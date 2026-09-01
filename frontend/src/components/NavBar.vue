<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { ref, onMounted } from 'vue'
import { useToast } from 'primevue/usetoast'
import { useUserStore, useRemoteTaskStore } from '@/stores'
import { getScrollTop } from '@/utils'
import { useColorMode } from '@/utils/colorMode'
import { useLocalePath } from '@/utils/localePath'
import { usePresenceWs } from '@/composables/usePresenceWs'
import WalletPanel from '@/components/WalletPanel.vue'
import ContactsPanel from '@/components/ContactsPanel.vue'
import GroupsPanel from '@/components/GroupsPanel.vue'
import TasksPanel from '@/components/TasksPanel.vue'
import PushTasksDialog from '@/components/PushTasksDialog.vue'

const localePath = useLocalePath()
const { locale, t } = useI18n()
const colorMode = useColorMode()
const isBgBlur = ref(false)
const userStore = useUserStore()
const remoteTaskStore = useRemoteTaskStore()
const { userInfo, isConfirmDefault } = storeToRefs(userStore)
const tmpNickname = ref('')
const userInfoPopover = ref()
const pushDialogVisible = ref(false)
const toast = useToast()

// ShareYouSee:全局常驻 ws,用于 register / pushList
const presence = usePresenceWs()

function openPushDialog() {
  pushDialogVisible.value = true
}

// 暗色模式切换
function switchColorMode() {
  if (colorMode.preference.value === 'light') {
    colorMode.set('dark')
  } else {
    colorMode.set('light')
  }
}

// 中英语言切换
function switchI18n() {
  locale.value = locale.value === 'en' ? 'zh' : 'en'
}

// 是否开启发送方自动确认
function switchConfirmDefault() {
  userStore.setConfirmDefault(isConfirmDefault.value)
}

// 展示昵称编辑弹框
function showNicknameEditor(event: Event) {
  tmpNickname.value = userInfo.value.nickname
  userInfoPopover.value.toggle(event)
}

// 编辑昵称
function editNickname() {
  userStore.setNickname(tmpNickname.value)
  tmpNickname.value = userInfo.value.nickname
  userInfoPopover.value.hide()
}

// 编辑头像
function editAvatar() {
  userStore.openAvatarPicker()
}

// 钱包就绪后激活常驻 ws(目前 WalletSetupDialog 由 WalletPanel 持有,
// NavBar 不再单独暴露开关,此函数保留以备将来复用)
function onWalletSetupClosed() {
  presence.refresh()
}

onMounted(() => {
  window.addEventListener('scroll', () => {
    isBgBlur.value = getScrollTop() > 64
  })
  tmpNickname.value = userInfo.value.nickname
})
</script>

<template>
  <nav
    class="flex flex-row items-center py-3 px-4 md:py-4 md:px-[10vw] sticky left-0 right-0 top-0 z-50 nav-bar"
    :class="{ 'backdrop-blur': isBgBlur }"
  >
    <NuxtLink :to="localePath('/')">
      <div class="tracking-wider">
        <img src="/app-icon.svg" class="inline-block size-[32px] mr-1" />ShareYouSee
      </div>
    </NuxtLink>

    <div class="flex-1"></div>

    <div class="contents text-sm">
      <WalletPanel />
      <ContactsPanel />
      <GroupsPanel />
      <TasksPanel />
      <Avatar
        :image="userInfo.avatarURL"
        shape="circle"
        class="shadow cursor-pointer"
        @click="showNicknameEditor"
      />
      <p class="ml-2 truncate shrink-[1000] hidden md:block">
        {{ userInfo.nickname }}
      </p>
      <!-- 定向推送按钮:替代原 BuyMeCoffee 位置,挂在个人头像旁 -->
      <Button
        v-if="userStore.hasWallet"
        severity="secondary"
        text
        size="small"
        class="py-3 relative"
        aria-label="PushTasks"
        @click="openPushDialog"
      >
        <Icon name="solar:target-broken" class="text-black/90 dark:text-white/90" />
        <span
          v-if="remoteTaskStore.pendingList.length > 0"
          class="absolute -top-0.5 -right-0.5 size-4 rounded-full bg-rose-500 text-white text-[10px] flex items-center justify-center"
        >
          {{ remoteTaskStore.pendingList.length }}
        </span>
      </Button>
    </div>

    <!-- 用户信息弹出框 -->
    <Popover ref="userInfoPopover">
      <div class="relative p-3 m-2">
        <div class="relative flex flex-col items-center gap-4">
          <Avatar
            :image="userInfo.avatarURL"
            shape="circle"
            class="shadow-md cursor-pointer"
            size="xlarge"
            @click="editAvatar"
          />
          <InputGroup>
            <InputText
              severity="contrast"
              size="small"
              placeholder="昵称"
              v-model:model-value="tmpNickname"
              @keydown.enter="editNickname"
            />
            <Button severity="contrast" size="small" class="m-0" @click="editNickname"
              ><Icon name="material-symbols:check-rounded"
            /></Button>
          </InputGroup>
        </div>

        <Divider />

        <div class="flex flex-row items-center justify-between">
          <p class="text-sm">{{ $t('label.autoConfirmBySender') }}</p>
          <ToggleSwitch v-model="isConfirmDefault" @change="switchConfirmDefault" />
        </div>
      </div>
    </Popover>

    <PushTasksDialog v-model:visible="pushDialogVisible" />

    <div class="contents">
      <!-- <NuxtLink to="https://www.buymeacoffee.com/shouchen" target="_blank" class="ml-2 md:ml-4">
        <Button severity="warning" text size="small" class="py-3" aria-label="Buy Me A Coffee">
          <IconCoffee class="size-5 text-black dark:text-white/90" />
        </Button>
      </NuxtLink> -->

      <Button
        severity="secondary"
        text
        @click="switchI18n"
        size="small"
        class="py-3"
        aria-label="Language"
      >
        <Icon
          name="icon-park-outline:chinese"
          class="text-black/90 dark:text-white/90"
          v-if="locale === 'zh'"
        />
        <Icon
          name="icon-park-outline:english"
          class="text-black/90 dark:text-white/90"
          v-else-if="locale === 'en'"
        />
      </Button>

      <!-- <Popover ref="i18nPopover">
        <Listbox
          v-model="selectedLocale"
          :options="availableLocales"
          optionLabel="name"
          class="border-0"
          ><template #option="slotProps">
            <div class="flex items-center gap-2 text-sm">
              <Icon :name="slotProps.option.icon" />
              <div>{{ slotProps.option.name }}</div>
            </div>
          </template>
        </Listbox>
      </Popover> -->

      <Button
        severity="secondary"
        text
        @click="switchColorMode"
        size="small"
        class="py-3"
        aria-label="Dark"
      >
        <Icon
          name="solar:moon-linear"
          class="text-yellow-500/90"
          v-if="colorMode.preference.value === 'dark'"
        />
        <Icon name="solar:sun-broken" class="text-black" v-else />
      </Button>
    </div>
  </nav>
</template>

<style scoped>
.nav-bar {
  transition: backdrop-filter 0.5s ease;
}
</style>
