# Persistent state and trailing stop

`sdk.state` is the SDK mechanism for non-trivial strategies. It is a dictionary that the engine keeps alive **between script calls**, holding flags, counters, reference prices, buffers, and any value that needs to persist bar by bar.

## Principle

**Always initialize keys before using them**, at least for non-numeric objects.

```python
def on_bar_strategy(sdk, params):
    if not isinstance(sdk.state, dict):
        sdk.state = {}
    if "my_list" not in sdk.state:
        sdk.state["my_list"] = []
    if "entry_price" not in sdk.state:
        sdk.state["entry_price"] = None
```

`sdk.state` has special behavior: missing numeric keys return `0.0` automatically. This simplifies counters but **hides bugs** for objects (lists, dicts, strings). Prefer defensive code.

## Pattern 1 -- "Already did X" flags

Useful for "one-time setup" logic or "waiting for the next event":

```python
def on_bar_strategy(sdk, params):
    if not isinstance(sdk.state, dict):
        sdk.state = {}
    if sdk.state.get("done_setup") is not True:
        # Initialization logic: computes fixed levels once.
        highs_20 = [c["high"] for c in sdk.candles[-20:]]
        sdk.state["pivot_high"] = max(highs_20)
        sdk.state["done_setup"] = True

    # Pivot is already computed here; use it from now on.
    close = sdk.candles[-1]["close"]
    if close > sdk.state["pivot_high"]:
        # pivot breakout
        ...
```

## Pattern 2 -- Counter

```python
def on_bar_strategy(sdk, params):
    if not isinstance(sdk.state, dict):
        sdk.state = {}

    # sdk.state["bars_since_last_signal"] returns 0.0 if missing (safe).
    sdk.state["bars_since_last_signal"] = sdk.state.get("bars_since_last_signal", 0) + 1

    cooldown = int((params or {}).get("cooldown", 5))
    if sdk.state["bars_since_last_signal"] < cooldown:
        return  # cooldown active

    # ... signal logic
    # At the moment a signal is emitted:
    sdk.state["bars_since_last_signal"] = 0
```

## Pattern 3 -- Cooldown based on timestamp

More accurate in chart trading (timeframes can be irregular during outages):

```python
def on_bar_strategy(sdk, params):
    if not isinstance(sdk.state, dict):
        sdk.state = {}
    if "last_entry_time" not in sdk.state:
        sdk.state["last_entry_time"] = 0

    now_ms = sdk.candles[-1]["time"]
    cooldown_ms = int((params or {}).get("cooldown_minutes", 30)) * 60_000

    if now_ms - sdk.state["last_entry_time"] < cooldown_ms:
        return

    # ... logic that may trigger an entry
    if entered:
        sdk.state["last_entry_time"] = now_ms
```

## Pattern 4 -- High-water trailing stop (long)

Frequent case. Keeps the **highest price seen** since the entry and places the stop X% below:

```python
def on_bar_strategy(sdk, params):
    if not isinstance(sdk.state, dict):
        sdk.state = {}
    if "high_water" not in sdk.state:
        sdk.state["high_water"] = None

    close = sdk.candles[-1]["close"]
    trail_pct = float((params or {}).get("trail_pct", 0.02))

    if sdk.position > 0:
        # Long open: track high-water
        hw = sdk.state["high_water"]
        sdk.state["high_water"] = close if hw is None else max(hw, close)

        new_stop = sdk.state["high_water"] * (1 - trail_pct)

        if close <= new_stop:
            sdk.sell(
                action="sell_to_close",
                qty=abs(sdk.position),
                order_type="market",
            )
            sdk.state["high_water"] = None
        else:
            sdk.update_exits(stop_loss=new_stop)

    elif sdk.position == 0:
        # Reset the trailing when flat
        sdk.state["high_water"] = None

    # (entry logic goes here; upon entering long, `high_water` is None
    #  and will be populated on the next bar in which position > 0.)
```

### Short version

Analogous, but tracks the **lowest price seen** and places the stop X% above:

```python
if sdk.position < 0:
    lw = sdk.state.get("low_water")
    sdk.state["low_water"] = close if lw is None else min(lw, close)
    new_stop = sdk.state["low_water"] * (1 + trail_pct)

    if close >= new_stop:
        sdk.buy(action="buy_to_cover", qty=abs(sdk.position), order_type="market")
        sdk.state["low_water"] = None
    else:
        sdk.update_exits(stop_loss=new_stop)
```

## Pattern 5 -- Value buffer (for custom calculation)

In some cases a historical window of a value **computed by the script itself** is needed (not coming from candles). Example: incremental EMA without recomputing every time.

```python
def on_bar_strategy(sdk, params):
    if not isinstance(sdk.state, dict):
        sdk.state = {}
    if "ema_state" not in sdk.state:
        sdk.state["ema_state"] = None

    period = int((params or {}).get("period", 20))
    alpha = 2.0 / (period + 1.0)
    close = sdk.candles[-1]["close"]

    # Update the EMA incrementally
    ema = sdk.state["ema_state"]
    if ema is None:
        sdk.state["ema_state"] = close
    else:
        sdk.state["ema_state"] = alpha * close + (1 - alpha) * ema

    # Use sdk.state["ema_state"] in the logic
```

### Size limit

`sdk.state` lives in sandbox memory (64MB limit). Do not accumulate without control:

```python
# Memory leak
sdk.state["all_closes"] = sdk.state.get("all_closes", []) + [c["close"] for c in sdk.candles]

# Correct: caps the size
buf = sdk.state.setdefault("buffer", [])
buf.append(sdk.candles[-1]["close"])
if len(buf) > 1000:
    del buf[:len(buf) - 1000]  # keeps the last 1000
```

## Pattern 6 -- Record entry price

Useful when the exact entry price is needed (beyond `sdk.buy_price`, which provides the weighted average price). For example, a 3:1 risk-reward exit based on the entry price.

```python
def on_bar_strategy(sdk, params):
    if not isinstance(sdk.state, dict):
        sdk.state = {}

    close = sdk.candles[-1]["close"]

    if sdk.position == 0 and entry_signal:
        sdk.buy(action="buy_to_open", qty=1, order_type="market")
        sdk.state["entry_price"] = close        # approximate
        sdk.state["risk"] = 0.02                 # 2% stop
        sdk.state["target_r"] = 3.0              # 3R target

    elif sdk.position > 0 and sdk.state.get("entry_price") is not None:
        entry = sdk.state["entry_price"]
        risk = sdk.state["risk"]
        target_r = sdk.state["target_r"]

        stop_price = entry * (1 - risk)
        target_price = entry * (1 + risk * target_r)

        if close <= stop_price or close >= target_price:
            sdk.sell(action="sell_to_close", qty=abs(sdk.position),
                     order_type="market")
            sdk.state["entry_price"] = None
```

**Note:** `close` at the time of `sdk.buy()` is the current candle, but the actual execution price in backtest may have slippage. For precision, use `sdk.buy_price` later, when the engine updates it on the next bar.

## Pattern 7 -- Compound conditional signals

Entry only after two consecutive bars meeting a condition:

```python
def on_bar_strategy(sdk, params):
    if not isinstance(sdk.state, dict):
        sdk.state = {}

    # Counter of consecutive bars with close above the moving average
    closes = [c["close"] for c in sdk.candles]
    if len(closes) < 21:
        return
    sma = sum(closes[-20:]) / 20

    if closes[-1] > sma:
        sdk.state["streak"] = sdk.state.get("streak", 0) + 1
    else:
        sdk.state["streak"] = 0

    if sdk.position == 0 and sdk.state["streak"] >= 3:
        sdk.buy(action="buy_to_open", qty=1, order_type="market")
        sdk.state["streak"] = 0  # reset after entry
```

## Pattern 8 -- Explicit reset when closing a position

With multiple state fields tied to the position (entry_price, high_water, bars_held), create a cleanup function:

```python
def _reset_position_state(sdk):
    for key in ("entry_price", "high_water", "low_water", "bars_held"):
        sdk.state[key] = None

def on_bar_strategy(sdk, params):
    if not isinstance(sdk.state, dict):
        sdk.state = {}

    if sdk.position == 0:
        _reset_position_state(sdk)

    # ... rest of the logic
```

Avoids residual state carried between entries.

## What persists across restarts

Discussed in detail in [script lifecycle](../contract/lifecycle.md). Summary:

* **Backtest:** `sdk.state` is kept throughout the execution and discarded at the end.
* **Chart trading:** `sdk.state` is kept while the engine process is alive. If the backend restarts, it is **reinitialized** (cleared). The engine does not persist `sdk.state` in the DB.

Logics that cannot lose state across a restart do not currently have a graceful escape in the contract. Chart trading must be operated with the awareness that rare restarts reset the trailing.

## Next steps

* [Solid entry/exit patterns](entry-exit-patterns.md) -- recommended practices for solid scripts.
* [Stops, targets and trailing](../sdk-reference/stops-and-targets.md) -- native versus manual trailing stop.
