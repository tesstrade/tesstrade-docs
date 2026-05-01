# Error catalog

Exceptions the engine may raise, with typical cause and fix. Search for the error string in the log and locate it in the table.

## Quick table

| Category | When it fires | Severity |
|---|---|---|
| `SecurityError` | Forbidden import, builtin, or construct | High - code outside the contract |
| `TimeoutError` | Execution exceeded the time limit | Medium - slow logic |
| `MemoryError` | Exceeded the memory limit | Medium - uncontrolled accumulation |
| `ProtocolError` | Protocol violated (missing action, invalid JSON) | High - contract |
| `ProcessError` | Python subprocess crashed | High - infra |
| `RuntimeError` | Classic Python error (IndexError, ZeroDiv, etc.) | Medium - bug in the script |
| `WorkerPoolTimeout` | Queue full; request did not acquire a permit | Low - retry |
| `UnknownError` | Uncategorized error | Investigate |

## `SecurityError`

The engine rejected the code **before** execution. The script did not run.

### Cause 1 - Forbidden import
```
SecurityError: Import not allowed: os
```
**Fix:** use only `numpy`, `pandas`, `math`, `json`, `datetime`, `pandas_ta`, `talib`. See [sandbox limits](../getting-started/sandbox-limits.md).

### Cause 2 - Blocked builtin
```
SecurityError: Forbidden builtin: eval
```
**Fix:** banned builtins include `open`, `exec`, `eval`, `__import__`, `input`, `exit`, `dir`, `vars`, `globals`, `locals`. No substitute; remove from the logic.

### Cause 3 - Dunder attribute
```
SecurityError: Forbidden attribute: __class__
```
**Fix:** use `isinstance(x, type)` instead of accessing `__class__`. Deep introspection is not accepted.

### Cause 4 - Lambda
```
SecurityError: Lambda functions are forbidden
```
**Fix:** replace with a `def` function:
```python
# Incorrect
sorted_items = sorted(items, key=lambda x: x[1])

# Correct
def _key(x):
    return x[1]
sorted_items = sorted(items, key=_key)
```

### Cause 5 - Code too large or too nested
```
SecurityError: Code exceeds max size
SecurityError: Nesting too deep
```
**Fix:** split into smaller functions. The configured limits are hard to exceed in reasonable scripts.

### Cause 6 - Restricted construct (`global`, `nonlocal`, `while True`, `del`)
```
SecurityError: <construct> is not allowed
```
**Fix:** rewrite the function without the construct.

* `global` / `nonlocal`: pass values explicitly or persist through `sdk.state`.
* `while True`: use a finite `for ... in range(...)` or guard the loop with a counter.
* `del` statement: re-bind the variable to `None`.

## `TimeoutError`

```
TimeoutError: Execution exceeded the time limit
```

### Cause 1 - Heavy loop
```python
# Incorrect: O(n^2) on a list of 10000 candles
for i in range(len(sdk.candles)):
    for j in range(len(sdk.candles)):
        ...
```
**Fix:** use only the last N bars (`sdk.candles[-period:]`). Vectorize with numpy when possible.

### Cause 2 - `pd.DataFrame(sdk.candles)` on every call
Building a DataFrame is costly.
**Fix:** use a list comprehension: `closes = [c["close"] for c in sdk.candles]`.

### Cause 3 - Indicator recomputed from scratch on every bar
**Fix:** cache in `sdk.state` and update incrementally. See [persistent state](../strategies/persistent-state.md).

## `MemoryError`

```
MemoryError: Memory limit exceeded
```

### Cause - Lists growing without a limit in `sdk.state`
```python
# Incorrect: memory leak
sdk.state["all_closes"] = sdk.state.get("all_closes", []) + [...]
```
**Fix:** bound the size:
```python
buf = sdk.state.setdefault("closes", [])
buf.append(new_value)
if len(buf) > 500:
    del buf[:len(buf) - 500]
```

## `ProtocolError`

The SDK contract was violated.

### Cause 1 - `sdk.buy()` without `action`
```
ProtocolError: Strict Mode: buy() / sell() requires explicit action
```
**Fix:** always pass `action=`:
```python
sdk.buy(action="buy_to_open", qty=1, order_type="market")
```

### Cause 2 - No entry point defined
```
ProtocolError: Strict Mode. Your strategy must define a function
'main(df=None, sdk=None, params={})', 'on_bar(sdk)', ...
```
**Fix:** define `main()` at the root level of the file. See [The `main()` dispatcher](../contract/dispatcher-main.md).

### Cause 3 - Non-serializable return
```
ProtocolError: Unable to serialize return value
```
**Fix:** return only `dict`, `list`, `str`, `int`, `float`, `bool`, `None`. Convert numpy arrays with `.tolist()`. Convert `NaN` to `None`.

## `ProcessError`

```
ProcessError: Subprocess spawn failed
```
Infrastructure problem: the Python sandbox did not start or did not establish communication.

**Fix:** this is not a user code error. Report it to support. Occurs rarely.

## `RuntimeError`

Classic Python exception not handled by the script:

```
RuntimeError: IndexError: list index out of range
RuntimeError: ValueError: could not convert string to float
RuntimeError: ZeroDivisionError: division by zero
RuntimeError: KeyError: 'close'
```

### Cause - False assumption about data
```python
# Incorrect: assumes candles has at least 20 items
sma = sum(sdk.candles[-20:][i]["close"] for i in range(20)) / 20
```
If `sdk.candles` has 5 items, an index out of range occurs.

**Fix:** always validate:
```python
if len(sdk.candles) < 20:
    return
sma = sum(c["close"] for c in sdk.candles[-20:]) / 20
```

### Cause - Division by zero
```python
# Incorrect: when avg_loss == 0, breaks
rs = avg_gain / avg_loss
```
**Fix:**
```python
if avg_loss == 0:
    return 100.0
rs = avg_gain / avg_loss
```

### Cause - Key missing
```python
# Incorrect: if the candle does not have 'volume'
vol = sdk.candles[-1]["volume"]
```
**Fix:**
```python
vol = sdk.candles[-1].get("volume", 0.0)
```

## `WorkerPoolTimeout`

```
WorkerPoolTimeout: timed out waiting for Python worker
```

The sandbox has a finite pool of Python workers. When many requests arrive, the queue fills and new requests wait. If the wait exceeds the configured timeout, the request fails.

**Fix:** this is transient. Retry after a few seconds. If persistent, the backend is overloaded; wait for capacity to free up.

## `UnknownError`

```
UnknownError: <message>
```
Fallback when the engine has not categorized the exception. It usually coincides with a Python `RuntimeError`.

**Fix:** inspect the message. If it contains a Python traceback, treat it as RuntimeError.

## Silent rendering issues (no exception)

Some misconfigurations do not raise an error — the script runs, the engine
accepts the return value, but the chart is empty or wrong. The most common:

| Symptom | Likely cause | Fix |
|---|---|---|
| Legend chip appears, line is invisible | Oscillator declared with `pane: "overlay"` (default). On a high-priced asset, the line collapses against y=0 | Add `"pane": "new"` and `"scale": "right"` to the DECLARATION |
| Width or color of a plot ignored | Field `lineWidth` (legacy) or 8-digit hex (`#RRGGBBAA`) | Use `"width": 2` and 6-digit hex (`"#RRGGBB"`); area transparency is automatic |
| Reference levels (0, 70, 30) don't render with the right baseline | Constant series used instead of `levels` | Move the constants into `DECLARATION["levels"]` |
| Plot drawn but `pane` field of declaration looks ignored | Style override saved with the indicator (legacy `style.pane`) is fighting the declaration | Re-save the indicator with the current declaration; the editor strips legacy style pane on save |

## Quick diagnostic table

| Message | Likely category | First step |
|---|---|---|
| "Import not allowed" | SecurityError | Remove the import |
| "Forbidden builtin" | SecurityError | Remove the use |
| "Lambda" | SecurityError | Replace with `def` |
| "Strict Mode" | ProtocolError | Add `main()` |
| "explicit action" | ProtocolError | Add `action=` |
| "execution exceeded time limit" | TimeoutError | Optimize the loop |
| "memory limit exceeded" | MemoryError | Bound lists in state |
| "IndexError" / "list out of range" | RuntimeError | Check `len(sdk.candles)` |
| "ZeroDivisionError" | RuntimeError | Check divisor != 0 |
| "KeyError" | RuntimeError | Use `.get()` with a default |
| "timed out waiting for worker" | WorkerPoolTimeout | Retry |

## Debugging in the live editor

When seeing an error in the "Errors" tab:

1. **Read the full message**, including traceback if present.
2. **Locate the line** indicated by the traceback.
3. **Test hypotheses** with `print()`:
   ```python
   print(f"DEBUG: sdk.position={sdk.position}, len(candles)={len(sdk.candles)}")
   ```
4. **Re-run** and inspect the logs.

## Next steps

* [Sandbox limits](../getting-started/sandbox-limits.md) - full restrictions.
* [Backtest troubleshooting](../backtest/troubleshooting.md) - behavior problems (not errors).
* [Script lifecycle](../contract/lifecycle.md) - in which phase each error may arise.
