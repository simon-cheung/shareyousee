<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { computed } from 'vue'
import { useTaskStore } from '@/stores'
import { humanFileSize } from '@/utils'
import { useLocalePath } from '@/utils/localePath'
// 任务详情页:展示文件清单 + 状态
const { t } = useI18n()
const route = useRoute()
const localePath = useLocalePath()
const taskStore = useTaskStore()

const id = computed(() => String(route.query.id || ''))
const task = computed(() => taskStore.tasks.find((x) => x.id === id.value) || null)

function fmtTime(ts: number) {
  if (!ts) return ''
  return new Date(ts).toLocaleString()
}

function humanSize(n: number) {
  return humanFileSize(n, 2)
}
</script>

<template>
  <div class="md:px-[10vw] px-4 py-6">
    <div class="flex items-center gap-2 mb-4">
      <NuxtLink :to="localePath('/')">
        <Button text size="small" severity="contrast">
          <Icon name="solar:arrow-left-broken" class="mr-1" />{{ t('btn.toHome') }}
        </Button>
      </NuxtLink>
    </div>

    <div v-if="!task" class="text-sm text-neutral-500">{{ t('hint.noTasks') }}</div>

    <div v-else class="flex flex-col gap-3">
      <h2 class="text-2xl tracking-wider">{{ t('task.history') }}</h2>
      <div class="grid grid-cols-2 gap-2 text-sm">
        <span class="text-neutral-500">{{ t('task.statusDone') }}/{{ t('task.statusError') }}</span>
        <span :class="task.status === 'done' ? 'text-emerald-500' : 'text-rose-500'">{{
          task.status
        }}</span>
        <span class="text-neutral-500">peer</span>
        <span class="font-mono">{{
          task.peerNickname || task.peerWalletId?.slice(0, 8) || '—'
        }}</span>
        <span class="text-neutral-500">start</span>
        <span>{{ fmtTime(task.startTime) }}</span>
        <span class="text-neutral-500">end</span>
        <span>{{ fmtTime(task.endTime || 0) }}</span>
        <span class="text-neutral-500">bytes</span>
        <span>{{ humanSize(task.transmittedBytes) }} / {{ humanSize(task.totalBytes) }}</span>
      </div>

      <Divider />

      <h3 class="text-lg">{{ t('btn.viewFiles') }}</h3>
      <div v-if="task.filesSnapshot.truncated" class="text-xs text-amber-500">
        {{ t('task.filesSnapshotTruncated') }} ({{ task.filesSnapshot.items.length }} /
        {{ task.filesSnapshot.totalCount }})
      </div>
      <div class="max-h-[50vh] overflow-y-auto text-sm font-mono">
        <div
          v-for="item in task.filesSnapshot.items"
          :key="item.key"
          class="flex items-center justify-between py-1 border-b border-neutral-100 dark:border-neutral-800"
        >
          <span class="truncate mr-2">{{ item.path }}</span>
          <span class="text-neutral-500 whitespace-nowrap">{{ humanSize(item.size) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
