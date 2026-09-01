<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'primevue/usetoast'
import { useUserStore } from '@/stores'
import { genMnemonic, checkMnemonic, normalizeMnemonic } from '@/utils/wallet'
import { copyToClipboard } from '@/utils'
import ClientOnly from '@/components/ClientOnly.vue'
// 首次启动钱包设置向导:
// 1. 选择生成新钱包 / 导入助记词
// 2. (新钱包)展示 12 词助记词,强制用户勾选"我已抄写"
// 3. 写入 IndexedDB + localStorage;后续直接关闭弹窗
// mode='recover' 时:有 walletId 但私钥丢失,只能导入旧助记词恢复,不可关闭
const props = defineProps<{
  visible: boolean
  mode?: 'choose' | 'recover'
}>()
const emit = defineEmits<{ (e: 'update:visible', v: boolean): void }>()

const { t } = useI18n()
const toast = useToast()
const userStore = useUserStore()

// 检测 Secure Context(WebCrypto 在 HTTP 非 localhost 时不可用)
const isSecureContext = ref(true)
onMounted(() => {
  isSecureContext.value = (globalThis as any).isSecureContext !== false
  if (!isSecureContext.value) {
    toast.add({
      severity: 'warn',
      summary: 'Insecure context',
      detail: t('wallet.insecureContextHint'),
      life: 10e3
    })
  }
})

const localVisible = computed({
  get: () => props.visible,
  set: (v) => emit('update:visible', v)
})

// 重新打开时重置 step,避免上次未完成的助记词展示残留
watch(
  [localVisible, () => props.mode],
  ([v, mode]) => {
    if (v) {
      // recover 模式直接进入导入页,跳过生成新钱包入口
      step.value = mode === 'recover' ? 'import' : 'choose'
      ackSaved.value = false
      importText.value = ''
      mnemonic.value = []
    }
  },
  { immediate: true }
)

type Step = 'choose' | 'showMnemonic' | 'import' | 'done'
const step = ref<Step>('choose')
const mnemonic = ref<string[]>([])
const importText = ref('')
const ackSaved = ref(false)
const busy = ref(false)

async function generateNew() {
  busy.value = true
  try {
    const words = genMnemonic(128).split(' ')
    mnemonic.value = words
    step.value = 'showMnemonic'
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: `${e}`, life: 5e3 })
  } finally {
    busy.value = false
  }
}

function switchToImport() {
  step.value = 'import'
  importText.value = ''
  ackSaved.value = false
}

async function confirmSaved() {
  if (!ackSaved.value) {
    toast.add({ severity: 'warn', summary: t('wallet.confirmSaveFirst') })
    return
  }
  busy.value = true
  try {
    await userStore.generateWalletFromMnemonic(mnemonic.value.join(' '))
    userStore.acknowledgeMnemonic()
    step.value = 'done'
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: `${e}`, life: 5e3 })
  } finally {
    busy.value = false
  }
}

async function confirmImport() {
  const text = normalizeMnemonic(importText.value)
  const wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0
  console.log(
    '[WalletSetupDialog] confirmImport text:',
    text.slice(0, 60),
    '...',
    'words:',
    wordCount
  )
  if (!checkMnemonic(text)) {
    // 给用户更具体的提示:词数 + 是否合法
    toast.add({
      severity: 'error',
      summary: t('wallet.invalidMnemonic'),
      detail: `${wordCount} words`,
      life: 5e3
    })
    return
  }
  busy.value = true
  try {
    await userStore.generateWalletFromMnemonic(text)
    userStore.acknowledgeMnemonic()
    step.value = 'done'
  } catch (e: any) {
    console.error('[WalletSetupDialog] confirmImport error:', e)
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: e?.message ?? String(e),
      life: 8e3
    })
  } finally {
    busy.value = false
  }
}

// 助记词可一键复制(空格分隔,与导入格式一致)
async function copyMnemonic() {
  const text = mnemonic.value.join(' ')
  if (!text) return
  await copyToClipboard(text)
  toast.add({ severity: 'success', summary: t('btn.copied'), life: 2e3 })
}

function close() {
  if (step.value === 'showMnemonic' && !ackSaved.value) {
    toast.add({ severity: 'warn', summary: t('wallet.confirmSaveFirst') })
    return
  }
  // recover 模式:有 walletId 但私钥丢失,不允许关闭(否则功能完全不可用)
  if (props.mode === 'recover') {
    toast.add({ severity: 'warn', summary: t('wallet.recoverRequired') })
    return
  }
  emit('update:visible', false)
}

const shortWalletId = computed(() => {
  const id = userStore.walletInfo?.walletId || ''
  return id ? `${id.slice(0, 6)}…${id.slice(-4)}` : ''
})
</script>

<template>
  <ClientOnly>
    <Dialog
      v-model:visible="localVisible"
      :closable="step === 'done' && mode !== 'recover'"
      :close-on-escape="step === 'done' && mode !== 'recover'"
      modal
      :dismissable-mask="step === 'done' && mode !== 'recover'"
      :header="mode === 'recover' ? t('wallet.recoverTitle') : t('wallet.setupTitle')"
      class="w-[90vw] md:w-[480px]"
    >
      <div v-if="step === 'choose'" class="flex flex-col gap-4">
        <p class="text-sm leading-6 text-gray-600 dark:text-gray-300">
          {{ t('wallet.intro') }}
        </p>
        <div class="grid grid-cols-2 gap-3">
          <Button severity="contrast" :loading="busy" @click="generateNew">
            {{ t('wallet.generate') }}
          </Button>
          <Button outlined severity="contrast" @click="switchToImport">
            {{ t('wallet.import') }}
          </Button>
        </div>
      </div>

      <div v-else-if="step === 'showMnemonic'" class="flex flex-col gap-3">
        <p class="text-rose-500 text-sm">{{ t('wallet.mnemonicWarn') }}</p>
        <div class="grid grid-cols-3 gap-2">
          <div
            v-for="(word, i) in mnemonic"
            :key="i"
            class="px-3 py-2 rounded border border-neutral-400/60 bg-neutral-100 dark:bg-zinc-800 text-sm font-mono flex items-center"
          >
            <span class="text-neutral-500 mr-2">{{ i + 1 }}.</span>
            <span>{{ word }}</span>
          </div>
        </div>
        <div class="flex items-center gap-2 mt-2">
          <Checkbox v-model="ackSaved" :binary="true" input-id="ack-saved" />
          <label for="ack-saved" class="text-sm cursor-pointer">{{ t('wallet.iHaveSaved') }}</label>
        </div>
        <div class="flex justify-end gap-2 mt-2">
          <Button outlined severity="contrast" @click="copyMnemonic">
            <Icon name="solar:copy-line-duotone" class="mr-1" />{{ t('btn.copy') }}
          </Button>
          <Button severity="contrast" :disabled="!ackSaved || busy" @click="confirmSaved">
            {{ t('btn.confirm') }}
          </Button>
        </div>
      </div>

      <div v-else-if="step === 'import'" class="flex flex-col gap-3">
        <p v-if="mode === 'recover'" class="text-rose-500 text-sm">
          {{ t('wallet.recoverWarn') }}
        </p>
        <p v-else class="text-sm text-gray-600 dark:text-gray-300">
          {{ t('wallet.importHint') }}
        </p>
        <Textarea
          v-model="importText"
          rows="3"
          auto-resize
          :placeholder="t('wallet.importPlaceholder')"
          class="font-mono"
        />
        <div class="flex justify-end gap-2">
          <Button
            v-if="mode !== 'recover'"
            text
            severity="contrast"
            @click="step = 'choose'"
          >
            {{ t('btn.back') }}
          </Button>
          <Button severity="contrast" :loading="busy" @click="confirmImport">
            {{ t('btn.confirm') }}
          </Button>
        </div>
      </div>

      <div v-else-if="step === 'done'" class="flex flex-col gap-3 items-center text-center">
        <Icon name="solar:check-circle-bold" class="text-emerald-500" size="48" />
        <p class="text-base">{{ t('wallet.setupDone') }}</p>
        <p class="text-sm text-neutral-500">
          {{ t('wallet.idLabel') }}: <span class="font-mono">{{ shortWalletId }}</span>
        </p>
        <Button severity="contrast" @click="close">{{ t('btn.close') }}</Button>
      </div>
    </Dialog>
  </ClientOnly>
</template>
