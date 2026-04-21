# Stops, targets and trailing

There are three mechanisms to protect a position: stop loss, take profit, and trailing stop. TessTrade offers **native** stop and target (attached to the position and monitored by the engine) and also allows **manual** stop/trailing (where the script computes and fires the exit).

## Native stop loss and native take profit

Pass them as kwargs on the entry order:

```python
close = sdk.candles[-1]["close"]
sdk.buy(
    action="buy_to_open",
    qty=1,
    order_type="market",
    stop_loss=close * 0.98,      # 2% below
    take_profit=close * 1.05,    # 5% above
)
```

After entry, the engine **monitors the position** on every candle:

- If the **low** of the candle touches `stop_loss` -> emits an automatic exit order (for long: `sell_to_close`).
- If the **high** of the candle touches `take_profit` -> emits an automatic exit order.
- If **both** are touched on the same candle, the result depends on the configured execution model (pessimistic: stop wins; optimistic: target wins).

The script does not need to do anything for the stop/target to work. The engine takes care of it.

### Modify stop/target of a live position

Use `update_position_exits` (details in [canonical actions](actions.md#7-update_position_exits)):

```python
if sdk.position > 0:
    close = sdk.candles[-1]["close"]
    new_stop = close * 0.97  # raises the stop (manual trailing)
    sdk.close(
        action="update_position_exits",
        stop_loss=new_stop,
        # take_profit omitted - keeps the previous one
    )
```

Or use the semantic shortcut:

```python
sdk.update_exits(stop_loss=new_stop)
sdk.set_trailing_stop(new_stop)  # same effect; clearer name
```

**Passing `None` does not clear the stop**, it only omits the update of that field. To remove the stop, pass `0` and the engine will ignore it (stops <= 0 are not considered).

## Trailing stop - manual implementation

There is no native `trailing_stop=`. The implementation is done in the script with `sdk.state` and `update_exits`. It requires more code but allows full flexibility.

### Classic trailing stop (by percentage)

```python
def on_bar_strategy(sdk, params):
    if not isinstance(sdk.state, dict):
        sdk.state = {}
    if "high_water" not in sdk.state:
        sdk.state["high_water"] = None

    close = sdk.candles[-1]["close"]
    trail_pct = float((params or {}).get("trail_pct", 0.02))

    if sdk.position > 0:
        # Long open: track the high-water.
        hw = sdk.state["high_water"]
        sdk.state["high_water"] = close if hw is None else max(hw, close)

        # Stop always trail_pct below the highest price seen.
        new_stop = sdk.state["high_water"] * (1 - trail_pct)

        # Fire exit if the close falls below the stop.
        if close <= new_stop:
            sdk.sell(
                action="sell_to_close",
                qty=abs(sdk.position),
                order_type="market",
            )
            sdk.state["high_water"] = None
        else:
            # Update the native stop to reflect the new level.
            sdk.update_exits(stop_loss=new_stop)
    else:
        # No position, reset.
        sdk.state["high_water"] = None
```

**What happens:**
- Bar by bar, `high_water` grows as the price rises.
- The stop is shifted up proportionally (`trail_pct` below the high_water).
- If the price falls below the current stop, the script closes manually (`sell_to_close`). Even if the native stop also fires, the manual exit arrives first.
- When the position flattens, `high_water` is reset.

### Trailing with `trailing_stop_pct`

The `buy`/`sell` actions accept `trailing_stop_pct` as a kwarg, which the engine forwards to the execution model. In theory this simplifies the case above, but the logic of **when to update** is still the script's responsibility. The kwarg only records the preference in the signal. For effective trailing, implement it as above.

### Short trailing

For a short position, track the **low_water** (lowest price seen) and place the stop **above** it:

```python
if sdk.position < 0:
    lw = sdk.state.get("low_water")
    close = sdk.candles[-1]["close"]
    sdk.state["low_water"] = close if lw is None else min(lw, close)
    new_stop = sdk.state["low_water"] * (1 + trail_pct)

    if close >= new_stop:
        sdk.buy(
            action="buy_to_cover",
            qty=abs(sdk.position),
            order_type="market",
        )
        sdk.state["low_water"] = None
    else:
        sdk.update_exits(stop_loss=new_stop)
```

## Exit strategies beyond stop/target

### Time-based exit (maximum bars in position)

```python
if sdk.position != 0:
    entered_at = sdk.state.get("entry_time")
    now = sdk.candles[-1]["time"]
    max_hold_ms = 3_600_000 * 4  # 4 hours

    if entered_at is not None and now - entered_at > max_hold_ms:
        side = "sell_to_close" if sdk.position > 0 else "buy_to_cover"
        sdk.close(action="close_position", qty=abs(sdk.position), order_type="market")
        sdk.state["entry_time"] = None
elif sdk.position == 0 and sdk.state.get("entry_time") is None:
    # (entry moment; save the timestamp)
    pass
```

Set `entry_time` at the moment of entry.

### Exit on RSI reversal

Combines persistent state with an indicator:

```python
if sdk.position > 0:
    rsi = _rsi_last([c["close"] for c in sdk.candles], 14)
    if rsi is not None and rsi >= 70:  # left the overbought zone
        sdk.sell(action="sell_to_close", qty=abs(sdk.position), order_type="market")
```

## Combining native stop + manual trailing

Recommended pattern: place an **initial native stop** at entry (protection against an extreme gap) and apply **manual trailing** as the price advances:

```python
if sdk.position == 0 and buy_signal:
    close = sdk.candles[-1]["close"]
    initial_stop = close * 0.95  # 5% stop as a safety net
    sdk.buy(
        action="buy_to_open",
        qty=1,
        order_type="market",
        stop_loss=initial_stop,
    )
    sdk.state["high_water"] = close

elif sdk.position > 0:
    close = sdk.candles[-1]["close"]
    sdk.state["high_water"] = max(sdk.state.get("high_water", close), close)
    new_stop = max(initial_stop, sdk.state["high_water"] * 0.97)  # 3% trailing
    sdk.update_exits(stop_loss=new_stop)
```

## Common mistakes

* **A stop below the current price on a buy fires an immediate close.** Always use `close * 0.98` or lower.
* **Forgetting to reset `high_water` when the position flattens.** On the next entry, the script inherits the high_water from the previous position.
* **Updating the stop on every candle without a real change.** `update_exits` generates a signal and multiple updates pollute the log (the engine merges them, but it is noise). Check `if new_stop != sdk.state.get("last_stop")` to avoid it.
* **Relying on native `stop_loss` during explosive volatility.** On an opening gap, the stop may execute well below (slippage). For volatile markets, consider a volatility-based stop (ATR) or an early manual exit.

## Next steps

* [Persistent state](../strategies/persistent-state.md) - deep dive into `sdk.state` with complex trailing.
* [Canonical actions](actions.md) - how `update_position_exits` works in detail.
