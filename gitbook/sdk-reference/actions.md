# Canonical actions

Every order issued by the script uses `sdk.buy(...)`, `sdk.sell(...)` or `sdk.close(...)` with an **explicit action** via the `action` kwarg. The engine accepts 7 canonical actions; there are no hidden aliases.

| Action | Effect | When to use |
|---|---|---|
| `buy_to_open` | Opens a long position | `sdk.position == 0` and buy signal |
| `sell_short_to_open` | Opens a short position | `sdk.position == 0` and sell signal |
| `sell_to_close` | Closes a long position | `sdk.position > 0` and exit signal |
| `buy_to_cover` | Closes a short position | `sdk.position < 0` and cover signal |
| `close_position` | Closes any open position (generic) | Forced stop, risk management |
| `reverse_position` | Closes current and opens on the opposite side | Reversal in one step |
| `update_position_exits` | Only updates stop/target on the live position | Trailing stop external to the engine |

## `action` is mandatory

`action` is required. `sdk.buy(qty=1)` without `action` raises `ProtocolError` and terminates the strategy:

```
ProtocolError: Strict Mode: buy() / sell() requires an explicit action
```

No exceptions. Every call requires the `action` kwarg.

---

## Full signature

All methods (`buy`, `sell`, `close`) accept the same kwargs. The method only determines the side on the emitted signal:

```python
sdk.buy(
    action,                      # REQUIRED - one of the 7 actions
    qty,                         # quantity (float; accepts fractional in crypto)
    order_type="market",         # "market" (default) | "limit" | "stop" | "stop_limit"
    price=None,                  # price for limit/stop_limit
    stop_loss=None,              # stop price attached to the position
    take_profit=None,            # target price attached to the position
    trailing_stop_pct=None,      # trailing as a percentage (0.02 = 2%)
    time=None,                   # timestamp (ms). Default: last candle
    tif="day",                   # "day" (default) | "gtc" | "ioc" | "fok" | "gtd"
    size_pct=None,               # % of cash - alternative to qty
    oco_group=None,              # OCO group (one-cancels-other)
    instrument_id=None,          # instrument override (rare)
)
```

The same kwargs apply to `sdk.sell(...)` and `sdk.close(...)`.

### Equivalent helpers

The SDK also exposes semantic shortcuts. The recommended idiom is to pass `action` explicitly, since it makes the code more auditable:

```python
# All equivalent:
sdk.buy(action="buy_to_open",         qty=1, order_type="market")
sdk.buy_to_open(qty=1, order_type="market")

sdk.sell(action="sell_to_close",      qty=abs(sdk.position), order_type="market")
sdk.sell_to_close(qty=abs(sdk.position), order_type="market")

sdk.close(action="close_position",    qty=abs(sdk.position))
sdk.close_position(qty=abs(sdk.position))
```

---

## 1. `buy_to_open`

**Opens a long position.**

```python
if sdk.position == 0 and buy_signal:
    sdk.buy(
        action="buy_to_open",
        qty=1,
        order_type="market",
    )
```

With attached stop and target:

```python
sdk.buy(
    action="buy_to_open",
    qty=1,
    order_type="market",
    stop_loss=close * 0.98,       # stop 2% below
    take_profit=close * 1.05,     # target 5% above
)
```

The engine keeps the stop and target alive while the position is open. If either one is hit, it generates the exit signal automatically.

---

## 2. `sell_short_to_open`

**Opens a short position.**

```python
if sdk.position == 0 and sell_signal:
    sdk.sell(
        action="sell_short_to_open",
        qty=1,
        order_type="market",
    )
```

The legacy alias `sell_short` is also accepted by the runtime (without the `_to_open` suffix), but prefer the full form for consistency with `buy_to_open`.

---

## 3. `sell_to_close`

**Closes a long position.** Always use `qty=abs(sdk.position)`:

```python
if sdk.position > 0 and exit_signal:
    sdk.sell(
        action="sell_to_close",
        qty=abs(sdk.position),
        order_type="market",
    )
```

If `qty` is smaller than `abs(sdk.position)`, the engine closes partially and the remaining position stays open.

---

## 4. `buy_to_cover`

**Closes a short position.** Symmetric to `sell_to_close`:

```python
if sdk.position < 0 and cover_signal:
    sdk.buy(
        action="buy_to_cover",
        qty=abs(sdk.position),
        order_type="market",
    )
```

---

## 5. `close_position`

**Closes any open position, regardless of side.** Useful for risk handlers:

```python
# Daily stop: if drawdown > 5%, close everything
if drawdown > 0.05 and sdk.position != 0:
    sdk.close(
        action="close_position",
        qty=abs(sdk.position),
        order_type="market",
    )
```

The engine uses `sdk.position` to decide whether the signal becomes `sell_to_close` (long) or `buy_to_cover` (short).

---

## 6. `reverse_position`

**Closes the current position and opens one of the opposite size.** In a single atomic step:

```python
if reversal_signal:
    sdk.close(
        action="reverse_position",
        qty=abs(sdk.position),    # qty of the current side
        order_type="market",
    )
```

The reversal side is inferred: `position > 0` becomes short; `position < 0` becomes long. Useful in momentum strategies where the position must remain exposed.

---

## 7. `update_position_exits`

**Updates only the `stop_loss` / `take_profit` of the live position, without emitting a new order.** This is the standard mechanism for an external trailing stop:

```python
if sdk.position > 0:
    close = sdk.candles[-1]["close"]
    new_stop = close * 0.97
    sdk.close(
        action="update_position_exits",
        stop_loss=new_stop,
        # take_profit omitted - keeps the previous one
    )
```

Equivalent shortcut:

```python
sdk.update_exits(stop_loss=new_stop)
sdk.set_trailing_stop(new_stop)  # simple wrapper over update_exits
```

Leaving `stop_loss=None` **does not clear the stop**; it only omits the update. To zero it, pass `0` explicitly (the engine ignores stops <= 0).

---

## Order types (`order_type`)

| Value | Meaning | Extra kwargs |
|---|---|---|
| `"market"` | Executes at market price (default) | none |
| `"limit"` | Executes at the price or better | `price=X` |
| `"stop"` | Turns into market when the trigger is touched | `price=X` (trigger) |
| `"stop_limit"` | Turns into limit when the trigger is touched | `price=X` |

```python
# Limit order 2% below the close
sdk.buy(
    action="buy_to_open",
    qty=1,
    order_type="limit",
    price=close * 0.98,
)
```

---

## Time in Force (`tif`)

| Value | Meaning |
|---|---|
| `"day"` | Expires at the end of the session (default) |
| `"gtc"` | Good-til-cancelled - lives until you cancel |
| `"ioc"` | Immediate-or-cancel - executes what it can now, cancels the rest |
| `"fok"` | Fill-or-kill - executes everything now or cancels entirely |
| `"gtd"` | Good-til-date (requires a complement; rarely used in scripts) |

---

## Quick decision matrix

| Situation | `sdk.position` | Action |
|---|---|---|
| Want to open long, currently flat | `== 0` | `buy_to_open` |
| Want to open short, currently flat | `== 0` | `sell_short_to_open` |
| Have long, want to close | `> 0` | `sell_to_close` |
| Have short, want to close | `< 0` | `buy_to_cover` |
| Have anything, want to flatten | `!= 0` | `close_position` |
| Have long, want to flip to short (or vice versa) | `!= 0` | `reverse_position` |
| Want to adjust stop/target without changing size | `!= 0` | `update_position_exits` |

---

## Common mistakes

* **`ProtocolError: explicit action`** - the script called `sdk.buy(qty=1)` without `action=`. Fix by passing the canonical action.
* **Using `sell_short` instead of `sell_short_to_open`** - the runtime accepts both for compatibility, but standardize on `sell_short_to_open` in new scripts.
* **Using `qty=1` in crypto spot with a low balance** - generates "insufficient capital". In crypto, compute `qty` proportional to `sdk.cash`.
* **Forgetting `qty=abs(sdk.position)` on closing orders** - without `qty` the order closes 1 unit, leaving the rest open.
* **Passing `time` as a candle index** - the engine expects a timestamp in ms. Use `sdk.candles[-1]["time"]`.
