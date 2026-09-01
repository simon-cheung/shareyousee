<script setup lang="ts">
// 全局 Icon 组件:把 <Icon name="collection:icon" /> 解析为实际图标组件。
// 由于 unplugin-icons 只转换静态 import,动态 `<component :is="string">` 无法被识别,
// 因此这里把所有项目内用到的图标静态导入并建映射表。
import { computed, type Component } from 'vue'

import IconSolarCardReciveLinear from '~icons/solar/card-recive-linear'
import IconSolarCheckCircleBold from '~icons/solar/check-circle-bold'
import IconSolarTargetBroken from '~icons/solar/target-broken'
import IconSolarRefreshSquareBroken from '~icons/solar/refresh-square-broken'
import IconSolarSunBroken from '~icons/solar/sun-broken'
import IconSolarMoonLinear from '~icons/solar/moon-linear'
import IconSolarCopyLineDuotone from '~icons/solar/copy-line-duotone'
import IconSolarWalletMoneyBroken from '~icons/solar/wallet-money-broken'
import IconSolarTrashBinTrashLinear from '~icons/solar/trash-bin-trash-linear'
import IconSolarHistoryBroken from '~icons/solar/history-broken'
import IconSolarUserHandUpBroken from '~icons/solar/user-hand-up-broken'
import IconSolarPenBroken from '~icons/solar/pen-broken'
import IconSolarCloseCircleLineDuotone from '~icons/solar/close-circle-line-duotone'
import IconSolarNotebookBookmarkLineDuotone from '~icons/solar/notebook-bookmark-line-duotone'
import IconSolarUsersGroupRoundedBroken from '~icons/solar/users-group-rounded-broken'
import IconSolarUsersGroupTwoRoundedBroken from '~icons/solar/users-group-two-rounded-broken'
import IconSolarUserCircleBroken from '~icons/solar/user-circle-broken'
import IconSolarArrowLeftBroken from '~icons/solar/arrow-left-broken'
import IconSolarSadSquareLineDuotone from '~icons/solar/sad-square-line-duotone'
import IconSolarHome2Linear from '~icons/solar/home-2-linear'
import IconSolarFolderWithFilesLineDuotone from '~icons/solar/folder-with-files-line-duotone'
import IconSolarFolderErrorLinear from '~icons/solar/folder-error-linear'
import IconSolarArchiveDownMinimlisticLineDuotone from '~icons/solar/archive-down-minimlistic-line-duotone'
import IconSolarConfettiLineDuotone from '~icons/solar/confetti-line-duotone'
import IconSolarDownloadMinimalisticLinear from '~icons/solar/download-minimalistic-linear'
import IconSolarLinkMinimalistic2Linear from '~icons/solar/link-minimalistic-2-linear'
import IconSolarLinkRoundAngleBold from '~icons/solar/link-round-angle-bold'
import IconSolarLinkBrokenMinimalisticBroken from '~icons/solar/link-broken-minimalistic-broken'
import IconSolarCloseSquareLinear from '~icons/solar/close-square-linear'
import IconSolarCheckSquareLinear from '~icons/solar/check-square-linear'
import IconSolarStopLinear from '~icons/solar/stop-linear'
import IconSolarFileSendLinear from '~icons/solar/file-send-linear'
import IconSolarFileLineDuotone from '~icons/solar/file-line-duotone'
import IconMaterialSymbolsCheckRounded from '~icons/material-symbols/check-rounded'
import IconMaterialSymbolsTimerOffOutlineRounded from '~icons/material-symbols/timer-off-outline-rounded'
import IconMaterialSymbolsLightUnknownDocumentOutlineRounded from '~icons/material-symbols-light/unknown-document-outline-rounded'
import IconMaterialSymbolsLightAccountCircleOffOutlineRounded from '~icons/material-symbols-light/account-circle-off-outline-rounded'
import IconMaterialSymbolsLightWarningOutlineRounded from '~icons/material-symbols-light/warning-outline-rounded'
import IconIcOutlineInstallMobile from '~icons/ic/outline-install-mobile'
import IconIconParkOutlineChinese from '~icons/icon-park-outline/chinese'
import IconIconParkOutlineEnglish from '~icons/icon-park-outline/english'

const props = defineProps<{
  name: string
  size?: number | string
}>()

const icons: Record<string, Component> = {
  'solar:card-recive-linear': IconSolarCardReciveLinear,
  'solar:check-circle-bold': IconSolarCheckCircleBold,
  'solar:target-broken': IconSolarTargetBroken,
  'solar:refresh-square-broken': IconSolarRefreshSquareBroken,
  'solar:sun-broken': IconSolarSunBroken,
  'solar:moon-linear': IconSolarMoonLinear,
  'solar:copy-line-duotone': IconSolarCopyLineDuotone,
  'solar:wallet-money-broken': IconSolarWalletMoneyBroken,
  'solar:trash-bin-trash-linear': IconSolarTrashBinTrashLinear,
  'solar:history-broken': IconSolarHistoryBroken,
  'solar:user-hand-up-broken': IconSolarUserHandUpBroken,
  'solar:pen-broken': IconSolarPenBroken,
  'solar:close-circle-line-duotone': IconSolarCloseCircleLineDuotone,
  'solar:notebook-bookmark-line-duotone': IconSolarNotebookBookmarkLineDuotone,
  'solar:users-group-rounded-broken': IconSolarUsersGroupRoundedBroken,
  'solar:users-group-two-rounded-broken': IconSolarUsersGroupTwoRoundedBroken,
  'solar:user-circle-broken': IconSolarUserCircleBroken,
  'solar:arrow-left-broken': IconSolarArrowLeftBroken,
  'solar:sad-square-line-duotone': IconSolarSadSquareLineDuotone,
  'solar:home-2-linear': IconSolarHome2Linear,
  'solar:folder-with-files-line-duotone': IconSolarFolderWithFilesLineDuotone,
  'solar:folder-error-linear': IconSolarFolderErrorLinear,
  'solar:archive-down-minimlistic-line-duotone': IconSolarArchiveDownMinimlisticLineDuotone,
  'solar:confetti-line-duotone': IconSolarConfettiLineDuotone,
  'solar:download-minimalistic-linear': IconSolarDownloadMinimalisticLinear,
  'solar:link-minimalistic-2-linear': IconSolarLinkMinimalistic2Linear,
  'solar:link-round-angle-bold': IconSolarLinkRoundAngleBold,
  'solar:link-broken-minimalistic-broken': IconSolarLinkBrokenMinimalisticBroken,
  'solar:close-square-linear': IconSolarCloseSquareLinear,
  'solar:check-square-linear': IconSolarCheckSquareLinear,
  'solar:stop-linear': IconSolarStopLinear,
  'solar:file-send-linear': IconSolarFileSendLinear,
  'solar:file-line-duotone': IconSolarFileLineDuotone,
  'material-symbols:check-rounded': IconMaterialSymbolsCheckRounded,
  'material-symbols:timer-off-outline-rounded': IconMaterialSymbolsTimerOffOutlineRounded,
  'material-symbols-light:unknown-document-outline-rounded':
    IconMaterialSymbolsLightUnknownDocumentOutlineRounded,
  'material-symbols-light:account-circle-off-outline-rounded':
    IconMaterialSymbolsLightAccountCircleOffOutlineRounded,
  'material-symbols-light:warning-outline-rounded': IconMaterialSymbolsLightWarningOutlineRounded,
  'ic:outline-install-mobile': IconIcOutlineInstallMobile,
  'icon-park-outline:chinese': IconIconParkOutlineChinese,
  'icon-park-outline:english': IconIconParkOutlineEnglish
}

const cmp = computed(() => icons[props.name] || null)
</script>

<template>
  <component :is="cmp" v-if="cmp" :size="size" />
</template>
