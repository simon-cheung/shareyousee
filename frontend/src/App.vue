<script setup lang="ts">
import { onMounted } from 'vue'
import { useAppStore, useHomeStore } from '@/stores'
import FullScreenLoader from '@/components/FullScreenLoader.vue'
import AppFooter from '@/components/AppFooter.vue'
import NavBar from '@/components/NavBar.vue'
import DocPanel from '@/components/DocPanel.vue'
import InstallPWA from '@/components/InstallPWA.vue'
import WalletSetupDialog from '@/components/WalletSetupDialog.vue'
import Toast from 'primevue/toast'
import ScrollTop from 'primevue/scrolltop'

const appStore = useAppStore()
const homeStore = useHomeStore()

// user/contacts/task 的初始化在 main.ts 入口已经触发(同步启动 IDB 异步读),
// 这里不再重复,避免双重调用。

onMounted(() => {
  window.addEventListener('beforeinstallprompt', (event) => {
    appStore.setDeferredPrompt(event as BeforeInstallPromptEvent)
  })
  appStore.setFullScreenLoading(false)

  fetch('/banner.txt')
    .then((res) => res.text())
    .then(console.log)
})
</script>

<template>
  <FullScreenLoader />
  <Toast position="top-right" />
  <NavBar />
  <RouterView />
  <AppFooter />
  <ScrollTop />
  <InstallPWA />
  <DocPanel />
  <!-- ShareYouSee 全局钱包首次启动向导 -->
  <ClientOnly>
    <WalletSetupDialog
      :visible="homeStore.isWalletSetupOpen"
      :mode="homeStore.walletSetupMode"
      @update:visible="homeStore.closeWalletSetup"
    />
  </ClientOnly>
</template>
