# Sandbox limits

The code runs in a **hardened** Python sandbox. The engine validates the source before executing, blocks unsafe modules and builtins, and enforces time and memory limits.

This document describes the applied limits and how to avoid them.

## Available modules

Injected automatically as globals (no `import` required):

| Name in the script | Type | Common use |
|---|---|---|
| `np` | `numpy` | `np.mean`, `np.std`, `np.array` |
| `pd` | `pandas` | `pd.DataFrame`, `pd.Series`, `pd.to_datetime` |
| `math` | `math` stdlib | `math.sqrt`, `math.log`, `math.pi` |
| `json` | `json` stdlib | `json.dumps`, `json.loads` |
| `datetime` | `datetime` module | `datetime.datetime.fromtimestamp` |
| `ta` / `pandas_ta` | safe optimized version | subset of `ta.ema`, `ta.rsi`, etc. |
| `talib` | safe optimized version | limited subset |

**Example:** the script below runs without error, with no `import`:

```python
def on_bar_strategy(sdk, params):
    closes = np.array([c["close"] for c in sdk.candles])
    vol = np.std(closes[-20:])  # standard deviation of the last 20 closes
    ...
```

### About `ta` / `pandas_ta` / `talib`

These are safe, optimized versions that expose a subset of the popular functions. For full control over behavior, implement indicators in pure Python or with `np`/`pd`. See [implementing SMA/EMA](../indicators/implementing-sma-ema.md).

### Forbidden modules

The import whitelist accepts only the modules above. Any other triggers `SecurityError`:

```python
import os              # SecurityError
import requests        # SecurityError
import subprocess      # SecurityError
from scipy import ...  # SecurityError
import random          # SecurityError - not in the whitelist
```

### Why `random` is blocked

To guarantee **determinism** - same input, same output. When randomness is required, use a seed combined with a hash:

```python
seed = int(sdk.candles[-1]["time"]) % 10_000
pseudo_random = (seed * 1103515245 + 12345) % 2_147_483_648
```

## Available builtins

Full whitelist:

**Types and constants:** `None`, `True`, `False`, `bool`, `int`, `float`, `str`, `list`, `tuple`, `dict`, `set`, `frozenset`

**Math:** `abs`, `min`, `max`, `sum`, `round`, `pow`, `divmod`

**Iteration:** `len`, `range`, `enumerate`, `zip`, `reversed`, `sorted`, `filter`, `map`

**Logic:** `all`, `any`

**Type checking:** `isinstance`, `issubclass`, `type`, `callable`, `hasattr`, `getattr`

**String:** `chr`, `ord`, `format`, `repr`, `ascii`

**Object:** `id`, `hash`, `iter`, `next`, `slice`

**Exceptions (for `try/except`):** `Exception`, `ValueError`, `TypeError`, `KeyError`, `IndexError`, `AttributeError`, `RuntimeError`, `ZeroDivisionError`, `OverflowError`, `StopIteration`

**Debug:** `print` (the output is captured and sent to the logs)

### Blocked builtins

```python
open("file.txt")      # SecurityError - I/O
exec("code")          # SecurityError - dynamic execution
eval("expression")    # SecurityError
__import__("os")      # SecurityError
input()               # SecurityError - I/O
dir()                 # SecurityError - introspection
vars()                # SecurityError
globals()             # SecurityError
locals()              # SecurityError
exit(), quit()        # SecurityError - process control
breakpoint()          # SecurityError - debugging
setattr(x, "y", 1)    # SecurityError (removed)
delattr(x, "y")       # SecurityError
memoryview(x)         # SecurityError
```

### Forbidden dunder attributes

Access to `__xxx__` attributes (except a few whitelisted ones) is blocked to prevent sandbox escape:

```python
obj.__class__             # SecurityError
obj.__dict__              # SecurityError
obj.__bases__             # SecurityError
obj.__subclasses__()      # SecurityError
```

### Lambdas

Lambdas are not allowed:

```python
f = lambda x: x * 2       # SecurityError
```

Alternative: use a normal `def`.

```python
def f(x):
    return x * 2
```

### Other restricted constructs

| Construct | Why it is blocked | Alternative |
|---|---|---|
| `lambda` | Can hide arbitrary code | `def helper(...)` |
| `global` / `nonlocal` | Mutates outer scopes implicitly | Pass values via parameters or `sdk.state` |
| `while True:` (infinite loop) | Cannot terminate within budget | `for ... in range(...)` or a finite condition |
| `eval` / `exec` / `compile` | Dynamic code execution | Express logic as plain Python |
| `del` (statement) | Removes protections from objects | Re-bind the variable to `None` instead |

In short: write direct, explicit code. If a construct does not pass the
validator, simplify the function. The whitelist intentionally favors
predictable scripts over clever ones.

## Resource limits

| Resource | Default limit | Raised if exceeded |
|---|---|---|
| **Time per call** | 200ms | `TimeoutError` |
| **Memory** | 64MB | `MemoryError` |
| **Source size** | ~100KB | rejected at load time (`SecurityError`) |
| **Nesting depth** | 20 levels of blocks | rejected at load time |

### About the 200ms limit

For a typical strategy (indicators over 500 candles, simple logic), 200ms is adequate headroom. The usual execution time is between 5 and 20ms. If the limit is being exceeded, check:

* Building `pd.DataFrame(sdk.candles)` on every candle is expensive. Prefer collecting directly with a list comprehension.
* Iteration over the entire `sdk.candles`. Use only the last N (`sdk.candles[-period:]`).
* Nested loop over candles. Reduce complexity - it is usually possible to vectorize with `np`.

### About the 64MB limit

For trading logic, 64MB is sufficient. If the limit is being exceeded, there is usually a list accumulating in `sdk.state` without bound:

```python
# Unbounded growth - causes MemoryError.
sdk.state["all_closes"] = sdk.state.get("all_closes", []) + [c["close"] for c in sdk.candles]
```

Cap the size:

```python
buf = sdk.state.setdefault("buffer", [])
buf.append(sdk.candles[-1]["close"])
if len(buf) > 1000:
    del buf[:len(buf) - 1000]  # keep only the last 1000
```

## Other important restrictions

* **`print` output** goes to the engine logs, not to the frontend console. Useful for debugging, but does not appear in real time.
* **The return value must be JSON-serializable.** Dict, list, str, int, float, bool, or None. Objects, sets (convert to list), and NaN (use None) are not supported.
* **Writes to `params` are ignored.** `params` is treated as read-only by the engine. To persist something, use `sdk.state`.
* **Writes to `sdk.candles[i]`** may have non-deterministic effects. Do not modify them.

## Diagnosing errors

When something fails, the engine categorizes the error. See [error catalog](../reference/errors.md) for the full table:

| Error | Common cause |
|---|---|
| `SecurityError` | Forbidden import, blocked builtin, lambda, dunder attribute |
| `TimeoutError` | Loop too slow or infinite |
| `MemoryError` | List/dict growing without bound |
| `ProtocolError` | `sdk.buy()` without `action`, invalid signal, non-JSON return |
| `RuntimeError` | Classic Python: IndexError, ValueError, ZeroDivisionError |
| `WorkerPoolTimeout` | Pool full; the strategy waited in the queue. Retry. |

## Next steps

* [Script lifecycle](../contract/lifecycle.md) - how the engine loads and calls the code.
* [Error catalog](../reference/errors.md) - meaning of each error and how to resolve it.
