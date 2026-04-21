import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import { h } from 'vue'
import InlineAlgoliaSearch from './components/InlineAlgoliaSearch.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      'nav-bar-content-before': () => h(InlineAlgoliaSearch)
    })
  }
} satisfies Theme
