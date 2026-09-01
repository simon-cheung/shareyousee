<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useContactsStore, useHomeStore } from '@/stores'
import { getDeviceIcon } from '@/utils/device'
import { getContactDisplay } from '@/utils/contactsDisplay'
// 首页 tab 内通用面板:
// 端点 / 联系人 / 群组 全部平铺为单层列表(按 type 排序),用 icon 区分
// mode='recent'  → 仅显示有交互记录的联系人
// mode='contacts' → 显示全部联系人
// 点击即选中用于定向发送

const props = defineProps<{
  mode: 'recent' | 'contacts'
}>()

const emit = defineEmits<{
  (e: 'selectItem', id: string, isGroup: boolean): void
}>()

const { t } = useI18n()
const contactsStore = useContactsStore()
const homeStore = useHomeStore()

const selfEndpoints = computed(() => contactsStore.selfEndpoints)

const visibleContacts = computed(() => {
  if (props.mode === 'recent') return contactsStore.recentContacts
  return contactsStore.otherContacts
})

const groups = computed(() => contactsStore.groups)

type ListItem =
  | { kind: 'endpoint'; id: string; deviceLabel: string; walletId: string }
  | { kind: 'contact'; id: string; walletId: string; alias?: string; lastInteractionAt: number }
  | { kind: 'group'; id: string; name: string; memberCount: number }

const flatList = computed<ListItem[]>(() => {
  const items: ListItem[] = []
  for (const ep of selfEndpoints.value) {
    items.push({
      kind: 'endpoint',
      id: `ep:${ep.deviceLabel}`,
      deviceLabel: ep.deviceLabel,
      walletId: ep.walletId
    })
  }
  for (const c of visibleContacts.value) {
    items.push({
      kind: 'contact',
      id: c.walletId,
      walletId: c.walletId,
      alias: c.alias,
      lastInteractionAt: c.lastInteractionAt
    })
  }
  for (const g of groups.value) {
    items.push({ kind: 'group', id: g.id, name: g.name, memberCount: g.memberWalletIds.length })
  }
  return items
})

function selectItem(item: ListItem) {
  if (item.kind === 'group') emit('selectItem', item.id, true)
  else if (item.kind === 'endpoint') emit('selectItem', item.walletId, false)
  else emit('selectItem', item.walletId, false)
}

function isSelected(item: ListItem): boolean {
  return homeStore.pushTargetId === item.id
}

function lastTimeFmt(ts: number) {
  if (!ts) return '—'
  const diff = Date.now() - ts
  if (diff < 60_000) return t('label.secondsAgo', { n: Math.floor(diff / 1000) })
  if (diff < 3_600_000) return t('label.minutesAgo', { n: Math.floor(diff / 60_000) })
  if (diff < 86_400_000) return t('label.hoursAgo', { n: Math.floor(diff / 3_600_000) })
  return t('label.daysAgo', { n: Math.floor(diff / 86_400_000) })
}

function displayName(item: ListItem): string {
  if (item.kind === 'endpoint') return item.deviceLabel
  if (item.kind === 'contact') {
    const rec = contactsStore.contacts.find((c) => c.walletId === item.walletId)
    return getContactDisplay(rec, item.walletId)
  }
  return item.name
}
</script>

<template>
  <div class="flex flex-col gap-1 p-2">
    <div v-if="flatList.length === 0" class="text-xs text-neutral-500 px-2 py-1">
      {{ t('hint.noContacts') }}
    </div>
    <button
      v-for="item in flatList"
      :key="item.id"
      type="button"
      class="flex items-center justify-between gap-2 py-1.5 px-2 rounded text-sm text-left transition-colors"
      :class="
        isSelected(item)
          ? 'bg-sky-100 dark:bg-sky-900/30 ring-1 ring-sky-400'
          : 'hover:bg-neutral-100 dark:hover:bg-zinc-800'
      "
      @click="selectItem(item)"
    >
      <div class="flex items-center gap-2 min-w-0">
        <Icon
          v-if="item.kind === 'endpoint'"
          :name="getDeviceIcon(item.deviceLabel as any)"
          class="text-sky-500"
        />
        <Icon
          v-else-if="item.kind === 'contact'"
          name="solar:user-circle-broken"
          class="text-emerald-500"
        />
        <Icon v-else name="solar:users-group-two-rounded-broken" class="text-violet-500" />
        <span class="truncate">{{ displayName(item) }}</span>
      </div>
      <span class="text-xs text-neutral-500 shrink-0">
        <template v-if="item.kind === 'contact'">{{
          lastTimeFmt(item.lastInteractionAt)
        }}</template>
        <template v-else-if="item.kind === 'group'">{{ item.memberCount }}</template>
        <template v-else>
          <Icon name="solar:check-circle-bold" class="text-emerald-500 inline-block" />
        </template>
      </span>
    </button>
  </div>
</template>
