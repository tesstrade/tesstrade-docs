# Supported operators

Complete reference of the operators that declarative mode (`entry_conditions` / `exit_conditions`) accepts.

## Quick table

| Operator | Meaning | Fires when |
|---|---|---|
| `crosses_above` | Crosses upward | `source[t-1] <= target[t-1]` **AND** `source[t] > target[t]` |
| `crosses_below` | Crosses downward | `source[t-1] >= target[t-1]` **AND** `source[t] < target[t]` |
| `crosses` | Any cross | `crosses_above` or `crosses_below` |
| `>` (or `greater_than`) | Strictly greater | `source[t] > target[t]` |
| `>=` (or `greater_or_equal`) | Greater or equal | `source[t] >= target[t]` |
| `<` (or `less_than`) | Strictly less | `source[t] < target[t]` |
| `<=` (or `less_or_equal`) | Less or equal | `source[t] <= target[t]` |
| `==` (or `equals`) | Equal (point-wise) | `source[t] == target[t]` |
| `!=` (or `not_equals`) | Different | `source[t] != target[t]` |

`source[t]` is the last value of the series; `source[t-1]` is the value on the previous candle.

## Condition shape

```python
{
    "name": "Readable name",             # optional
    "description": "Explanation",        # optional -- tooltip in the UI
    "source": "series_name",             # key in series (required)
    "operator": "crosses_above",         # required
    "target": "other_series",            # key in series, OR
    "value": 30,                         # constant numeric value
    "action": "buy_to_open",             # action fired on trigger
    "enabled": True,                     # if false, the condition is ignored
    "message": "Buy signal",             # optional -- log when triggered
}
```

**Rule:** provide **either `target` (series name) or `value` (constant)**, not both. If both are provided, the engine prioritizes `target`.

## Crossing operators (discrete)

`crosses_above`, `crosses_below`, and `crosses` fire only on the **exact bar** of the crossing. Subsequent bars do not fire again (even if the general condition `source > target` continues to be true).

### Example: fast SMA crosses slow upward

```python
{
    "name": "Entry Long",
    "source": "ma_fast",       # series computed in _build_chart
    "operator": "crosses_above",
    "target": "ma_slow",       # another series computed in _build_chart
    "action": "buy_to_open",
    "enabled": True,
}
```

Fires **once** on the candle where `ma_fast[-1] > ma_slow[-1]` **and** `ma_fast[-2] <= ma_slow[-2]`.

### Example: RSI crosses 30 upward (oversold recovering)

```python
{
    "name": "RSI Reversal Up",
    "source": "rsi",
    "operator": "crosses_above",
    "value": 30,               # constant, not a series
    "action": "buy_to_open",
    "enabled": True,
}
```

When you use `value`, the engine compares the series against a fixed value. `source[t-1] <= 30 and source[t] > 30`.

## Continuous comparison operators

`>`, `<`, `==`, etc. fire on **every bar** where the condition is true. Useful for filters, but **unsuitable** for direct entries (they would fire on every bar in which the position is flat).

### Correct usage: combined filter

It is not possible to combine multiple conditions within the same entry (it is one per entry). The engine evaluates exit_conditions on every candle; if the condition remains true and `sdk.position != 0`, the exit fires.

For regime filters, use imperative mode.

### Example: close short if RSI goes below 30 (again)

Declarative mode has no "AND". To express "close short when RSI < 30", simply declare:

```python
"exit_conditions": [
    {
        "name": "Short Cover by RSI",
        "source": "rsi",
        "operator": "<",        # less_than
        "value": 30,
        "action": "buy_to_cover",
        "enabled": True,
    },
],
```

Fires on every bar where `rsi[-1] < 30` and `sdk.position < 0`. The engine already filters by the current position: a `buy_to_cover` exit_condition only runs if `sdk.position < 0`.

## Actions accepted in conditions

Full list (details in [canonical actions](../sdk-reference/actions.md)):

* `buy_to_open` -- opens long
* `sell_short_to_open` (or `sell_short`) -- opens short
* `sell_to_close` -- closes long
* `buy_to_cover` -- closes short
* `close_position` -- closes any open position
* `reverse_position` -- closes and reverses

### Caveat: coherence between condition and action

The engine **does not validate** whether the action makes sense with the current position. Consider the following case:

```python
# Anti-pattern: sell_to_close in entry_conditions
{
    "name": "Sell",
    "operator": "crosses_above",
    "action": "sell_to_close",
    ...
}
```

The condition fires, but if there is no open long position, the engine ignores it. `sell_to_close` in `entry_conditions` **does nothing**.

**Convention:**
- `entry_conditions` -> `buy_to_open` or `sell_short_to_open`.
- `exit_conditions` -> `sell_to_close` or `buy_to_cover` (or `close_position` as a generic).

## Complete example: declarative RSI mean reversion

```python
DECLARATION = {
    "type": "strategy",
    "inputs": [
        {"name": "period", "type": "int", "default": 14, "min": 2, "max": 100},
        {"name": "oversold", "type": "float", "default": 30, "min": 0, "max": 50},
        {"name": "overbought", "type": "float", "default": 70, "min": 50, "max": 100},
    ],
    "plots": [
        {"name": "rsi", "source": "rsi", "type": "line", "color": "#A78BFA"},
    ],
    "pane": "new",
    "entry_conditions": [
        {
            "name": "Buy on oversold",
            "source": "rsi",
            "operator": "crosses_above",
            "value": 30,
            "action": "buy_to_open",
            "enabled": True,
        },
        {
            "name": "Sell on overbought",
            "source": "rsi",
            "operator": "crosses_below",
            "value": 70,
            "action": "sell_short_to_open",
            "enabled": True,
        },
    ],
    "exit_conditions": [
        {
            "name": "Long exit at midline",
            "source": "rsi",
            "operator": "crosses_above",
            "value": 50,
            "action": "sell_to_close",
            "enabled": True,
        },
        {
            "name": "Short cover at midline",
            "source": "rsi",
            "operator": "crosses_below",
            "value": 50,
            "action": "buy_to_cover",
            "enabled": True,
        },
    ],
}
```

Note the use of a **constant value** (`"value": 30`) instead of a series target. There is no `on_bar_strategy`: the engine does everything.

## Known limitations

* **No composite logic (AND/OR/NOT).** One condition = one comparison.
* **No condition histogram.** It is not possible to express "fire if the condition is true in 3 of the last 5 bars".
* **No cooldown.** If two conditions fire on two consecutive bars, the engine tries to execute both (the second is usually rejected by `Max Positions = 1`).
* **No filters.** It is not possible to express "only fire during business hours" (except through the global `trading_hours` of the DECLARATION).

For these cases, **use imperative mode**.

## Next steps

* [When to use entry/exit conditions](when-to-use.md) -- side-by-side comparison with imperative mode.
* [DECLARATION shape](../contract/declaration.md) -- full format of conditions.
* [Canonical actions](../sdk-reference/actions.md) -- details of the fired actions.
