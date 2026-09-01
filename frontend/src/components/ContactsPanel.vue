<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'primevue/usetoast'
import { useContactsStore, useUserStore } from '@/stores'
import { getDeviceIcon } from '@/utils/device'
import GroupCrudDialog from '@/components/GroupCrudDialog.vue'
// NavBar 上联系人浮层:
// 顶部展示我的端点(按设备标签分组)
// 中部展示其他联系人(只显示 walletId + 别名)
// 底部提供重命名/删除/加入群组操作
const { t } = useI18n()
const toast = useToast()

const contactsStore = useContactsStore()
const userStore = useUserStore()

const selfId = computed(() => userStore.walletInfo?.walletId || '')

const selfEndpoints = computed(() => contactsStore.selfEndpoints)
const others = computed(() => contactsStore.otherContacts)

function onSelect(id: string) {
  contactsStore.selectContact(id === contactsStore.selectedContactId ? null : id)
}

function remove(id: string) {
  if (!confirm(t('contacts.removeContact') + '?')) return
  contactsStore.removeContact(id)
  toast.add({ severity: 'info', summary: t('contacts.contactDeleted') })
}

const renameDialog = ref<{ open: boolean; id: string; alias: string }>({
  open: false,
  id: '',
  alias: ''
})

function startRename(id: string, current?: string) {
  renameDialog.value = { open: true, id, alias: current || '' }
}

function applyRename() {
  contactsStore.renameContact(renameDialog.value.id, renameDialog.value.alias)
  renameDialog.value.open = false
}

const groupDialog = ref<{ open: boolean; contactId: string }>({ open: false, contactId: '' })

function startAddToGroup(contactId: string) {
  groupDialog.value = { open: true, contactId }
}
</script>

<template>
  <Popover>
    <Button severity="secondary" text size="small" class="py-3" aria-label="Contacts">
      <Icon name="solar:users-group-rounded-broken" class="text-black/90 dark:text-white/90" />
    </Button>
    <div class="relative p-3 m-2 w-[300px] max-h-[60vh] overflow-y-auto">
      <div class="flex items-center justify-between mb-2">
        <p class="text-sm font-medium">{{ t('contacts.addContact') }}</p>
      </div>

      <div
        v-if="selfEndpoints.length === 0 && others.length === 0"
        class="text-xs text-neutral-500"
      >
        {{ t('hint.noContacts') }}
      </div>

      <div v-if="selfEndpoints.length" class="mb-3">
        <p class="text-xs text-neutral-500 mb-1">{{ t('label.myEndpoints') }}</p>
        <div
          v-for="ep in selfEndpoints"
          :key="`self-${ep.deviceLabel}`"
          class="flex items-center justify-between py-1 text-xs"
        >
          <div class="flex items-center gap-2">
            <Icon :name="getDeviceIcon(ep.deviceLabel)" />
            <span>{{ ep.deviceLabel }}</span>
            <span class="font-mono text-neutral-500">
              {{ ep.walletId.slice(0, 6) }}…{{ ep.walletId.slice(-4) }}
            </span>
          </div>
          <span class="text-emerald-500">{{ t('label.online') }}</span>
        </div>
      </div>

      <div v-if="others.length">
        <p class="text-xs text-neutral-500 mb-1">{{ t('label.contactsTab') }}</p>
        <div
          v-for="c in others"
          :key="c.walletId"
          class="flex flex-col gap-1 py-1 px-2 rounded cursor-pointer"
          :class="{
            'bg-neutral-100 dark:bg-zinc-800': contactsStore.selectedContactId === c.walletId
          }"
          @click="onSelect(c.walletId)"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2 min-w-0">
              <Icon name="solar:user-circle-broken" />
              <span class="text-sm truncate">{{ c.alias || c.walletId }}</span>
            </div>
            <div class="flex items-center gap-1">
              <Button text size="small" @click.stop="startRename(c.walletId, c.alias)">
                <Icon name="solar:pen-broken" />
              </Button>
              <Button text size="small" severity="danger" @click.stop="remove(c.walletId)">
                <Icon name="solar:trash-bin-trash-linear" />
              </Button>
            </div>
          </div>
          <div v-if="contactsStore.selectedContactId === c.walletId" class="flex gap-2 mt-1">
            <Button
              size="small"
              outlined
              severity="contrast"
              @click.stop="startAddToGroup(c.walletId)"
            >
              {{ t('btn.addToGroup') }}
            </Button>
          </div>
        </div>
      </div>
    </div>
  </Popover>

  <Dialog
    v-model:visible="renameDialog.open"
    modal
    :header="t('contacts.renameContact')"
    class="w-[90vw] md:w-[400px]"
  >
    <InputText v-model="renameDialog.alias" class="w-full" />
    <template #footer>
      <Button severity="contrast" @click="applyRename">{{ t('btn.confirm') }}</Button>
    </template>
  </Dialog>

  <GroupCrudDialog
    v-if="groupDialog.open"
    :open="groupDialog.open"
    :contact-id="groupDialog.contactId"
    @close="groupDialog.open = false"
  />
</template>
