<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'primevue/usetoast'
import { useUserStore } from '@/stores'
import { copyToClipboard } from '@/utils'
import { getDeviceIcon } from '@/utils/device'
import WalletSetupDialog from '@/components/WalletSetupDialog.vue'

// NavBar 上钱包信息入口:
// - NavBar 里只渲染一个触发按钮(wallet 图标)
// - 点击打开 Popover 显示 walletId / 设备 / 公钥 / 私钥状态 / 重置
// PrimeVue 4 的 Popover 推荐用法:trigger 用 ref + toggle(),Popover 内容用 teleport 到 body。
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
  walletPopover.value?.hide()
  setupVisible.value = true
}

const walletPopover = ref()
function toggleWallet(ev: Event) {
  walletPopover.value?.toggle(ev)
}

const setupVisible = ref(false)
</script>

<template>
  <Button
    severity="secondary"
    text
    size="small"
    class="py-3"
    aria-label="Wallet"
    @click="toggleWallet"
  >
    <Icon name="solar:wallet-money-broken" class="text-black/90 dark:text-white/90" />
    <span
      v-if="!userStore.hasPrivateKey && userStore.hasWallet"
      class="ml-1 size-2 rounded-full bg-rose-500 inline-block"
      :title="t('wallet.privateKeyMissing')"
    />
  </Button>

  <Popover ref="walletPopover">
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
          <Button size="small" text severity="contrast" @click="resetWallet">
            <Icon name="solar:refresh-square-broken" class="mr-1" />{{ t('wallet.switchIdentity') }}
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
