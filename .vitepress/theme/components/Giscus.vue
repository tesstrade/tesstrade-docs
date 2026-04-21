<script setup lang="ts">
import { useData } from 'vitepress'

const { isDark } = useData()
</script>

<template>
  <div class="comments">
    <component
      :is="'script'"
      src="https://giscus.app/client.js"
      data-repo="tesstrade/tesstrade-docs"
      data-repo-id="R_kgDON7uKMA"
      data-category="General"
      data-category-id="DIC_kwDON7uKMM4Cm9A2"
      data-mapping="pathname"
      data-strict="0"
      data-reactions-enabled="1"
      data-emit-metadata="0"
      data-input-position="top"
      :data-theme="isDark ? 'dark' : 'light'"
      data-lang="en"
      crossorigin="anonymous"
      async
    />
  </div>
</template>

<style scoped>
.comments {
  margin-top: 40px;
  border-top: 1px solid var(--vp-c-divider);
  padding-top: 24px;
}
</style>
