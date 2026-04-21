# Live vs backtest differences

The Python contract is **identical** in both contexts, but execution details differ. Knowing these differences explains why a strategy that is profitable in the backtest may behave unexpectedly live.

## When the script is called

### Backtest
The engine iterates over **each historical candle in sequence**, as fast as possible. On each iteration, it updates `sdk.candles` and calls `main(sdk=sdk, ...)`. Thousands of candles are processed in seconds.

### Live
The engine **waits for the real candle to close** (according to the configured timeframe) before calling the script. For 1m, 1 call per minute; for 1h, 1 call per hour.

**Implication:** live has **natural latency**. The script does not react to every market tick, only to each candle close.

## Execution price

### Backtest
Configurable simulated model:
- **Market order:** price of the current candle's `close` plus the slippage configured in ticks.
- **Limit order:** if the price touched the limit during the candle, it executes (with `probFillOnLimit`).
- **Stop order:** if the trigger was touched, it executes.

Simulation is deterministic: the same code and the same data produce the same result.

### Live
Real price from the connected exchange's order book:
- **Market order:** ask price (buy) or bid price (sell) at the moment of submission.
- **Limit order:** sent to the real book, awaits a match.
- **Stop order:** likewise.

Execution is **non-deterministic**: the book changes every microsecond, so two runs of the same script may present slightly different execution prices.

## Slippage

### Backtest
Slippage in ticks is a fixed **configuration**: the engine always applies the defined value.

### Live
Slippage is **real**. In ultra-liquid markets it is minimal (a few basis points). In smaller instruments or short timeframes, it can be high.

**Common discrepancy:** backtest with slippage = 0 versus live with real slippage. A strategy profitable in the backtest may be neutral or negative live if the slippage cost is material.

## Fees

### Backtest
Fees in bps configured in the panel (maker/taker). Applied on each trade.

### Live
Real fees charged by the connected exchange, according to its published fee schedule.

**Fix:** configure the backtest with the exchange's exact fees for comparable results.

## Latency

### Backtest
Zero latency; the engine processes instantly. Orders execute exactly on the candle on which they are issued.

### Live
There is real latency between:
- Candle close at the exchange and candle arrival at the TessTrade backend (via WebSocket).
- Script call by the backend and order emission.
- Order sending to the exchange and execution.

Strategies sensitive to short movements are affected.

## Parallelism

### Backtest
A single process serializes candles. Deterministic.

### Live
Each bot runs in its own task. Multiple bots on the same symbol receive the same candle **simultaneously**: with 5 bots operating BTCUSDT, all are called at the same time when the candle closes.

**Implication:** orders from different bots on the same account **compete** for Max Positions. The first to arrive opens; the others are rejected.

## Backend restart

### Backtest
Not applicable. When it ends, it ends.

### Live
Deploys and crashes happen. After a backend restart:
- **Orders and positions:** hydrated from the database. Exposure is not lost.
- **`sdk.state`:** lost. The script starts from scratch.
- **Module global variables:** lost.
- **Active bots:** **not** restarted automatically. They must be recreated.

**Implication:** strategies dependent on state accumulated across many bars (complex trailing stop, manual cached EMA without recomputation) may temporarily degrade after a restart.

## Market data

### Backtest
Clean, historical data, without gaps. Coming from the configured data provider.

### Live
Raw data from the stream. May contain:
- **Gaps** (WebSocket momentarily disconnected).
- **Delayed ticks** (network).
- **Suspicious volume** (wash trading, disconnects).

Resilient scripts **do not rely** on precise volumes live; they use volume as a macro filter, not as a fine input.

## Atomic operations

### Backtest
Everything is serial. It is possible to assume consistent state at any point.

### Live
Race conditions exist. Example: `if sdk.position == 0: sdk.buy(...)` may, between reading `sdk.position` and executing the order, see another bot on the same account open a position. The order is rejected.

**Fix:** do not rely on assumptions about state. Treat rejections as normal and inspect logs periodically.

## Execution order

### Backtest
Signals emitted in one call are **all processed before the next candle**. With `sell_to_close` plus `buy_to_open` in the same call, the engine executes both in a deterministic sequence.

### Live
Signals are submitted to the exchange **in parallel** (or in batch). There is no ordering guarantee. For atomicity (close A and open B), use `reverse_position`.

## Debugging

### Backtest
May run 100 times and produce identical results. Reproducible logs.

### Live
Problems are **ephemeral**. An order rejected today may not reproduce tomorrow. Logs and metrics are the only tool; use `print()` liberally in critical conditions and remove afterwards.

## When the strategy works in backtest but fails live

Checklist:

1. **Underestimated slippage.** Double the slippage in the backtest and rerun; verify it remains profitable.
2. **Underestimated fees.** Confirm they match the exchange's actual fees.
3. **Look-ahead bias.** Was `current_candle.high` used for a decision within the same candle? Review the code.
4. **Too short a timeframe.** In 1m, noise and latency dominate. Try 15m or 1h.
5. **Market changed regime.** The backtest may have included a bull market, while live is sideways. No backtest fully prepares for this.
6. **Insufficient sample size.** 30 trades in the backtest may be luck. Wait for at least 100.

## When to trust each

| Question | Use |
|---|---|
| "Does the idea have edge?" | Backtest (several years, several regimes) |
| "Is the implementation correct?" | Backtest (deterministic, reproducible) |
| "Does the logic hold up on real data?" | Live paper (2-4 weeks before real capital) |
| "What is the current market regime?" | Live (the backtest is always the past) |
| "What is the historical performance?" | Backtest |
| "What is the expected performance in a week?" | Neither answers with certainty. |

## Next steps

* [Live editor](live-editor.md) - where the script runs live.
* [Paper Trading Bots](paper-trading-bots.md) - running persistent scripts.
* [Backtest troubleshooting](../backtest/troubleshooting.md) - diagnosis for atypical backtest results.
