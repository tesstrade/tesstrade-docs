# Performance metrics

The backtest results panel displays a dozen numbers. Some carry significant weight in evaluation; others little. This page describes the meaning of each one.

## Main metrics

### 1. Total return
```
((equity_final / equity_initial) - 1) * 100
```
Change in capital over the period. Baseline for all other metrics.

**Interpretation:** 20% in 1 year is good, 50% is excellent, 200% is suspicious (verify sanity).

### 2. Sharpe ratio (annualized)
```
(mean_return - risk_free) / volatility_of_returns * sqrt(252)
```
Risk-adjusted return. The most widely used metric in quant.

| Sharpe | Interpretation |
|---|---|
| < 0.5 | Weak; does not compensate for the risk |
| 0.5 - 1.0 | Acceptable, not exceptional |
| 1.0 - 2.0 | **Good**; realistic target for live strategies |
| 2.0 - 3.0 | Very good; rare |
| > 3.0 | Probable overfitting; maintain skepticism |

**Caveat:** an annualized Sharpe on a 6-month backtest is less reliable than on 5 years.

### 3. Max drawdown (MDD)
```
min((equity - previous_peak) / previous_peak) * 100
```
Largest valley of the equity curve; maximum loss from peak to trough.

**Psychological interpretation:**
- **< 10%:** tolerated by almost all traders.
- **10-25%:** tolerable for most.
- **> 30%:** risk of abandoning the strategy before recovery.

A high Sharpe with a 50% MDD presents significant emotional risk of interrupting operations.

### 4. Profit factor
```
sum_of_gains / sum_of_losses
```
Gain per unit lost.

| PF | Interpretation |
|---|---|
| < 1.0 | Loses money |
| 1.0 - 1.3 | Marginal; may be luck |
| 1.3 - 1.7 | **Good**; robust across varied markets |
| 1.7 - 2.5 | Very good |
| > 3.0 | Suspicious; verify there is no single dominant trade |

### 5. Win rate
```
winning_trades / total_trades * 100
```
Percentage of positive trades.

**Do not evaluate in isolation.** A strategy with 30% win rate and profit factor 2.0 (loses little, wins big) is excellent. One with 80% win rate and PF 0.9 (wins little, loses big) is poor.

### 6. Average trade P&L
```
total_P&L / number_of_trades
```
Average return per trade.

It must be significantly greater than the cost (fees plus slippage) per trade. If the typical cost is BRL 10 and the average trade profits BRL 12, the margin is insufficient.

## Secondary metrics

### Sortino ratio
Similar to Sharpe, but penalizes only negative volatility (losses). More suitable for asymmetric strategies.

### Calmar ratio
```
CAGR / abs(max_drawdown)
```
Annualized return divided by drawdown. Calmar > 1.0 is good; > 3.0 is excellent.

### Average hold time
Identifies the effective operating timeframe. Scalper: seconds to minutes; swing: days; position: weeks.

### Largest loss
A single trade with a loss exceeding 3x the average loss size is a red flag. It may indicate a missing stop or a tail event.

### Recovery factor
```
total_return / max_drawdown
```
Number of times profit covers the worst drawdown. Above 3.0 is reasonable; above 10.0 is excellent.

### Expectancy
```
(win_rate * avg_win) - (loss_rate * avg_loss)
```
Expected profit per trade. Must be positive. Consistent positive expectancy, a sufficient number of trades and capital characterize a scalable strategy.

## Metrics that can be ignored initially

### Alpha / Beta
Applicable for comparison against a benchmark (e.g., SPY). In pure crypto, the natural benchmark varies (BTC, total market). Complex; ignore early on.

### Information ratio
Variant of Sharpe against a benchmark. Same case as alpha.

### Omega ratio
Unified metric weighting gain versus loss. Applicable in specific cases; Sortino covers the essential.

## Decision framework

A practical process:

### Step 1 - Minimum filter
- Profit factor > 1.2
- Sharpe > 0.8
- More than 50 trades
- Drawdown < 25%
- Positive expectancy

If any item fails, return to the editor.

### Step 2 - Sanity against overfitting
- **Split test:** backtest over 2 non-overlapping periods (e.g., 2022 and 2024). Metrics must be **similar**. A difference greater than 2x indicates overfitting.
- **Walk-forward:** optimize parameters on 1 year, test on another. Significant degradation indicates overfitting.

### Step 3 - Robustness to parameters
- Vary main parameters by +/-20%. A drastic drop in Sharpe characterizes a fragile strategy.
- A stable metric indicates real edge; localized peaks indicate a specific point in the parameter space.

### Step 4 - Live paper trading
Place in chart trading for 2-4 weeks in paper. Compare with the backtest. A large discrepancy indicates bias in the backtest (underestimated slippage, accidental look-ahead).

## Ranking strategies

With several versions running, compare in a consolidated table:

| Strategy | Sharpe | MDD | PF | Trades | Verdict |
|---|---|---|---|---|---|
| SMA 9/21 | 1.2 | 18% | 1.5 | 87 | Use |
| SMA 5/13 | 1.5 | 35% | 1.6 | 140 | High DD |
| RSI 14 | 0.7 | 12% | 1.3 | 65 | Low Sharpe |
| MACD default | 1.1 | 22% | 1.7 | 53 | Use |

The "best" strategy depends on the **risk profile**, not on Sharpe alone. If 35% DD is intolerable, SMA 5/13 is unsuitable even with a higher Sharpe.

## Frequent reading errors

### Comparing Sharpe across different time periods
A 6-month Sharpe is not comparable to a 2-year Sharpe. Annualize or compare identical periods.

### Considering win rate in isolation
An 80% win rate without the corresponding PF is inconclusive. Small gains and rare large losses characterize martingale with explosion risk.

### Trusting a short backtest
30 trades in 3 months may have Sharpe 2.0 by luck. Minimum of 100 trades and 6 months for confidence.

### Ignoring fees and slippage
Without costs, any strategy reaches Sharpe 3.0. Costs turn marginal strategies into losing ones.

## Next steps

* [Reading the results](reading-results.md) - where each metric appears on the panel.
* [Troubleshooting](troubleshooting.md) - procedures for atypical metrics.
