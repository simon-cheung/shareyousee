<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { useHomeStore, useContactsStore, useTaskStore, useUserStore } from '@/stores'
import { useSeoMeta } from '@/utils/seoMeta'
import ContactsAndRecentPanel from '@/components/ContactsAndRecentPanel.vue'
// 首页布局(ShareYouSee):
// - 顶部一整行:取件码板块(横向居中)
// - 主区:左 2/3(发送三按钮 + 联系人列表),右 1/4 留空
// - 选中列表项后,三按钮自动转为定向发送,直接进入 sender
const { t } = useI18n()
const router = useRouter()
const toastForCall = useToast()
const homeStore = useHomeStore()
const contactsStore = useContactsStore()
const taskStore = useTaskStore()
const userStore = useUserStore()
const { isModernFileAPISupport, isDirSupport, receiveCode, isFileDraging } = storeToRefs(homeStore)
const fileDragArea = ref()

useSeoMeta({
  title: t('home')
})

watch(isFileDraging, (val) => {
  if (val) {
    fileDragArea.value.style.display = 'flex'
    fileDragArea.value.style.opacity = '1'
  } else {
    fileDragArea.value.style.opacity = '0'
    setTimeout(() => {
      if (fileDragArea.value) {
        fileDragArea.value.style.display = 'none'
      }
    }, 300)
  }
})

function fileDragOver(e: Event) {
  e.preventDefault()
  homeStore.setDragging(true)
}

function fileDrop(e: DragEvent) {
  homeStore.handleDropFile(e).catch(console.warn)
}

watch(receiveCode, () => homeStore.handleReceiveCodeChange(), { flush: 'sync' })

onMounted(() => {
  homeStore.initialize()

  window.ondragenter = (e) => {
    e.preventDefault()
    homeStore.setDragging(true)
  }
  window.ondragleave = (e: DragEvent) => {
    e.preventDefault()
    if (!e.relatedTarget) {
      homeStore.setDragging(false)
    }
  }
  window.ondragover = (e) => {
    e.preventDefault()
  }
  window.ondrop = (e) => {
    e.preventDefault()
    homeStore.setDragging(false)
  }
})

// 选中条目(端点 / 联系人 / 群组)用于定向发送
function selectItem(id: string | null, isGroup = false) {
  homeStore.setPushTarget(id, isGroup)
}

function selectGroup(id: string) {
  homeStore.setPushTarget(id, true)
}

// 三按钮入口:有选中目标时走定向,无选中时走普通取件码
function startSendFile() {
  homeStore.startSend('transFile')
}
function startSendDir() {
  homeStore.startSend('transDir')
}
function startSyncDir() {
  homeStore.startSend('syncDir')
}

// tab 状态:'recent' = 最近协作,'contacts' = 联系人(同样平铺展示)
const tabMode = ref<'recent' | 'contacts'>('recent')

// 下拉菜单:缺省按钮 = 发文件,菜单展开另外两种
const sendMenuItems = computed(() => [
  {
    label: t('btn.sendDir'),
    icon: 'solar:folder-with-files-line-duotone',
    disabled: !isDirSupport.value,
    command: () => startSendDir()
  },
  {
    label: t('btn.syncDir'),
    icon: 'solar:refresh-square-broken',
    disabled: !isModernFileAPISupport.value,
    command: () => startSyncDir()
  }
])

// 通话 / 屏幕共享入口:mode='audio' 语音通话,mode='screen' 屏幕共享
// 分离成两个独立按钮,各自携带自己的模式,不再共用弹窗选择。
async function startCall(mode: 'audio' | 'screen') {
  if (!homeStore.pushTargetId) {
    toastForCall.add({
      severity: 'warn',
      summary: 'Warn',
      detail: t('call.needTarget'),
      life: 5e3
    })
    return
  }
  const id = homeStore.pushTargetId
  const targets = homeStore.pushTargetIsGroup
    ? contactsStore.resolveGroupMembers(id).map((walletId) => ({ walletId, deviceLabel: undefined }))
    : [{ walletId: id, deviceLabel: undefined }]
  sessionStorage.setItem(
    'sy-call-pending',
    JSON.stringify({
      mode,
      targets,
      fromWalletId: userStore.walletInfo?.walletId || '',
      fromPublicKey: userStore.walletInfo?.publicKey || '',
      fromDevice: userStore.walletInfo?.deviceLabel || 'unknown'
    })
  )
  await router.push('/call')
}
</script>

<template>
  <div class="md:px-[10vw] pb-4">
    <div
      class="fixed top-0 left-0 right-0 bottom-0 inset-0 -z-50 h-full w-full bg-white dark:bg-zinc-950 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] dark:bg-[radial-gradient(#25272b_1px,transparent_1px)] [background-size:16px_16px]"
    ></div>
    <p
      class="text-xs md:text-sm text-neutral-600 dark:text-neutral-400 p-4"
      v-show="!isModernFileAPISupport"
    >
      <span class="text-red-500">*</span>{{ $t('hint.noModernFileAPIWarn') }}
    </p>

    <!-- 顶部一整行:取件码板块 -->
    <div class="flex flex-col items-center px-4 pt-6 pb-8 space-y-4">
      <h2 class="text-2xl tracking-wider flex flex-row items-center gap-2">
        <Icon name="solar:card-recive-linear" />{{ $t('label.receiveCode') }}
      </h2>

      <InputOtp integerOnly v-model="receiveCode" class="gap-4">
        <template #default="{ attrs, events, index }">
          <input
            :autofocus="index === 1"
            type="text"
            inputmode="numeric"
            v-bind="attrs"
            v-on="events"
            class="border border-neutral-500/70 rounded bg-neutral-50 dark:bg-zinc-900 focus:outline-none size-14 text-2xl text-center no-arrows"
          />
        </template>
      </InputOtp>
    </div>

    <!-- 主区:发送 + 联系人列表整体居中 -->
    <div class="flex flex-col items-center px-4">
      <div class="w-full max-w-[640px] flex flex-col items-stretch relative px-2 py-2">
        <!-- 拖放指示 -->
        <div
          ref="fileDragArea"
          @dragover="fileDragOver"
          @drop="fileDrop"
          class="file-drag-area absolute left-0 top-0 right-0 bottom-0 flex-col items-center justify-center rounded-lg bg-white/60 dark:bg-black/60 backdrop-blur-sm border border-dashed border-neutral-500 z-40"
        >
          <Icon name="solar:file-send-linear" size="48" />
          <p class="mt-4">{{ $t('label.dragHereToSendFile') }}</p>
        </div>

        <!-- 三个入口同一行:发送文件(带下拉) / 语音 / 屏幕共享 -->
        <div class="grid grid-cols-3 gap-2 mb-3">
          <SplitButton
            severity="contrast"
            outlined
            rounded
            class="py-2"
            :label="$t('btn.sendFile')"
            :title="$t('btn.sendFile')"
            :aria-label="$t('btn.sendFile')"
            :model="sendMenuItems"
            @click="startSendFile"
          >
            <template #default>
              <Icon name="solar:file-line-duotone" size="20" />
            </template>
          </SplitButton>

          <Button
            severity="contrast"
            rounded
            outlined
            class="py-2"
            :disabled="!homeStore.pushTargetId"
            :title="$t('call.audio')"
            :aria-label="$t('call.audio')"
            @click="startCall('audio')"
          >
            <Icon name="solar:user-hand-up-broken" size="20" />
          </Button>

          <Button
            severity="contrast"
            rounded
            outlined
            class="py-2"
            :disabled="!homeStore.pushTargetId"
            :title="$t('call.screen')"
            :aria-label="$t('call.screen')"
            @click="startCall('screen')"
          >
            <Icon name="solar:link-round-angle-bold" size="20" />
          </Button>
        </div>

        <!-- 已选提示 -->
        <div
          v-if="homeStore.pushTargetId"
          class="flex items-center justify-between gap-2 mb-2 px-3 py-1 rounded bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-300 text-xs"
        >
          <span class="truncate">
            <Icon name="solar:target-broken" class="inline-block mr-1" />
            {{ t('push.targetSelected') }}
          </span>
          <button class="text-sky-700 dark:text-sky-300 hover:underline" @click="selectItem(null)">
            {{ t('btn.cancel') }}
          </button>
        </div>

        <!-- 联系人/最近协作 tab -->
        <div class="contact-tabs">
          <div class="flex flex-row gap-2 mb-2 border-b border-neutral-200 dark:border-neutral-700">
            <button
              type="button"
              class="px-3 py-1 text-sm rounded-t border-b-2 transition-colors"
              :class="
                tabMode === 'recent'
                  ? 'border-sky-500 text-sky-600 dark:text-sky-400'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700'
              "
              @click="tabMode = 'recent'"
            >
              {{ $t('label.recentCollaborators') }}
            </button>
            <button
              type="button"
              class="px-3 py-1 text-sm rounded-t border-b-2 transition-colors"
              :class="
                tabMode === 'contacts'
                  ? 'border-sky-500 text-sky-600 dark:text-sky-400'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700'
              "
              @click="tabMode = 'contacts'"
            >
              {{ $t('label.contactsTab') }}
            </button>
          </div>
          <div class="contact-tabs-body">
            <ContactsAndRecentPanel
              :mode="tabMode"
              @select-item="(id, isGroup) => (isGroup ? selectGroup(id) : selectItem(id, false))"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
.file-drag-area {
  display: none;
  opacity: 0;
  transition-property: opacity;
  transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
  transition-duration: 300ms;
}
.contact-tabs {
  display: flex;
  flex-direction: column;
  height: min(calc(100vh * 0.66), 480px);
}
.contact-tabs-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
</style>
