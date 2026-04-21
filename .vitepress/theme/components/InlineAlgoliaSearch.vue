<script setup lang="ts">
import { liteClient } from 'algoliasearch/lite'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useData, useRoute } from 'vitepress'

type InlineSearchConfig = {
  appId?: string
  indexName?: string
  apiKey?: string
  placeholder?: string
}

type DocSearchHit = {
  objectID: string
  url?: string
  content?: string
  type?: string
  hierarchy?: Record<string, string | null>
  _highlightResult?: {
    hierarchy?: Record<string, { value?: string }>
  }
  _snippetResult?: {
    content?: { value?: string }
  }
}

const { theme } = useData()
const route = useRoute()

const root = ref<HTMLElement>()
const input = ref<HTMLInputElement>()
const expanded = ref(false)
const query = ref('')
const hits = ref<DocSearchHit[]>([])
const loading = ref(false)
const error = ref('')
const selectedIndex = ref(-1)

const config = computed<InlineSearchConfig | undefined>(
  () => (theme.value as { inlineSearch?: InlineSearchConfig }).inlineSearch
)

const placeholder = computed(() => config.value?.placeholder ?? 'Search docs')
const canSearch = computed(
  () => !!config.value?.appId && !!config.value?.apiKey && !!config.value?.indexName
)

const client = computed(() => {
  if (!canSearch.value || !config.value?.appId || !config.value?.apiKey) {
    return null
  }

  return liteClient(config.value.appId, config.value.apiKey)
})

const trimmedQuery = computed(() => query.value.trim())
const hasPanel = computed(
  () => expanded.value && (trimmedQuery.value.length >= 2 || loading.value || !!error.value)
)

let searchTimer: ReturnType<typeof setTimeout> | undefined
let searchRun = 0
const cache = new Map<string, DocSearchHit[]>()

watch(
  () => route.path,
  () => closeSearch(false)
)

watch(trimmedQuery, (value) => {
  if (searchTimer) {
    clearTimeout(searchTimer)
  }

  selectedIndex.value = -1
  error.value = ''

  if (value.length < 2) {
    hits.value = []
    loading.value = false
    return
  }

  if (cache.has(value)) {
    hits.value = cache.get(value) ?? []
    loading.value = false
    return
  }

  loading.value = true
  searchTimer = setTimeout(() => runSearch(value), 140)
})

onMounted(() => {
  window.addEventListener('pointerdown', handlePointerDown)
  window.addEventListener('keydown', handleGlobalKeydown)
})

onUnmounted(() => {
  window.removeEventListener('pointerdown', handlePointerDown)
  window.removeEventListener('keydown', handleGlobalKeydown)

  if (searchTimer) {
    clearTimeout(searchTimer)
  }
})

async function openSearch() {
  if (!canSearch.value) {
    return
  }

  expanded.value = true
  await nextTick()
  input.value?.focus()
}

function closeSearch(clearQuery: boolean) {
  expanded.value = false
  selectedIndex.value = -1
  error.value = ''

  if (clearQuery) {
    query.value = ''
    hits.value = []
  }
}

function handlePointerDown(event: PointerEvent) {
  if (!expanded.value || !root.value) {
    return
  }

  if (!root.value.contains(event.target as Node)) {
    closeSearch(false)
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
  }
}

async function runSearch(value: string) {
  const currentRun = ++searchRun

  if (!client.value || !config.value?.indexName) {
    loading.value = false
    return
  }

  try {
    const response = await client.value.search({
      requests: [
        {
          indexName: config.value.indexName,
          query: value,
          hitsPerPage: 7,
          attributesToRetrieve: ['hierarchy', 'content', 'url', 'type'],
          attributesToSnippet: ['content:18'],
          highlightPreTag: '<mark>',
          highlightPostTag: '</mark>'
        }
      ]
    })

    if (currentRun !== searchRun) {
      return
    }

    const results = response.results?.[0] as { hits?: DocSearchHit[] } | undefined
    const nextHits = results?.hits ?? []

    cache.set(value, nextHits)
    hits.value = nextHits
  } catch {
    if (currentRun === searchRun) {
      error.value = 'Search is unavailable'
      hits.value = []
    }
  } finally {
    if (currentRun === searchRun) {
      loading.value = false
    }
  }
}

function onInputKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    closeSearch(false)
    return
  }

  if (event.key === 'ArrowDown') {
    event.preventDefault()
    selectedIndex.value = Math.min(selectedIndex.value + 1, hits.value.length - 1)
    return
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault()
    selectedIndex.value = Math.max(selectedIndex.value - 1, -1)
    return
  }

  if (event.key === 'Enter') {
    const hit = selectedIndex.value >= 0 ? hits.value[selectedIndex.value] : hits.value[0]

    if (hit) {
      event.preventDefault()
      window.location.href = hitUrl(hit)
    }
  }
}

function clearQuery() {
  query.value = ''
  hits.value = []
  selectedIndex.value = -1
  nextTick(() => input.value?.focus())
}

const hierarchyLevels = ['lvl6', 'lvl5', 'lvl4', 'lvl3', 'lvl2', 'lvl1', 'lvl0']

function hitTitle(hit: DocSearchHit) {
  for (const level of hierarchyLevels) {
    const highlighted = hit._highlightResult?.hierarchy?.[level]?.value

    if (highlighted) {
      return highlighted
    }
  }

  for (const level of hierarchyLevels) {
    const heading = hit.hierarchy?.[level]

    if (heading) {
      return heading
    }
  }

  return 'Untitled'
}

function hitSection(hit: DocSearchHit) {
  return hit.hierarchy?.lvl1 || hit.hierarchy?.lvl0 || hit.type || 'Documentation'
}

function hitSnippet(hit: DocSearchHit) {
  return hit._snippetResult?.content?.value || hit.content || ''
}

function hitUrl(hit: DocSearchHit) {
  const rawUrl = hit.url || '/'

  try {
    const url = new URL(rawUrl, window.location.origin)

    if (url.origin === window.location.origin || url.hostname === 'learn.tesstrade.com') {
      return `${url.pathname}${url.search}${url.hash}`
    }

    return url.href
  } catch {
    return rawUrl
  }
}
</script>

<template>
  <div
    v-if="canSearch"
    ref="root"
    class="tt-inline-search"
    :class="{ 'tt-inline-search--open': expanded }"
  >
    <div class="tt-inline-search__shell">
      <button
        type="button"
        class="tt-inline-search__icon-button"
        aria-label="Search"
        @click="openSearch"
      >
        <span aria-hidden="true" class="vpi-search tt-inline-search__icon" />
      </button>

      <input
        ref="input"
        v-model="query"
        class="tt-inline-search__input"
        type="search"
        :placeholder="placeholder"
        autocomplete="off"
        spellcheck="false"
        @focus="expanded = true"
        @keydown="onInputKeydown"
      >

      <button
        v-if="query"
        type="button"
        class="tt-inline-search__clear"
        aria-label="Clear search"
        @click="clearQuery"
      >
        <span aria-hidden="true" class="vpi-delete tt-inline-search__clear-icon" />
      </button>
    </div>

    <div v-if="hasPanel" class="tt-inline-search__panel">
      <div v-if="loading" class="tt-inline-search__state">Searching...</div>
      <div v-else-if="error" class="tt-inline-search__state">{{ error }}</div>
      <div v-else-if="hits.length === 0" class="tt-inline-search__state">No results</div>

      <a
        v-for="(hit, index) in hits"
        v-else
        :key="hit.objectID"
        class="tt-inline-search__result"
        :class="{ 'tt-inline-search__result--active': selectedIndex === index }"
        :href="hitUrl(hit)"
        @mouseenter="selectedIndex = index"
        @mousedown="closeSearch(false)"
      >
        <span class="tt-inline-search__section">{{ hitSection(hit) }}</span>
        <span class="tt-inline-search__title" v-html="hitTitle(hit)" />
        <span v-if="hitSnippet(hit)" class="tt-inline-search__snippet" v-html="hitSnippet(hit)" />
      </a>
    </div>
  </div>
</template>

<style scoped>
.tt-inline-search {
  position: relative;
  z-index: 30;
  flex: 0 0 auto;
  margin-right: 12px;
}

.tt-inline-search__shell {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) 32px;
  align-items: center;
  width: 40px;
  height: 40px;
  overflow: hidden;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  transition:
    width 0.18s ease,
    border-color 0.18s ease,
    background-color 0.18s ease,
    box-shadow 0.18s ease;
}

.tt-inline-search--open .tt-inline-search__shell {
  width: min(520px, 46vw);
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-bg);
  box-shadow: 0 12px 30px rgb(0 0 0 / 12%);
}

.tt-inline-search__icon-button,
.tt-inline-search__clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: 0;
  color: var(--vp-c-text-2);
  background: transparent;
  cursor: pointer;
}

.tt-inline-search__icon-button:hover,
.tt-inline-search__clear:hover {
  color: var(--vp-c-text-1);
}

.tt-inline-search__icon,
.tt-inline-search__clear-icon {
  width: 18px;
  height: 18px;
}

.tt-inline-search__input {
  min-width: 0;
  width: 100%;
  height: 38px;
  border: 0;
  outline: 0;
  color: var(--vp-c-text-1);
  background: transparent;
  font-size: 14px;
  line-height: 38px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.12s ease;
}

.tt-inline-search--open .tt-inline-search__input {
  opacity: 1;
  pointer-events: auto;
}

.tt-inline-search__input::placeholder {
  color: var(--vp-c-text-3);
}

.tt-inline-search__panel {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  width: min(640px, calc(100vw - 32px));
  max-height: min(520px, calc(100vh - 96px));
  overflow: auto;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg);
  box-shadow: 0 18px 48px rgb(0 0 0 / 18%);
}

.tt-inline-search__state {
  padding: 18px 20px;
  color: var(--vp-c-text-2);
  font-size: 13px;
}

.tt-inline-search__result {
  display: grid;
  gap: 4px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--vp-c-divider);
  color: var(--vp-c-text-1);
  text-decoration: none;
  outline: 0;
}

.tt-inline-search__result:last-child {
  border-bottom: 0;
}

.tt-inline-search__result:hover,
.tt-inline-search__result--active {
  background: var(--vp-c-bg-soft);
}

.tt-inline-search__section {
  overflow: hidden;
  color: var(--vp-c-brand-1);
  font-size: 11px;
  font-weight: 650;
  line-height: 16px;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}

.tt-inline-search__title {
  overflow: hidden;
  color: var(--vp-c-text-1);
  font-size: 14px;
  font-weight: 650;
  line-height: 20px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tt-inline-search__snippet {
  display: -webkit-box;
  overflow: hidden;
  color: var(--vp-c-text-2);
  font-size: 13px;
  line-height: 18px;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.tt-inline-search__title :deep(mark),
.tt-inline-search__snippet :deep(mark),
.tt-inline-search__title :deep(.algolia-docsearch-suggestion--highlight),
.tt-inline-search__snippet :deep(.algolia-docsearch-suggestion--highlight) {
  border-radius: 3px;
  padding: 0 2px;
  color: var(--vp-c-brand-1);
  background: color-mix(in srgb, var(--vp-c-brand-1) 14%, transparent);
}

@media (max-width: 767px) {
  .tt-inline-search {
    position: fixed;
    top: 8px;
    right: 56px;
    z-index: 100;
    margin-right: 0;
  }

  .tt-inline-search--open {
    left: 12px;
    right: 56px;
  }

  .tt-inline-search--open .tt-inline-search__shell {
    width: 100%;
  }

  .tt-inline-search__panel {
    position: fixed;
    top: calc(var(--vp-nav-height) + 8px);
    right: 12px;
    left: 12px;
    width: auto;
    max-height: calc(100vh - var(--vp-nav-height) - 24px);
  }
}

@media (min-width: 768px) and (max-width: 1180px) {
  .tt-inline-search--open .tt-inline-search__shell {
    width: min(420px, 42vw);
  }
}
</style>
