import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import { h } from 'vue'
import PagefindSearch from './components/PagefindSearch.vue'
import Giscus from './components/Giscus.vue'
import Tabs from './components/Tabs.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('Tabs', Tabs)
  },
  Layout() {
    return h(DefaultTheme.Layout, null, {
      'nav-bar-content-before': () => h(PagefindSearch),
      'doc-after': () => h(Giscus)
    })
  }
} satisfies Theme
