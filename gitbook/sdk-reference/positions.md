# Position, cash and equity

Five `sdk` properties expose the current state of the simulated portfolio. All are **read-only**: the script observes, the engine updates.

| Property | Type | Description |
|---|---|---|
| `sdk.position` | `float` | Net position. `> 0` long, `< 0` short, `0` flat. |
| `sdk.buy_price` | `Optional[float]` | Average price of the long side (`None` if no long is open). |
| `sdk.sell_price` | `Optional[float]` | Average price of the sold/shorted side (`None` if no short is open). |
| `sdk.cash` | `float` | Cash balance. |
| `sdk.equity` | `float` | Equity = cash + position value at market price. |

## `sdk.position`

Central property. Always check before issuing any order.

```python
if sdk.position == 0:
    # flat, may open long or short
    sdk.buy(action="buy_to_open", qty=1, order_type="market")
elif sdk.position > 0:
    # already long, consider exiting
    pass
elif sdk.position < 0:
    # already short, consider covering
    pass
```

### Why it is `float` and not `int`

The TessTrade backtest supports multiple markets with different granularities. Futures contracts (WIN, WDO) use integers; crypto uses fractional sizes (`0.005 BTC`). The `float` type covers both cases. In any context, the position can be treated as a signed quantity:

```python
qty_to_close = abs(sdk.position)
sdk.sell(action="sell_to_close", qty=qty_to_close, order_type="market")
```

### Max Positions = 1 (default behavior)

The engine silently rejects opening orders (`buy_to_open` or `sell_short_to_open`) when a position is already open. This prevents accidental pyramiding. If the script depends on pyramiding, close the position before reopening.

```python
# Incorrect: accidental pyramid
if close_up:
    sdk.buy(action="buy_to_open", qty=1)  # rejected if already long

# Correct: check first
if sdk.position == 0 and close_up:
    sdk.buy(action="buy_to_open", qty=1)
```

---

## `sdk.buy_price` and `sdk.sell_price`

Weighted average price of the bought / sold side. Useful for computing unrealized P&L or manual stops based on the entry point.

```python
if sdk.position > 0 and sdk.buy_price is not None:
    close = sdk.candles[-1]["close"]
    pnl_pct = (close - sdk.buy_price) / sdk.buy_price
    if pnl_pct >= 0.05:  # 5% profit
        sdk.sell(action="sell_to_close", qty=abs(sdk.position),
                 order_type="market")
```

**Warning:** `buy_price` / `sell_price` may be `None`. Always check before using them in a calculation.

```python
# Defensive idiom
entry = sdk.buy_price if sdk.position > 0 else sdk.sell_price
if entry is None:
    return  # no position open, nothing to monitor
```

---

## `sdk.cash`

Cash balance **after all filled orders**. Useful for proportional sizing:

```python
close = sdk.candles[-1]["close"]
target_notional = sdk.cash * 0.25     # use 25% of the cash
qty = target_notional / close          # in asset units

sdk.buy(action="buy_to_open", qty=qty, order_type="market")
```

### Note on markets

* **Crypto / Spot:** `sdk.cash` reflects the balance in USDT (or the quote currency of the pair).
* **Futures:** `sdk.cash` reflects the margin account balance.
* **Stocks:** similar to crypto spot.

Units and precision follow the market. There is no automatic currency conversion.

---

## `sdk.equity`

Equity at market price = cash + (`sdk.position` * current price). It is the indicator the engine uses to compute drawdown and to trigger risk management (daily stop, simulated margin call).

```python
# Example: close everything if intraday drawdown > 5%
if not isinstance(sdk.state, dict):
    sdk.state = {}
if "equity_open" not in sdk.state:
    sdk.state["equity_open"] = sdk.equity

dd = (sdk.state["equity_open"] - sdk.equity) / sdk.state["equity_open"]
if dd > 0.05 and sdk.position != 0:
    side = "sell_to_close" if sdk.position > 0 else "buy_to_cover"
    sdk.close(action=side if sdk.position > 0 else "buy_to_cover",
              qty=abs(sdk.position), order_type="market")
```

---

## Common patterns

### Pattern 1 - open only when flat

```python
if sdk.position == 0:
    if buy_signal:
        sdk.buy(action="buy_to_open", qty=1, order_type="market")
    elif sell_signal:
        sdk.sell(action="sell_short_to_open", qty=1, order_type="market")
```

### Pattern 2 - close and reverse

```python
if reversal_signal:
    if sdk.position > 0:
        sdk.sell(action="sell_to_close", qty=abs(sdk.position), order_type="market")
        sdk.sell(action="sell_short_to_open", qty=1, order_type="market")
    elif sdk.position < 0:
        sdk.buy(action="buy_to_cover", qty=abs(sdk.position), order_type="market")
        sdk.buy(action="buy_to_open", qty=1, order_type="market")
```

(Or use `sdk.close(action="reverse_position", ...)` - a semantic shortcut that lets the engine perform both steps atomically.)

### Pattern 3 - sizing proportional to cash

```python
def on_bar_strategy(sdk, params):
    if sdk.position != 0:
        return
    close = sdk.candles[-1]["close"]
    risk_pct = float((params or {}).get("risk_pct", 0.02))
    qty = (sdk.cash * risk_pct) / close
    sdk.buy(action="buy_to_open", qty=qty, order_type="market")
```

### Pattern 4 - manual stop based on entry price

```python
if sdk.position > 0 and sdk.buy_price is not None:
    close = sdk.candles[-1]["close"]
    stop_price = sdk.buy_price * 0.98  # 2% stop
    if close <= stop_price:
        sdk.sell(action="sell_to_close", qty=abs(sdk.position),
                 order_type="market")
```

---

## Common mistakes

* **Calling `abs(sdk.position)` when `sdk.position` is `None`:** `sdk.position` is never `None` (always `float`). `abs(0.0) == 0.0`, safe.
* **Forgetting to check `sdk.buy_price is not None`:** returns `None` when no long is open. Arithmetic with `None` raises `TypeError`.
* **Comparing `sdk.position == 1`:** use `sdk.position > 0` (it can be fractional). `== 0` is safe for flat.
* **Using `sdk.cash` as equity:** `sdk.cash` does not consider the value of open positions. For risk decisions, use `sdk.equity`.
