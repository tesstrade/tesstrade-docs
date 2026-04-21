# Plots and `series`

For lines, histograms, or areas to appear on the chart, two things are required:

1. Declare the **visual shape** in `DECLARATION["plots"]` (name, type, color, pane).
2. Return the **numeric values** in `series` from the `df=` branch of `main()`.

The key in `series` must **match exactly** the `source` of the plot. Otherwise, the frontend draws nothing.

## Minimum contract

```python
DECLARATION = {
    "type": "indicator",
    "inputs": [
        {"name": "period", "type": "int", "default": 14, "min": 1, "max": 100},
    ],
    "plots": [
        {
            "name": "sma",             # internal name
            "source": "sma",           # must match the key in series
            "type": "line",
            "color": "#22D3EE",
            "lineWidth": 2,
        },
    ],
    "pane": "overlay",
}


def _sma_series(values, period):
    out = []
    for i in range(len(values)):
        if i + 1 < period:
            out.append(None)
        else:
            out.append(sum(values[i - period + 1:i + 1]) / period)
    return out


def _build_chart(df, params):
    period = int((params or {}).get("period", 14))
    closes = list(df["close"])
    return {
        "plots": DECLARATION["plots"],
        "series": {
            "sma": _sma_series(closes, period),
        },
    }


def main(df=None, sdk=None, params={}):
    if df is not None:
        return _build_chart(df, params)
    return DECLARATION
```

## Rules for `series`

### Length = number of candles

Each array in `series` must have **exactly the same length** as `df`. The frontend aligns by index. An array that is shorter or longer misaligns every point.

```python
closes = list(df["close"])
sma_array = _sma_series(closes, period)
assert len(sma_array) == len(closes)  # always true if _sma_series is correct
```

### `None` during warmup

Before there is enough data to compute, use `None`. The frontend does not draw a point there.

```python
# An SMA of period 14 cannot be computed on the first 13 candles.
[None, None, ..., None, first_sma, ...]
```

**Never use `0` or `NaN` for warmup.** The frontend draws a point at 0 (visually distorted) or breaks on NaN.

### Accepted types

Each value must be `float` or `None`. Numpy conversions also work (`np.float64`), but **numpy arrays** do not -- convert them with `.tolist()`:

```python
# Wrong
closes_np = np.array(closes)
sma_np = pd.Series(closes_np).rolling(period).mean()
return {"series": {"sma": sma_np}}  # return value must be JSON-serializable

# Correct
return {"series": {"sma": sma_np.tolist()}}   # converts to list
# or
return {"series": {"sma": [float(x) if not pd.isna(x) else None for x in sma_np]}}
```

## Multiple plots

Declare multiple entries in `plots` and return multiple keys in `series`:

```python
DECLARATION = {
    "plots": [
        {"name": "ma_fast", "source": "ma_fast", "type": "line", "color": "#22D3EE"},
        {"name": "ma_slow", "source": "ma_slow", "type": "line", "color": "#F59E0B"},
        {"name": "volume",  "source": "volume",  "type": "histogram", "color": "#64748B"},
    ],
    "pane": "overlay",
}

def _build_chart(df, params):
    closes = list(df["close"])
    volumes = list(df["volume"])
    return {
        "plots": DECLARATION["plots"],
        "series": {
            "ma_fast": _sma_series(closes, 9),
            "ma_slow": _sma_series(closes, 21),
            "volume":  volumes,  # already has 1 point per candle
        },
    }
```

## Plot types

| `type` | Visual | Typical use |
|---|---|---|
| `"line"` | Continuous line | Moving averages, RSI, VWAP |
| `"histogram"` | Vertical bars (positive/negative) | MACD hist, Volume |
| `"dots"` | Discrete points | Buy/sell signals |
| `"area"` | Area filled to zero | Volume, ATR |
| `"arrows"` | Up/down arrows | Signal markers |
| `"circles"` | Circles | Pivots, extremes |

### Histograms with conditional colors

The engine accepts `colorExpression` on histogram columns. Use it for a two-color histogram (green positive, red negative):

```python
{
    "name": "hist",
    "source": "hist",
    "type": "histogram",
    "colorExpression": "value >= 0 ? '#22C55E' : '#EF4444'",
}
```

If you prefer not to use the expression, leave only `color` and the frontend applies the same color to every bar (positive or negative).

### Dots for visual signals

When you want to mark specific points (not a continuous series), fill only the relevant indices and leave the rest as `None`:

```python
signals = [None] * len(closes)
for i in range(len(closes)):
    if closes[i] > closes[i-1] * 1.02:  # spike
        signals[i] = closes[i]

return {"series": {"spike_marker": signals}}
```

In the `DECLARATION`:
```python
{"name": "spike_marker", "source": "spike_marker", "type": "dots", "color": "#22C55E"}
```

## Reusing the same computation for plots and trading

Idiomatic pattern: the `df=` branch builds the entire series (for the chart) and the `sdk=` branch calls a variant that only computes the last point:

```python
def _sma(values, period):
    """Last point only. Efficient for on_bar."""
    if len(values) < period:
        return None
    return sum(values[-period:]) / period


def _sma_series(values, period):
    """Full series. Used only in build_chart."""
    # ... (full implementation)


def _build_chart(df, params):
    period = int((params or {}).get("period", 14))
    closes = list(df["close"])
    return {
        "plots": DECLARATION["plots"],
        "series": {"sma": _sma_series(closes, period)},
    }


def on_bar_strategy(sdk, params):
    period = int((params or {}).get("period", 14))
    closes = [c["close"] for c in sdk.candles]
    sma = _sma(closes, period)  # current point only
    if sma is None:
        return
    # ... trading logic
```

## Common errors

* **Plot does not appear:** check `source` of the plot against the key in `series`. Both must be **exactly equal**, case-sensitive.
* **Misaligned line:** the series array has a length different from `len(df)`. Use `None` for warmup instead of omitting.
* **All-gray histogram:** `colorExpression` is missing for differentiating positive/negative. Configure it or accept a single color.
* **Plot "jumping" between points:** `None` in the middle of the series (after warmup). The frontend interprets it as a break. For continuous lines, ensure a dense computation.
* **Returning `{"series": {...}}` without `"plots"`:** the frontend needs both in the return of the `df=` branch. Although the engine already has `DECLARATION["plots"]`, the contract is to return it explicitly.

## Next steps

* [Implementing SMA and EMA](implementing-sma-ema.md) -- implementations without pandas_ta.
* [RSI, MACD and Bollinger Bands](rsi-macd-bands.md) -- composite indicators.
* [Panes: overlay vs new pane](panes.md) -- where each plot appears.
