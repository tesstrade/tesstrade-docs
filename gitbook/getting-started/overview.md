# Backtest vs Chart Trading

TessTrade runs the **same Python script** in two contexts. You write once and decide where to test or operate. Understanding the difference prevents confusion about "why it worked in backtest but not live".

## Comparison

| | **Backtest** | **Chart Trading** |
|---|---|---|
| **Data** | Full history pre-loaded | Live stream candle by candle |
| **Execution time** | Minutes (processes thousands of candles) | Indefinite (keeps running while enabled) |
| **Orders** | Simulated against history | Simulated against a paper trading account |
| **Slippage/fees** | Configurable in the panel | Real from the connected exchange's order book when available |
| **Result** | Final snapshot with metrics | Evolving orders + equity |
| **Typical use** | Validate an idea before running live | Operate paper in real time |

Both use exactly the **same Python contract** (`main(df, sdk, params)`, `DECLARATION`, 7 canonical actions). The code remains identical.

## Canonical flow

```
  1. Write the script in the Code Editor
                |
                v
  2. Run in Backtest (historical replay)
                |
         [iterate until solid]
                |
                v
  3. Promote to Chart Trading (live paper)
                |
         [monitor for days/weeks]
                |
                v
  4. Consider real capital (out of scope for this doc)
```

## When to use each

### Use **Backtest** when:

* **Validating a new idea.** "Does SMA crossover 9/21 on ETHUSDT 1h produce a profit?" - backtest answers in 2 min.
* **Optimizing parameters.** Vary `fast_period` between 5 and 30 and evaluate which yields the best Sharpe.
* **You want quantitative metrics.** Sharpe, drawdown, profit factor, win rate - only the backtest delivers all of them together (see [metrics](../backtest/metrics.md)).
* **Testing on several years of data.** Live takes 1 year to produce 1 year of data. The backtest processes the same interval in seconds.
* **Comparing strategies.** Run 5 different versions over the same period and compare results.

### Use **Chart Trading** when:

* **You have already validated in backtest** and want to observe real behavior before operating with capital.
* **Testing robustness against live data.** Some bugs appear only with a real stream (latency, gaps, late trades).
* **Validating the strategy under the current regime.** A 2020 backtest may have great metrics that do not repeat today.
* **Strategy depends on intraday timing.** When the script reads `sdk.candles[-1]["time"]` for session decisions, rigorous backtesting is harder.

## Caveats when migrating from backtest to live

Even with an identical contract, three things change:

### 1. Delayed data

In **backtest**, `sdk.candles[-1]` is always the "now" candle of the replay. In **chart trading**, there is a delay (typically 100-500ms) between the real close and the candle arriving at the script. Time-sensitive decisions (orders in the first seconds of the candle) may behave differently.

### 2. Real slippage

In backtest, slippage is configured as an estimate. In live, the execution price depends on who is in the book at the moment. In more liquid crypto (BTC, ETH) the difference is minimal; in altcoins it can be relevant.

### 3. Engine restarts

Chart trading runs in a long-lived process. If the backend restarts (deploy, crash), `sdk.state` is **rebuilt** via hydration from the DB, but some edge cases may lose volatile state (for example, an in-memory counter populated manually). Backtest runs from scratch, without that complication.

Details in [live vs backtest](../chart-trading/live-vs-backtest.md).

## Context-specific content

| Section | Context |
|---|---|
| [Contract](../contract/dispatcher-main.md) | Both (identical) |
| [SDK Reference](../sdk-reference/candles.md) | Both (identical) |
| [Indicators](../indicators/plots-and-series.md) | Both |
| [Ready-to-use strategies](../strategies/sma-crossover.md) | Both - run in either |
| [Declarative mode](../declarative-mode/when-to-use.md) | Both |
| [Backtest](../backtest/reading-results.md) | **Specific - reading results, metrics, troubleshooting** |
| [Chart Trading](../chart-trading/live-editor.md) | **Specific - live editor, paper bots, execution differences** |

## Next steps

* [Example script](example-script.md) - minimal runnable version.
* [`main()` dispatcher](../contract/dispatcher-main.md) - the core of the contract.
* [Ready-to-use template](../strategies/sma-crossover.md) to copy and adapt.
