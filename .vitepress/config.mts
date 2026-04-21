import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'TessTrade Docs',
  description: 'TessTrade Python SDK documentation',
  srcDir: 'gitbook',
  cleanUrls: true,
  sitemap: {
    hostname: 'https://learn.tesstrade.com',
    transformItems(items) {
      return items.filter((item) => item.url !== 'SUMMARY' && item.url !== '/SUMMARY')
    }
  },
  transformHtml(code) {
    return code.replace(/<main class="main"(?![^>]*data-pagefind-body)/, '<main class="main" data-pagefind-body')
  },
  themeConfig: {
    siteTitle: 'TessTrade Docs',
    nav: [
      { text: 'Guide', link: '/' }
    ],
    sidebar: [
      {
        text: 'Getting started',
        items: [
          { text: 'Backtest vs Chart Trading', link: '/getting-started/overview' },
          { text: 'Example script', link: '/getting-started/example-script' },
          { text: 'Sandbox limits', link: '/getting-started/sandbox-limits' }
        ]
      },
      {
        text: 'Contract',
        items: [
          { text: 'The main dispatcher', link: '/contract/dispatcher-main' },
          { text: 'The DECLARATION shape', link: '/contract/declaration' },
          { text: 'Script lifecycle', link: '/contract/lifecycle' }
        ]
      },
      {
        text: 'SDK Reference',
        items: [
          { text: 'Candles, params and state', link: '/sdk-reference/candles' },
          { text: 'Position, cash and equity', link: '/sdk-reference/positions' },
          { text: 'Canonical actions', link: '/sdk-reference/actions' },
          { text: 'Order types', link: '/sdk-reference/order-types' },
          { text: 'Stops, targets and trailing', link: '/sdk-reference/stops-and-targets' }
        ]
      },
      {
        text: 'Indicators',
        items: [
          { text: 'Plots and series', link: '/indicators/plots-and-series' },
          { text: 'Implementing SMA and EMA', link: '/indicators/implementing-sma-ema' },
          { text: 'RSI, MACD and Bollinger Bands', link: '/indicators/rsi-macd-bands' },
          { text: 'Panes: overlay vs new pane', link: '/indicators/panes' }
        ]
      },
      {
        text: 'Ready-to-use strategies',
        items: [
          { text: 'SMA Crossover', link: '/strategies/sma-crossover' },
          { text: 'RSI Mean Reversion', link: '/strategies/rsi-mean-reversion' },
          { text: 'MACD Momentum', link: '/strategies/macd-momentum' },
          { text: 'Persistent state and trailing stop', link: '/strategies/persistent-state' },
          { text: 'Solid entry/exit patterns', link: '/strategies/entry-exit-patterns' }
        ]
      },
      {
        text: 'Declarative mode',
        items: [
          { text: 'When to use entry/exit conditions', link: '/declarative-mode/when-to-use' },
          { text: 'Supported operators', link: '/declarative-mode/operators' }
        ]
      },
      {
        text: 'Backtest',
        items: [
          { text: 'Reading the results', link: '/backtest/reading-results' },
          { text: 'Performance metrics', link: '/backtest/metrics' },
          { text: 'Troubleshooting', link: '/backtest/troubleshooting' }
        ]
      },
      {
        text: 'Chart Trading',
        items: [
          { text: 'Live editor', link: '/chart-trading/live-editor' },
          { text: 'Paper Trading Bots', link: '/chart-trading/paper-trading-bots' },
          { text: 'Live vs backtest differences', link: '/chart-trading/live-vs-backtest' }
        ]
      },
      {
        text: 'Reference',
        items: [
          { text: 'Canonical actions table', link: '/reference/canonical-actions' },
          { text: 'Operators table', link: '/reference/operators' },
          { text: 'Error catalog', link: '/reference/errors' },
          { text: 'Glossary', link: '/reference/glossary' }
        ]
      }
    ]
  }
})
