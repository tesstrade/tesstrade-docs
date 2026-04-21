# Operators table

Reference of all operators accepted in `entry_conditions` and `exit_conditions` of declarative mode.

## Crossover operators

Fire **once**, on the exact bar of the transition:

| Operator | Alias | Fires when |
|---|---|---|
| `crosses_above` | -- | `source[t-1] <= target[t-1]` **AND** `source[t] > target[t]` |
| `crosses_below` | -- | `source[t-1] >= target[t-1]` **AND** `source[t] < target[t]` |
| `crosses` | -- | `crosses_above` OR `crosses_below` |

## Comparison operators

Fire on **every bar** on which the condition holds:

| Operator | Symbolic alias | Means |
|---|---|---|
| `greater_than` | `>` | `source[t] > target[t]` |
| `greater_or_equal` | `>=` | `source[t] >= target[t]` |
| `less_than` | `<` | `source[t] < target[t]` |
| `less_or_equal` | `<=` | `source[t] <= target[t]` |
| `equals` | `==` | `source[t] == target[t]` |
| `not_equals` | `!=` | `source[t] != target[t]` |

The engine accepts **both the textual name and the symbol**. Prefer the textual form for readability.

## Condition shape

```python
{
    "name": "Readable name",         # optional
    "description": "Explanation",    # optional - tooltip
    "source": "series_name",         # key in series - required
    "operator": "crosses_above",     # required
    "target": "other_series",        # key in series, OR
    "value": 30,                     # numeric constant
    "action": "buy_to_open",         # required
    "enabled": True,                 # false = ignores the condition
    "message": "Log message",        # optional
}
```

**Provide `target` OR `value`, not both.** If both are provided, `target` prevails.

## Examples

### Crossover between two series
```python
{
    "source": "ma_fast",
    "operator": "crosses_above",
    "target": "ma_slow",
    "action": "buy_to_open",
    "enabled": True,
}
```

### Crossover of a fixed value
```python
{
    "source": "rsi",
    "operator": "crosses_above",
    "value": 30,
    "action": "buy_to_open",
    "enabled": True,
}
```

### Absolute comparison
```python
{
    "source": "rsi",
    "operator": "less_than",
    "value": 30,
    "action": "buy_to_open",
    "enabled": True,
}
```

**Caution:** this condition fires on **every bar** on which RSI < 30 and the position is zero. If RSI remains oversold for 5 consecutive bars, the script attempts to open 5 times. Prefer `crosses_above` to avoid repetition.

## Operator selection

| Goal | Use |
|---|---|
| Buy when X crosses Y upward | `crosses_above` |
| Sell when X is below Y (any bar) | `less_than` |
| Act when X crosses Y in either direction | `crosses` |
| Filter entries by RSI > 50 | `greater_than` (combined with imperative) |

Combined conditions (AND/OR) **do not exist** in declarative mode. For "enter only if ma_fast > ma_slow AND rsi < 30", use imperative mode.

## Common errors

### Unknown `operator`
Use exactly the name from the table above. `greaterThan` (camelCase) does not work; it is `greater_than` (snake_case).

### `source` does not exist
The key must match the return of `_build_chart` in the `df=` branch. If the script does not return the referenced series, the engine evaluates it as absent and the condition does not fire.

### `target` pointing at itself
```python
{"source": "ma_fast", "operator": "crosses_above", "target": "ma_fast", ...}  # invalid
```
Logically impossible; a series does not cross itself. The engine silently ignores it.

### `equals` comparison on floats
```python
{"source": "rsi", "operator": "equals", "value": 50.0}  # rarely fires
```
RSI is a float and is rarely exactly 50.0. Use `less_than 51` and `greater_than 49` for an approximation, or redesign the logic.

## Details on other pages

* [Declarative mode - when to use](../declarative-mode/when-to-use.md)
* [Declarative mode - operators explained](../declarative-mode/operators.md)
* [DECLARATION shape](../contract/declaration.md)
