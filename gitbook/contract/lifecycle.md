# Script lifecycle

This section describes how the engine loads, validates, and executes your code. The knowledge is useful for diagnosing errors and for writing code that correctly takes advantage of `sdk.state` and global variables.

## Overview

```mermaid
flowchart TD
    A[You paste the code into the editor] --> B[1. Validation]
    B -->|fails?| X[SecurityError, rejected before running]
    B --> C[2. Sandbox load]
    C --> C1[- executes root level<br/>- defines DECLARATION, on_bar_strategy, main, helpers<br/>- PARAMS and sdk injected as globals]
    C1 --> D[3. First call: main with no args]
    D --> D1[returns DECLARATION to build the parameters panel]
    D1 --> E[4. Per-candle loop:<br/>- updates sdk.candles (append or reset)<br/>- calls main(sdk=sdk, params=params)<br/>- collects emitted signals<br/>- engine executes the orders]
    E --> F[5. End (backtest) or continue (chart trading)]
```

## Phase 1 - Validation

Before executing a single line, the engine validates the code. If any check fails, the engine **never runs the code** and raises `SecurityError` with the offending line and reason. See [Sandbox limits](../getting-started/sandbox-limits.md) for the allowed surface.

## Phase 2 - Loading

If the AST passes, the engine executes the file in the sandbox namespace. It is the equivalent of an `exec(your_code, safe_globals)`:

* Root-level definitions (`DECLARATION = {...}`, `def main(...)`, `def _helper(...)`) are registered.
* Declared global variables (`PARAMS = {...}`) become live.
* Root-level statements run (`print("loaded")` here appears in the logs exactly once).

This phase happens exactly once, at script load time. If it fails (syntax error, top-level exception), the engine aborts.

### Global variables survive

Because the module stays loaded, anything at the root level **persists between calls**:

```python
GLOBAL_CACHE = {}  # empty at load time

def on_bar_strategy(sdk, params):
    # GLOBAL_CACHE is the SAME object across every call
    GLOBAL_CACHE[sdk.candles[-1]["time"]] = sdk.candles[-1]["close"]
```

This provides persistence at no extra cost, but it is considered an anti-pattern: prefer `sdk.state`, which is persisted to the database across backend restarts. Module-level globals are lost if the process restarts.

## Phase 3 - Entrypoint discovery

After loading, the engine searches for one of the **accepted entrypoints** (in order):

1. Function `main(df=None, sdk=None, params={})` - recommended, canonical mode.
2. Function `on_bar(sdk)` - legacy, no dispatcher.

If none is found, the engine raises:

```
ProtocolError: Strict Mode. Your strategy must define a function
'main(df=None, sdk=None, params={})' or 'on_bar(sdk)'.
```

## Phase 4 - Metadata (`main()` with no args)

As soon as the script loads, the engine calls `main()` **with no arguments** to obtain the `DECLARATION`:

```python
main()  # returns DECLARATION
```

The return value is used to:
* Build the editable parameters panel in the UI (`inputs`).
* Discover the plots required for the chart (`plots`).
* Read `entry_conditions` / `exit_conditions` if declarative mode is used.

If this call fails (exception in `main()` when `df` and `sdk` are None), the engine does not build the panel. Robust scripts guarantee a fallback:

```python
def main(df=None, sdk=None, params={}):
    params = params or {}
    if sdk is not None:
        return on_bar_strategy(sdk, params)
    if df is not None:
        return _build_chart(df, params)
    return DECLARATION   # <<<< always returns something here
```

## Phase 5 - Per-candle loop

This is where the strategy is executed. For **every closed candle**:

1. The engine updates `sdk.candles` with the latest list.
   - Default mode: replaces the entire list (`reset`).
   - `append` mode: appends the new candle to the end.
   - `replace_last` mode: updates only the last one (rare, used for intra-bar).
2. Calls `main(sdk=sdk, params=params)`.
3. The code reads `sdk.candles`, makes a decision, calls `sdk.buy/sell/close/...`.
4. Each action call adds a signal to the `signals` buffer.
5. When `main` returns, the engine collects the buffer and routes the orders.

### `sdk` between calls

The same `sdk` object is reused for every candle. Properties such as `sdk.position`, `sdk.cash`, `sdk.equity` are updated by the engine before each call.

`sdk.state` persists between calls of the same script.

### Editing parameters in the UI

New values arrive in `sdk.params` (and in the `params` argument) on the next call. The script requires no additional handling; simply read the parameters via `params.get(...)`.

## Phase 6 - Plots phase (`df=` branch)

**When it is called:** once per run (backtest), or when the user requests the script to be loaded on the chart (chart trading).

**What the engine passes:** `main(df=pandas_dataframe, params=params)`.

**What the script returns:** `{"plots": [...], "series": {...}}`.

This is a parallel phase, independent from the candle loop in phase 5. The script may be running bar-by-bar while the frontend requests a re-render of the plots (the engine calls `main(df=)` again). The two calls do not interfere with each other.

## Persistence across backend restarts

Chart trading is a long-running process. If the backend restarts (deploy, crash):

* **Orders and positions** are persisted in the database. On return, the engine rehydrates the ledger state and the engine state from storage.
* **`sdk.state`** is reinitialized. Volatile script state (flags, cooldowns, trailing high-water) may reset.
* **Module-level globals** (`PARAMS`, `GLOBAL_CACHE`) also reset.

**Mitigation:** if the script needs state that must survive a restart, save it to `sdk.state` at the start of every call. The engine persists `sdk.state` to the database when it is safe to do so.

For most scripts, restarts are rare and do not affect the strategy. The concern is only relevant for critical logic that depends on state accumulated over many bars (for example, a custom manual EMA fed bar by bar).

## Complete diagram

```mermaid
flowchart TD
    Start[BACKTEST / CHART TRADING] --> P1[1. Validation]
    P1 -->|fail| E1[SecurityError<br/>rejected]
    P1 --> P2[2. Loading<br/>exec(code, globals)]
    P2 -->|fail| E2[SyntaxError / RuntimeError<br/>aborted]
    P2 --> P3[3. Entrypoint discovery<br/>main / on_bar]
    P3 -->|fail| E3[ProtocolError<br/>Strict Mode]
    P3 --> P4[4. main() with no args<br/>-> DECLARATION]
    P4 --> P4R[params panel built in the UI]
    P4 --> P5[5. Per-candle loop<br/>main(sdk=, params=)<br/>-> signals collected]
    P5 -->|next candle| P5
    P5 -.in parallel.-> P6[6. Plots<br/>main(df=, params=)<br/>-> series + plots]
```

## Next steps

* [The `main()` dispatcher](dispatcher-main.md) - the 3 contexts in detail.
* [SDK reference](../sdk-reference/candles.md) - what is available in each call.
* [Sandbox limits](../getting-started/sandbox-limits.md) - what is accepted and what is rejected.
