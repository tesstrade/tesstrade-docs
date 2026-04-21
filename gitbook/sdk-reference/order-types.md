# Order types

The `order_type` kwarg of `sdk.buy/sell/close` controls **how** the order executes. Five values are accepted:

| `order_type` | Executes | Extra kwargs |
|---|---|---|
| `"market"` | Immediately, at the current price (default) | - |
| `"limit"` | At the specified price or better | `price` (required) |
| `"stop"` | When the price hits the trigger, becomes market | `price` (trigger) |
| `"stop_limit"` | Hits the trigger, becomes limit | `price` (trigger), more details below |
| `"bracket"` | Groups entry + stop + target into one OCO | `stop_loss`, `take_profit` |

## `market`

The default and most frequently used type. Executes immediately against the book.

```python
sdk.buy(
    action="buy_to_open",
    qty=1,
    order_type="market",
)
```

**Execution price:**
- **Backtest:** uses the current candle's `close` by default (or a more realistic model via `execution_model=ohlc` + slippage in the backtest params).
- **Chart trading:** uses the current book price (ask for a buy, bid for a sell). Slippage is real.

For most scripts, `order_type="market"` is the appropriate choice.

## `limit`

Only executes if the price reaches the limit or better. For a buy, "better" means lower; for a sell, higher.

```python
close = sdk.candles[-1]["close"]
sdk.buy(
    action="buy_to_open",
    qty=1,
    order_type="limit",
    price=close * 0.99,  # try to buy 1% below the close
)
```

### Behavior when it does not execute

The engine keeps monitoring the order until:
- The price touches the limit -> executes.
- The `tif` expires -> cancels.

In a backtest, if the price never touches, the order stays pending until the end of the period (and the backtest counts it as not executed - with no effect). In chart trading, it stays pending indefinitely with `tif="gtc"`.

### With `probFillOnLimit` (backtest)

In the backtest, the engine simulates realistic book behavior: sometimes the price touches the limit but **does not execute** because the order would be behind in the queue. The `probFillOnLimit` param (default 1.0 = always executes) controls that probability. Details in [reading results](../backtest/reading-results.md).

## `stop`

Inactive until the price crosses the trigger. When it crosses, becomes a market order.

```python
sdk.buy(
    action="buy_to_open",
    qty=1,
    order_type="stop",
    price=close * 1.02,  # buy if it rises 2%
)
```

**Classic case:** entry on breakout. The buy should happen only when the price breaks a resistance level.

## `stop_limit`

Inactive until the price crosses the trigger, at which point it becomes **limit**. More conservative than `stop`, since it avoids buying at any price during explosive moves.

Used in advanced strategies; the engine implementation requires two prices (trigger + limit) passed via `price` + an auxiliary field. For most cases, prefer the simple `stop`.

## `bracket`

Groups three orders into one: **entry + stop + target**, linked as OCO (One-Cancels-Other). If the stop fires, the target is cancelled automatically; if the target executes, the stop is cancelled.

```python
close = sdk.candles[-1]["close"]
sdk.buy(
    action="buy_to_open",
    qty=1,
    order_type="bracket",
    stop_loss=close * 0.98,
    take_profit=close * 1.05,
)
```

Result: market entry, stop 2% below, target 5% above. The first of the two to fire closes the position automatically, without additional logic in the script.

### When to use `bracket` vs attaching `stop_loss` / `take_profit` on `market`

Both work similarly. The difference is semantic:

* **`market` + `stop_loss=x, take_profit=y`** - market entry, stops/targets configured as *exits* associated with the position.
* **`bracket`** - explicitly groups the three orders at submit time. Clearer in logs and auditing.

In practice the observable behavior is the same.

## Time in Force (`tif`)

Regardless of `order_type`, `tif` controls **how long** the order stays alive while it does not execute:

| `tif` | Meaning |
|---|---|
| `"day"` | Valid until the end of the day/session (default) |
| `"gtc"` | Good-til-cancelled - lives until explicit cancellation |
| `"ioc"` | Immediate-or-cancel - executes what it can now, the rest cancels |
| `"fok"` | Fill-or-kill - all or nothing: executes 100% immediately or cancels entirely |
| `"gtd"` | Good-til-date - expires at a specific timestamp (rare usage via script) |

```python
sdk.buy(
    action="buy_to_open",
    qty=1,
    order_type="limit",
    price=close * 0.99,
    tif="gtc",  # stays in the book until cancelled
)
```

For `market`, `tif` is irrelevant since the order executes immediately anyway.

## Quantity with `size_pct` (alternative to `qty`)

Instead of an absolute quantity, you can pass the **percentage of available cash**:

```python
sdk.buy(
    action="buy_to_open",
    size_pct=0.25,   # use 25% of the cash
    order_type="market",
)
```

The engine computes `qty = (cash * size_pct) / price`. Useful for strategies that scale with capital.

**Warning:** `size_pct` and `qty` are mutually exclusive. If you pass both, the engine prioritizes `qty` and ignores `size_pct`.

## Combined example - breakout with bracket

Breakout entry (stop order) with fixed stop and target (bracket):

```python
def on_bar_strategy(sdk, params):
    if sdk.position != 0:
        return
    if len(sdk.candles) < 20:
        return

    # High of the last 20 candles
    recent_high = max(c["high"] for c in sdk.candles[-20:])
    close = sdk.candles[-1]["close"]

    # Only enter if the price is close to the top (breakout confirmation)
    if close < recent_high * 0.995:
        return

    atr = _atr(sdk.candles, 14)
    if atr is None:
        return

    sdk.buy(
        action="buy_to_open",
        qty=1,
        order_type="stop",             # only buy if it breaks...
        price=recent_high + atr * 0.1, # ...slightly above the top
        stop_loss=recent_high - atr * 2,
        take_profit=recent_high + atr * 4,
    )
```

## Common mistakes

* **`order_type="limit"` without `price`:** the engine rejects. Always pass `price=` on a limit.
* **Using a `qty` that is too small in crypto Spot:** the book has a minimum size (for example, 0.00001 BTC). Below that, the matching engine rejects.
* **`tif="day"` in 24/7 chart trading:** crypto has no formal "end of day"; the engine interprets `day` as 24h. Use `gtc` for a permanent order.
* **Bracket with `stop_loss > close`:** on a buy (long), the stop must be **below** the current price. Placing it above triggers the order immediately.

## Next steps

* [Stops, targets e trailing](stops-and-targets.md) - how stops live during the position.
* [Canonical actions](actions.md) - the 7 actions and when to use each.
