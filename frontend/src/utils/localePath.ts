// 替代 Nuxt useLocalePath:vue-i18n 没有 localePath。
// 当前项目 i18n 路由前缀固定为空(无 /en / /zh 前缀),
// 业务只用 localePath('/') / localePath('/recipient') 等绝对路径形式,
// 直接返回原路径即可。

export function useLocalePath() {
  return (path: string) => path
}
