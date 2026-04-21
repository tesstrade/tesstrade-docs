# Reading the results

At the end of a backtest, TessTrade generates a results panel with several sections. Each one answers a different question about the strategy.

## Panel overview

1. **Summary (quantitative metrics)** - Sharpe, drawdown, profit factor, etc.
2. **Equity curve** - capital chart over time.
3. **Trades** - detailed list of each trade: entry, exit, P&L, duration.
4. **Distribution** - histogram of gains/losses.
5. **Logs** - script stdout (output from `print()`).

## Equity curve

The equity line shows the evolution of total capital across the backtested period.

### What to observe

- **General shape:** rising indicates a profitable strategy; falling, a losing one; plateau, neutral.
- **Visible drawdowns:** deep valleys represent periods of losses. Details in [Performance metrics](metrics.md).
- **Consistency:** a smooth curve with small oscillations is preferable to one with large sporadic jumps, even with similar total P&L.
- **Concentration period:** if all performance comes from 2-3 trades on specific dates, the strategy is fragile.

### Benchmark (optional)

If the UI offers a "buy and hold" overlay, compare strategy performance against simply buying and holding the asset. If the strategy does not outperform the benchmark, no additional value is added.

## Trade list

Table detailing each round-trip (entry plus exit) with:

| Column | Meaning |
|---|---|
| Entry time | Entry timestamp (ms or date) |
| Entry price | Price executed at entry |
| Exit time | Exit timestamp |
| Exit price | Price executed at exit |
| Side | `long` or `short` |
| Qty | Position size |
| P&L (abs) | Profit / loss in monetary units |
| P&L (%) | Percentage return on allocated capital |
| Duration | Time in position |
| Fees | Fees charged |
| Slippage | Execution slippage |

### Useful filters
- **Sort by P&L:** identifies the best and worst trades and exposes where the strategy wins or loses.
- **Filter by date:** isolates specific periods, for example performance during a bear market versus a bull market.
- **Filter by side:** separates long from short results.

## Result distribution

Histogram of trades classified by P&L:
- Many small losses and few large gains characterize typical trend-following.
- Many small gains and few large losses characterize typical mean-reversion.
- **Anomalies:** a single trade explaining 50% of the total P&L is a red flag and indicates luck rather than edge.

## Logs

Capture of the script's `stdout`. Useful for debugging:

```python
def on_bar_strategy(sdk, params):
    rsi = _rsi_last([c["close"] for c in sdk.candles], 14)
    print(f"[{sdk.candles[-1]['time']}] RSI={rsi:.2f} pos={sdk.position}")
```

Each `print()` generates a line in the log with a timestamp. Uncaught exceptions also appear here, with traceback.

**Note:** in scripts that run across thousands of candles, `print()` on every bar generates huge logs. Use sparingly or guard with `if`.

## Sanity - quick checklist when opening results

Before considering a high Sharpe as definitive:

### 1. Is the number of trades reasonable?
- **Few trades (< 20):** the result may be luck. Low statistical confidence.
- **Tens to hundreds:** adequate base for conclusions.
- **Thousands in a short period:** probable overreaction to noise. Review signals.

### 2. An extreme win rate is suspicious
- **> 80%:** either the strategy is exceptional, or there is look-ahead bias zeroing unrealized losses and accounting only for gains.
- **< 40% but profitable:** acceptable if expectancy (avg P&L x win_rate - avg loss P&L x loss_rate) is positive. Check profit factor.

### 3. Is the equity curve "too smooth"?
Very smooth strategies with no visible drawdown often indicate overfitting: parameters adjusted to fit historical data. Test on an **out-of-sample period** (another year) before trusting.

### 4. Performance concentrated on a few dates?
Sort trades by P&L and observe the top 5. If they sum to more than 30% of the total P&L, the strategy is fragile.

### 5. Max drawdown acceptable?
Drawdown is the **largest valley** of the equity curve. For most traders, above 30% is psychologically painful. If the backtest shows a 45% DD with a good Sharpe, evaluate tolerance before going live.

### 6. Are fees and slippage enabled?
Without fees and slippage, results are not realistic. TessTrade applies them by default; confirm in the backtest configuration section.

## Settings relevant to results

### Execution model
- **Pessimistic** (default): in case of ambiguity (stop and target touched on the same candle), the stop wins. Conservative.
- **Optimistic:** the target wins. Generates unrealistically optimistic results; use only for debug.

### Slippage
In ticks. For crypto 1h, `2` is reasonable. For shorter intraday, increase.

### Probability fill on limit
Controls how often a limit order fills when the price touches it. Lower values reflect realistic queue competition. Tune according to the market being simulated.

### Fees
Maker/taker in bps. Configure according to the fee schedule of the venue being simulated.

## Exporting results

The panel typically offers:
- **CSV of trades** for analysis in Excel/Pandas.
- **JSON of equity curve** to compare strategies externally.
- **PDF report** as a printable summary.

## Next steps

* [Performance metrics](metrics.md) - meaning of each number and reference targets.
* [Troubleshooting](troubleshooting.md) - diagnosis of atypical results (0 trades, 1 trade, absurd drawdown).
