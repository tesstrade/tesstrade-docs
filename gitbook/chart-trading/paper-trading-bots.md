# Paper Trading Bots

A **paper bot** is a Python script executing **continuously on the backend**, even without an open tab or connected browser. It consumes live data, runs the strategy and records orders in a simulated account in the database.

Difference from the live editor: the editor depends on an open tab; the bot does not.

## Life cycle

```
  1. Click "Create Bot"
        |
        v
  2. Backend loads the script in the sandbox
        |
        v
  3. Engine initializes sdk.candles with historical warmup
        |
        v
  4. Bot starts consuming the live stream from the connected exchange
        |
        v
  5. On each closed candle: calls main(sdk=sdk, params=params)
        |
        v
  6. Emitted signals are persisted and executed
        |
        v
  7. Runs indefinitely until "Stop" is clicked
        |
        v
  8. [Stop] graceful shutdown, disconnects and releases resources
```

## Creating a bot

In the Chart Trading UI, after writing and testing a script in the editor:
1. Click **Create Paper Bot**.
2. Fill in:
   - **Name** (human-readable, to distinguish multiple bots).
   - **Symbol** (e.g., `BTCUSDT`).
   - **Timeframe** (e.g., `1h`, `15m`, `1m`).
   - **Warmup bars** (number of historical candles loaded at start; configurable).
   - **Execution timeout** (configurable).
3. The bot appears in the list of active bots.

From this point, the bot runs in the background.

## Active sessions

It is possible to maintain **several bots simultaneously**, each with:
- Its own script.
- Its own symbol/timeframe.
- Its own `sdk.state`.
- Its own orders and positions.

There is no interference between bots (they run in independent threads).

**Limit:** there is a per-user bot ceiling. When exceeded, attempts to create a new bot are rejected.

## Rate limiting

Safety limits apply to prevent abuse of the backend. When exceeded, the request is rejected with HTTP 429 (Too Many Requests); in the UI, the toast "Rate limit exceeded, try again in a few seconds" is shown.

## Observing the bot

Each active bot exposes:

### Status
- **Running / Stopped / Error**
- **Started at** (timestamp)
- **Dropped ticks** (how many ticks were discarded due to a full buffer; ideally 0)
- **Last error** (if any)

### Runtime metrics
- Realized and unrealized P&L
- Current equity
- Number of trades
- Current position

### Issued actions (history)
List of orders dispatched by the bot, with timestamps and prices.

### Logs
Script `print()` appears here, as in the editor. Use sparingly: in bots running for days, verbose logs consume space.

## Stopping a bot

Click **Stop** on the active bot. What happens:

1. Backend sends a stop signal.
2. The script **stops being called** from the next candle onward.
3. Open positions **remain open**: the bot simply ceases to operate, does not close automatically.
4. The sandbox is terminated; `sdk.state` is discarded.

### Closing positions on stop

Before clicking Stop, close manually via the UI or add in the script:
```python
# Graceful shutdown: detects external signal and closes
if sdk.state.get("_should_stop"):
    if sdk.position != 0:
        sdk.close(action="close_position", qty=abs(sdk.position), order_type="market")
```
The `_should_stop` flag must be set externally. The current SDK does not offer this hook; close manually before stopping.

## Durability - surviving a crash

The backend persists in the database:
- Open orders
- Positions
- Simulated account balance
- Fill history

After a backend restart (deploy, crash):
1. The bots **must be started again**; there is no automatic restart.
2. The simulated account state (balance, positions) is **hydrated** from the database.
3. The bot's `sdk.state` is lost; execution starts from scratch.

**Recommendation:** for critical strategies, periodically verify that the bot is still running (via UI or API).

## Differences versus the live editor

| Aspect | Editor | Paper Bot |
|---|---|---|
| Requires open tab? | Yes | No |
| Persists across sessions? | No | Yes (until stopped) |
| Multiple scripts at the same time? | No | Yes (one per bot) |
| Real-time visible logs? | Yes | Yes (poll, not push) |
| Live parameter editing? | Yes | Via separate UI (reloads) |
| Cost to the backend | Low (stops when tab closes) | Continuous |

## Operational considerations

### 1. Test in the editor before turning it into a bot
The bot runs unsupervised. Logic bugs may generate incorrect orders, detectable only by drawdown. Always run in the editor or backtest first.

### 2. Monitor `dropped_ticks`
Growth of this counter indicates the bot is behind the market, possibly due to a slow script. Investigate with `print()` of execution time:

```python
import datetime
def on_bar_strategy(sdk, params):
    t0 = datetime.datetime.now()
    # ... logic
    elapsed = (datetime.datetime.now() - t0).total_seconds() * 1000
    if elapsed > 100:
        print(f"SLOW: took {elapsed:.1f}ms")
```

### 3. Do not modify the script while the bot is running
Editing the code in the editor **does not update the bot**. The bot has an isolated copy. To apply changes:
1. Stop the current bot.
2. Save and test the new version in the editor.
3. Create a new bot.

### 4. Finite initial balance
The paper account starts with a configured initial balance (e.g., 500,000). If the bot loses everything, there is no automatic top-up; a new account must be created or more must be deposited, when the UI allows it.

## Multiple strategies on the same symbol

Position on the backend is **shared per account**, not per bot. Scenario:
- Bot A is long BTCUSDT.
- Bot B attempts to open long BTCUSDT.

Bot B is rejected (Max Positions = 1 per account). To isolate, use **different paper accounts**: one bot per account.

## Next steps

* [Live editor](live-editor.md) - where to test before turning into a bot.
* [Live vs backtest differences](live-vs-backtest.md) - execution differences in each context.
