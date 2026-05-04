# Troubleshooting

Most common problems in backtesting, with root cause and fix. Ordered by frequency of occurrence.

## "0 trades"

The backtest completes, but the trade list is empty.

### Cause 1 - `entry_conditions` and `on_bar_strategy` together

The most frequent case. When `entry_conditions` is present in the `DECLARATION` and `on_bar_strategy` is also defined, the engine prioritizes declarative mode and ignores the imperative one. If the conditions do not have valid `plots` or the series does not fire, the result is zero trades.

```python
# Incorrect
DECLARATION = {
    "entry_conditions": [{"action": "buy_to_open", "enabled": True, ...}],
    ...
}
def on_bar_strategy(sdk, params):
    sdk.buy(...)   # never runs
```

**Fix:** choose one mode and remove the other. Details in [when to use declarative mode](../declarative-mode/when-to-use.md).

### Cause 2 - Insufficient data for warmup

The strategy requires N candles, but the backtest has fewer than N. The script returns early on every bar:

```python
if len(sdk.candles) < 200:  # 200-bar warmup
    return
```

**Fix:** reduce the minimum period or extend the backtest interval. For SMA 200, use at least 500 candles to obtain effective signals.

### Cause 3 - Entry condition never true

The signal does not fire in the period. Possible reasons:
- Thresholds too restrictive (e.g., RSI < 10, extremely rare).
- Trend filter never aligned with the signal.
- Bug in the condition (wrong operator, different series name).

**Fix:** add `print()` temporarily:
```python
if sdk.position == 0:
    if rsi < oversold:
        print(f"SIGNAL fires: rsi={rsi}")
        sdk.buy(...)
```

If prints appear but trades do not, the issue is in `sdk.position` (position already open) or rejection due to balance.

### Cause 4 - `sdk.buy()` without `action=`

Raises `ProtocolError` and halts execution. On the panel, the error is displayed. If the script uses only `print()` instead of `sdk.buy()`, the error does not occur.

**Fix:** see [canonical actions](../sdk-reference/actions.md).

## "Only 1 trade"

One entry and one forced exit at the end of the period.

### Cause - missing exit condition

The position is opened but there is no logic to close it. The backtest keeps the position open until the last candle, closing on termination.

```python
# Incorrect: only enters, never exits
if sdk.position == 0 and crossed_up:
    sdk.buy(action="buy_to_open", qty=1, order_type="market")
# Missing: elif sdk.position > 0 and crossed_down: ...
```

**Fix:** add `elif sdk.position > 0 and <condition>: sdk.sell(action="sell_to_close", ...)`.

## "Positions accumulating"

The log shows several consecutive `buy_to_open` orders when one per signal is expected.

### Cause - missing `if sdk.position == 0:` before entering

On every bar in which the condition is true, the script attempts to open. The engine rejects silently (Max Positions = 1), but the log becomes polluted.

```python
# Incorrect
if fast_ma > slow_ma:
    sdk.buy(action="buy_to_open", qty=1, order_type="market")

# Correct
if sdk.position == 0 and fast_ma > slow_ma:
    sdk.buy(action="buy_to_open", qty=1, order_type="market")
```

## Absurd metrics (Sharpe > 5, PF > 10)

### Cause 1 - Look-ahead bias

Use of future data in the current decision. Classic example:

```python
# Incorrect: uses high of the candle still closing
if sdk.candles[-1]["high"] > sdk.candles[-1]["close"]:
    sdk.buy(...)
```

The `high` of the current candle is only known **at close**, but the code makes the decision as if the value were available during the candle. The backtest accepts this data as legitimate, generating a fantastic result that is not reproducible live.

**Fix:** use only data from the previous candle (`sdk.candles[-2]`) to decide at the close of the current one. The current candle may be used for `close` (decision price).

### Cause 2 - Optimistic execution model

Execution mode set to "optimistic": when stop and target are touched on the same candle, the target wins. Live, the stop wins; the mode is unrealistic.

**Fix:** in backtest settings, use **pessimistic** mode (default).

### Cause 3 - `probFillOnLimit = 1.0` on limit orders

With 100% fill on limit, every order that touches the price executes. In a real market, the order is not always ahead in the queue.

**Fix:** configure `probFillOnLimit = 0.6` to simulate a realistic book.

### Cause 4 - Zeroed fees

Without fees and slippage, marginally profitable strategies present unrealistic results.

**Fix:** verify the configuration section. Fees are on by default; if zeroed, restore them.

### Cause 5 - Short backtest concentrated in a specific regime

Sharpe 3.0 over 3 months of bull market may be luck. There is no guarantee of survival across a full year with bear and sideways phases.

**Fix:** test across multiple periods (2021, 2022, 2023). Drastic metric degradation indicates overfitting.

## "TimeoutError"

A single bar exceeded the 800ms per-bar budget. The engine tolerates
isolated occurrences (cold starts, GC pauses, occasional spikes) — a
backtest only aborts when transient failures cross 5% of total bars
(and at least 5 bars failed in absolute terms). If the run is
finishing successfully but the logs include
`X/Y bar callbacks failed transiently`, you are within tolerance and
no action is required. If the run aborts, the most common causes are
below.

### Cause 1 - Heavy loop over all candles

```python
# Incorrect: O(n^2), redoing it on every bar
for i in range(len(sdk.candles)):
    for j in range(len(sdk.candles)):
        ...
```

**Fix:** use only the current point or the last N bars. Do not iterate over the full history.

### Cause 2 - `pd.DataFrame(sdk.candles)` on every bar

Building a DataFrame is costly. On every bar, over 10k backtest candles, the cumulative cost exceeds the timeout.

**Fix:** use a pure-Python list comprehension:
```python
closes = [c["close"] for c in sdk.candles]
```

### Cause 3 - Recursive indicators not cached

Recomputing EMA from scratch on every bar is O(n). Use an incremental
version cached in `sdk.state` (see [persistent state](../strategies/persistent-state.md))
or a streaming class from
[`tesstrade_indicators`](../indicators/tesstrade-indicators.md), which
keeps the cost flat at O(1) per bar without manual cache management.

## "SecurityError"

Code rejected by the engine before running.

### Cause 1 - Forbidden import

```python
import os   # SecurityError: Import not allowed: os
```

**Fix:** use only `numpy`, `pandas`, `math`, `json`, `datetime`, `pandas_ta`, `talib`. Details in [sandbox limits](../getting-started/sandbox-limits.md).

### Cause 2 - Blocked builtin

```python
open("file.txt", "w")     # SecurityError: open is blocked
eval("1+1")               # SecurityError: eval is blocked
```

**Fix:** there is no I/O or dynamic execution. Rewrite the strategy without these calls.

### Cause 3 - Dunder attribute

```python
obj.__class__     # SecurityError: Forbidden attribute
```

**Fix:** avoid introspection. To check a type, use `isinstance()`.

### Cause 4 - Lambda

```python
key = lambda x: x[1]   # SecurityError: Lambda is forbidden
```

**Fix:** use `def`:
```python
def _key(x):
    return x[1]
```

## "MemoryError"

Exceeded the per-strategy memory ceiling. Trading logic rarely hits
this organically — when it does, the cause is almost always an
unbounded growing collection in `sdk.state`.

### Cause - Accumulating lists without a limit

```python
sdk.state["all_closes"] = sdk.state.get("all_closes", []) + [c["close"] for c in sdk.candles]
# Grows quadratically throughout the backtest
```

**Fix:** bound the size:
```python
buf = sdk.state.setdefault("closes", [])
buf.append(sdk.candles[-1]["close"])
if len(buf) > 500:
    del buf[:len(buf) - 500]
```

## "insufficient capital"

Order rejected because `sdk.cash` is less than the cost.

### Cause 1 - `qty=1` on crypto spot with a small balance

If `sdk.cash = 100 USDT` and BTC = 50000, `qty=1 BTC` costs 50000 and is rejected.

**Fix:** use `size_pct` or compute `qty` proportionally:
```python
close = sdk.candles[-1]["close"]
qty = (sdk.cash * 0.25) / close  # 25% of cash
sdk.buy(action="buy_to_open", qty=qty, order_type="market")
```

### Cause 2 - Very low initial balance

If the initial balance is BRL 1,000 and the asset is WIN (BRL 5,000/contract), the first trade is rejected.

**Fix:** increase the balance or use a compatible asset.

## "ProtocolError: Strict Mode"

The script does not define a valid entrypoint.

**Fix:** it is mandatory to define `main(df=None, sdk=None, params={})` or `on_bar(sdk)` at the root level.

## Plot does not appear on the chart

The backtest runs, but the indicator line does not appear.

### Cause 1 - Plot `source` different from the key in `series`

```python
"plots": [{"name": "sma", "source": "sma_fast", ...}]   # source = "sma_fast"
"series": {"sma": [...]}                                  # key = "sma" - divergent
```

**Fix:** keep `source` equal to the key in `series`.

### Cause 2 - Series array of different length than candles

The frontend discards a misaligned series.

**Fix:** ensure `len(series["sma"]) == len(df)`. Use `None` for warmup.

### Cause 3 - Missing the `df=` branch

```python
def main(df=None, sdk=None, params={}):
    if sdk is not None:
        return on_bar_strategy(sdk, params)
    return DECLARATION
    # Missing: if df is not None: return _build_chart(df, params)
```

Without the `df=` branch, the frontend does not receive the series.

## Next steps

* [Reading the results](reading-results.md) - understanding the panel.
* [Performance metrics](metrics.md) - when atypical numbers are a red flag.
* [Solid entry/exit patterns](../strategies/entry-exit-patterns.md) - checklist to avoid these problems.
