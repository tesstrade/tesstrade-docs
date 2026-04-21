# Solid entry/exit patterns

Practices that reduce bugs and improve the quality of strategies. The items listed derive from errors observed in execution logs, not from theory.

## For entries

### Check `sdk.position` before entering

```python
if sdk.position == 0:
    if buy_signal:
        sdk.buy(action="buy_to_open", ...)
```

Without this `if`, the engine **silently ignores** the extra orders (Max Positions = 1). The result appears as "only 1 trade" with no apparent cause.

### Check for sufficient data before computing

```python
if len(sdk.candles) < max(fast, slow) + 1:
    return  # warmup
```

Without this guard, `sum(sdk.candles[:20])` with 5 candles triggers `IndexError` or computes an incorrect SMA. The engine continues executing without error, but the results are invalid.

### Gate with `enabled=True` in declarative mode

When using `entry_conditions` in the DECLARATION, pass `"enabled": True` explicitly. Some engine validations depend on it.

```python
"entry_conditions": [
    {"name": "Long", "action": "buy_to_open", "enabled": True, ...},
]
```

### Cooldown between signals

Avoids dozens of trades on noise. Details in [persistent state](persistent-state.md#pattern-3----cooldown-based-on-timestamp).

```python
now_ms = sdk.candles[-1]["time"]
if now_ms - sdk.state.get("last_entry_time", 0) < cooldown_ms:
    return
```

### Trend filter

Avoids entries against the larger context. Example: long entry only if the 200 SMA is rising:

```python
sma_200 = _sma(closes, 200)
sma_200_prev = _sma(closes[:-5], 200)
if sma_200 is None or sma_200_prev is None:
    return
if sdk.position == 0 and buy_signal and sma_200 > sma_200_prev:
    # only open long when the larger trend is up
    sdk.buy(...)
```

### Do not use candle indices as timestamps

```python
# Wrong
sdk.buy(time=len(sdk.candles), ...)

# Right
sdk.buy(time=sdk.candles[-1]["time"], ...)
```

Timestamps are in **Unix milliseconds** (`int`). The engine uses these values for timeline and alignment; indices break this structure.

### Do not enter on every bar: use **crossover detection**

```python
# Wrong: fires on every bar in which MA is above
if fast_ma > slow_ma:
    sdk.buy(...)

# Right: fires only on the cross
if prev_fast <= prev_slow and fast_ma > slow_ma:
    sdk.buy(...)
```

Without transition detection, the script tries to buy on every bar. The engine rejects due to an existing position, but the log becomes cluttered.

## For exits

### Use `qty=abs(sdk.position)` to close

```python
sdk.sell(
    action="sell_to_close",
    qty=abs(sdk.position),
    order_type="market",
)
```

Without `qty` or with `qty=1`, only 1 unit is closed and the rest remains open. In Spot crypto with fractional positions, this error goes unnoticed.

### Always have an exit condition

Without an explicit exit, the backtest opens the position on the first signal and holds until the end of the period, with a forced close. The log shows "1 trade" with long duration and large drawdown. Every script needs both sides:

```python
if sdk.position == 0 and entry_signal:
    sdk.buy(...)
elif sdk.position > 0 and exit_signal:
    sdk.sell(action="sell_to_close", qty=abs(sdk.position), order_type="market")
```

### Use `update_position_exits` for trailing stop

Do not emit "replace stop" orders. Use `update_exits`:

```python
sdk.update_exits(stop_loss=new_stop)  # reuses the existing position
```

Details in [stops, targets and trailing](../sdk-reference/stops-and-targets.md).

### Do not close and reopen on the same bar by accident

```python
# Wrong: closes long and opens long again on the same candle
if sdk.position > 0 and exit_signal:
    sdk.sell(action="sell_to_close", ...)
if sdk.position == 0 and entry_signal:   # sdk.position is still > 0 on this candle
    sdk.buy(action="buy_to_open", ...)
```

The engine processes signals **after** the script finishes. During script execution, `sdk.position` **does not change** even if orders are emitted. For atomic reversal, use `reverse_position`:

```python
if sdk.position > 0 and short_reversal_signal:
    sdk.close(action="reverse_position", qty=abs(sdk.position), order_type="market")
```

## Risk management

### Always an initial stop

Even in a mean reversion strategy, keep a last-resort stop:

```python
sdk.buy(
    action="buy_to_open",
    qty=1,
    order_type="market",
    stop_loss=close * 0.95,   # 5% safety net
)
```

### Global daily stop

Implement in the script itself. The engine does not know the user's tolerable drawdown:

```python
def on_bar_strategy(sdk, params):
    if not isinstance(sdk.state, dict):
        sdk.state = {}
    if "equity_open" not in sdk.state:
        sdk.state["equity_open"] = sdk.equity

    daily_dd = (sdk.state["equity_open"] - sdk.equity) / sdk.state["equity_open"]
    if daily_dd >= 0.03:
        # lost 3% on the day: stop and close everything
        if sdk.position != 0:
            sdk.close(
                action="close_position",
                qty=abs(sdk.position),
                order_type="market",
            )
        return  # do not open anything else today
```

### Sizing proportional to cash

In crypto, `qty=1` can be catastrophic with a low balance:

```python
close = sdk.candles[-1]["close"]
risk_pct = float((params or {}).get("risk_pct", 0.02))
qty = (sdk.cash * risk_pct) / close
sdk.buy(action="buy_to_open", qty=qty, order_type="market")
```

## Defensive idioms

### `params or {}` always

```python
fast = int((params or {}).get("fast_period", 9))
```

`params` can arrive as `None` in some hydration paths. The `or {}` fallback is cheap.

### Convert types explicitly

```python
fast = int(params.get("fast_period", 9))
risk = float(params.get("risk_pct", 0.02))
use_vol = bool(params.get("use_volume", False))
```

In some paths, the engine delivers a string. `int(9)` is idempotent; `int("9")` also works. Without conversion, the comparison `if params["fast_period"] > 5` fails when the value is a string.

### Check `is None` explicitly

```python
if sdk.buy_price is None:
    return  # no open position
pnl = close - sdk.buy_price   # safe now
```

`if sdk.buy_price:` works for `None` and `0`, but does not distinguish between the two. Use `is None`.

## Solid script template

Gathering the points above, a defensive scaffold:

```python
DECLARATION = {
    "type": "strategy",
    "inputs": [
        {"name": "fast_period", "type": "int", "default": 9, "min": 1, "max": 100},
        {"name": "slow_period", "type": "int", "default": 21, "min": 2, "max": 200},
        {"name": "risk_pct",    "type": "float", "default": 0.02, "min": 0.001, "max": 0.1},
        {"name": "cooldown_minutes", "type": "int", "default": 15, "min": 0, "max": 120},
    ],
}


def on_bar_strategy(sdk, params):
    params = params or {}
    fast = int(params.get("fast_period", 9))
    slow = int(params.get("slow_period", 21))
    risk_pct = float(params.get("risk_pct", 0.02))
    cooldown_ms = int(params.get("cooldown_minutes", 15)) * 60_000

    # Warmup
    if len(sdk.candles) < max(fast, slow) + 1:
        return

    # State
    if not isinstance(sdk.state, dict):
        sdk.state = {}
    if "last_entry_time" not in sdk.state:
        sdk.state["last_entry_time"] = 0

    closes = [c["close"] for c in sdk.candles]
    now = sdk.candles[-1]["time"]
    close = closes[-1]

    # Indicators
    fast_ma = sum(closes[-fast:]) / fast
    slow_ma = sum(closes[-slow:]) / slow
    prev_fast = sum(closes[-fast-1:-1]) / fast
    prev_slow = sum(closes[-slow-1:-1]) / slow
    crossed_up = prev_fast <= prev_slow and fast_ma > slow_ma
    crossed_down = prev_fast >= prev_slow and fast_ma < slow_ma

    # ENTRY
    if sdk.position == 0:
        if now - sdk.state["last_entry_time"] < cooldown_ms:
            return   # cooldown
        qty = max(0.001, (sdk.cash * risk_pct) / close)
        if crossed_up:
            sdk.buy(
                action="buy_to_open",
                qty=qty,
                order_type="market",
                stop_loss=close * (1 - risk_pct * 2),
            )
            sdk.state["last_entry_time"] = now
        elif crossed_down:
            sdk.sell(
                action="sell_short_to_open",
                qty=qty,
                order_type="market",
                stop_loss=close * (1 + risk_pct * 2),
            )
            sdk.state["last_entry_time"] = now

    # EXIT
    elif sdk.position > 0 and crossed_down:
        sdk.sell(action="sell_to_close", qty=abs(sdk.position), order_type="market")
    elif sdk.position < 0 and crossed_up:
        sdk.buy(action="buy_to_cover", qty=abs(sdk.position), order_type="market")


def main(df=None, sdk=None, params={}):
    params = params or {}
    if sdk is not None:
        return on_bar_strategy(sdk, params)
    return DECLARATION
```

Use as a starting point. The essential elements:

* Type conversion at the top.
* Warmup before indicators.
* State initialized with guard.
* `sdk.position == 0` before entering.
* Cooldown between entries.
* Proportional sizing.
* Mandatory stop.
* Explicit exits for long and short.

## Next steps

* [Persistent state and trailing stop](persistent-state.md) -- detailed coverage of `sdk.state`.
* [Troubleshooting](../backtest/troubleshooting.md) -- diagnosis of the most common issues.
* [SMA Crossover](sma-crossover.md), [RSI Mean Reversion](rsi-mean-reversion.md), [MACD Momentum](macd-momentum.md) -- reference templates.
