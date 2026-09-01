// 替代 Nuxt useSeoMeta:在 SPA 中没有 SSR 注入 head 的能力,
// SEO meta 统一在 index.html 中静态声明;运行时调用此函数为 no-op。
// 未来若引入 SSR 或 @unhead/vue,可在此切换实现。

export function useSeoMeta(_meta: Record<string, any>) {
  // no-op
  void _meta
}
