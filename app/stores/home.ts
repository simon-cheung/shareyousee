import type { FlatFileMap } from '~/types/transfer'

/**
 * 首页业务仓库。
 * 负责选择文件/目录、处理拖拽和取件码跳转，避免首页脚本直接承载业务流程。
 */
export const useHomeStore = defineStore('home', () => {
  const { t } = useI18n()
  const localePath = useLocalePath()
  const router = useRouter()
  const toast = useToast()

  const appStore = useAppStore()
  const transferConfigStore = useTransferConfigStore()
  const userStore = useUserStore()
  const contactsStore = useContactsStore()

  const isModernFileAPISupport = ref(true)
  const isDirSupport = ref(true)
  const receiveCode = ref('')
  const isFileDraging = ref(false)

  // 钱包设置向导是否处于打开中(由首页挂载,首启动未生成钱包时弹)
  const isWalletSetupOpen = ref(false)

  function initialize() {
    isModernFileAPISupport.value = isModernFileAPIAvailable()
    isDirSupport.value = supportsDirectorySelection()
    receiveCode.value = ''
    transferConfigStore.clearTransferFiles()
    // 首次启动若没有钱包,引导用户生成/导入
    if (!userStore.hasWallet) {
      isWalletSetupOpen.value = true
    }
  }

  function closeWalletSetup() {
    isWalletSetupOpen.value = false
  }

  async function applyTransferSelection(
    type: 'transFile' | 'transDir' | 'syncDir',
    fileMap: FlatFileMap
  ) {
    if (Object.keys(fileMap).length === 0) {
      throw new Error(type === 'transFile' ? '未选择文件' : '目录为空')
    }
    transferConfigStore.setTransferFiles(type, fileMap)
    await router.push(localePath('/sender'))
  }

  // 当前是否处于"定向发送"上下文(已选联系人/群组/端点时,顶部三按钮直接定向)
  const pushTargetId = ref<string | null>(null)
  const pushTargetIsGroup = ref(false)

  function setPushTarget(id: string | null, isGroup = false) {
    pushTargetId.value = id
    pushTargetIsGroup.value = isGroup
  }

  // 通用发送入口:选中联系人/群组时,选完文件后直接发起定向发送(写入 push-pending,senderTransfer 自动上报)
  async function startSend(type: 'transFile' | 'transDir' | 'syncDir') {
    let fileMap: FlatFileMap
    try {
      if (type === 'transFile') {
        const file = await selectFile()
        fileMap = dealFilesFormFile(file)
      } else {
        const files = await selectDir()
        fileMap = await dealFilesFormList(files)
      }
    } catch (error) {
      console.warn(error)
      toast.add({ severity: 'error', summary: 'Error', detail: `${error}`, life: 5e3 })
      return
    }
    appStore.setFullScreenLoading(true)
    transferConfigStore.setTransferFiles(type, fileMap)
    if (pushTargetId.value) {
      // 把 push-pending 写到 sessionStorage,senderTransfer 拿到 server code 后自动上报
      if (import.meta.client) {
        const { snapshotFromFileMap } = await import('~/types/task')
        const targets = (() => {
          const id = pushTargetId.value!
          if (pushTargetIsGroup.value) {
            return contactsStore.resolveGroupMembers(id).map((walletId) => ({
              walletId,
              deviceLabel: undefined
            }))
          }
          return [{ walletId: id, deviceLabel: undefined }]
        })()
        const snapshot = snapshotFromFileMap(type, fileMap, transferConfigStore.root)
        const userStore = useUserStore()
        sessionStorage.setItem(
          'sy-push-pending',
          JSON.stringify({
            targets,
            filesSnapshot: snapshot,
            fromWalletId: userStore.walletInfo?.walletId || '',
            fromPublicKey: userStore.walletInfo?.publicKey || '',
            fromDevice: userStore.walletInfo?.deviceLabel || 'unknown'
          })
        )
      }
    }
    await router.push(localePath('/sender'))
  }

  async function handleDropFile(event: DragEvent) {
    event.preventDefault()
    isFileDraging.value = false

    if (!event.dataTransfer || event.dataTransfer.items.length === 0) {
      return
    }

    const firstItem = event.dataTransfer.items[0]
    if (!firstItem) {
      return
    }

    const item = firstItem.webkitGetAsEntry()
    const files = event.dataTransfer.files
    if (!item) {
      return
    }

    if (item.isFile) {
      const file = files[0]
      if (!file) {
        return
      }

      appStore.setFullScreenLoading(true)
      await applyTransferSelection('transFile', dealFilesFormFile(file))
      return
    }

    if (item.isDirectory) {
      toast.add({
        severity: 'warn',
        summary: 'Warn',
        detail: t('hint.noSupportFolderDrag'),
        life: 5e3
      })
    }
  }

  async function handleReceiveCodeChange() {
    if (receiveCode.value.length !== 4) {
      return
    }

    if (/^\d{4}$/.test(receiveCode.value)) {
      appStore.setFullScreenLoading(true)
      await router.push({ path: localePath('recipient'), query: { code: receiveCode.value } })
      return
    }

    receiveCode.value = receiveCode.value.replaceAll(' ', '')
  }

  function setDragging(value: boolean) {
    isFileDraging.value = value
  }

  return {
    isModernFileAPISupport,
    isDirSupport,
    receiveCode,
    isFileDraging,
    isWalletSetupOpen,
    pushTargetId,
    pushTargetIsGroup,
    initialize,
    closeWalletSetup,
    setPushTarget,
    startSend,
    handleDropFile,
    handleReceiveCodeChange,
    setDragging
  }
})
