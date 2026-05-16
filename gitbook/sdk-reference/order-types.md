# Order types

The `order_type` kwarg of `sdk.buy/sell/close` controls **how** the order executes. Three values are accepted:

| `order_type` | Executes | Extra kwargs |
|---|---|---|
| `"market"` | Immediately, at the current price (default) | - |
| `"limit"` | At the specified price or better | `price` (required) |
| `"stop"` | When the price hits the trigger, becomes market | `price` (trigger) |

Any other value falls back to `"market"`. A protective stop and target are **not** a separate order type — pass `stop_loss` / `take_profit` on a `market`, `limit`, or `stop` order (see [Attached stop and target](#attached-stop-and-target)).

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

## Attached stop and target

There is no `bracket` or `stop_limit` order type. To get an entry with a protective stop and a profit target, pass `stop_loss` and/or `take_profit` **on the entry order** (`market`, `limit`, or `stop`):

```python
close = sdk.candles[-1]["close"]
sdk.buy(
    action="buy_to_open",
    qty=1,
    order_type="market",
    stop_loss=close * 0.98,
    take_profit=close * 1.05,
)
```

Result: market entry, stop 2% below, target 5% above. The engine keeps both alive while the position is open; whichever is touched first closes the position and the other is cancelled automatically (OCO-style), with no extra logic in the script. The same `stop_loss` / `take_profit` kwargs work on a `limit` or `stop` entry.

## Time in Force (`tif`)

Regardless of `order_type`, `tif` controls **how long** the order stays alive while it does not execute:

| `tif` | Meaning |
|---|---|
| `"day"` | Valid until the end of the day/session (default) |
| `"gtc"` | Good-til-cancelled - lives until explicit cancellation |
| `"this_bar"` | Valid only for the current bar; cancelled if it does not execute by the next candle |

Any other value falls back to `"day"`.

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

## Combined example - breakout with attached stop and target

Breakout entry (stop order) with a fixed stop and target attached to it:

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
* **`stop_loss` above the entry price on a long:** on a buy (long), the stop must be **below** the current price. Placing it above closes the position immediately.

## Next steps

* [Stops, targets e trailing](stops-and-targets.md) - how stops live during the position.
* [Canonical actions](actions.md) - the 7 actions and when to use each.
