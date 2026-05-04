# TessTrade Python SDK

Write indicators and strategies in **Python**. The same script runs in two contexts - a historical backtest and live chart trading - under an identical contract. This documentation covers how the engine calls your code, what the SDK exposes, the set of accepted actions, and the most common pitfalls.



::: info
**New here?** Start with [Backtest vs Chart Trading](getting-started/overview.md) for the mental model, then jump to the [Example script](getting-started/example-script.md) to write your first strategy in five minutes.
:::



## What you write

A Python file with a `main(df, sdk, params)` function and, optionally, a `DECLARATION` dictionary describing the editable parameters and the chart plots.

```python
DECLARATION = {
    "type": "strategy",
    "inputs": [
        {"name": "fast_period", "type": "int", "default": 9,  "min": 1, "max": 100},
        {"name": "slow_period", "type": "int", "default": 21, "min": 2, "max": 200},
    ],
}

def main(df=None, sdk=None, params={}):
    params = params or {}
    if sdk is not None:
        # tick by tick / candle by candle execution
        return on_bar_strategy(sdk, params)
    if df is not None:
        # chart plots
        return _build_chart(df, params)
    return DECLARATION
```

The same function is called in three different contexts. See [The `main()` dispatcher](contract/dispatcher-main.md) for details on each one.

## Documentation map

### Getting started

| Page | Description |
|---|---|
| [Backtest vs Chart Trading](getting-started/overview.md) | The two execution contexts and why the same script runs in both |
| [Example script](getting-started/example-script.md) | A minimal runnable strategy to verify the editor and the pipeline |
| [Sandbox limits](getting-started/sandbox-limits.md) | Available modules, builtins, and resource caps |

### Contract

| Page | Description |
|---|---|
| [The `main()` dispatcher](contract/dispatcher-main.md) | The three contexts the engine calls your script in |
| [The `DECLARATION` shape](contract/declaration.md) | Root-level dictionary for inputs, plots, and conditions |
| [Script lifecycle](contract/lifecycle.md) | How the engine loads, validates, and executes your code |

### SDK reference

| Page | Description |
|---|---|
| [Candles, params and state](sdk-reference/candles.md) | Reading market data and persisting values across bars |
| [Position, cash and equity](sdk-reference/positions.md) | Portfolio properties exposed on the SDK |
| [Canonical actions](sdk-reference/actions.md) | Every action string the engine accepts |
| [Order types](sdk-reference/order-types.md) | Market, limit, stop, stop-limit, bracket |
| [Stops, targets and trailing](sdk-reference/stops-and-targets.md) | Protective stops, take-profit, and trailing stops |

### Indicators

| Page | Description |
|---|---|
| [Plots and `series`](indicators/plots-and-series.md) | How chart plots are declared and rendered |
| [Implementing SMA and EMA](indicators/implementing-sma-ema.md) | Moving average recipes in pure Python |
| [RSI, MACD and Bollinger Bands](indicators/rsi-macd-bands.md) | Pure-Python implementations of the three most common oscillators |
| [Panes: overlay vs new pane](indicators/panes.md) | When to overlay on price versus use a separate pane |

### Ready-to-use strategies

| Page | Description |
|---|---|
| [SMA Crossover](strategies/sma-crossover.md) | Dual moving-average trend-following template |
| [RSI Mean Reversion](strategies/rsi-mean-reversion.md) | Overbought/oversold reversal template |
| [MACD Momentum](strategies/macd-momentum.md) | Signal-line crossover template |
| [Persistent state and trailing stop](strategies/persistent-state.md) | Patterns for `sdk.state` and trailing exits |
| [Solid entry/exit patterns](strategies/entry-exit-patterns.md) | Checklist of robust practices |

### Declarative mode

| Page | Description |
|---|---|
| [When to use entry/exit conditions](declarative-mode/when-to-use.md) | Declarative versus imperative mode and how to choose |
| [Supported operators](declarative-mode/operators.md) | Operator catalog with semantics |

### Backtest

| Page | Description |
|---|---|
| [Reading the results](backtest/reading-results.md) | Interpreting the output panel |
| [Performance metrics](backtest/metrics.md) | Sharpe, drawdown, profit factor, and which ones actually matter |
| [Troubleshooting](backtest/troubleshooting.md) | Common failure modes with root cause and fix |

### Chart Trading

| Page | Description |
|---|---|
| [Live editor](chart-trading/live-editor.md) | In-chart development environment |
| [Paper Trading Bots](chart-trading/paper-trading-bots.md) | Persistent simulated bots that run without an open tab |
| [Live vs backtest differences](chart-trading/live-vs-backtest.md) | Subtle execution gaps between the two contexts |

### Reference

| Page | Description |
|---|---|
| [Canonical actions table](reference/canonical-actions.md) | Quick lookup for every accepted action |
| [Operators table](reference/operators.md) | Quick lookup for declarative operators |
| [Error catalog](reference/errors.md) | Every exception the engine can raise and how to fix it |
| [Glossary](reference/glossary.md) | Term definitions |

## What the SDK provides

* **`sdk.candles`** - list of OHLCV candles.
* **`sdk.params`** - the parameters defined in `DECLARATION["inputs"]`, already typed.
* **`sdk.state`** - dictionary persistent across candles (useful for trailing stops, flags, cooldowns).
* **`sdk.position`** - current net position (positive = long, negative = short, zero = flat).
* **`sdk.cash`**, **`sdk.equity`**, **`sdk.buy_price`**, **`sdk.sell_price`** - portfolio snapshot.
* **`sdk.buy(...)`**, **`sdk.sell(...)`**, **`sdk.close(...)`**, **`sdk.update_exits(...)`** - issue signals.

Full API in [SDK reference](sdk-reference/candles.md).

## Sandbox

Scripts run in a hardened Python sandbox. Available resources:

* **Injected modules (no `import` required):** `np` (numpy), `pd` (pandas), `math`, `json`, `datetime`, plus safe optimized versions of `ta`, `pandas_ta`, and `talib`.
* **Allowed builtins:** `len`, `range`, `sum`, `abs`, `min`, `max`, `round`, `sorted`, `zip`, `enumerate`, `isinstance`, `int`, `float`, `str`, `list`, `dict`, `tuple`, `set`, `print`.
* **Exception classes:** `ValueError`, `TypeError`, `KeyError`, `IndexError`, `RuntimeError`, `ZeroDivisionError`, `OverflowError`.

Anything outside this surface raises `SecurityError`. Full detail in [Sandbox limits](getting-started/sandbox-limits.md).

## Execution limits

| Limit | Default | Raised if exceeded |
|---|---|---|
| Time per bar | 800ms | `TimeoutError` (single bars are tolerated; persistent failures abort the run) |
| Memory | per-strategy ceiling | `MemoryError` |
| Code size | ~100KB | rejected at load time |
| Nesting depth | 20 levels | rejected at load time |



::: tip
**Quick start:** copy the [SMA Crossover](strategies/sma-crossover.md) template, adjust the parameters, and run it. From there, swap in the indicator of your choice from [Implementing SMA and EMA](indicators/implementing-sma-ema.md) or [RSI, MACD and Bollinger Bands](indicators/rsi-macd-bands.md).
:::

