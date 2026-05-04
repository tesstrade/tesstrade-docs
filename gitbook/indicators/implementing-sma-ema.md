# Implementing SMA and EMA

Moving averages are the foundation of a large portion of strategies. A safe, optimized version of `pandas_ta` is available in the sandbox, but implementing them manually grants full control and predictability.

This page covers implementations of SMA (Simple Moving Average), EMA (Exponential Moving Average), and variations.

> **Faster alternative:** if the strategy reads SMA/EMA on every bar
> and you don't need to inspect the math, the
> [`tesstrade_indicators`](tesstrade-indicators.md) library exposes
> `Sma`/`Ema` streaming classes that keep state across bars — O(1)
> per update instead of O(n). Same Wilder/standard formulas as
> `pandas_ta`, callable as `import tesstrade_indicators as ti; ti.Ema(20)`.
> The implementations below remain the right reference when you need
> to read or modify the math.

## SMA -- Simple moving average

The arithmetic mean of the last `period` closes.

### "Full series" version (for plots)

```python
def sma_series(values, period):
    """Returns a list the same length as values; None during warmup."""
    out = []
    running_sum = 0.0
    for i, v in enumerate(values):
        running_sum += v
        if i + 1 < period:
            out.append(None)
            continue
        if i + 1 > period:
            running_sum -= values[i - period]
        out.append(running_sum / period)
    return out
```

**Complexity:** O(n). The naive version with `sum(values[i-p+1:i+1])` is O(n * p) and should be avoided on long series. The `running_sum` trick keeps it at O(n).

### "Last point" version (for on_bar_strategy)

```python
def sma_last(values, period):
    if len(values) < period:
        return None
    return sum(values[-period:]) / period
```

Performance is irrelevant here: typical `period` is less than 100 and `sum()` is trivial.

### Usage

```python
closes = [c["close"] for c in sdk.candles]
sma20 = sma_last(closes, 20)
if sma20 is None:
    return  # warmup

if sdk.candles[-1]["close"] > sma20:
    # price above the moving average
    ...
```

## EMA -- Exponential moving average

Weights exponentially: recent points carry more weight. Classic formula:

```
alpha = 2 / (period + 1)
ema[i] = alpha * values[i] + (1 - alpha) * ema[i-1]
ema[0] = values[0]   # seed: first value becomes the initial point
```

### "Full series" version

```python
def ema_series(values, period):
    """EMA aligned by candle. First point is the seed (=values[0])."""
    if not values:
        return []
    alpha = 2.0 / (period + 1.0)
    out = [float(values[0])]
    for v in values[1:]:
        out.append(alpha * v + (1.0 - alpha) * out[-1])
    return out
```

**Note on warmup:** unlike SMA, EMA does not return `None`. It uses the first value itself as the seed. The first `period` points are less precise because the exponential weighting is still settling, but they are valid values.

If you want to enforce strict warmup, return `None` for the first `period` points and start the seed as the SMA of `period`:

```python
def ema_series_strict(values, period):
    if len(values) < period:
        return [None] * len(values)
    alpha = 2.0 / (period + 1.0)
    # Seed = SMA of the first `period` values
    seed = sum(values[:period]) / period
    out = [None] * (period - 1) + [seed]
    for v in values[period:]:
        out.append(alpha * v + (1.0 - alpha) * out[-1])
    return out
```

For backtests of simple scripts, the relaxed version works. To match `pandas_ta.ema` exactly, use the strict version (which is what `pandas_ta` does).

### Incremental "last point" version

EMA is **naturally incremental**: each step depends only on the previous one. It can be cached in `sdk.state`:

```python
def on_bar_strategy(sdk, params):
    period = int((params or {}).get("period", 20))
    alpha = 2.0 / (period + 1.0)

    if not isinstance(sdk.state, dict):
        sdk.state = {}
    if "ema" not in sdk.state:
        sdk.state["ema"] = None

    last_close = sdk.candles[-1]["close"]
    ema = sdk.state["ema"]
    if ema is None:
        sdk.state["ema"] = last_close  # seed
        return

    ema = alpha * last_close + (1 - alpha) * ema
    sdk.state["ema"] = ema

    # ... logic uses `ema`
```

**Gain:** O(1) per candle instead of O(n). For 5m strategies running over months, this makes a difference.

## WMA -- Weighted moving average

Linearly decreasing weight: the most recent point weighs the most.

```python
def wma_last(values, period):
    if len(values) < period:
        return None
    weights = list(range(1, period + 1))  # 1, 2, 3, ..., period
    window = values[-period:]
    total = sum(v * w for v, w in zip(window, weights))
    return total / sum(weights)
```

## HMA -- Hull Moving Average

Smoother than EMA, less laggy than SMA:

```python
def hma_series(values, period):
    half = max(1, period // 2)
    sqrt_p = max(1, int(period ** 0.5))

    wma_half = [None] * len(values)
    wma_full = [None] * len(values)

    # Rolling WMA (see WMA implementation above, adapted to a series)
    for i in range(len(values)):
        if i + 1 >= half:
            w = list(range(1, half + 1))
            win = values[i - half + 1 : i + 1]
            wma_half[i] = sum(v * ww for v, ww in zip(win, w)) / sum(w)
        if i + 1 >= period:
            w = list(range(1, period + 1))
            win = values[i - period + 1 : i + 1]
            wma_full[i] = sum(v * ww for v, ww in zip(win, w)) / sum(w)

    # Raw = 2 * WMA_half - WMA_full, then WMA of raw with sqrt(period)
    raw = []
    for h, f in zip(wma_half, wma_full):
        raw.append(2 * h - f if h is not None and f is not None else None)

    # Final WMA on raw (ignores None during warmup)
    out = [None] * len(values)
    for i in range(len(values)):
        window = [r for r in raw[max(0, i - sqrt_p + 1) : i + 1] if r is not None]
        if len(window) == sqrt_p:
            w = list(range(1, sqrt_p + 1))
            out[i] = sum(v * ww for v, ww in zip(window, w)) / sum(w)

    return out
```

HMA is more complex to implement, but it is suitable for scripts that need a smooth average. For the "something better than SMA" case, EMA is usually enough.

## With `numpy`

Using `np`, the implementation fits in a few lines:

```python
import numpy as np  # already available as the global `np`

def sma_last_np(values, period):
    if len(values) < period:
        return None
    return float(np.mean(values[-period:]))


def ema_series_np(values, period):
    alpha = 2.0 / (period + 1.0)
    arr = np.asarray(values, dtype=float)
    # numpy has no native EMA; emulating with `lfilter` would be ideal, but simpler:
    out = np.empty_like(arr)
    out[0] = arr[0]
    for i in range(1, len(arr)):
        out[i] = alpha * arr[i] + (1 - alpha) * out[i - 1]
    return out.tolist()
```

**Caveat:** even with numpy, the loop is still necessary for EMA. For real vectorization, `scipy.signal.lfilter` would be required, which is **not available** in the sandbox. If performance is critical, cache in `sdk.state` as shown above.

## Using `pandas_ta`

A subset of popular functions is available:

```python
# Requires conversion to a pandas Series
close_series = pd.Series([c["close"] for c in sdk.candles])
sma = ta.sma(close_series, length=20)  # returns Series
if sma is not None and not pd.isna(sma.iloc[-1]):
    last_sma = float(sma.iloc[-1])
```

In general, **prefer a manual implementation** for predictability.

## Summary table

| Indicator | Lag | Smoothing | Incremental complexity |
|---|---|---|---|
| SMA | High | Low | O(1) with running sum |
| EMA | Medium | High | O(1) native |
| WMA | Low | Medium | O(period) |
| HMA | Very low | Very high | O(period) |

## Next steps

* [RSI, MACD and Bollinger Bands](rsi-macd-bands.md) -- composite indicators built on top of EMAs.
* [SMA Crossover](../strategies/sma-crossover.md) -- full template using SMA.
* [MACD Momentum](../strategies/macd-momentum.md) -- template using EMA and signal line.
