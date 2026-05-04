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

The following modules require an explicit `import`:

| Module | What it is | When to use |
|---|---|---|
| `tesstrade_indicators` | native indicator library (optimized) | hot path of strategies that recompute indicators every bar |

**Example:** the script below runs without error, with no `import`:

```python
def on_bar_strategy(sdk, params):
    closes = np.array([c["close"] for c in sdk.candles])
    vol = np.std(closes[-20:])  # standard deviation of the last 20 closes
    ...
```

### About `ta` / `pandas_ta` / `talib`

These are safe, optimized versions that expose a subset of the popular functions. For full control over behavior, implement indicators in pure Python or with `np`/`pd`. See [implementing SMA/EMA](../indicators/implementing-sma-ema.md).

### About `tesstrade_indicators`

A native indicator library available as an optional `import`. Provides
the same Wilder/standard formulas as `pandas_ta` (RSI, EMA, ATR, MACD,
WMA, SMA) plus state-preserving streaming classes that are O(1) per
bar instead of O(n) — meaningful when the strategy recomputes the
same indicator on every candle. Full reference in
[tesstrade_indicators](../indicators/tesstrade-indicators.md).

```python
import tesstrade_indicators as ti

_rsi = ti.Rsi(14)  # constructed once at module scope; state survives across bars

def on_bar_strategy(sdk, params):
    _rsi.update(sdk.candles[-1]["close"])
    if _rsi.is_ready() and _rsi.value() < 30:
        sdk.buy(action="buy_to_open", qty=1, order_type="market")
```

### Forbidden modules

The import whitelist accepts only the modules above. Any other triggers `SecurityError`:

```python
import os              # SecurityError
import sys             # SecurityError
import subprocess      # SecurityError
import requests        # SecurityError
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
| **Time per bar** | 800ms | `TimeoutError` |
| **Memory** | per-strategy ceiling enforced by the engine | `MemoryError` |
| **Source size** | ~100KB | rejected at load time (`SecurityError`) |
| **Nesting depth** | 20 levels of blocks | rejected at load time |

### About the 800ms time budget

For a typical strategy (indicators over 500 candles, simple logic),
800ms is generous headroom — usual execution time is between 5 and
50ms. Backtests can request a higher per-bar budget when running
heavier strategies (ML inference, custom scientific computation); the
backtest panel exposes the option when applicable.

A single bar that exceeds the budget produces a `TimeoutError` for
that bar and the engine **continues** with subsequent bars. The
backtest only aborts when transient failures cross 5% of the total
bar count (and at least 5 bars failed) — single GC pauses or cold
starts no longer kill the run.

If timeouts are persistent, check:

* Building `pd.DataFrame(sdk.candles)` on every candle is expensive. Prefer collecting directly with a list comprehension.
* Iteration over the entire `sdk.candles`. Use only the last N (`sdk.candles[-period:]`).
* Nested loop over candles. Reduce complexity — it is usually possible to vectorize with `np` or move the hot path to `tesstrade_indicators`.
* Recomputing the same indicator from scratch every bar. Cache in `sdk.state` or use a streaming class from [`tesstrade_indicators`](../indicators/tesstrade-indicators.md).

### About the memory limit

For trading logic the per-strategy memory ceiling is generous —
strategies very rarely hit it organically. When `MemoryError` does
appear, there is usually a list accumulating in `sdk.state` without
bound:

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
| `TimeoutError` | A single bar exceeded the time budget. Tolerated up to 5% of bars (min 5 absolute) — beyond that the run aborts. |
| `MemoryError` | List/dict growing without bound |
| `ProtocolError` | `sdk.buy()` without `action`, invalid signal, non-JSON return |
| `RuntimeError` | Classic Python: IndexError, ValueError, ZeroDivisionError |
| `WorkerPoolTimeout` | Engine queue full; the request waited beyond its limit. Retry. |

## Next steps

* [Script lifecycle](../contract/lifecycle.md) - how the engine loads and calls the code.
* [Error catalog](../reference/errors.md) - meaning of each error and how to resolve it.
