// 替代 @nuxtjs/color-mode 的最简实现
// 行为:preference = 'system' | 'light' | 'dark',fallback = 'light'
// 在 <html> 上加/去 'dark' class(与原 Nuxt 配置一致:darkMode: 'class')

import { ref, computed } from 'vue'

type Pref = 'system' | 'light' | 'dark'

function getSystemPref(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyClass(pref: Pref) {
  if (typeof document === 'undefined') return
  const resolved = pref === 'system' ? getSystemPref() : pref
  document.documentElement.classList.toggle('dark', resolved === 'dark')
}

export function useColorMode() {
  const preference = ref<Pref>(
    (typeof localStorage !== 'undefined' && (localStorage.getItem('nuxt-color-mode') as Pref)) ||
      'system'
  )

  function setPreference(v: Pref) {
    preference.value = v
    try {
      localStorage.setItem('nuxt-color-mode', v)
    } catch {}
    applyClass(v)
  }

  // 初始化:挂到 <html>.dark,与 Tailwind darkMode: 'class' 配合
  if (typeof window !== 'undefined') {
    applyClass(preference.value)
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (preference.value === 'system') applyClass('system')
    })
  }

  return {
    preference,
    value: computed(() => (preference.value === 'system' ? getSystemPref() : preference.value)),
    set: setPreference,
    setPreference
  }
}
