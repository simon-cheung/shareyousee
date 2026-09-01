<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'primevue/usetoast'
import { useContactsStore } from '@/stores'
// 群组 CRUD 弹窗:
// - 当 contactId 传入,默认选中新建群组并把该联系人加入
// - 否则允许选择现有群组加入或新建
const { t } = useI18n()
const toast = useToast()

const props = defineProps<{
  open: boolean
  contactId: string
}>()
const emit = defineEmits<{ (e: 'close'): void }>()

const contactsStore = useContactsStore()
const localOpen = computed({
  get: () => props.open,
  set: (v) => {
    if (!v) emit('close')
  }
})

const newName = ref('')
const selectedGroupId = ref<string | null>(null)

function createAndAdd() {
  const g = contactsStore.createGroup(newName.value)
  if (props.contactId) contactsStore.addContactToGroup(g.id, props.contactId)
  newName.value = ''
  toast.add({ severity: 'success', summary: t('groups.create') })
  emit('close')
}

function addToExisting() {
  if (!selectedGroupId.value) return
  if (props.contactId) contactsStore.addContactToGroup(selectedGroupId.value, props.contactId)
  emit('close')
}
</script>

<template>
  <Dialog
    v-model:visible="localOpen"
    modal
    :header="t('btn.addToGroup')"
    class="w-[90vw] md:w-[420px]"
  >
    <div class="flex flex-col gap-3">
      <div class="flex flex-col gap-2">
        <p class="text-sm">{{ t('btn.newGroup') }}</p>
        <div class="flex gap-2">
          <InputText v-model="newName" class="flex-1" :placeholder="t('groups.create')" />
          <Button severity="contrast" @click="createAndAdd">{{ t('btn.confirm') }}</Button>
        </div>
      </div>
      <Divider />
      <div class="flex flex-col gap-2">
        <p class="text-sm">{{ t('label.groups') }}</p>
        <Select
          v-model="selectedGroupId"
          :options="contactsStore.groups"
          option-label="name"
          option-value="id"
          :placeholder="t('label.groups')"
          class="w-full"
        />
        <Button severity="contrast" :disabled="!selectedGroupId" @click="addToExisting">
          {{ t('btn.confirm') }}
        </Button>
      </div>
    </div>
  </Dialog>
</template>
