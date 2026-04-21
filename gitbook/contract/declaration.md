# The `DECLARATION` shape

`DECLARATION` is the **metadata dictionary** that describes your strategy to the engine and to the UI:

* Which parameters the user can edit.
* Which lines appear on the chart (and on which pane).
* Which canonical entry and exit conditions apply (if you use declarative mode).

It is a constant at the root level of your script:

```python
DECLARATION = {
    "type": "strategy",
    "inputs": [...],
    "plots": [...],
    "pane": "overlay",
    "scale": "none",
}
```

And it is returned by `main()` when the engine calls it with no arguments:

```python
def main(df=None, sdk=None, params={}):
    # ...
    return DECLARATION
```

---

## Root-level fields

| Field | Required | Values | Description |
|---|---|---|---|
| `type` | Recommended | `"strategy"` \| `"indicator"` | `"strategy"` emits orders; `"indicator"` only draws plots. If omitted, the engine infers it from the presence of `entry_conditions`. |
| `inputs` | Yes | `list[dict]` | Editable parameters. |
| `plots` | No | `list[dict]` | Lines / marks to draw. Only required if the script returns `series` on the `df=` branch. |
| `pane` | No | `"overlay"` \| `"new"` \| `"price"` \| `"same"` | Where the plot appears. Default: `"overlay"` (on top of price). |
| `scale` | No | `"left"` \| `"right"` \| `"none"` | Which side the Y axis is drawn on. Default: `"none"`. |
| `levels` | No | `list[dict]` | Fixed horizontal lines (for example, 70/30 on RSI). |
| `alerts` | No | `list[dict]` | User-configurable alerts. |
| `entry_conditions` | No | `list[dict]` | Entry conditions for declarative mode (mutually exclusive with `on_bar_strategy`). |
| `exit_conditions` | No | `list[dict]` | Exit conditions for declarative mode. |

Accepted aliases: `entryConditions` / `entry_conditions`, `exitConditions` / `exit_conditions`, `studyType` / `study_type` / `type`.

---

## `inputs[]` - editable parameters

Each entry describes a control that appears in the configuration panel:

```python
{
    "name": "fast_period",          # REQUIRED - key in sdk.params
    "label": "Fast MA",             # optional - title shown in the UI
    "description": "Short period",  # optional - tooltip
    "type": "int",                  # REQUIRED - "int" | "float" | "bool" | "color" | "select" | "string"
    "default": 9,                   # initial value
    "min": 1,                       # minimum (int, float)
    "max": 100,                     # maximum (int, float)
    "step": 1,                      # stepper increment
}
```

### Supported types

| `type` | Example |
|---|---|
| `"int"` | `{"name": "period", "type": "int", "default": 14, "min": 1, "max": 200, "step": 1}` |
| `"float"` | `{"name": "risk", "type": "float", "default": 0.02, "min": 0.0, "max": 1.0, "step": 0.01}` |
| `"bool"` | `{"name": "use_volume", "type": "bool", "default": True}` |
| `"color"` | `{"name": "line_color", "type": "color", "default": "#22D3EE"}` |
| `"string"` | `{"name": "session", "type": "string", "default": "US"}` |
| `"select"` | `{"name": "mode", "type": "select", "default": "fast", "options": [{"label": "Fast", "value": "fast"}, {"label": "Slow", "value": "slow"}]}` |

### Access from Python

The values typed in the UI arrive in `sdk.params` (tick by tick) or in the `params` argument of `main()`. Convert them explicitly to the expected type - the engine may deliver a string depending on the input.

```python
fast = int((params or {}).get("fast_period", 9))
risk = float((params or {}).get("risk", 0.02))
use_volume = bool((params or {}).get("use_volume", True))
```

**Critical rule:** every parameter you read must be listed in `inputs`. If it is not, the value edited in the UI **does not reach the runtime** - the script falls back to the hard-coded default.

---

## `plots[]` - chart lines

Each plot has a data series (in `series`, returned by the `df=` branch) and visual metadata:

```python
{
    "name": "ma_fast",          # REQUIRED - key in series
    "title": "SMA 9",           # optional - legend
    "source": "ma_fast",        # REQUIRED - key in series (usually equal to name)
    "type": "line",             # REQUIRED - "line" | "histogram" | "dots" | "area" | "arrows" | "circles"
    "color": "#22D3EE",         # hex or CSS color
    "lineWidth": 2,             # pixels
    "style": "solid",           # "solid" | "dashed" | "dotted"
    "visible": True,
}
```

**The contract between `plots` and `series`:**

```python
# In DECLARATION:
"plots": [{"name": "ma_fast", "source": "ma_fast", "type": "line", "color": "#22D3EE"}]

# In the return value of _build_chart(df, params):
return {
    "plots": [...],
    "series": {
        "ma_fast": [None, None, ..., 100.5, 101.2, 102.3],  # same length as candles
    },
}
```

The key `"ma_fast"` in `series` must match the plot's `source` exactly. Otherwise the frontend does not draw the line.

### Plot types

| `type` | Visual | Typical use |
|---|---|---|
| `"line"` | Continuous line | Moving averages, RSI |
| `"histogram"` | Vertical bars | MACD histogram, volume |
| `"dots"` | Discrete dots | Signals, events |
| `"area"` | Filled area | Bands, ATR |
| `"arrows"` | Up/down arrows | Signal markers |
| `"circles"` | Circles | Pivots |

---

## `pane` - where the plot appears

| Value | Meaning |
|---|---|
| `"overlay"` | On top of the price chart (default). Used for moving averages, bands, VWAP. |
| `"price"` | Synonym for `"overlay"`. |
| `"same"` | On the current pane (useful when you are already on a separate pane). |
| `"new"` | Creates a new pane below the chart. Used for RSI, MACD, volume. |

For an oscillator such as RSI, you declare `"pane": "new"` and the frontend creates a dedicated subchart.

---

## `levels[]` - horizontal lines

Useful for marking fixed levels (RSI 70/30, pivot points).

```python
"levels": [
    {"name": "Overbought", "value": 70, "color": "#EF4444", "style": "dashed"},
    {"name": "Oversold",   "value": 30, "color": "#22C55E", "style": "dashed"},
],
```

Fields: `value` (required), `name`, `color`, `width`, `style`, `visible`.

---

## `entry_conditions[]` / `exit_conditions[]` (declarative mode)

An alternative to the manual `on_bar_strategy`. You declare the conditions and the engine executes them:

```python
"entry_conditions": [
    {
        "name": "Buy",
        "source": "ma_fast",         # key in series
        "operator": "crosses_above",
        "target": "ma_slow",         # another key in series, OR
        "value": None,               # a constant value
        "action": "buy_to_open",
        "enabled": True,
    },
],
"exit_conditions": [
    {
        "name": "Exit",
        "source": "ma_fast",
        "operator": "crosses_below",
        "target": "ma_slow",
        "action": "sell_to_close",
        "enabled": True,
    },
],
```

### Supported operators

| Operator | Meaning |
|---|---|
| `crosses_above` | Source crossed above target (on the last bar) |
| `crosses_below` | Source crossed below target |
| `crosses` | Any crossing |
| `greater_than` / `>` | Source > target |
| `greater_or_equal` / `>=` | Source >= target |
| `less_than` / `<` | Source < target |
| `less_or_equal` / `<=` | Source <= target |
| `equals` / `==` | Source = target |
| `not_equals` / `!=` | Source != target |

### Accepted actions

The same 7 canonical actions described in [Canonical actions](../sdk-reference/actions.md): `buy_to_open`, `sell_short_to_open`, `sell_to_close`, `buy_to_cover`, `close_position`, `reverse_position`, `update_position_exits`.

### Exclusivity rule

**`entry_conditions` and `on_bar_strategy` are mutually exclusive.** When the engine finds `entry_conditions` in the DECLARATION, it activates declarative mode and ignores any `on_bar_strategy` function or `sdk` branch in `main()`. To use manual logic, do not declare `entry_conditions`.

---

## Complete example - SMA crossover

```python
DECLARATION = {
    "type": "strategy",
    "inputs": [
        {
            "name": "fast_period",
            "label": "Fast MA",
            "type": "int",
            "default": 9,
            "min": 1,
            "max": 100,
            "step": 1,
        },
        {
            "name": "slow_period",
            "label": "Slow MA",
            "type": "int",
            "default": 21,
            "min": 2,
            "max": 200,
            "step": 1,
        },
    ],
    "plots": [
        {
            "name": "ma_fast",
            "title": "Fast SMA",
            "source": "ma_fast",
            "type": "line",
            "color": "#22D3EE",
            "lineWidth": 2,
        },
        {
            "name": "ma_slow",
            "title": "Slow SMA",
            "source": "ma_slow",
            "type": "line",
            "color": "#F59E0B",
            "lineWidth": 2,
        },
    ],
    "pane": "overlay",
    "scale": "none",
}
```

When the engine calls `main()` with no arguments, you return exactly this constant. When it calls with `df=`, you return `{"plots": DECLARATION["plots"], "series": {"ma_fast": [...], "ma_slow": [...]}}`.
