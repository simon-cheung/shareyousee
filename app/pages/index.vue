<script setup lang="ts">
// 首页布局(ShareYouSee):
// - 顶部一整行:取件码板块(横向居中)
// - 主区:左 2/3(发送三按钮 + 联系人列表),右 1/4 留空
// - 选中列表项后,三按钮自动转为定向发送,直接进入 sender
const { t } = useI18n()
const homeStore = useHomeStore()
const contactsStore = useContactsStore()
const taskStore = useTaskStore()
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
  contactsStore.initialize()
  taskStore.initialize()
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

    <!-- 主区:左 2/3 发送 + 联系人列表,右 1/4 留空 -->
    <div class="md:grid md:grid-cols-[2fr_1fr] gap-4 px-4">
      <div class="flex flex-col items-stretch relative px-2 py-2">
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

        <!-- 紧凑三按钮一行 -->
        <div class="flex flex-row items-stretch gap-2 mb-3">
          <Button
            outlined
            rounded
            class="flex-1 py-2"
            severity="contrast"
            :title="$t('btn.sendFile')"
            :aria-label="$t('btn.sendFile')"
            @click="startSendFile"
          >
            <Icon name="solar:file-line-duotone" size="20" />
          </Button>
          <Button
            outlined
            rounded
            class="flex-1 py-2"
            severity="contrast"
            :disabled="!isDirSupport"
            :title="$t('btn.sendDir')"
            :aria-label="$t('btn.sendDir')"
            @click="startSendDir"
          >
            <Icon name="solar:folder-with-files-line-duotone" size="20" />
          </Button>
          <Button
            rounded
            class="flex-1 py-2"
            severity="contrast"
            :disabled="!isModernFileAPISupport"
            :title="$t('btn.syncDir')"
            :aria-label="$t('btn.syncDir')"
            @click="startSyncDir"
          >
            <Icon name="solar:refresh-square-broken" size="20" />
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

      <!-- 右 1/4 留空 -->
      <div></div>
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
