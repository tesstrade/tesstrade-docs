# Panes: overlay vs new pane

Each plot has a visual destination: it appears **over the price chart** (overlay) or in a **separate pane below** (new pane). The choice depends on the indicator's scale.

## Rule of thumb

| Indicator type | Pane | Reason |
|---|---|---|
| Moving averages (SMA, EMA, VWAP) | `"overlay"` | Scale matches the price |
| Bollinger Bands | `"overlay"` | Same scale as price |
| Donchian channels, pivots | `"overlay"` | Price levels |
| RSI, Stochastic | `"new"` | 0-100 scale, incompatible with price |
| MACD, Histogram | `"new"` | Scale oscillates around zero |
| Volume | `"new"` | Completely different scale |
| ATR | `"new"` | Absolute volatility scale |

## Accepted values

```python
"pane": "overlay"   # over the price chart (default)
"pane": "price"     # synonym of "overlay"
"pane": "new"       # dedicated new pane below
"pane": "same"      # uses the active pane (useful in composed scripts)
```

## Examples

### Overlay: moving averages over price

```python
DECLARATION = {
    "type": "indicator",
    "inputs": [
        {"name": "period", "type": "int", "default": 20, "min": 1, "max": 200},
    ],
    "plots": [
        {"name": "sma", "source": "sma", "type": "line", "color": "#22D3EE", "lineWidth": 2},
    ],
    "pane": "overlay",  # drawn together with the candles
}
```

Result: a cyan line over the price chart.

### New pane: RSI in a dedicated pane

```python
DECLARATION = {
    "type": "indicator",
    "inputs": [
        {"name": "period", "type": "int", "default": 14, "min": 2, "max": 100},
    ],
    "plots": [
        {"name": "rsi", "source": "rsi", "type": "line", "color": "#A78BFA", "lineWidth": 2},
    ],
    "pane": "new",       # separate pane
    "scale": "left",     # scale on the left side
    "levels": [
        {"name": "Overbought", "value": 70, "color": "#EF4444", "style": "dashed"},
        {"name": "Midline",    "value": 50, "color": "#64748B", "style": "dotted"},
        {"name": "Oversold",   "value": 30, "color": "#22C55E", "style": "dashed"},
    ],
}
```

Result: a pane below the price chart, with the RSI line and three fixed levels (70, 50, 30).

### New pane: MACD with three plots

```python
DECLARATION = {
    "plots": [
        {"name": "macd",        "source": "macd",        "type": "line", "color": "#22D3EE"},
        {"name": "signal_line", "source": "signal_line", "type": "line", "color": "#F59E0B"},
        {"name": "hist",        "source": "hist",        "type": "histogram", "color": "#94A3B8"},
    ],
    "pane": "new",
    "levels": [
        {"name": "Zero", "value": 0, "color": "#64748B", "style": "dotted"},
    ],
}
```

All three plots share the same new pane (because `pane` is at the root level of the DECLARATION, not on each plot).

## Customizing the scale

The `scale` kwarg controls which side the Y axis of the pane appears on:

| Value | Effect |
|---|---|
| `"right"` | Scale on the right side (default on the price chart) |
| `"left"` | Scale on the left side (useful when you already have something on the right) |
| `"none"` | No visible Y axis |

For overlay over price, set `"scale": "none"`. The price scale is already rendered.

```python
"pane": "overlay",
"scale": "none",   # moving averages inherit the price scale
```

## Levels: fixed horizontal lines

`levels` draws **fixed** horizontal lines that do not change with the data. Suitable for overbought/oversold, theoretical pivots, and global take-profits.

```python
"levels": [
    {"name": "TP 10%",    "value": 110.0, "color": "#22C55E", "style": "dashed"},
    {"name": "Break-Even","value": 100.0, "color": "#64748B", "style": "solid"},
    {"name": "Stop -5%",  "value": 95.0,  "color": "#EF4444", "style": "dashed"},
],
```

In the context of an RSI, they go in the same pane as the plot (pane=new). In the context of overlay over price, they are drawn on top of the candles.

## Plots in different panes (advanced)

Current support is **one pane per DECLARATION**. For plots in separate panes (for example, moving averages on the overlay and RSI in a new pane within the same script), create two scripts: one for the overlay indicator and another for the RSI.

For combined strategies (logic in a single script), keep all plots in the same pane and use `levels` to mark reference points.

## Combining plots: histogram and line

It is common to want a line **and** a histogram in the same pane. Classic example: MACD + signal line + histogram:

```python
"plots": [
    {"name": "macd",        "source": "macd",        "type": "line",      "color": "#22D3EE", "lineWidth": 2},
    {"name": "signal_line", "source": "signal_line", "type": "line",      "color": "#F59E0B", "lineWidth": 2},
    {"name": "hist",        "source": "hist",        "type": "histogram", "color": "#94A3B8"},
],
"pane": "new",
```

The frontend renders in declaration order: first the macd line (behind), then signal line, then histogram (on top). To prevent the histogram from hiding the lines, keep the histogram last and use a semi-transparent color.

## Value-driven colors (two-color histograms)

For green-positive and red-negative histograms without two series, use `colorExpression`:

```python
{
    "name": "hist",
    "source": "hist",
    "type": "histogram",
    "colorExpression": "value >= 0 ? '#22C55E' : '#EF4444'",
}
```

The expression is evaluated per value: each bar may have its own color.

## Common errors

* **Plot in the right pane but not appearing:** check the `source` (key in `series`) and the length of the series.
* **RSI in overlay over price:** price may be at 50000 (Bitcoin) and the RSI at 70. The RSI becomes a flat line glued to zero. Use `"pane": "new"`.
* **Levels not appearing:** make sure `levels` is at the root of the DECLARATION, not inside a plot.
* **New pane without scale:** if `scale` is omitted, the frontend tries to pick one, with inconsistent results. Pass `"scale": "left"` or `"right"` explicitly for new panes.

## Next steps

* [Plots and series](plots-and-series.md) -- the complete plotting contract.
* [Implementing indicators](implementing-sma-ema.md) -- code for the series.
* [DECLARATION](../contract/declaration.md) -- every field of the shape.
