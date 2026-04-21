import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import { h } from 'vue'
import PagefindSearch from './components/PagefindSearch.vue'
import Giscus from './components/Giscus.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      'nav-bar-content-before': () => h(PagefindSearch),
      'doc-after': () => h(Giscus)
    })
  }
} satisfies Theme
