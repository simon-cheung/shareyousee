<script setup lang="ts">
// ClientOnly:仅在浏览器中渲染 default slot,SSR 或水合前显示 fallback。
// 当前项目是 SPA,实际上永远渲染 default slot;
// 保留 fallback slot 是为了保持与原 Nuxt ClientOnly 的 API 兼容。
import { ref, onMounted } from 'vue'

const mounted = ref(false)
onMounted(() => {
  mounted.value = true
})
</script>

<template>
  <slot v-if="!mounted" name="fallback" />
  <slot v-else />
</template>
