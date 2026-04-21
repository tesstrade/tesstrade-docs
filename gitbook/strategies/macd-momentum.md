# MACD Momentum

**Momentum** strategy with MACD. The entry occurs on histogram turns (the difference between MACD and the signal line). When the histogram crosses zero upward, there is buying strength and the strategy opens long. When it crosses downward, there is selling strength and the strategy opens short.

It occupies a middle ground between SMA crossover (slow in some scenarios) and RSI mean reversion (counter-trend in a directional market).

## When to use

* **Trending markets with pullbacks.** The histogram captures the moment when the correction ends.
* **Intermediate timeframes (1h, 4h).** On very short timeframes the histogram oscillates too much; on very long timeframes signals are delayed.
* **Complement to trend-following strategies.** The histogram filters weak MACD crossovers, reducing premature entries.

## What to expect

* Trade frequency between SMA crossover and RSI. Typically 3 to 10 per week on 1h crypto.
* Earlier signals than SMA crossover, since the histogram reverses before the moving-average crossover.
* More sensitive to noise than SMA. In highly sideways markets, the histogram crosses zero several times without a real price move.

---

## Complete template

```python
DECLARATION = {
    "type": "strategy",
    "inputs": [
        {
            "name": "fast",
            "label": "Fast EMA",
            "type": "int",
            "default": 12,
            "min": 2,
            "max": 100,
            "step": 1,
        },
        {
            "name": "slow",
            "label": "Slow EMA",
            "type": "int",
            "default": 26,
            "min": 2,
            "max": 200,
            "step": 1,
        },
        {
            "name": "signal",
            "label": "Signal Period",
            "type": "int",
            "default": 9,
            "min": 1,
            "max": 50,
            "step": 1,
        },
    ],
    "plots": [
        {
            "name": "macd",
            "title": "MACD",
            "source": "macd",
            "type": "line",
            "color": "#22D3EE",
            "lineWidth": 2,
        },
        {
            "name": "signal_line",
            "title": "Signal",
            "source": "signal_line",
            "type": "line",
            "color": "#F59E0B",
            "lineWidth": 2,
        },
        {
            "name": "hist",
            "title": "Histogram",
            "source": "hist",
            "type": "histogram",
            "color": "#94A3B8",
        },
    ],
    "pane": "new",
    "levels": [
        {"name": "Zero", "value": 0, "color": "#64748B", "style": "dotted"},
    ],
}


def _ema(values, period):
    """EMA aligned per candle. First point becomes the seed (values[0])."""
    if not values:
        return []
    alpha = 2.0 / (period + 1.0)
    out = [values[0]]
    for v in values[1:]:
        out.append(alpha * v + (1.0 - alpha) * out[-1])
    return out


def _macd_series(closes, fast, slow, signal_period):
    """Returns (macd_line, signal_line, hist) -- all aligned with closes."""
    fast_ema = _ema(closes, fast)
    slow_ema = _ema(closes, slow)
    macd_line = [f - s for f, s in zip(fast_ema, slow_ema)]
    signal_line = _ema(macd_line, signal_period)
    hist = [m - s for m, s in zip(macd_line, signal_line)]
    return macd_line, signal_line, hist


def _macd_hist_prev_curr(closes, fast, slow, signal_period):
    """Lean version: only the histogram of the second-to-last and last bars."""
    fast_ema = _ema(closes, fast)
    slow_ema = _ema(closes, slow)
    macd_line = [f - s for f, s in zip(fast_ema, slow_ema)]
    signal_line = _ema(macd_line, signal_period)
    hist_prev = macd_line[-2] - signal_line[-2]
    hist_curr = macd_line[-1] - signal_line[-1]
    return hist_prev, hist_curr


def _build_chart(df, params):
    fast = int((params or {}).get("fast", 12))
    slow = int((params or {}).get("slow", 26))
    signal_period = int((params or {}).get("signal", 9))
    closes = list(df["close"])
    macd_line, signal_line, hist = _macd_series(closes, fast, slow, signal_period)
    return {
        "plots": DECLARATION["plots"],
        "series": {
            "macd": macd_line,
            "signal_line": signal_line,
            "hist": hist,
        },
    }


def on_bar_strategy(sdk, params):
    fast = int((params or {}).get("fast", 12))
    slow = int((params or {}).get("slow", 26))
    signal_period = int((params or {}).get("signal", 9))

    # Warmup: long EMA + signal period + 1 bar to compare.
    min_bars = max(fast, slow) + signal_period + 2
    if len(sdk.candles) < min_bars:
        return

    closes = [c["close"] for c in sdk.candles]
    hist_prev, hist_curr = _macd_hist_prev_curr(closes, fast, slow, signal_period)

    crossed_up = hist_prev <= 0 and hist_curr > 0
    crossed_down = hist_prev >= 0 and hist_curr < 0

    qty_open = 1
    qty_close = abs(sdk.position)

    if sdk.position == 0:
        if crossed_up:
            sdk.buy(
                action="buy_to_open",
                qty=qty_open,
                order_type="market",
            )
        elif crossed_down:
            sdk.sell(
                action="sell_short_to_open",
                qty=qty_open,
                order_type="market",
            )
    elif sdk.position > 0 and crossed_down:
        sdk.sell(
            action="sell_to_close",
            qty=qty_close,
            order_type="market",
        )
    elif sdk.position < 0 and crossed_up:
        sdk.buy(
            action="buy_to_cover",
            qty=qty_close,
            order_type="market",
        )


def main(df=None, sdk=None, params={}):
    params = params or {}
    if sdk is not None:
        return on_bar_strategy(sdk, params)
    if df is not None:
        return _build_chart(df, params)
    return DECLARATION
```

---

## Dissecting the code

### The three MACD lines

* **MACD line:** `EMA(12) - EMA(26)`. Shows the difference between short and long momentum. Positive indicates buying strength; negative, selling strength.
* **Signal line:** `EMA(9)` of the MACD line. It is the smoothed MACD and serves as a filter.
* **Histogram:** `MACD line - Signal line`. This is what the strategy uses. When it turns positive, the MACD is breaking above the signal, indicating accelerating upside momentum.

### `_ema(values, period)`

Classic Wilder EMA: `out[i] = alpha * values[i] + (1 - alpha) * out[i-1]`, with `alpha = 2 / (period + 1)`. The first value serves as the seed (`out[0] = values[0]`). There is no formal warmup, but the first points are less accurate. With `min_bars = fast + slow + signal + 2`, there is enough stabilization time.

### The crossover criterion

```python
crossed_up = hist_prev <= 0 and hist_curr > 0
crossed_down = hist_prev >= 0 and hist_curr < 0
```

Fires **exactly once** at the zero crossover. On subsequent bars, `hist_prev` and `hist_curr` have the same sign, so the condition does not repeat.

### Why the histogram and not the MACD line?

An alternative would be to use direct crossovers of the MACD with the signal line:

```python
crossed_up = macd_prev <= signal_prev and macd_curr > signal_curr
```

It works, but **the histogram crosses zero at the same moment** (it is literally the difference). The form with `hist_prev <= 0 and hist_curr > 0` is more readable and aligns with the histogram plot.

### Conservative min bars

```python
min_bars = max(fast, slow) + signal_period + 2
```

With `fast=12, slow=26, signal=9`, it requires at least 37 candles. The EMA with seed `values[0]` stabilizes quickly, but the signal EMA needs more points. The `+2` guarantees `prev` and `curr` to compare.

---

## Variations

### 1. Trend filter with the MACD zero line

Only enter long if the MACD line is also above zero (composite signal):

```python
macd_line, _, hist = _macd_series(closes, fast, slow, signal_period)
macd_positive = macd_line[-1] > 0
macd_negative = macd_line[-1] < 0

if sdk.position == 0:
    if crossed_up and macd_positive:
        sdk.buy(action="buy_to_open", qty=1, order_type="market")
    elif crossed_down and macd_negative:
        sdk.sell(action="sell_short_to_open", qty=1, order_type="market")
```

Filters trades in sideways markets (where MACD oscillates around zero but the histogram crosses).

### 2. Take profit via weakening histogram

Exit when the histogram starts to decrease in magnitude (momentum loss), even without crossing zero:

```python
if sdk.position > 0:
    if hist_curr < hist_prev * 0.7:  # histogram fell 30% from the peak
        sdk.sell(action="sell_to_close", qty=abs(sdk.position),
                 order_type="market")
```

Requires storing the peak in `sdk.state` to compare correctly; the example above is simplistic (uses only the previous bar).

### 3. ATR-based stop/target

Combine with a simple ATR for dynamic stops:

```python
def _atr(candles, period):
    if len(candles) < period + 1:
        return None
    trs = []
    for i in range(1, period + 1):
        h = candles[-i]["high"]
        l = candles[-i]["low"]
        cp = candles[-i - 1]["close"]
        trs.append(max(h - l, abs(h - cp), abs(l - cp)))
    return sum(trs) / period

if sdk.position == 0 and crossed_up:
    close = sdk.candles[-1]["close"]
    atr = _atr(sdk.candles, 14)
    if atr:
        sdk.buy(
            action="buy_to_open",
            qty=1,
            order_type="market",
            stop_loss=close - atr * 2,
            take_profit=close + atr * 3,
        )
```

---

## Common issues

* **Whipsaw signals (sideways):** MACD performs poorly in ranges. Combine with ADX or with the zero-line filter above.
* **0 trades at the start:** 37+ candles is quite a lot on long timeframes (1d equals approximately 1.5 months). Expected behavior; wait for the warmup.
* **Plots do not appear at the same height:** the histogram and MACD have different scales. The frontend handles this, but if `pane` is customized, check that it is in `"new"` (dedicated panel). The value `"overlay"` superimposes on price, which scales incorrectly.
* **Histogram with visual noise:** swap `"type": "histogram"` for `"type": "area"` for an area visual.
* **For B3 stocks (WIN/WDO) at 5m:** the `12/26/9` defaults are for crypto markets and global equities. For mini-index contracts, try `6/13/4` for higher sensitivity.
