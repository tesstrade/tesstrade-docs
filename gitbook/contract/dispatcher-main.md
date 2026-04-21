# The `main()` dispatcher

The TessTrade engine calls the script's `main` function in **three distinct contexts**. If any of the three is not handled, parts of execution fail silently, with no error, no trade, and no plot.

## Canonical signature

```python
def main(df=None, sdk=None, params={}):
    params = params or {}
    if sdk is not None:
        return on_bar_strategy(sdk, params)   # bar-by-bar trading
    if df is not None:
        return _build_chart(df, params)       # chart plots
    return DECLARATION                        # metadata / parameters panel
```

The three parameters are **always passed as keyword arguments**. The order of the checks (`sdk` before `df`, `df` before the fallback) is the recommended idiom.

---

## Context 1 - `sdk=` (bar-by-bar execution)

**When it happens:** on every closed candle, during a historical backtest or during live chart trading.

**What the engine passes:**

```python
main(sdk=strategy_sdk_instance, params={"fast_period": 9, "slow_period": 21})
```

**What the script does:** reads `sdk.candles`, computes indicators, decides whether to open or close a position, and calls `sdk.buy(...)` / `sdk.sell(...)`.

**What the script returns:** nothing (implicit `None`) or any value. The engine ignores the return value. The side effect is the orders emitted through the SDK.

```python
def on_bar_strategy(sdk, params):
    fast = int((params or {}).get("fast_period", 9))
    slow = int((params or {}).get("slow_period", 21))

    if len(sdk.candles) < max(fast, slow) + 1:
        return  # warmup; not enough candles yet

    closes = [c["close"] for c in sdk.candles]
    fast_ma = sum(closes[-fast:]) / fast
    slow_ma = sum(closes[-slow:]) / slow

    if sdk.position == 0 and fast_ma > slow_ma:
        sdk.buy(action="buy_to_open", qty=1, order_type="market")
```

---

## Context 2 - `df=` (indicator chart)

**When it happens:** the frontend calls once with all available candles to render the indicator lines on the chart.

**What the engine passes:**

```python
main(df=pd.DataFrame({"time": [...], "open": [...], "high": [...], ...}), params={...})
```

`df` is a **real pandas DataFrame** with the columns `time`, `open`, `high`, `low`, `close`, `volume`.

**What the script returns:** a dictionary with `plots` and `series`:

```python
def _build_chart(df, params):
    fast = int((params or {}).get("fast_period", 9))
    closes = list(df["close"])
    return {
        "plots": [
            {
                "name": "ma_fast",
                "title": f"SMA {fast}",
                "source": "ma_fast",
                "type": "line",
                "color": "#22D3EE",
                "lineWidth": 2,
            },
        ],
        "series": {
            "ma_fast": _sma_series(closes, fast),
        },
    }
```

**Rules for the return value:**

* Every key in `series` must match the `source` of some plot exactly.
* Each series array must have the **same length** as the list of candles. Use `None` in the warmup positions (before there are enough points to compute).
* Numeric values must be `float` or `None`. Do not use `NaN`; use `None`.

---

## Context 3 - no arguments (metadata)

**When it happens:** the engine needs to build the strategy's parameters panel (the form that appears when you open a script with editable inputs).

**What the engine passes:** nothing. All arguments keep their defaults (`df=None`, `sdk=None`, `params={}`).

**What the script returns:** the `DECLARATION`, described in detail in [The `DECLARATION` shape](declaration.md).

```python
DECLARATION = {
    "type": "strategy",
    "inputs": [
        {"name": "fast_period", "type": "int", "default": 9,  "min": 1, "max": 100},
        {"name": "slow_period", "type": "int", "default": 21, "min": 2, "max": 200},
    ],
}
```

---

## The complete pattern

These three contexts combine in the dispatcher of a real strategy:

```python
DECLARATION = {
    "type": "strategy",
    "inputs": [
        {"name": "fast_period", "type": "int", "default": 9,  "min": 1, "max": 100},
        {"name": "slow_period", "type": "int", "default": 21, "min": 2, "max": 200},
    ],
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
    fast = int((params or {}).get("fast_period", 9))
    closes = list(df["close"])
    return {
        "plots": [
            {"name": "ma_fast", "title": f"SMA {fast}", "source": "ma_fast",
             "type": "line", "color": "#22D3EE", "lineWidth": 2},
        ],
        "series": {
            "ma_fast": _sma_series(closes, fast),
        },
    }

def on_bar_strategy(sdk, params):
    fast = int((params or {}).get("fast_period", 9))
    closes = [c["close"] for c in sdk.candles]
    if len(closes) < fast + 1:
        return
    fast_ma = sum(closes[-fast:]) / fast
    if sdk.position == 0 and closes[-1] > fast_ma:
        sdk.buy(action="buy_to_open", qty=1, order_type="market")

def main(df=None, sdk=None, params={}):
    params = params or {}
    if sdk is not None:
        return on_bar_strategy(sdk, params)
    if df is not None:
        return _build_chart(df, params)
    return DECLARATION
```

---

## Alternative: `on_bar(sdk)` (legacy mode)

If your strategy does not use `df=` (it does not plot anything on the chart) and does not declare editable inputs, the engine also accepts the classic `on_bar(sdk)` function:

```python
PARAMS = {"fast_period": 10, "slow_period": 20}

def on_bar(sdk):
    fast = int(PARAMS.get("fast_period", 10))
    slow = int(PARAMS.get("slow_period", 20))
    # ...
```

In this mode, the parameters live in a global `PARAMS` constant, there is no `DECLARATION`, and there are no plots. It is leaner, but **not recommended** for new scripts. The `main()` dispatcher is the canonical pattern because it supports all three contexts.

---

## Common mistakes

* **"Strict Mode" error:** the code does not define any of the expected entry points (`main` or `on_bar`). Define `main(df=None, sdk=None, params={})` at the root level.
* **`sdk.buy()` without `action`:** every order call requires an explicit `action` kwarg (`action="buy_to_open"`, and so on). Omitting it raises `ProtocolError`. See [Canonical actions](../sdk-reference/actions.md) for details.
* **Returning a list instead of a dict in the `df=` context:** the engine expects `{"plots": [...], "series": {...}}`. Returning `series` alone without `plots` causes the frontend to draw nothing.
* **`series` arrays with a different length from candles:** the frontend aligns by index. An array shorter than the number of candles misaligns every point. Pad the warmup with `None`.
* **Mutating `params` inside `main`:** treat `params` as read-only. If you need a default, use `int((params or {}).get("fast_period", 9))` instead of `params.setdefault(...)`.
