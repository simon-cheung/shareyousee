<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useTaskStore, useContactsStore } from '@/stores'
import { getContactDisplay } from '@/utils/contactsDisplay'
import { useLocalePath } from '@/utils/localePath'
// NavBar 任务日志浮层:展示历史任务,可点击进入详情
const { t } = useI18n()
const taskStore = useTaskStore()
const contactsStore = useContactsStore()
const localePath = useLocalePath()
const router = useRouter()

function fmtTime(ts: number) {
  if (!ts) return ''
  const d = new Date(ts)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function typeLabel(t: any) {
  if (t === 'transFile') return 'task.sentFile'
  if (t === 'transDir') return 'task.sentDir'
  return ''
}

function roleLabel(role: string, type: string) {
  if (role === 'sender') return type === 'transFile' ? t('task.sentFile') : t('task.sentDir')
  return type === 'transFile' ? t('task.receivedFile') : t('task.receivedDir')
}

function statusColor(status: string) {
  if (status === 'done') return 'text-emerald-500'
  if (status === 'err') return 'text-rose-500'
  return 'text-amber-500'
}

function peerDisplay(task: any) {
  const rec = contactsStore.contacts.find((c) => c.walletId === task.peerWalletId)
  return getContactDisplay(rec, task.peerWalletId, task.peerDeviceLabel)
}

function clearAll() {
  if (!confirm(t('hint.clearHistoryConfirm'))) return
  taskStore.clear()
}

function openDetail(id: string) {
  router.push(localePath('/tasks') + '?id=' + id)
}
</script>

<template>
  <Popover>
    <Button severity="secondary" text size="small" class="py-3" aria-label="Tasks">
      <Icon name="solar:history-broken" class="text-black/90 dark:text-white/90" />
    </Button>
    <div class="relative p-3 m-2 w-[320px] max-h-[60vh] overflow-y-auto">
      <div class="flex items-center justify-between mb-2">
        <p class="text-sm font-medium">{{ t('task.history') }}</p>
        <Button text size="small" severity="danger" @click="clearAll">
          <Icon name="solar:trash-bin-trash-linear" class="mr-1" />{{ t('btn.clearHistory') }}
        </Button>
      </div>

      <div v-if="taskStore.tasks.length === 0" class="text-xs text-neutral-500">
        {{ t('hint.noTasks') }}
      </div>

      <div
        v-for="task in taskStore.tasks"
        :key="task.id"
        class="py-2 border-b border-neutral-200 dark:border-neutral-700 cursor-pointer"
        @click="openDetail(task.id)"
      >
        <div class="flex items-center justify-between">
          <span class="text-sm truncate">{{ roleLabel(task.role, task.type) }}</span>
          <span :class="statusColor(task.status)" class="text-xs">
            {{
              task.status === 'done'
                ? t('task.statusDone')
                : task.status === 'err'
                  ? t('task.statusError')
                  : t('task.statusPending')
            }}
          </span>
        </div>
        <div class="flex items-center justify-between text-xs text-neutral-500 mt-1">
          <span class="truncate">{{ peerDisplay(task) }}</span>
          <span>{{ fmtTime(task.startTime) }}</span>
        </div>
      </div>
    </div>
  </Popover>
</template>
