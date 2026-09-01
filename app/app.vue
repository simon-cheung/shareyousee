<script setup lang="ts">
useSeoMeta({
  ogTitle: 'ShareYouSee',
  ogType: 'website',
  ogImage: 'https://share.armin.com.cn/ogImg.webp',
  twitterCard: 'summary_large_image',
  twitterTitle: 'ShareYouSee',
  twitterDescription: 'Fast peer-to-peer file and directory transfers',
  twitterImage: 'https://share.armin.com.cn/ogImg.webp',
  twitterSite: '@ShouChen_',
  twitterCreator: '@ShouChen_'
})

const appStore = useAppStore()
const homeStore = useHomeStore()

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
  <NuxtPwaManifest />
  <NuxtRouteAnnouncer />
  <FullScreenLoader />
  <Toast position="top-right" />
  <NavBar />
  <NuxtPage />
  <AppFooter />
  <ScrollTop />
  <InstallPWA />
  <DocPanel />
  <!-- ShareYouSee 全局钱包首次启动向导 -->
  <ClientOnly>
    <WalletSetupDialog
      :visible="homeStore.isWalletSetupOpen"
      @update:visible="homeStore.closeWalletSetup"
    />
  </ClientOnly>
</template>
