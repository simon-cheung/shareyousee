<script setup lang="ts">
// NavBar 上钱包信息浮层:展示 walletId / 设备标签 / 公钥指纹
// 切换 ID 入口已统一放在用户头像 Popover(NavBar),此处仅保留查看与重置
const userStore = useUserStore()
const { t } = useI18n()
const toast = useToast()

const shortWalletId = computed(() => {
  const id = userStore.walletInfo?.walletId || ''
  return id ? `${id.slice(0, 8)}…${id.slice(-4)}` : ''
})

const shortPubKey = computed(() => {
  const pk = userStore.walletInfo?.publicKey || ''
  return pk ? `${pk.slice(0, 6)}…${pk.slice(-4)}` : ''
})

async function copyId() {
  const id = userStore.walletInfo?.walletId || ''
  if (!id) return
  await copyToClipboard(id)
  toast.add({ severity: 'success', summary: t('wallet.copiedId') })
}

async function resetWallet() {
  if (!confirm(t('wallet.confirmReset'))) return
  await userStore.resetWallet()
  toast.add({ severity: 'info', summary: t('wallet.resetDone') })
  // 重置后立即激活 WalletSetupDialog,允许用户生成新 ID 或导入旧助记词
  setupVisible.value = true
}

const walletPopover = ref()
function toggleWallet(ev: Event) {
  walletPopover.value?.toggle(ev)
}

const setupVisible = ref(false)
</script>

<template>
  <Popover ref="walletPopover">
    <Button
      severity="secondary"
      text
      size="small"
      class="py-3"
      aria-label="Wallet"
      @click="toggleWallet"
    >
      <Icon name="solar:wallet-money-broken" class="text-black/90 dark:text-white/90" />
    </Button>

    <div class="relative p-3 m-2 w-[280px]">
      <div class="flex flex-col gap-2">
        <div class="flex items-center gap-2">
          <Icon :name="getDeviceIcon(userStore.walletInfo.deviceLabel)" />
          <p class="text-sm">{{ t('wallet.title') }}</p>
        </div>

        <div v-if="userStore.hasWallet" class="flex flex-col gap-2 text-xs">
          <div class="flex flex-row items-center justify-between">
            <span class="text-neutral-500">{{ t('wallet.walletId') }}</span>
            <span class="font-mono">{{ shortWalletId }}</span>
          </div>
          <div class="flex flex-row items-center justify-between">
            <span class="text-neutral-500">{{ t('wallet.deviceLabel') }}</span>
            <span>{{ userStore.walletInfo.deviceLabel }}</span>
          </div>
          <div class="flex flex-row items-center justify-between">
            <span class="text-neutral-500">{{ t('wallet.publicKey') }}</span>
            <span class="font-mono">{{ shortPubKey }}</span>
          </div>
          <div class="flex flex-row items-center justify-between">
            <span class="text-neutral-500">{{ t('wallet.hasPrivateKey') }}</span>
            <Icon
              :name="
                userStore.hasPrivateKey ? 'solar:check-circle-bold' : 'solar:close-circle-bold'
              "
              :class="userStore.hasPrivateKey ? 'text-emerald-500' : 'text-rose-500'"
            />
          </div>
          <Divider />
          <Button size="small" outlined severity="contrast" @click="copyId">
            <Icon name="solar:copy-line-duotone" class="mr-1" />{{ t('wallet.copyId') }}
          </Button>
          <Button size="small" text severity="danger" @click="resetWallet">
            <Icon name="solar:trash-bin-trash-linear" class="mr-1" />{{ t('wallet.reset') }}
          </Button>
        </div>

        <div v-else class="flex flex-col gap-2 text-xs">
          <p>{{ t('wallet.notSetup') }}</p>
          <Button size="small" severity="contrast" @click="setupVisible = true">
            {{ t('wallet.setupNow') }}
          </Button>
        </div>
      </div>
    </div>
  </Popover>

  <WalletSetupDialog v-model:visible="setupVisible" />
</template>
