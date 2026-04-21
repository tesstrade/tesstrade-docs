# When to use entry/exit conditions

TessTrade accepts **two mutually exclusive ways** of writing the logic of a strategy:

1. **Imperative mode (`on_bar_strategy`)** -- you write Python code that decides when to buy/sell.
2. **Declarative mode (`entry_conditions` / `exit_conditions`)** -- you describe the conditions in JSON and the engine executes them.

## Quick decision

| Situation | Use |
|---|---|
| Logic involves more than 2 indicators | **Imperative** |
| Requires persistent state (`sdk.state`) | **Imperative** |
| Requires cooldown or temporal filters | **Imperative** |
| Manual trailing stop | **Imperative** |
| Strategy is "when A crosses B, buy" | **Declarative** |
| Non-programmer users must edit the rules | **Declarative** |
| Simple crossing of two series | **Declarative** |
| Sharing a strategy through UI templates | **Declarative** |

When in doubt: **imperative**. It is more expressive and covers everything the declarative mode offers.

## The critical rule

**The two modes cannot coexist.** If `DECLARATION` contains `entry_conditions`, the engine **ignores any `on_bar_strategy`** in the script. The strategy runs **entirely in declarative mode**.

The result is "0 trades" with no explicit error, because the engine is running in a different mode from what was intended.

```python
# Anti-pattern: has entry_conditions and on_bar_strategy
DECLARATION = {
    "type": "strategy",
    "entry_conditions": [
        {"source": "fast", "operator": "crosses_above", "target": "slow",
         "action": "buy_to_open", "enabled": True},
    ],
    # ...
}

def on_bar_strategy(sdk, params):
    # DOES NOT EXECUTE. The engine is in declarative mode.
    sdk.buy(action="buy_to_open", qty=1, order_type="market")
```

### How to fix

For manual logic, **remove `entry_conditions` and `exit_conditions`** from the DECLARATION:

```python
DECLARATION = {
    "type": "strategy",
    "inputs": [...],
    "plots": [...],
    # no entry_conditions, no exit_conditions
}

def on_bar_strategy(sdk, params):
    # now executes
    sdk.buy(...)
```

For declarative mode, **remove the `on_bar_strategy`** and keep only the minimal dispatcher:

```python
def main(df=None, sdk=None, params={}):
    if df is not None:
        return _build_chart(df, params)
    return DECLARATION
```

## Declarative mode in practice

The engine evaluates **conditions against the series** returned in the `df=` branch. You must declare the plots and provide the series; the engine crosses the values and fires the actions.

### Complete example: declarative SMA crossover

```python
DECLARATION = {
    "type": "strategy",
    "inputs": [
        {"name": "fast_period", "type": "int", "default": 9, "min": 1, "max": 100},
        {"name": "slow_period", "type": "int", "default": 21, "min": 2, "max": 200},
    ],
    "plots": [
        {"name": "ma_fast", "source": "ma_fast", "type": "line", "color": "#22D3EE"},
        {"name": "ma_slow", "source": "ma_slow", "type": "line", "color": "#F59E0B"},
    ],
    "entry_conditions": [
        {
            "name": "Buy",
            "description": "Fast crosses above Slow",
            "source": "ma_fast",
            "operator": "crosses_above",
            "target": "ma_slow",
            "action": "buy_to_open",
            "enabled": True,
        },
        {
            "name": "Short Sell",
            "description": "Fast crosses below Slow",
            "source": "ma_fast",
            "operator": "crosses_below",
            "target": "ma_slow",
            "action": "sell_short_to_open",
            "enabled": True,
        },
    ],
    "exit_conditions": [
        {
            "name": "Long Exit",
            "source": "ma_fast",
            "operator": "crosses_below",
            "target": "ma_slow",
            "action": "sell_to_close",
            "enabled": True,
        },
        {
            "name": "Short Cover",
            "source": "ma_fast",
            "operator": "crosses_above",
            "target": "ma_slow",
            "action": "buy_to_cover",
            "enabled": True,
        },
    ],
}


def _sma_series(values, period):
    out = []
    for i in range(len(values)):
        if i + 1 < period:
            out.append(None)
        else:
            out.append(sum(values[i - period + 1:i + 1]) / period)
    return out


def _build_chart(df, params):
    fast = int((params or {}).get("fast_period", 9))
    slow = int((params or {}).get("slow_period", 21))
    closes = list(df["close"])
    return {
        "plots": DECLARATION["plots"],
        "series": {
            "ma_fast": _sma_series(closes, fast),
            "ma_slow": _sma_series(closes, slow),
        },
    }


def main(df=None, sdk=None, params={}):
    if df is not None:
        return _build_chart(df, params)
    return DECLARATION
```

**Note:** there is no `on_bar_strategy`. All trading logic lives in `entry_conditions` and `exit_conditions`. The engine reads the series computed in `_build_chart` (inside the `df=` branch) and evaluates the conditions.

### How the engine evaluates

On every closed candle, the engine takes the **last two points** of each series and applies the operator. For `crosses_above(ma_fast, ma_slow)`:

- `ma_fast[-2] <= ma_slow[-2]` (on the previous candle it was below)
- `ma_fast[-1] > ma_slow[-1]` (now it is above)

If both conditions hold, the condition fires and the engine emits the `action`.

## Advantages and limitations

### Advantages of declarative mode
- **Readable.** A non-programmer trader reads and understands it.
- **Shareable.** A JSON/YAML template can be exported, cloned, and versioned.
- **Zero state bugs.** No `sdk.state` to forget to reset.

### Limitations
- **No state.** `sdk.state` does not exist in declarative mode. Cooldown, counters, and manual trailing are not possible.
- **No composite logic.** It is not possible to express "enter if (A crosses B) AND (RSI < 30)" directly. Only one condition per entry.
- **No dynamism.** Thresholds are fixed; there is no adaptation to the market regime.
- **No time-based exit.** "Exit after 4 hours" cannot be expressed.

**Rule of thumb:** if the strategy goes beyond "when X crosses Y", use `on_bar_strategy`.

## How the frontend uses both modes

The "Strategies" UI in chart trading offers a **visual builder** to assemble `entry_conditions` without writing Python. These visual templates generate declarative DECLARATIONs that the engine executes.

When exporting a strategy built in the UI, the generated Python contains **only the DECLARATION and `_build_chart`**, without `on_bar_strategy`. It is purely declarative.

To customize beyond the UI, you must **transition to imperative mode**: copy the generated Python, remove `entry_conditions`, and write `on_bar_strategy`.

## Next steps

* [Supported operators](operators.md) -- complete table of declarative operators.
* [DECLARATION shape](../contract/declaration.md) -- fields of `entry_conditions` and `exit_conditions`.
* [Solid patterns](../strategies/entry-exit-patterns.md) -- how to write robust imperative code.
