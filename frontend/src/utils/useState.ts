// 替代 Nuxt useState:在 SPA 中需要跨页面共享的 ref(reactive)
// 用 module-level Map 实现,避免每次重新创建
// 当前只在旧 composables(useFilesInfo 等)中被引用,业务代码已切到 Pinia。

import { ref } from 'vue'

const cache: Map<string, unknown> = ((globalThis as any).__SHAREYOUSEE_USE_STATE__ ||= new Map())

export function useState<T>(key: string, init: () => T) {
  if (!cache.has(key)) {
    cache.set(key, init())
  }
  return ref(cache.get(key) as T)
}
