<script setup lang="ts">
import { useData, useRoute } from 'vitepress'
import { onMounted, watch, nextTick } from 'vue'

const { isDark } = useData()
const route = useRoute()

const loadGiscus = () => {
  // Limpa comentários antigos se existirem (importante para navegação SPA)
  const existingContainer = document.querySelector('.giscus')
  if (existingContainer) existingContainer.innerHTML = ''

  const script = document.createElement('script')
  script.src = 'https://giscus.app/client.js'
  script.async = true
  script.crossOrigin = 'anonymous'
  
  // Atributos de configuração
  script.setAttribute('data-repo', 'tesstrade/tesstrade-docs')
  script.setAttribute('data-repo-id', 'R_kgDOSIVsvQ')
  script.setAttribute('data-category', 'General')
  // O Sr. S. vai me passar o data-category-id real abaixo
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

// Recarrega o Giscus quando o tema muda
watch(isDark, () => {
  const iframe = document.querySelector<HTMLIFrameElement>('iframe.giscus-frame')
  if (!iframe) return
  iframe.contentWindow?.postMessage(
    { giscus: { setConfig: { theme: isDark.value ? 'dark' : 'light' } } },
    'https://giscus.app'
  )
})

// Recarrega o Giscus quando o usuário muda de página
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
