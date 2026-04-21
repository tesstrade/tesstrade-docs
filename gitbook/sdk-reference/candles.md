# Candles, `params` and `state`

The `sdk` object delivered to the script exposes three frequently used data sources:

* **`sdk.candles`** - the candle history, including the current one.
* **`sdk.params`** - the `DECLARATION` parameters, already populated with user values.
* **`sdk.state`** - a dictionary that persists across bars (flags, cooldown, trailing stop).

## `sdk.candles`

A list of dictionaries, from the oldest (`sdk.candles[0]`) to the most recent (`sdk.candles[-1]`).

### Shape of each candle

```python
{
    "time":   1700001234000,  # int - Unix timestamp in milliseconds
    "open":   50123.45,       # float
    "high":   50345.67,       # float
    "low":    49987.12,       # float
    "close":  50234.00,       # float
    "volume": 1234.567,       # float
}
```

### Common idioms

Collect closing prices:

```python
closes = [c["close"] for c in sdk.candles]
highs  = [c["high"]  for c in sdk.candles]
lows   = [c["low"]   for c in sdk.candles]
```

Timestamp of the last bar (use it on every order):

```python
last_time = sdk.candles[-1]["time"]
sdk.buy(time=last_time, action="buy_to_open", qty=1, order_type="market")
```

Check whether there is enough data for an indicator:

```python
def on_bar_strategy(sdk, params):
    period = int((params or {}).get("period", 20))
    if len(sdk.candles) < period + 1:
        return  # warm-up, nothing to do yet
    # ... continues
```

### When `sdk.candles` is updated

During the backtest, the list grows with each processed candle. In live chart trading, it is updated at the candle close. In other words, `sdk.candles[-1]` is always the last **closed** candle, not the candle in formation.

Intra-bar updates (tick-by-tick) are not part of the public API.

### Convert to a pandas DataFrame

`pd` (pandas) is available globally; the conversion can be done at any time:

```python
df = pd.DataFrame(sdk.candles)
df["ret"] = df["close"].pct_change()
last_ret = float(df["ret"].iloc[-1])
```

Use it sparingly: `pd.DataFrame(...)` on every candle has a cost. For simple calculations, plain Python list comprehensions are faster.

---

## `sdk.params`

Dictionary with the current values of the inputs declared in `DECLARATION["inputs"]`. The values arrive already adjusted by the user in the UI panel.

```python
sdk.params  # {"fast_period": 9, "slow_period": 21, "use_volume": True}
```

**Converting to the correct type:** even with `"type": "int"` declared, the engine may deliver a string through some hydration paths. The robust idiom is to convert explicitly:

```python
fast = int((sdk.params or {}).get("fast_period", 9))
risk = float((sdk.params or {}).get("risk", 0.02))
use_volume = bool((sdk.params or {}).get("use_volume", False))
```

**Note:** when the engine invokes via the dispatcher `main(df=None, sdk=None, params={})`, `params` (the main argument) and `sdk.params` contain the same dictionary. Use whichever is more readable.

### Global `PARAMS` (legacy mode)

If the script uses the `on_bar(sdk)` entrypoint instead of `main()`, the parameters live in a global constant named `PARAMS`:

```python
PARAMS = {"fast_period": 10, "slow_period": 20}

def on_bar(sdk):
    fast = int(PARAMS.get("fast_period", 10))
    # ...
```

`PARAMS` is injected automatically by the engine with the current input values.

---

## `sdk.state`

Persistent dictionary across candles. The engine keeps the same active object for the entire execution.

### Basic usage

```python
def on_bar_strategy(sdk, params):
    if not isinstance(sdk.state, dict):
        sdk.state = {}
    if "last_signal_time" not in sdk.state:
        sdk.state["last_signal_time"] = 0

    now = sdk.candles[-1]["time"]
    cooldown_ms = 60_000  # 1 minute

    if now - sdk.state["last_signal_time"] < cooldown_ms:
        return  # cooldown active, do not emit a new signal

    # ... entry logic ...
    sdk.state["last_signal_time"] = now
```

### Real trailing stop

The classic case: keep the highest price seen since entry and use it to trigger the exit.

```python
def on_bar_strategy(sdk, params):
    if not isinstance(sdk.state, dict):
        sdk.state = {}
    if "high_water" not in sdk.state:
        sdk.state["high_water"] = None

    close = sdk.candles[-1]["close"]

    if sdk.position > 0:
        # Long open: update the high water
        hw = sdk.state["high_water"]
        sdk.state["high_water"] = close if hw is None else max(hw, close)

        # Stop at 2% below the high water
        stop = sdk.state["high_water"] * 0.98
        if close <= stop:
            sdk.sell(action="sell_to_close", qty=abs(sdk.position),
                     order_type="market")
            sdk.state["high_water"] = None
    else:
        # No position, reset the trailing
        sdk.state["high_water"] = None
```

### Note on missing keys

`sdk.state` has a special behavior: **missing numeric keys return `0.0` instead of `KeyError`**. This simplifies classic indicators (counters, accumulators):

```python
# These two are equivalent:
sdk.state["hits"] = sdk.state["hits"] + 1         # "hits" did not exist, starts at 0.0
sdk.state["hits"] = sdk.state.get("hits", 0) + 1
```

For keys that hold objects (lists, dicts, strings), **always check beforehand**:

```python
if "buffer" not in sdk.state:
    sdk.state["buffer"] = []
sdk.state["buffer"].append(sdk.candles[-1]["close"])
```

### What persists, what does not

| Item | Persists across candles |
|---|---|
| `sdk.state[key]` | Yes, maintained while the runner is active |
| Local variables inside `main()` | No, reset on every call |
| Global variables (`PARAMS`, etc.) | Yes, module scope, alive throughout the entire execution |
| Objects in `sdk.candles` | Recomputed by the engine; do not modify |

**Rule:** if the script needs to remember something between calls, place it in `sdk.state`.

---

## Quick checklist

* [ ] Read `sdk.candles` as a list of dicts (not a DataFrame).
* [ ] Use `sdk.candles[-1]["time"]` for the order timestamp.
* [ ] Convert `params` / `sdk.params` values with `int(...)`, `float(...)`, `bool(...)`.
* [ ] Initialize `sdk.state` keys before indexing non-numeric objects.
* [ ] Verify `len(sdk.candles) >= minimum_period` before computing indicators.
