<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'primevue/usetoast'
import { useContactsStore } from '@/stores'
// NavBar 上群组浮层:展示所有群组 + 成员,支持新建/重命名/删除
const { t } = useI18n()
const toast = useToast()

const contactsStore = useContactsStore()

function remove(gid: string) {
  if (!confirm(t('groups.confirmDelete'))) return
  contactsStore.removeGroup(gid)
  toast.add({ severity: 'info', summary: t('groups.groupDeleted') })
}

const renameState = ref<{ open: boolean; id: string; name: string }>({
  open: false,
  id: '',
  name: ''
})

function startRename(id: string, current: string) {
  renameState.value = { open: true, id, name: current }
}

function applyRename() {
  contactsStore.renameGroup(renameState.value.id, renameState.value.name)
  renameState.value.open = false
}

const createState = ref(false)
const newGroupName = ref('')
function createGroup() {
  const g = contactsStore.createGroup(newGroupName.value)
  newGroupName.value = ''
  createState.value = false
  toast.add({ severity: 'success', summary: t('groups.create') + ': ' + g.name })
}

const expanded = ref<string | null>(null)
function toggle(id: string) {
  expanded.value = expanded.value === id ? null : id
}

function memberAlias(walletId: string) {
  const c = contactsStore.contacts.find((x) => x.walletId === walletId)
  return c?.alias || walletId
}
</script>

<template>
  <Popover>
    <Button severity="secondary" text size="small" class="py-3" aria-label="Groups">
      <Icon name="solar:user-hand-up-broken" class="text-black/90 dark:text-white/90" />
    </Button>
    <div class="relative p-3 m-2 w-[300px] max-h-[60vh] overflow-y-auto">
      <div class="flex items-center justify-between mb-2">
        <p class="text-sm font-medium">{{ t('label.groups') }}</p>
        <Button size="small" severity="contrast" @click="createState = true">
          {{ t('btn.newGroup') }}
        </Button>
      </div>

      <div v-if="contactsStore.groups.length === 0" class="text-xs text-neutral-500">
        {{ t('hint.noGroups') }}
      </div>

      <div
        v-for="g in contactsStore.groups"
        :key="g.id"
        class="mb-2 border border-neutral-200 dark:border-neutral-700 rounded"
      >
        <div
          class="flex items-center justify-between px-2 py-1 cursor-pointer"
          @click="toggle(g.id)"
        >
          <span class="text-sm">{{ g.name }} ({{ g.memberWalletIds.length }})</span>
          <div class="flex items-center gap-1">
            <Button text size="small" @click.stop="startRename(g.id, g.name)">
              <Icon name="solar:pen-broken" />
            </Button>
            <Button text size="small" severity="danger" @click.stop="remove(g.id)">
              <Icon name="solar:trash-bin-trash-linear" />
            </Button>
          </div>
        </div>
        <div v-if="expanded === g.id" class="px-2 pb-2">
          <div
            v-for="m in g.memberWalletIds"
            :key="m"
            class="flex items-center justify-between py-1 text-xs"
          >
            <span class="truncate">{{ memberAlias(m) }}</span>
            <Button
              text
              size="small"
              severity="danger"
              @click="contactsStore.removeMemberFromGroup(g.id, m)"
            >
              <Icon name="solar:close-circle-line-duotone" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  </Popover>

  <Dialog
    v-model:visible="createState"
    modal
    :header="t('groups.create')"
    class="w-[90vw] md:w-[400px]"
  >
    <InputText v-model="newGroupName" class="w-full" :placeholder="t('groups.create')" />
    <template #footer>
      <Button severity="contrast" @click="createGroup">{{ t('btn.confirm') }}</Button>
    </template>
  </Dialog>

  <Dialog
    v-model:visible="renameState.open"
    modal
    :header="t('groups.rename')"
    class="w-[90vw] md:w-[400px]"
  >
    <InputText v-model="renameState.name" class="w-full" />
    <template #footer>
      <Button severity="contrast" @click="applyRename">{{ t('btn.confirm') }}</Button>
    </template>
  </Dialog>
</template>
