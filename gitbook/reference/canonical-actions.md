# Canonical actions table

Quick reference of all actions accepted by the engine. For use in `sdk.buy(...)`, `sdk.sell(...)`, `sdk.close(...)` and in `entry_conditions` / `exit_conditions` of declarative mode.

## Main table

| Action | Side | Effect | When to use |
|---|---|---|---|
| `buy_to_open` | Long | Opens long position | `sdk.position == 0` plus buy signal |
| `sell_short_to_open` | Short | Opens short position | `sdk.position == 0` plus sell signal |
| `sell_to_close` | Long | Closes long position | `sdk.position > 0` plus exit signal |
| `buy_to_cover` | Short | Closes short position | `sdk.position < 0` plus cover signal |
| `close_position` | Generic | Closes any position | Forced stop; engine decides the side |
| `reverse_position` | Generic | Closes and opens on the opposite side | Atomic reversal |
| `update_position_exits` | Generic | Only updates stop/target | External trailing stop |

## Accepted aliases

The runtime normalizes some aliases; prefer the canonical form for consistency:

| Alias | Canonical |
|---|---|
| `sell_short` | `sell_short_to_open` |

Other variations (CamelCase, spaces, uppercase) **do not work**. The action is always `snake_case` and lowercase.

## Call signature

```python
sdk.buy(
    action="buy_to_open",        # required
    qty=1,                       # quantity (float)
    order_type="market",         # "market" | "limit" | "stop" | "stop_limit" | "bracket"
    price=None,                  # for limit/stop
    stop_loss=None,              # stop price
    take_profit=None,            # target price
    trailing_stop_pct=None,      # percentage for native trailing
    time=None,                   # timestamp (ms); default: last candle
    tif="day",                   # "day" | "gtc" | "ioc" | "fok" | "gtd"
    size_pct=None,               # alternative to qty: % of cash
    oco_group=None,              # OCO group
    instrument_id=None,          # instrument override
)
```

`sdk.sell(...)`, `sdk.close(...)`, `sdk.update_exits(...)` accept the same kwargs.

## Golden rule

**`action` is mandatory.** `sdk.buy(qty=1)` without `action` raises `ProtocolError` and halts execution:

```
ProtocolError: Strict Mode: buy() / sell() requires explicit action
```

## Decision matrix

```
                 sdk.position == 0       sdk.position > 0       sdk.position < 0
Enter long:      buy_to_open             --                      --
Enter short:     sell_short_to_open      --                      --
Exit long:       --                      sell_to_close           --
Exit short:      --                      --                      buy_to_cover
Flatten:         --                      close_position          close_position
Reverse:         --                      reverse_position        reverse_position
Trailing:        --                      update_position_exits   update_position_exits
```

## Qty on closing orders

Always:
```python
qty = abs(sdk.position)
```

Omitting it or passing the wrong value results in a partial close.

## Orders with attached stop and target

```python
sdk.buy(
    action="buy_to_open",
    qty=1,
    order_type="market",
    stop_loss=close * 0.98,
    take_profit=close * 1.05,
)
```

The engine monitors and executes the exit automatically when either of the two is touched.

## Complete example - standard

```python
if sdk.position == 0:
    if buy_signal:
        sdk.buy(action="buy_to_open",         qty=1,                 order_type="market")
    elif sell_signal:
        sdk.sell(action="sell_short_to_open", qty=1,                 order_type="market")
elif sdk.position > 0 and exit_signal:
    sdk.sell(action="sell_to_close",          qty=abs(sdk.position), order_type="market")
elif sdk.position < 0 and cover_signal:
    sdk.buy(action="buy_to_cover",            qty=abs(sdk.position), order_type="market")
```

## Where to use each action

### `buy_to_open`
- **In script:** `sdk.buy(action="buy_to_open", ...)`
- **In entry_conditions:** `"action": "buy_to_open"`

### `sell_short_to_open`
- **In script:** `sdk.sell(action="sell_short_to_open", ...)`
- **In entry_conditions:** `"action": "sell_short_to_open"`

### `sell_to_close`
- **In script:** `sdk.sell(action="sell_to_close", ...)`
- **In exit_conditions:** `"action": "sell_to_close"`

### `buy_to_cover`
- **In script:** `sdk.buy(action="buy_to_cover", ...)`
- **In exit_conditions:** `"action": "buy_to_cover"`

### `close_position`
- **In script:** `sdk.close(action="close_position", ...)`
- **In exit_conditions:** `"action": "close_position"` (the engine infers the side)

### `reverse_position`
- **In script:** `sdk.close(action="reverse_position", ...)`
- **In exit_conditions:** rarely used; prefer imperative mode

### `update_position_exits`
- **In script:** `sdk.update_exits(stop_loss=..., take_profit=...)` or `sdk.close(action="update_position_exits", ...)`
- **In exit_conditions:** not applicable (does not close; only updates)

## Details on other pages

* [Canonical actions - detail and examples](../sdk-reference/actions.md)
* [Order types](../sdk-reference/order-types.md) - market, limit, stop, bracket
* [Stops, targets and trailing](../sdk-reference/stops-and-targets.md) - trailing, update_exits
* [Declarative mode](../declarative-mode/when-to-use.md) - using actions in `entry_conditions`
