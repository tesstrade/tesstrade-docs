# RSI Mean Reversion

**Mean reversion** strategy with RSI. When the RSI is oversold (below 30), the market has overshot to the downside and the strategy buys expecting a bounce. When overbought (above 70), the market has overshot to the upside and the strategy sells expecting a correction. The exit occurs when the RSI returns to the neutral line (50).

## When to use

* **Sideways or range-bound markets.** Ideal scenario for mean reversion. SMA crossover performs poorly here; the RSI captures the bounces.
* **Assets that tend to revert to the mean.** Blue-chip stocks, range-bound crypto, low-volatility currency pairs.
* **Anti-pattern in strong trends.** In a prolonged bull run, the RSI can stay overbought for weeks. In this regime, mean reversion trades against the trend and accumulates losses.

## What to expect

* More trades than SMA crossover. Typically 5 to 15 per week on 1h crypto.
* High individual win rate (approximately 60 to 70%), but occasional large losses in strong trends.
* Sensitive to thresholds. `oversold=30, overbought=70` are robust defaults; `20/80` is more selective but produces fewer trades.

---

## Complete template

```python
DECLARATION = {
    "type": "strategy",
    "inputs": [
        {
            "name": "period",
            "label": "RSI Period",
            "type": "int",
            "default": 14,
            "min": 2,
            "max": 100,
            "step": 1,
        },
        {
            "name": "oversold",
            "label": "Oversold Level",
            "type": "float",
            "default": 30.0,
            "min": 0.0,
            "max": 50.0,
            "step": 1.0,
        },
        {
            "name": "overbought",
            "label": "Overbought Level",
            "type": "float",
            "default": 70.0,
            "min": 50.0,
            "max": 100.0,
            "step": 1.0,
        },
    ],
    "plots": [
        {
            "name": "rsi",
            "title": "RSI",
            "source": "rsi",
            "type": "line",
            "color": "#A78BFA",
            "lineWidth": 2,
        },
    ],
    "pane": "new",
    "levels": [
        {"name": "Overbought", "value": 70, "color": "#EF4444", "style": "dashed"},
        {"name": "Midline",    "value": 50, "color": "#64748B", "style": "dotted"},
        {"name": "Oversold",   "value": 30, "color": "#22C55E", "style": "dashed"},
    ],
}


def _rsi_series(closes, period):
    """RSI aligned per candle; None on the first `period` points."""
    if len(closes) < period + 1:
        return [None] * len(closes)
    out = [None] * period
    gains = 0.0
    losses = 0.0
    for i in range(1, period + 1):
        delta = closes[i] - closes[i - 1]
        if delta >= 0:
            gains += delta
        else:
            losses += -delta
    avg_gain = gains / period
    avg_loss = losses / period
    out.append(100.0 if avg_loss == 0 else 100.0 - (100.0 / (1.0 + avg_gain / avg_loss)))
    for i in range(period + 1, len(closes)):
        delta = closes[i] - closes[i - 1]
        gain = delta if delta > 0 else 0.0
        loss = -delta if delta < 0 else 0.0
        avg_gain = (avg_gain * (period - 1) + gain) / period
        avg_loss = (avg_loss * (period - 1) + loss) / period
        out.append(100.0 if avg_loss == 0 else 100.0 - (100.0 / (1.0 + avg_gain / avg_loss)))
    return out


def _rsi_last(closes, period):
    """RSI at the last point only -- cheap for use in on_bar_strategy."""
    if len(closes) < period + 1:
        return None
    gains = 0.0
    losses = 0.0
    for i in range(len(closes) - period, len(closes)):
        delta = closes[i] - closes[i - 1]
        if delta >= 0:
            gains += delta
        else:
            losses += -delta
    avg_gain = gains / period
    avg_loss = losses / period
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return 100.0 - (100.0 / (1.0 + rs))


def _build_chart(df, params):
    period = int((params or {}).get("period", 14))
    closes = list(df["close"])
    return {
        "plots": DECLARATION["plots"],
        "series": {
            "rsi": _rsi_series(closes, period),
        },
    }


def on_bar_strategy(sdk, params):
    period = int((params or {}).get("period", 14))
    oversold = float((params or {}).get("oversold", 30))
    overbought = float((params or {}).get("overbought", 70))

    if len(sdk.candles) < period + 2:
        return

    closes = [c["close"] for c in sdk.candles]
    rsi = _rsi_last(closes, period)
    if rsi is None:
        return

    qty_open = 1
    qty_close = abs(sdk.position)

    if sdk.position == 0:
        if rsi < oversold:
            sdk.buy(
                action="buy_to_open",
                qty=qty_open,
                order_type="market",
            )
        elif rsi > overbought:
            sdk.sell(
                action="sell_short_to_open",
                qty=qty_open,
                order_type="market",
            )
    elif sdk.position > 0 and rsi >= 50:
        sdk.sell(
            action="sell_to_close",
            qty=qty_close,
            order_type="market",
        )
    elif sdk.position < 0 and rsi <= 50:
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

### The `DECLARATION`

Three editable inputs (`period`, `oversold`, `overbought`). One plot for the RSI line. Two relevant details:

* **`"pane": "new"`.** The RSI is not on the price chart; it goes in a separate panel below.
* **`"levels"`.** Three fixed horizontal lines (70/50/30) remain visible in the RSI panel, speeding up reading.

### `_rsi_series(closes, period)` -- historical calculation

Classic Wilder RSI implementation:

1. Initializes the **gain and loss averages** of the first `period` deltas.
2. From there on uses **Wilder exponential smoothing**: `avg_new = (avg_old * (period-1) + current_delta) / period`.
3. `RSI = 100 - 100 / (1 + avg_gain / avg_loss)`.
4. Returns `None` on the first `period` points (not enough data).

It is O(n) and allocates a list. Suitable for the `df=` branch, which runs only once to build the chart.

### `_rsi_last(closes, period)` -- incremental calculation

Cheap version that computes the RSI of the last point only. Used inside `on_bar_strategy` because on each candle only the current value is needed. Avoids allocation.

**Simplification:** this version uses the simple average of the last `period` deltas, not Wilder smoothing. For intraday RSI the error is small; for exact historical precision, use `_rsi_series(closes, period)[-1]`.

### The trading logic

```python
if sdk.position == 0:
    if rsi < oversold:          # enter long
        sdk.buy(action="buy_to_open", ...)
    elif rsi > overbought:      # enter short
        sdk.sell(action="sell_short_to_open", ...)
elif sdk.position > 0 and rsi >= 50:   # exit long
elif sdk.position < 0 and rsi <= 50:   # cover short
```

The exit occurs at the midline (50), not at the opposite level. It is a risk choice:

* **Exit at 50:** fast trade, modest profit, consistent.
* **Exit at `overbought` (long) or `oversold` (short):** longer trade, larger profit when it works, worse drawdown when the bounce is short.

Swap `rsi >= 50` for `rsi >= overbought` to experiment with the more aggressive version.

---

## Variations

### 1. Divergence: only enter if the price makes a new low but the RSI does not

Classic anti-trend filter. Enters only when there is bullish divergence on the RSI:

```python
close_now = sdk.candles[-1]["close"]
close_5_ago = sdk.candles[-6]["close"]
rsi_now = _rsi_last(closes, period)
rsi_5_ago = _rsi_last(closes[:-5], period)

bullish_div = close_now < close_5_ago and rsi_now > rsi_5_ago
if sdk.position == 0 and rsi_now < oversold and bullish_div:
    sdk.buy(action="buy_to_open", qty=1, order_type="market")
```

### 2. Fixed stop based on volatility

In crypto, use ATR (implemented by you) or a fixed percentage:

```python
if sdk.position == 0 and rsi < oversold:
    close = sdk.candles[-1]["close"]
    sdk.buy(
        action="buy_to_open",
        qty=1,
        order_type="market",
        stop_loss=close * 0.97,    # stop 3% below
        take_profit=close * 1.015, # target 1.5% above
    )
```

### 3. RSI with regime filter

Only open short if the 200 SMA is falling (bear market). Avoids shorts in a bull run:

```python
sma_200 = _sma(closes, 200)
sma_200_prev = _sma(closes[:-5], 200)
if sma_200 is None or sma_200_prev is None:
    return
regime_bear = sma_200 < sma_200_prev

if sdk.position == 0:
    if rsi < oversold:
        sdk.buy(action="buy_to_open", qty=1, order_type="market")
    elif rsi > overbought and regime_bear:  # only open short in bear
        sdk.sell(action="sell_short_to_open", qty=1, order_type="market")
```

---

## Common issues

* **Prolonged oversold hurts the long:** in a sharp decline, the RSI stays below 30 for several bars. The long entry triggers and the price keeps falling. Protect with a fixed stop (`stop_loss=`) or add a trend filter.
* **Noisy RSI values on short timeframes:** on 1m or 5m, the RSI oscillates a lot. Use `period=21` or `period=28` to smooth.
* **0 trades on low-volatility assets:** if the RSI never touches 30/70, there is no entry. Loosen the thresholds (for example, `oversold=40, overbought=60`).
* **Exit too quick:** the RSI returns to 50 rapidly after the bounce. To hold longer, swap `>= 50` for `>= 60` (long) or `<= 40` (short).
