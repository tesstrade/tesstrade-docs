<script setup lang="ts">
import { useData, useRoute } from 'vitepress'
import { onMounted, watch, nextTick } from 'vue'

const { isDark } = useData()
const route = useRoute()

const loadGiscus = () => {
  // Clear stale comments if present (important for SPA navigation)
  const existingContainer = document.querySelector('.giscus')
  if (existingContainer) existingContainer.innerHTML = ''

  const script = document.createElement('script')
  script.src = 'https://giscus.app/client.js'
  script.async = true
  script.crossOrigin = 'anonymous'
  
  // Configuration attributes
  script.setAttribute('data-repo', 'tesstrade/tesstrade-docs')
  script.setAttribute('data-repo-id', 'R_kgDOSIVsvQ')
  script.setAttribute('data-category', 'General')
  // TODO: replace with the real data-category-id
  script.setAttribute('data-category-id', 'DIC_kwDOSIVsvc4Cm7uH') 
  script.setAttribute('data-mapping', 'pathname')
  script.setAttribute('data-strict', '0')
  script.setAttribute('data-reactions-enabled', '1')
  script.setAttribute('data-emit-metadata', '0')
  script.setAttribute('data-input-position', 'top')
  script.setAttribute('data-theme', isDark.value ? 'dark' : 'light')
  script.setAttribute('data-lang', 'en')

  const container = document.querySelector('#giscus-container')
  if (container) container.appendChild(script)
}

// Reload Giscus when the theme changes
watch(isDark, () => {
  const iframe = document.querySelector<HTMLIFrameElement>('iframe.giscus-frame')
  if (!iframe) return
  iframe.contentWindow?.postMessage(
    { giscus: { setConfig: { theme: isDark.value ? 'dark' : 'light' } } },
    'https://giscus.app'
  )
})

// Reload Giscus when the user navigates to another page
watch(() => route.path, () => {
  nextTick(() => loadGiscus())
})

onMounted(() => {
  loadGiscus()
})
</script>

<template>
  <div class="comments-wrapper">
    <div id="giscus-container" class="giscus"></div>
  </div>
</template>

<style scoped>
.comments-wrapper {
  margin-top: 48px;
  border-top: 1px solid var(--vp-c-divider);
  padding-top: 32px;
}
</style>
