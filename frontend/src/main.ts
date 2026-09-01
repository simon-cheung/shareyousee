// Vue + Pinia + PrimeVue + i18n + Vue Router 入口
import { createApp, watch } from 'vue'
import { createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import PrimeVue from 'primevue/config'
import ToastService from 'primevue/toastservice'
import ConfirmationService from 'primevue/confirmationservice'
import Aura from '@primevue/themes/aura'

import Button from 'primevue/button'
import InputOtp from 'primevue/inputotp'
import InputText from 'primevue/inputtext'
import InputGroup from 'primevue/inputgroup'
import Textarea from 'primevue/textarea'
import Checkbox from 'primevue/checkbox'
import Toast from 'primevue/toast'
import Dialog from 'primevue/dialog'
import Popover from 'primevue/popover'
import Avatar from 'primevue/avatar'
import ProgressBar from 'primevue/progressbar'
import ToggleSwitch from 'primevue/toggleswitch'
import Select from 'primevue/select'
import Listbox from 'primevue/listbox'
import Divider from 'primevue/divider'
import Tree from 'primevue/tree'
import ScrollTop from 'primevue/scrolltop'
import SplitButton from 'primevue/splitbutton'

import { router } from './router'
import messages from './locales/i18n.config'
import ClientOnly from './components/ClientOnly.vue'
import Icon from './components/Icon.vue'
import { useColorMode } from './utils/colorMode'
import './styles/main.css'
import 'primeicons/primeicons.css'
import { registerSW } from 'virtual:pwa-register'
// 注意:不要在 main.ts 顶层调 useHomeStore / useSenderTransferStore / useRecipientTransferStore
// 这些 store 内部 useI18n() / useRouter() / useToast() / useLocalePath(),
// 必须由组件 setup() 内调用,否则 vue-i18n 会报 "Must be called at the top of a `setup` function"。
// 这里只调 useUserStore / useContactsStore / useTaskStore,它们的工厂不依赖组件 setup。
import { useUserStore, useContactsStore, useTaskStore } from './stores'
import App from './App.vue'

// 浏览器语言检测:首次访问走 navigator.language,
const detectedLocale = (() => {
  try {
    const saved = localStorage.getItem('sy-locale')
    if (saved === 'en' || saved === 'zh') return saved
    const nav = navigator.language || ''
    if (nav.toLowerCase().startsWith('zh')) return 'zh'
    return 'en'
  } catch {
    return 'en'
  }
})()

const i18n = createI18n({
  legacy: false,
  locale: detectedLocale,
  fallbackLocale: 'en',
  messages: messages.messages
})

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(i18n)
app.use(PrimeVue, {
  theme: {
    preset: Aura,
    options: {
      darkModeSelector: '.dark',
      cssLayer: false
    }
  },
  ripple: true
})
app.use(ToastService)
app.use(ConfirmationService)

// 全局注册 PrimeVue 组件
app.component('Button', Button)
app.component('InputOtp', InputOtp)
app.component('InputText', InputText)
app.component('InputGroup', InputGroup)
app.component('Textarea', Textarea)
app.component('Checkbox', Checkbox)
app.component('Toast', Toast)
app.component('Dialog', Dialog)
app.component('Popover', Popover)
app.component('Avatar', Avatar)
app.component('ProgressBar', ProgressBar)
app.component('ToggleSwitch', ToggleSwitch)
app.component('Select', Select)
app.component('Listbox', Listbox)
app.component('Divider', Divider)
app.component('Tree', Tree)
app.component('ScrollTop', ScrollTop)
app.component('SplitButton', SplitButton)

// 项目内自实现的 SPA 组件
app.component('ClientOnly', ClientOnly)
app.component('Icon', Icon)

// Vue Router 已自动注册 RouterLink,这里只注册 NuxtLink 别名供模板兼容旧代码
app.component('NuxtLink', RouterLink)

// 启动时初始化 color-mode(挂到 <html>.dark)
useColorMode()

// 切换语言时持久化到 localStorage
watch(
  () => (i18n.global as any).locale.value,
  (val) => {
    try {
      localStorage.setItem('sy-locale', String(val))
    } catch {}
  }
)

// PWA 注册
if (import.meta.env.PROD) {
  registerSW({ immediate: true })
}

// 在挂载前主动触发基础 store 的初始化(主要指 userStore 从 IDB 读偏好),
// 这样 NavBar/HomeView 渲染时数据已经在异步拉取,避免长时间显示默认值。
// 不能在这里触发 home/senderTransfer/recipientTransfer,它们的工厂里有 vue-i18n / vue-router hook。
console.log('[boot] main:128 about to useUserStore()')
try {
  const userStore = useUserStore()
  const contactsStore = useContactsStore()
  const taskStore = useTaskStore()
  console.log('[boot] stores created, calling initializeFromStorage')
  userStore.initializeFromStorage()
  contactsStore.initialize()
  taskStore.initialize()
  console.log('[boot] initializeFromStorage called, hasInitialized=', userStore.hasInitialized)
} catch (e) {
  console.error('[boot] store init error', e)
}

app.mount('#app')
