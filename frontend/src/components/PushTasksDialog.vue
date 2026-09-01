<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useRemoteTaskStore, useContactsStore } from '@/stores'
import type { RemoteTask } from '@/stores/remoteTask'
import { getDeviceIcon } from '@/utils/device'
import { getContactDisplay } from '@/utils/contactsDisplay'
import { useLocalePath } from '@/utils/localePath'
import { usePresenceWs } from '@/composables/usePresenceWs'
// 接收端定向任务面板:展示服务端 pushList 下发的任务
// 弹窗状态由父组件控制,点击"接收"跳 /recipient?code=CODE 走现有取件码配对
// "刷新"按钮:通过全局 presence ws 发 requestPushList,服务端会再下发一次 pushList
const { t } = useI18n()
const localePath = useLocalePath()
const router = useRouter()

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ (e: 'update:visible', v: boolean): void }>()

const remoteTaskStore = useRemoteTaskStore()
const contactsStore = useContactsStore()
const presence = usePresenceWs()

const localVisible = computed({
  get: () => props.visible,
  set: (v) => emit('update:visible', v)
})

function accept(task: RemoteTask) {
  remoteTaskStore.markLocalConsumed(task.code)
  // 通话/共享屏幕走 /call,文件传输走 /recipient(原有取件码配对)
  if (task.kind === 'call') {
    router.push(localePath('/call') + '?code=' + task.code)
  } else {
    router.push(localePath('/recipient') + '?code=' + task.code)
  }
  localVisible.value = false
}

function refresh() {
  presence.requestPushList()
}

// 优先显示昵称 + 设备标签,缺则兜底
function peerLabel(walletId: string, deviceLabel?: string) {
  const rec = contactsStore.contacts.find((x) => x.walletId === walletId)
  return getContactDisplay(rec, walletId, deviceLabel)
}

function fmtTime(ts: number) {
  if (!ts) return ''
  const d = new Date(ts)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}
</script>

<template>
  <Dialog
    v-model:visible="localVisible"
    modal
    :header="t('push.pushTo')"
    class="w-[90vw] md:w-[420px]"
  >
    <template #header>
      <div class="flex items-center justify-between w-full pr-2">
        <span class="font-medium">{{ t('push.pushTo') }}</span>
        <Button text size="small" :aria-label="t('btn.refresh')" @click="refresh">
          <Icon name="solar:refresh-square-broken" />
        </Button>
      </div>
    </template>
    <div class="max-h-[60vh] overflow-y-auto">
      <div v-if="remoteTaskStore.pendingList.length === 0" class="text-xs text-neutral-500 py-4">
        {{ t('hint.noTasks') }}
      </div>

      <div
        v-for="task in remoteTaskStore.pendingList"
        :key="task.code"
        class="py-2 border-b border-neutral-200 dark:border-neutral-700 last:border-b-0"
      >
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2 min-w-0">
            <Icon :name="getDeviceIcon(task.fromDevice)" />
            <Icon
              v-if="task.kind === 'call'"
              name="solar:user-hand-up-broken"
              class="text-sky-500"
            />
            <span class="text-sm truncate">{{
              peerLabel(task.fromWalletId, task.fromDevice)
            }}</span>
          </div>
          <span class="text-xs text-neutral-500">{{ fmtTime(task.createdAt) }}</span>
        </div>
        <div v-if="task.kind === 'call'" class="text-xs text-neutral-500 mt-1 truncate">
          {{ t('call.title') }}
        </div>
        <div v-else class="text-xs text-neutral-500 mt-1 truncate">
          {{ task.filesSnapshot.root || task.filesSnapshot.type }} ·
          {{ task.filesSnapshot.totalCount }} {{ $t('btn.viewFiles') }}
        </div>
        <div class="flex gap-2 mt-1">
          <Button size="small" severity="contrast" @click="accept(task)">
            {{ t('btn.receive') }}
          </Button>
        </div>
      </div>
    </div>
  </Dialog>
</template>
