<script setup>
import { ref } from 'vue'
const props = defineProps(['labels'])
const activeTab = ref(0)
</script>

<template>
  <div class="custom-tabs">
    <div class="tabs-nav">
      <button 
        v-for="(label, index) in labels" 
        :key="index"
        @click="activeTab = index"
        :class="{ active: activeTab === index }"
      >
        {{ label }}
      </button>
    </div>
    <div class="tabs-content">
      <div v-for="(label, index) in labels" :key="index" v-show="activeTab === index">
        <slot :name="'tab-' + index"></slot>
      </div>
    </div>
  </div>
</template>

<style scoped>
.custom-tabs {
  margin: 1.5rem 0;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  overflow: hidden;
  background: var(--vp-c-bg-soft);
}
.tabs-nav {
  display: flex;
  background: var(--vp-c-bg-mute);
  border-bottom: 1px solid var(--vp-c-divider);
  padding: 0 4px;
}
.tabs-nav button {
  padding: 10px 16px;
  font-size: 14px;
  font-weight: 500;
  color: var(--vp-c-text-2);
  border: none;
  background: transparent;
  cursor: pointer;
  transition: all 0.2s;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
}
.tabs-nav button:hover {
  color: var(--vp-c-text-1);
}
.tabs-nav button.active {
  color: var(--vp-c-brand-1);
  border-bottom: 2px solid var(--vp-c-brand-1);
}
.tabs-content {
  padding: 16px;
  background: var(--vp-c-bg);
}
</style>
