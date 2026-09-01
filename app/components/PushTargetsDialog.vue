<script setup lang="ts">
// 发送方定向发送确认弹窗:
// 展示目标 walletId 列表(联系人/群组按 walletId 展开,不指定设备)
// 确认后:跳转到 sender 页,senderTransfer 拿到 ws code 后自动上报 pendingPush
import { useContactsStore } from '~/stores/contacts'
import { useUserStore } from '~/stores/user'
import { useTransferConfigStore } from '~/stores/transferConfig'
import { snapshotFromFileMap } from '~/types/task'
import type { DeviceLabel } from '~/types/wallet'

const { t } = useI18n()
const toast = useToast()
const localePath = useLocalePath()
const router = useRouter()

const props = defineProps<{
  visible: boolean
  targetId: string
  isGroup: boolean
}>()
const emit = defineEmits<{ (e: 'close'): void }>()

const contactsStore = useContactsStore()
const userStore = useUserStore()
const transferConfigStore = useTransferConfigStore()

const localVisible = computed({
  get: () => props.visible,
  set: (v) => {
    if (!v) emit('close')
  }
})

// 解析目标 walletIds(群组 → 所有成员 walletId;联系人 → 单个 walletId)
const targetWalletIds = computed(() => {
  if (!props.targetId) return []
  if (props.isGroup) return contactsStore.resolveGroupMembers(props.targetId)
  return [props.targetId]
})

const targetTitle = computed(() => {
  if (!props.targetId) return ''
  if (props.isGroup) {
    return contactsStore.groups.find((g) => g.id === props.targetId)?.name || ''
  }
  const c = contactsStore.contacts.find((x) => x.walletId === props.targetId)
  return c?.alias || c?.walletId.slice(0, 8) || ''
})

async function confirmPush() {
  if (!transferConfigStore.type || Object.keys(transferConfigStore.fileMap).length === 0) {
    toast.add({ severity: 'warn', summary: t('hint.pushTargetsEmpty') })
    emit('close')
    return
  }

  // 目标端点列表:walletId 粒度,deviceLabel 留空表示"任意设备都能接收"
  const targets = targetWalletIds.value.map((walletId) => ({
    walletId,
    deviceLabel: undefined
  }))

  const snapshot = snapshotFromFileMap(
    transferConfigStore.type,
    transferConfigStore.fileMap,
    transferConfigStore.root
  )

  if (import.meta.client) {
    // code 由服务端 initSend 生成,此处只携带 targets 与快照,senderTransfer 在收到 server 'code' 后上报
    sessionStorage.setItem(
      'sy-push-pending',
      JSON.stringify({
        targets,
        filesSnapshot: snapshot,
        fromWalletId: userStore.walletInfo?.walletId || '',
        fromPublicKey: userStore.walletInfo?.publicKey || '',
        fromDevice: (userStore.walletInfo?.deviceLabel || 'unknown') as DeviceLabel
      })
    )
  }
  emit('close')
  await router.push(localePath('/sender'))
}
</script>

<template>
  <Dialog
    v-model:visible="localVisible"
    modal
    :header="t('push.pushTo')"
    class="w-[90vw] md:w-[480px]"
  >
    <div class="flex flex-col gap-3">
      <p class="text-sm">
        {{ t('push.pushFrom', { from: targetTitle }) }}
      </p>
      <div class="text-xs text-neutral-500">
        {{ t('push.pushToOnline', { n: targetWalletIds.length }) }}
      </div>
      <div class="max-h-[40vh] overflow-y-auto border rounded p-2">
        <div
          v-for="id in targetWalletIds"
          :key="id"
          class="flex items-center justify-between py-1 text-sm"
        >
          <span class="font-mono truncate">{{ id.slice(0, 8) }}…{{ id.slice(-4) }}</span>
          <Icon name="solar:check-circle-bold" class="text-emerald-500" />
        </div>
      </div>
      <p class="text-xs text-neutral-500">{{ t('push.pushHint') }}</p>
    </div>
    <template #footer>
      <Button text severity="contrast" @click="emit('close')">{{ t('btn.cancel') }}</Button>
      <Button severity="contrast" :disabled="targetWalletIds.length === 0" @click="confirmPush">
        {{ t('btn.confirm') }}
      </Button>
    </template>
  </Dialog>
</template>
