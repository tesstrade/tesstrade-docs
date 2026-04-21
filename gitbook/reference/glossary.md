# Glossary

Terms that appear in the documentation, organized alphabetically.

---

**Action** - String that identifies the intent of an order. The 7 canonical actions: `buy_to_open`, `sell_short_to_open`, `sell_to_close`, `buy_to_cover`, `close_position`, `reverse_position`, `update_position_exits`. See [Canonical actions table](canonical-actions.md).

**Admission control** - Backend subsystem that applies safety limits to prevent abuse. Returns HTTP 429 when a limit is exceeded.

**Backtest** - Replay of a strategy against historical data. Processes thousands of candles in seconds. Deterministic. Generates quantitative metrics. See [Reading the results](../backtest/reading-results.md).

**Bracket order** - Type of compound order: entry plus stop and target in OCO (one cancels the other). See [Order types](../sdk-reference/order-types.md#bracket).

**Candle** - Dictionary with `time`, `open`, `high`, `low`, `close`, `volume`. Fundamental data unit. `sdk.candles` is the list of them.

**Chart Trading** - TessTrade live execution context. Runs the script against a real candle stream from the connected exchange, paper trading with a simulated account.

**Cooldown** - Pattern of waiting N seconds or bars after a signal before emitting the next one. Implemented manually in `sdk.state` with timestamps.

**Crossover** - Event in which one series transitions from below to above (or vice versa) another. Canonical operators: `crosses_above`, `crosses_below`.

**DECLARATION** - Root-level dictionary in the script that describes inputs, plots, pane and canonical conditions. See [DECLARATION shape](../contract/declaration.md).

**df** - The `main(df=...)` parameter. A `pd.DataFrame` with columns `time`, `open`, `high`, `low`, `close`, `volume`. Used by the plot branch.

**Dispatcher** - Name of the `main()` function with 3 branches. Dispatches to `on_bar_strategy` (`sdk=`), `_build_chart` (`df=`) or returns the DECLARATION (no args).

**Drawdown (DD)** - Maximum drop of equity from a peak. Max DD is the worst observed valley. Risk metric.

**EMA** - Exponential Moving Average. Exponentially weighted moving average. See [Implementing SMA and EMA](../indicators/implementing-sma-ema.md).

**Entry conditions / Exit conditions** - DECLARATION fields that define declarative rules. Alternative to `on_bar_strategy`. See [When to use entry/exit conditions](../declarative-mode/when-to-use.md).

**Equity** - Total account capital: cash plus market value of positions. `sdk.equity` exposes this value.

**Feed** - Real-time stream of candles/ticks from the connected exchange.

**Histogram (plot)** - Plot type with vertical bars. Common for MACD hist and volume.

**Hook (legacy)** - Alternative function to `main()`: `on_bar(sdk)`. Less recommended; prefer `main()`.

**Imperative (mode)** - Logic written in `on_bar_strategy(sdk, params)`. Opposite of declarative mode. See [The `main()` dispatcher](../contract/dispatcher-main.md).

**Indicator** - Script with `DECLARATION["type"] = "indicator"`. Draws only plots; does not emit orders.

**Input** - Editable parameter declared in `DECLARATION["inputs"]`. Rendered as a control in the UI.

**Level** - Fixed horizontal line on the plot (e.g., 70/30 on RSI). Declared in `DECLARATION["levels"]`.

**Limit order** - Order that executes only at the specified price or better. Kwarg `order_type="limit"` plus `price=...`.

**Live** - Synonym for Chart Trading; execution against real-time data.

**Look-ahead bias** - Common backtest error: use of future data for a present decision. Generates unrealistic metrics that are not reproducible live.

**MACD** - Moving Average Convergence Divergence. Composite indicator: EMA(fast) minus EMA(slow), signal line and histogram.

**Market order** - Order executed immediately at the current price. Kwarg `order_type="market"`. Default.

**Max Positions** - Limit of simultaneously open positions per account. Default 1 (no pyramiding).

**OCO (One-Cancels-Other)** - Pair of orders in which execution of one cancels the other. Used in brackets (stop and target).

**on_bar(sdk)** - Legacy entry point without a dispatcher. Works, but prefer `main()`.

**on_bar_strategy** - Naming convention for the function called by the `sdk=` branch of `main()`. It is just a helper, with no special handling.

**Overlay (pane)** - Plot drawn over the price chart (on top of the candles). Used for moving averages, bands and VWAP.

**Pane** - Visual panel of the chart. `"overlay"` on top of price; `"new"` in a separate panel below. See [panes](../indicators/panes.md).

**PARAMS** - Global variable injected by the engine with the values of the inputs. Used in legacy mode `on_bar(sdk)`. In `main()` mode, use `params` or `sdk.params`.

**Plot** - Line, histogram or mark on the chart. Declared in `DECLARATION["plots"]`. Data comes in `series`.

**Profit Factor (PF)** - Sum of profits divided by sum of losses. PF > 1 indicates profitable; PF 1.5 or higher is good.

**RSI** - Relative Strength Index. Oscillator from 0 to 100. 70 indicates overbought; 30, oversold.

**Sandbox** - Isolated environment in which the Python script runs. Limits imports, builtins, CPU, memory and I/O access.

**sdk** - Object injected into the script with properties (`candles`, `position`, `state`, ...) and methods (`buy`, `sell`, `close`).

**sdk.state** - Persistent dictionary between calls. Used for flags, cooldown, manual trailing stop and buffers.

**Sharpe Ratio** - Return divided by volatility, multiplied by sqrt(252). Risk-adjusted return metric. Sharpe > 1 is good; > 2 is excellent.

**Signal** - Dictionary emitted by the SDK when `sdk.buy/sell/close` is called. Contains fields such as `time`, `side`, `action`, `qty`. Collected by the engine and executed.

**Sizing** - Determination of position size. `qty=` is absolute; `size_pct=` is relative to cash.

**Slippage** - Difference between expected and executed price. In backtest it is configurable; live it is real.

**SMA** - Simple Moving Average. Arithmetic mean of the last N closes.

**Source (plot/condition)** - Key that references a series in `series`. E.g., `plot.source = "ma_fast"` points to `series["ma_fast"]`.

**Stop loss** - Forced exit price in case of loss. Kwarg `stop_loss=`.

**Stop order** - Order that activates (as market) when price crosses a trigger. Kwarg `order_type="stop"`.

**Strategy** - Script with `DECLARATION["type"] = "strategy"`. Emits orders and, optionally, draws plots.

**Take profit** - Exit price at profit. Kwarg `take_profit=`.

**Target (condition)** - In an entry/exit condition, the other series (or constant) against which the source is compared. Required, or `value`.

**TIF (Time In Force)** - Time during which the order stays alive: `"day"`, `"gtc"`, `"ioc"`, `"fok"`, `"gtd"`.

**Trailing stop** - Stop that follows the price: rises with it in long, drops in short. Implemented manually via `update_exits` plus `sdk.state`.

**Warmup** - Initial period in which indicators do not yet have enough data. Return `None` in the series or exit early in the script. Size depends on the indicator (SMA-14 requires 14 or more candles).

**Win rate** - Percentage of profitable trades. In isolation it is misleading; combine with profit factor.

---

Did not find the term? Search in the [SUMMARY](../SUMMARY.md) by related section.
