<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vitepress'

type PagefindUIInstance = {
  destroy?: () => void
}

type PagefindUIConstructor = new (options: Record<string, unknown>) => PagefindUIInstance

declare global {
  interface Window {
    PagefindUI?: PagefindUIConstructor
  }
}

const route = useRoute()

const root = ref<HTMLElement>()
const expanded = ref(false)
const mountedPanel = ref(false)
const ready = ref(false)
const loading = ref(false)
const unavailable = ref(false)

let pagefindUi: PagefindUIInstance | undefined
let assetsPromise: Promise<void> | undefined

watch(
  () => route.path,
  () => closeSearch()
)

onMounted(() => {
  window.addEventListener('pointerdown', handlePointerDown)
  window.addEventListener('keydown', handleGlobalKeydown)
})

onUnmounted(() => {
  window.removeEventListener('pointerdown', handlePointerDown)
  window.removeEventListener('keydown', handleGlobalKeydown)
  pagefindUi?.destroy?.()
})

async function openSearch() {
  expanded.value = true
  mountedPanel.value = true
  unavailable.value = false

  await nextTick()
  await loadPagefind()
  focusInput()
}

function closeSearch() {
  expanded.value = false
}

function toggleSearch() {
  if (expanded.value) {
    closeSearch()
    return
  }

  openSearch()
}

function handlePointerDown(event: PointerEvent) {
  if (!expanded.value || !root.value) {
    return
  }

  if (!root.value.contains(event.target as Node)) {
    closeSearch()
  }
}

function handleGlobalKeydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null
  const isTyping =
    target?.isContentEditable ||
    target?.tagName === 'INPUT' ||
    target?.tagName === 'SELECT' ||
    target?.tagName === 'TEXTAREA'

  if ((event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) || (!isTyping && event.key === '/')) {
    event.preventDefault()
    openSearch()
    return
  }

  if (event.key === 'Escape' && expanded.value) {
    event.preventDefault()
    closeSearch()
  }
}

async function loadPagefind() {
  if (ready.value || loading.value) {
    return assetsPromise
  }

  loading.value = true

  assetsPromise = Promise.all([
    loadStylesheet('/pagefind/pagefind-ui.css'),
    loadScript('/pagefind/pagefind-ui.js')
  ]).then(() => {
    if (!window.PagefindUI) {
      throw new Error('Pagefind UI was not loaded')
    }

    pagefindUi?.destroy?.()
    pagefindUi = new window.PagefindUI({
      element: '#tt-pagefind-search',
      bundlePath: '/pagefind/',
      showImages: false,
      showSubResults: true,
      pageSize: 6,
      excerptLength: 18,
      debounceTimeoutMs: 120,
      resetStyles: false,
      translations: {
        placeholder: 'Search docs',
        search_label: 'Search docs',
        clear_search: 'Clear search',
        load_more: 'Load more',
        zero_results: 'No results for [SEARCH_TERM]'
      }
    })

    ready.value = true
    unavailable.value = false
  }).catch(() => {
    unavailable.value = true
  }).finally(() => {
    loading.value = false
  })

  return assetsPromise
}

function loadStylesheet(href: string) {
  const existing = document.querySelector<HTMLLinkElement>(`link[href="${href}"]`)

  if (existing) {
    return Promise.resolve()
  }

  return new Promise<void>((resolve, reject) => {
    const link = document.createElement('link')

    link.rel = 'stylesheet'
    link.href = href
    link.onload = () => resolve()
    link.onerror = () => reject(new Error(`Unable to load ${href}`))

    document.head.appendChild(link)
  })
}

function loadScript(src: string) {
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`)

  if (existing) {
    return window.PagefindUI ? Promise.resolve() : waitForScript(existing)
  }

  return new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')

    script.src = src
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error(`Unable to load ${src}`))

    document.head.appendChild(script)
  })
}

function waitForScript(script: HTMLScriptElement) {
  return new Promise<void>((resolve, reject) => {
    script.addEventListener('load', () => resolve(), { once: true })
    script.addEventListener('error', () => reject(new Error(`Unable to load ${script.src}`)), { once: true })
  })
}

function focusInput() {
  nextTick(() => {
    root.value?.querySelector<HTMLInputElement>('.pagefind-ui__search-input')?.focus()
  })
}
</script>

<template>
  <div
    ref="root"
    class="tt-pagefind-search"
    :class="{ 'tt-pagefind-search--open': expanded }"
  >
    <button
      type="button"
      class="tt-pagefind-search__trigger"
      aria-label="Search docs"
      :aria-expanded="expanded"
      aria-controls="tt-pagefind-search-panel"
      @click="toggleSearch"
    >
      <span aria-hidden="true" class="vpi-search tt-pagefind-search__icon" />
    </button>

    <div
      v-if="mountedPanel"
      v-show="expanded"
      id="tt-pagefind-search-panel"
      class="tt-pagefind-search__panel"
    >
      <div v-if="loading" class="tt-pagefind-search__state">Loading search...</div>
      <div v-else-if="unavailable" class="tt-pagefind-search__state">
        Search is available after the production build.
      </div>

      <div
        id="tt-pagefind-search"
        class="tt-pagefind-search__mount"
        :class="{ 'tt-pagefind-search__mount--ready': ready }"
      />
    </div>
  </div>
</template>

<style scoped>
.tt-pagefind-search {
  --pagefind-ui-scale: 0.82;
  --pagefind-ui-primary: var(--vp-c-brand-1);
  --pagefind-ui-text: var(--vp-c-text-1);
  --pagefind-ui-background: var(--vp-c-bg);
  --pagefind-ui-border: var(--vp-c-divider);
  --pagefind-ui-tag: var(--vp-c-bg-soft);
  --pagefind-ui-border-width: 1px;
  --pagefind-ui-border-radius: 8px;
  --pagefind-ui-image-border-radius: 6px;
  --pagefind-ui-font: var(--vp-font-family-base);

  position: relative;
  z-index: 30;
  flex: 0 0 auto;
  margin-right: 12px;
}

.tt-pagefind-search__trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: 1px solid transparent;
  border-radius: 8px;
  color: var(--vp-c-text-2);
  background: transparent;
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    background-color 0.18s ease,
    color 0.18s ease,
    box-shadow 0.18s ease;
}

.tt-pagefind-search__trigger:hover,
.tt-pagefind-search__trigger:focus-visible,
.tt-pagefind-search--open .tt-pagefind-search__trigger {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg);
  box-shadow: 0 12px 30px rgb(0 0 0 / 12%);
  outline: 0;
}

.tt-pagefind-search__icon {
  width: 18px;
  height: 18px;
}

.tt-pagefind-search__panel {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  width: min(680px, calc(100vw - 32px));
  max-height: min(560px, calc(100vh - 96px));
  overflow: auto;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg);
  box-shadow: 0 18px 48px rgb(0 0 0 / 18%);
}

.tt-pagefind-search__state {
  padding: 18px 20px;
  color: var(--vp-c-text-2);
  font-size: 13px;
}

.tt-pagefind-search__mount {
  padding: 12px;
}

.tt-pagefind-search__mount:not(.tt-pagefind-search__mount--ready) {
  display: none;
}

.tt-pagefind-search :deep(.pagefind-ui) {
  width: 100%;
  color: var(--vp-c-text-1);
  font-family: var(--vp-font-family-base);
}

.tt-pagefind-search :deep(.pagefind-ui__form) {
  position: relative;
  margin: 0;
}

.tt-pagefind-search :deep(.pagefind-ui__search-input) {
  width: 100%;
  height: 44px;
  padding: 0 42px 0 42px;
  border: 1px solid var(--vp-c-brand-1);
  border-radius: 8px;
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg);
  font-size: 14px;
  line-height: 44px;
  outline: 0;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--vp-c-brand-1) 13%, transparent);
}

.tt-pagefind-search :deep(.pagefind-ui__search-input::placeholder) {
  color: var(--vp-c-text-3);
}

.tt-pagefind-search :deep(.pagefind-ui__search-clear) {
  color: var(--vp-c-text-3);
}

.tt-pagefind-search :deep(.pagefind-ui__drawer) {
  margin-top: 10px;
}

.tt-pagefind-search :deep(.pagefind-ui__message) {
  padding: 12px 4px;
  color: var(--vp-c-text-2);
  font-size: 13px;
}

.tt-pagefind-search :deep(.pagefind-ui__results) {
  padding: 0;
}

.tt-pagefind-search :deep(.pagefind-ui__result) {
  padding: 12px 2px;
  border-top: 1px solid var(--vp-c-divider);
}

.tt-pagefind-search :deep(.pagefind-ui__result:first-child) {
  border-top: 0;
}

.tt-pagefind-search :deep(.pagefind-ui__result-link) {
  color: var(--vp-c-text-1);
  font-size: 14px;
  font-weight: 650;
  line-height: 20px;
  text-decoration: none;
}

.tt-pagefind-search :deep(.pagefind-ui__result-link:hover) {
  color: var(--vp-c-brand-1);
}

.tt-pagefind-search :deep(.pagefind-ui__result-excerpt),
.tt-pagefind-search :deep(.pagefind-ui__result-nested) {
  color: var(--vp-c-text-2);
  font-size: 13px;
  line-height: 18px;
}

.tt-pagefind-search :deep(.pagefind-ui__result-title mark),
.tt-pagefind-search :deep(.pagefind-ui__result-excerpt mark) {
  border-radius: 3px;
  padding: 0 2px;
  color: var(--vp-c-brand-1);
  background: color-mix(in srgb, var(--vp-c-brand-1) 14%, transparent);
}

.tt-pagefind-search :deep(.pagefind-ui__button) {
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg-soft);
  font-size: 13px;
}

.tt-pagefind-search :deep(.pagefind-ui__button:hover) {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

@media (max-width: 767px) {
  .tt-pagefind-search {
    position: fixed;
    top: 8px;
    right: 56px;
    z-index: 100;
    margin-right: 0;
  }

  .tt-pagefind-search__panel {
    position: fixed;
    top: calc(var(--vp-nav-height) + 8px);
    right: 12px;
    left: 12px;
    width: auto;
    max-height: calc(100vh - var(--vp-nav-height) - 24px);
  }
}
</style>
