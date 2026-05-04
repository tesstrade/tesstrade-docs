# `tesstrade_indicators` — native indicator library

`tesstrade_indicators` is an optional library of optimized indicator
implementations exposed to the sandbox. The math matches the reference
implementations of `pandas_ta` (Wilder smoothing, standard EMA seed,
etc.), but the heavy lifting runs in compiled native code instead of
Python — so when a strategy recomputes the same indicator on every bar
the cost stays flat as the candle history grows.

It is **opt-in**: you import it explicitly with
`import tesstrade_indicators as ti`. Strategies that already use
`pandas_ta` or pure-Python implementations keep working unchanged.

## When to use it

Use `tesstrade_indicators` when:

* The strategy reads the **same indicator on every bar** (e.g.
  `rsi.iloc[-1]` inside `on_bar_strategy`). Every call to the
  pandas-style API recomputes the entire series — `O(n)` per bar,
  `O(n²)` over a backtest. The streaming classes here are `O(1)` per
  bar.
* You are running long backtests (5 000+ bars) or optimization with
  many candidate parameter sets.
* The strategy is hitting `TimeoutError` because indicator math
  dominates the per-bar budget.

Stick with `pandas_ta` / `pandas` / `numpy` when:

* The indicator is exotic or composite and you already have a working
  `pandas` implementation.
* You only compute the indicator once at the end of the backtest
  rather than every bar (the cost is the same in either backend).
* You are most comfortable expressing the math with `Series.rolling`
  and `Series.ewm`. Optimisation is only useful where it matters.

## Two APIs per indicator

Every indicator in `tesstrade_indicators` ships in two flavours.

### Vectorised functions

Same shape as `pandas_ta`: pass a list, get a list back.

```python
import tesstrade_indicators as ti

closes = [c["close"] for c in sdk.candles]

sma  = ti.sma(closes, 20)              # list[Optional[float]]
ema  = ti.ema(closes, 20)              # list[Optional[float]]
wma  = ti.wma(closes, 20)              # list[Optional[float]]
rsi  = ti.rsi(closes, 14)              # list[Optional[float]]
macd, signal, hist = ti.macd(closes, fast=12, slow=26, signal=9)
```

For `atr` the inputs are three parallel lists:

```python
highs  = [c["high"]  for c in sdk.candles]
lows   = [c["low"]   for c in sdk.candles]
closes = [c["close"] for c in sdk.candles]
atr_series = ti.atr(highs, lows, closes, 14)
```

The output list is the same length as the input. Warm-up positions
(before the indicator has enough history) are `None`. Read the latest
value with `series[-1]`.

### Streaming classes

Build the indicator object **once at module scope** and `update()` it
with the latest price on every bar. State persists across calls so each
update is `O(1)`.

```python
import tesstrade_indicators as ti

# Module-scope state — survives between bars within the same run.
_rsi  = ti.Rsi(14)
_ema  = ti.Ema(20)
_atr  = ti.Atr(14)
_macd = ti.Macd(fast=12, slow=26, signal=9)


def on_bar_strategy(sdk, params):
    bar = sdk.candles[-1]

    _rsi.update(bar["close"])
    _ema.update(bar["close"])
    _atr.update(bar["high"], bar["low"], bar["close"])
    _macd.update(bar["close"])

    if not _rsi.is_ready():
        return  # warm-up

    if _rsi.value() < 30 and bar["close"] > _ema.value():
        sl = bar["close"] - 2 * _atr.value()
        sdk.buy(action="buy_to_open", qty=1, order_type="market",
                stop_loss=sl)
```

Common methods on every streaming class:

| Method | Returns | Description |
|---|---|---|
| `update(price)` | `None` | Consume one new sample |
| `update(high, low, close)` (`Atr` only) | `None` | Consume one OHLC bar |
| `value()` | `Optional[float]` (or tuple for `Macd`) | Latest output, `None` during warm-up |
| `is_ready()` | `bool` | True once the warm-up window is filled |
| `reset()` | `None` | Drop all state and start over |
| `period()` | `int` | Configured period |

`Macd.value()` returns a 3-tuple `(macd, signal, histogram)` once warm.

## Catalogue

| Function | Class | Equivalent in `pandas_ta` |
|---|---|---|
| `ti.sma(prices, period)` | `ti.Sma(period)` | `pandas_ta.sma` |
| `ti.ema(prices, period)` | `ti.Ema(period)` | `pandas_ta.ema` (Wilder/standard seed) |
| `ti.wma(prices, period)` | `ti.Wma(period)` | `pandas_ta.wma` |
| `ti.rsi(prices, period)` | `ti.Rsi(period)` | `pandas_ta.rsi` (Wilder) |
| `ti.atr(high, low, close, period)` | `ti.Atr(period)` | `pandas_ta.atr` |
| `ti.macd(prices, fast, slow, signal)` | `ti.Macd(fast, slow, signal)` | `pandas_ta.macd` |

If a strategy needs an indicator that is not on this list (Bollinger
bands, Stochastic, ADX, Ichimoku, etc.), keep using `pandas_ta` or a
hand-rolled implementation — see
[implementing SMA/EMA](implementing-sma-ema.md) and
[RSI, MACD, Bollinger Bands](rsi-macd-bands.md). The catalogue grows
over time; this page is the authoritative source for what is
currently available.

## Math correctness

Every indicator in this library is verified against a reference
implementation:

| Indicator | Reference | Tolerance |
|---|---|---|
| RSI | Wilder (`pandas_ta.rsi`) | `≤ 1e-9` over 1 000 bars |
| EMA | Wilder/standard seed | matches `pandas_ta.ema` |
| Streaming classes | their own vectorised function | `≤ 1e-12` (float epsilon) |

If you compare a chart computed with `tesstrade_indicators` against a
reference computed with `pandas_ta`, the values match to within float
precision. There is no behavioural drift you should worry about.

## Picking between `ti.rsi(...)` and `ti.Rsi(...)`

| Question | Answer |
|---|---|
| "I want the latest value once" | Either works — vectorised is slightly simpler |
| "I read the indicator on every bar of a backtest" | `Rsi(...)` streaming — `O(1)` per bar |
| "I need the entire series for a chart panel" | `ti.rsi(...)` vectorised |
| "I'm porting from `pandas_ta`" | Vectorised first, switch to streaming if performance matters |
| "I want determinism guarantees" | Both — same engine, same numbers |

A common pattern is to use the **streaming class for the trading
decision** and the **vectorised function only when rendering the
indicator in a chart pane**:

```python
import tesstrade_indicators as ti

_rsi = ti.Rsi(14)


def on_bar_strategy(sdk, params):
    _rsi.update(sdk.candles[-1]["close"])
    if _rsi.is_ready() and _rsi.value() < 30:
        sdk.buy(action="buy_to_open", qty=1, order_type="market")


def main(df=None, sdk=None, params={}):
    params = params or {}
    if sdk is not None:
        return on_bar_strategy(sdk, params)
    if df is not None:
        # The chart pane needs the whole series — vectorised is right here.
        closes = df["close"].tolist()
        return {"plots": [], "series": {"rsi_14": ti.rsi(closes, 14)}}
    return DECLARATION
```

## Migration tips

### From `pandas_ta` (last-point reads)

```python
# Before — pandas_ta recomputes the whole RSI every bar
import pandas_ta as ta

def on_bar_strategy(sdk, params):
    closes = pd.Series([c["close"] for c in sdk.candles])
    rsi = ta.rsi(closes, length=14).iloc[-1]
    if not pd.isna(rsi) and rsi < 30:
        sdk.buy(action="buy_to_open", qty=1, order_type="market")
```

```python
# After — streaming class, O(1) per bar
import tesstrade_indicators as ti

_rsi = ti.Rsi(14)

def on_bar_strategy(sdk, params):
    _rsi.update(sdk.candles[-1]["close"])
    if _rsi.is_ready() and _rsi.value() < 30:
        sdk.buy(action="buy_to_open", qty=1, order_type="market")
```

### From a custom `sdk.state` cache

If you already cache an EMA in `sdk.state` (see
[implementing SMA/EMA](implementing-sma-ema.md#incremental-last-point-version)),
the streaming class is a drop-in replacement that avoids the manual
seeding logic:

```python
# Before
def on_bar_strategy(sdk, params):
    if not isinstance(sdk.state, dict):
        sdk.state = {}
    if "ema" not in sdk.state:
        sdk.state["ema"] = None
    last = sdk.candles[-1]["close"]
    ema = sdk.state["ema"]
    if ema is None:
        sdk.state["ema"] = last
        return
    alpha = 2.0 / (20 + 1.0)
    sdk.state["ema"] = alpha * last + (1 - alpha) * ema
```

```python
# After
import tesstrade_indicators as ti

_ema = ti.Ema(20)

def on_bar_strategy(sdk, params):
    _ema.update(sdk.candles[-1]["close"])
    if _ema.is_ready():
        # use _ema.value()
        ...
```

## FAQ

### Does this change how my existing scripts behave?

No. `tesstrade_indicators` is opt-in — you only see it after `import
tesstrade_indicators`. Strategies using `pandas`, `numpy`, `pandas_ta`,
or pure-Python helpers run exactly as before.

### Can I mix it with `pandas_ta`?

Yes. They coexist fine in the same script. Use whichever is more
ergonomic for the indicator at hand.

### What about indicators not on the catalogue?

Keep using `pandas_ta` or a manual implementation. The catalogue
covers the common case; everything else stays available.

### Do the streaming classes work in chart trading too?

Yes. Module-scope state persists for the duration of the live bot,
the same way `sdk.state` does — see
[live vs backtest](../chart-trading/live-vs-backtest.md) for the
specifics of how state is preserved across restarts.

## Next steps

* [Implementing SMA and EMA](implementing-sma-ema.md) — pure-Python
  reference implementations and when to prefer them.
* [RSI, MACD and Bollinger Bands](rsi-macd-bands.md) — formula
  derivations for the harder indicators.
* [Persistent state](../strategies/persistent-state.md) — how
  module-scope state interacts with the engine across runs.
