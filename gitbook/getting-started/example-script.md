# Example script

A minimal script that buys whenever the price rises relative to the previous bar, with no indicators. Uses:

* Confirm that the Code Editor is working.
* Observe signals on the chart.
* Understand the `main()` dispatcher in a real run.

This is not a profitable strategy - it is only a working skeleton.

## 1. Open the Code Editor

In **Backtest** or **Chart Trading**, click **Editor**. A code window appears with a scaffold.

## 2. Erase the scaffold and paste the code below

```python
DECLARATION = {
    "type": "strategy",
    "inputs": [
        {
            "name": "qty",
            "label": "Quantity",
            "type": "float",
            "default": 1.0,
            "min": 0.001,
            "max": 1000.0,
            "step": 0.001,
        },
    ],
}


def on_bar_strategy(sdk, params):
    qty = float((params or {}).get("qty", 1.0))

    # Needs at least 2 candles to compare the previous one with the current one.
    if len(sdk.candles) < 2:
        return

    last_close = sdk.candles[-1]["close"]
    prev_close = sdk.candles[-2]["close"]
    went_up = last_close > prev_close

    if sdk.position == 0 and went_up:
        sdk.buy(
            action="buy_to_open",
            qty=qty,
            order_type="market",
        )
    elif sdk.position > 0 and not went_up:
        sdk.sell(
            action="sell_to_close",
            qty=abs(sdk.position),
            order_type="market",
        )


def main(df=None, sdk=None, params={}):
    params = params or {}
    if sdk is not None:
        return on_bar_strategy(sdk, params)
    # This script does not draw plots, so the `df=` branch returns empty.
    if df is not None:
        return {"plots": [], "series": {}}
    return DECLARATION
```

## 3. Click **Run** (or **Backtest**)

* In **Backtest**: choose the symbol, period, and click start. In 1-2 min the results panel appears.
* In **Chart Trading**: start a **paper trading bot** (see [paper bots](../chart-trading/paper-trading-bots.md)).

## 4. What to expect

Dozens of trades. Win rate close to 50% (coin flip of the previous bar). Net profit close to zero, visible drawdown. This behavior is expected: it is a noise generator, not a strategy.

Checkpoints:

* The parameter panel appeared with the editable "Quantity" field.
* Orders were emitted (markers on the chart).
* Equity evolved candle by candle.
* The script compiled and executed without error.

## 5. Variations

Modifications in order of difficulty:

### Only buy when it rises 2 bars in a row
```python
prev_close = sdk.candles[-2]["close"]
prev_prev_close = sdk.candles[-3]["close"]
went_up_twice = sdk.candles[-1]["close"] > prev_close > prev_prev_close
```

### Add an indicator and plot it on the chart

See [SMA Crossover](../strategies/sma-crossover.md), which contains a full template commented line by line.

### Store state between bars
```python
if not isinstance(sdk.state, dict):
    sdk.state = {}
sdk.state["trades_taken"] = sdk.state.get("trades_taken", 0) + 1
```

Details in [persistent state](../strategies/persistent-state.md).

## 6. Error handling

### "Strict Mode" error
The `main()` function was not defined at the root level. Check that it is not indented.

### "explicit action" error
`sdk.buy()` was called without `action=`. All calls require that argument - the [canonical actions](../sdk-reference/actions.md) documentation lists the 7.

### "Import not allowed"
Import outside the whitelist. See [sandbox limits](sandbox-limits.md). There are no imports in this script; if the error appears, remove any `import` that is not `numpy`/`pandas`/`math`/`json`/`datetime`.

### 0 trades
The `DECLARATION` declares `entry_conditions` but the script also defines `on_bar_strategy`. These modes are **mutually exclusive** (details in [when to use declarative mode](../declarative-mode/when-to-use.md)). Remove `entry_conditions` from the DECLARATION.

### Empty parameter panel
`DECLARATION["inputs"]` is empty or `main()` does not return `DECLARATION` in the no-argument branch. Review the contract in [main dispatcher](../contract/dispatcher-main.md).

## Next steps

* [main dispatcher](../contract/dispatcher-main.md) - why this script has 3 branches.
* [DECLARATION](../contract/declaration.md) - how to add more inputs and plots.
* [SMA Crossover](../strategies/sma-crossover.md) - first utility template.
