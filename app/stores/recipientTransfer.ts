import CryptoJS from 'crypto-js'
import { snapshotFromFileMap } from '~/types/task'
import type { DeviceLabel } from '~/types/wallet'
import {
  createRecipientCurrentFileState,
  createRecipientStatusState,
  createSyncDirState,
  type FilesPayload,
  type RecipientCurrentFileState,
  type RecipientStatusState,
  type SyncDirState,
  type UserInfo
} from '~/types/transfer'
import { PeerDataChannel } from '~/utils/PeerDataChannel'

/**
 * 接收端业务仓库。
 * 负责接收连接、文件写入、目录对比与同步动作,页面只保留展示与组件绑定。
 * ShareYouSee 行政特征:
 * - 接收端 ws.onopen 时 register,服务端顺势 pushList
 * - P2P 完成时主动发 consumePush,告知服务端从 targets 移除本端点
 */
export const useRecipientTransferStore = defineStore('recipientTransfer', () => {
  const { t } = useI18n()
  const localePath = useLocalePath()
  const toast = useToast()
  const router = useRouter()

  const appStore = useAppStore()
  const userStore = useUserStore()
  const contactsStore = useContactsStore()
  const taskStore = useTaskStore()
  const remoteTaskStore = useRemoteTaskStore()

  const isModernFileAPISupport = ref(true)
  const peerUserInfo = ref<UserInfo>({ nickname: 'unknown', avatarURL: '' })
  const peerFilesInfo = ref<FilesPayload>({ type: '', fileMap: {}, root: '' })
  const selectedKeys = ref<Record<string, boolean>>({})
  const code = ref('')
  const waitReceiveFileList = ref<string[]>([])
  const transmittedCount = ref(0)
  const receiveFileIndex = ref(0)
  const totalFileSize = ref(0)
  const totalTransmittedBytes = ref(0)
  const startTime = ref(0)
  const totalSpeed = ref(0)
  const durationTimeStr = ref('00:00')
  const remainingTimeStr = ref('00:00')
  const curFile = ref<RecipientCurrentFileState>(createRecipientCurrentFileState())
  const status = ref<RecipientStatusState>(createRecipientStatusState())
  const syncDirStatus = ref<SyncDirState>(createSyncDirState())

  // ShareYouSee:当前任务 id
  let currentTaskId = ''

  const hasher = CryptoJS.algo.MD5.create()

  let calcSpeedJobId: ReturnType<typeof setInterval> | undefined
  let ws: WebSocket | null = null
  let pdc: PeerDataChannel | null = null
  let saveFileFH: FileSystemFileHandle | undefined
  let curFileWriter: FileSystemWritableFileStream | undefined
  let rootDirDH: FileSystemDirectoryHandle | undefined
  let syncTargetDH: FileSystemDirectoryHandle | undefined
  let reqFileResolveFn: (() => void) | undefined
  let reqFileRejecteFn: (() => void) | undefined
  let calcPeerFileHashResolveFn: ((hash: string) => void) | undefined
  let calcPeerFileHashRejecteFn: (() => void) | undefined

  function resetState() {
    dispose()
    isModernFileAPISupport.value = true
    peerUserInfo.value = { nickname: 'unknown', avatarURL: '' }
    peerFilesInfo.value = { type: '', fileMap: {}, root: '' }
    selectedKeys.value = {}
    code.value = ''
    waitReceiveFileList.value = []
    transmittedCount.value = 0
    receiveFileIndex.value = 0
    totalFileSize.value = 0
    totalTransmittedBytes.value = 0
    startTime.value = 0
    totalSpeed.value = 0
    durationTimeStr.value = '00:00'
    remainingTimeStr.value = '00:00'
    curFile.value = createRecipientCurrentFileState()
    status.value = createRecipientStatusState()
    syncDirStatus.value = createSyncDirState()
    saveFileFH = undefined
    curFileWriter = undefined
    rootDirDH = undefined
    syncTargetDH = undefined
  }

  // 锁定中的 code 状态走 remoteTaskStore(usePresenceWs 也会过滤同一处)
  // 这里保留模块变量用于业务 ws 的 pushList 过滤冗余写入
  let lockedCode = ''

  function dispose() {
    if (calcSpeedJobId) {
      clearInterval(calcSpeedJobId)
      calcSpeedJobId = undefined
    }
    reqFileRejecteFn?.()
    calcPeerFileHashRejecteFn?.()
    reqFileResolveFn = undefined
    reqFileRejecteFn = undefined
    calcPeerFileHashResolveFn = undefined
    calcPeerFileHashRejecteFn = undefined
    ws?.close()
    ws = null
    pdc?.dispose()
    pdc = null
    // 释放锁定:dispose 后服务端会再次 pushList,这时允许显示
    if (lockedCode) {
      remoteTaskStore.unlockCode(lockedCode)
      lockedCode = ''
    }
  }

  function calcSpeedFn() {
    const curBytes = curFile.value.transmittedBytes + (pdc?.getReceivedBufferSize() || 0)
    curFile.value.speed = curBytes - curFile.value.lastSize
    curFile.value.lastSize = curBytes
    totalSpeed.value =
      totalTransmittedBytes.value / ((new Date().getTime() - startTime.value) / 1e3)
    durationTimeStr.value = formatTime(new Date().getTime() - startTime.value)
    remainingTimeStr.value = formatTime(
      ((totalFileSize.value - totalTransmittedBytes.value) / Math.max(totalSpeed.value, 1)) * 1e3
    )
  }

  function downloadFile() {
    doDownloadFromBlob(new Blob(curFile.value.chunks), curFile.value.name)
  }

  async function handleBufferData(buf: ArrayBuffer) {
    curFile.value.transmittedBytes += buf.byteLength
    totalTransmittedBytes.value += buf.byteLength
    hasher.update(CryptoJS.lib.WordArray.create(buf))

    if (isModernFileAPISupport.value) {
      await curFileWriter?.write(buf)
      return
    }

    curFile.value.chunks.push(buf)
  }

  /**
   * 关闭当前文件写入流，用于文件传输完成或异常时清理资源。
   */
  async function closeCurFileWriter() {
    try {
      await curFileWriter?.close()
    } catch {
      // writer 可能已关闭或处于异常状态，忽略
    }
    curFileWriter = undefined
  }

  function initCurFile(key?: string) {
    const fileMap = peerFilesInfo.value.fileMap
    const fileName = key || Object.keys(fileMap)[0]
    if (!fileName || !fileMap[fileName]) {
      throw new Error('File not found')
    }

    curFile.value = {
      name: fileName,
      size: fileMap[fileName]?.size || 0,
      transmittedBytes: 0,
      lastSize: 0,
      speed: 0,
      chunks: []
    }
  }

  async function handleObjData(obj: any) {
    if (obj.type === 'user') {
      peerUserInfo.value = obj.data
      // ShareYouSee 行政特征:登记对端联系人端点
      const walletId = obj.data?.walletId
      const publicKey = obj.data?.publicKey
      const deviceLabel = obj.data?.deviceLabel
      if (walletId && publicKey && deviceLabel) {
        contactsStore.upsertEndpoint(walletId, publicKey, deviceLabel, 'transfer')
      }
      if (walletId && obj.data?.nickname) {
        contactsStore.applyAliasFromNickname(walletId, obj.data.nickname)
      }
      // 任务日志同步刷新对端信息
      if (currentTaskId) {
        taskStore.updatePeer(currentTaskId, {
          peerWalletId: walletId,
          peerDeviceLabel: deviceLabel as any,
          peerNickname: obj.data?.nickname
        })
      }
      return
    }

    if (obj.type === 'files') {
      peerFilesInfo.value = obj.data
      if (peerFilesInfo.value.type === 'transFile') {
        initCurFile()
        totalFileSize.value = curFile.value.size
      } else if (!isModernFileAPISupport.value) {
        status.value.warn.code = -1
        status.value.warn.msg = '不支持目录传输'
        await pdc?.sendData(JSON.stringify({ type: 'err', data: -1 }))
        dispose()
      } else if (peerFilesInfo.value.type === 'syncDir') {
        syncDirStatus.value.folderName = peerFilesInfo.value.root
      }
      status.value.isWaitingPeerConfirm = false
      return
    }

    if (obj.type === 'fileDone') {
      const hash = hasher.finalize().toString(CryptoJS.enc.Base64)
      if (hash !== obj.data) {
        console.error(
          'Hash check failure.',
          curFile.value.name,
          'send:',
          obj.data,
          'receive:',
          hash
        )
        status.value.warn.code = -3
        toast.add({
          severity: 'error',
          summary: 'Error',
          detail: t('hint.hashCheckFail'),
          life: 5e3
        })
        // 校验失败时关闭写入流并尝试清理已写入的文件
        await closeCurFileWriter()
        if (saveFileFH) {
          // @ts-ignore 运行时浏览器 API 可用，类型定义未完整覆盖 remove。
          saveFileFH.remove()
        }
        dispose()
        return
      }

      // 校验通过，关闭写入流
      await closeCurFileWriter()
      transmittedCount.value++

      reqFileResolveFn?.()
      reqFileResolveFn = undefined
      reqFileRejecteFn = undefined

      if (!isModernFileAPISupport.value) {
        downloadFile()
      }
      return
    }

    if (obj.type === 'fileHash') {
      calcPeerFileHashResolveFn?.(obj.data)
      calcPeerFileHashResolveFn = undefined
      calcPeerFileHashRejecteFn = undefined
      return
    }

    if (obj.type === 'err') {
      console.warn(obj.data)
      if (obj.data === 403) {
        status.value.error.code = 403
        status.value.error.msg = '用户拒绝传输'
        toast.add({
          severity: 'error',
          summary: 'Error',
          detail: t('hint.refusesToTransmit'),
          life: 5e3
        })
      } else if (obj.data === 404) {
        toast.add({ severity: 'warn', summary: 'Warn', detail: '文件找不到', life: 5e3 })
      }
    }
  }

  function initPDC() {
    status.value.isPeerConnecting = true
    pdc = new PeerDataChannel({ iceServers: pubIceServers, initializeDataChannel: true })
    pdc.onSDP = (sdp) => ws?.send(JSON.stringify({ type: 'sdp', data: sdp }))
    pdc.onICECandidate = (candidate) =>
      ws?.send(JSON.stringify({ type: 'candidate', data: candidate }))
    pdc.onDispose = () => {
      status.value.isConnectPeer = false
      if (status.value.isIniting) {
        status.value.error.code = -10
      } else if (status.value.isWaitingPeerConfirm) {
        status.value.error.code = 403
      } else if (status.value.isReceiving) {
        status.value.warn.code = -2
        status.value.warn.msg = '连接断开，传输失败'
      }
      dispose()
      toast.add({ severity: 'warn', summary: 'Warn', detail: 'Disconnected', life: 5e3 })
    }
    pdc.onError = (err) => {
      console.error(err)
      status.value.isConnectPeer = false
      status.value.isPeerConnecting = false
      if (status.value.isIniting) {
        status.value.error.code = 500
        status.value.error.msg = `${err}`
      }
      dispose()
      toast.add({ severity: 'error', summary: 'Error', detail: `${err}`, life: 5e3 })
    }
    pdc.onConnected = () => {
      status.value.isConnectPeer = true
      status.value.isPeerConnecting = false
      status.value.isIniting = false
    }
    pdc.onOpen = () => pdc?.sendData(JSON.stringify({ type: 'user', data: userStore.userInfo }))
    pdc.onReceive = async (data) => {
      if (typeof data === 'string') {
        await handleObjData(JSON.parse(data))
      } else {
        await handleBufferData(data)
      }
    }
  }

  async function requestFile(key: string) {
    hasher.reset()
    await pdc?.sendData(JSON.stringify({ type: 'reqFile', data: key }))
    return new Promise<void>((resolve, reject) => {
      reqFileResolveFn = resolve
      reqFileRejecteFn = reject
    })
  }

  async function calcPeerFileHash(key: string) {
    await pdc?.sendData(JSON.stringify({ type: 'calcFileHash', data: key }))
    return new Promise<string>((resolve, reject) => {
      calcPeerFileHashResolveFn = resolve
      calcPeerFileHashRejecteFn = reject
    })
  }

  /**
   * 统一校验路径片段，避免文件系统 API 接收到 undefined。
   */
  function getPathSegment(segment: string | undefined) {
    if (!segment) {
      throw new Error('Invalid path segment')
    }
    return segment
  }

  /**
   * 删除文件后尝试清理空的父目录。
   * 从被删除文件的父目录向上逐级检查，如果目录为空则移除。
   */
  async function cleanupEmptyDirs(
    rootDH: FileSystemDirectoryHandle | undefined,
    deletedKeys: string[]
  ) {
    if (!rootDH) return
    // 收集所有可能变空的目录路径（去重），按深度从深到浅排序
    const dirPaths = new Set<string>()
    for (const key of deletedKeys) {
      const parts = key.split('/')
      for (let i = parts.length - 1; i >= 1; i--) {
        dirPaths.add(parts.slice(0, i).join('/'))
      }
    }
    const sorted = [...dirPaths].sort((a, b) => b.split('/').length - a.split('/').length)

    for (const dirPath of sorted) {
      try {
        const parts = dirPath.split('/')
        let parentDH = rootDH
        for (let i = 0; i < parts.length - 1; i++) {
          parentDH = await parentDH.getDirectoryHandle(parts[i]!)
        }
        const targetName = parts[parts.length - 1]!
        const targetDH = await parentDH.getDirectoryHandle(targetName)
        // 检查目录是否为空
        let isEmpty = true
        // @ts-ignore entries() 在 FileSystemDirectoryHandle 上可用
        for await (const _ of targetDH.entries()) {
          isEmpty = false
          break
        }
        if (isEmpty) {
          await parentDH.removeEntry(targetName)
        }
      } catch {
        // 目录不存在或无权限，忽略
      }
    }
  }

  function selectSyncDir() {
    window
      .showDirectoryPicker()
      .then((dh: FileSystemDirectoryHandle) => {
        syncDirStatus.value.isWaitingSelectDir = false
        syncTargetDH = dh
        return dealFilesFromHandler(dh)
      })
      .then((val: Record<string, any>) => fileMapWithoutRoot(val))
      .then(async (localFileMap: any) => {
        syncDirStatus.value.isDiffing = true
        const isQuick = syncDirStatus.value.isQuickDiff

        for (const key in peerFilesInfo.value.fileMap) {
          const remoteFile = peerFilesInfo.value.fileMap[key]
          if (key in localFileMap) {
            const localFile = localFileMap[key]
            if (remoteFile?.size === localFile?.size) {
              if (isQuick) {
                // 快速模式：大小相同且修改时间一致则视为相同
                if (remoteFile?.lastModified === localFile?.lastModified) {
                  localFile.isEqual = true
                  continue
                }
              } else {
                // 精确模式：大小相同时进一步比较 MD5
                const peerHashPromise = calcPeerFileHash(key)
                const localFileHash = await calcMD5(localFileMap[key].file)
                const peerFileHash = await peerHashPromise
                if (localFileHash === peerFileHash) {
                  localFile.isEqual = true
                  continue
                }
              }
            }
            // 使用远端文件信息，FilesTree 展示的大小为远端文件大小
            syncDirStatus.value.fileMapUpdate[key] = remoteFile!
            localFile.isUpdate = true
          } else {
            if (remoteFile) {
              syncDirStatus.value.fileMapAdd[key] = remoteFile
            }
          }
        }

        for (const key in localFileMap) {
          if (!localFileMap[key].isUpdate && !localFileMap[key].isEqual) {
            syncDirStatus.value.fileMapDelete[key] = localFileMap[key]
          }
        }
        syncDirStatus.value.isDiffing = false
      })
      .catch((error: unknown) => {
        // 目录选择取消时 isWaitingSelectDir 仍为 true，用户可重新选择
        // 如果是目录已选择后的异常（对比阶段），则需要恢复 UI 状态
        if (!syncDirStatus.value.isWaitingSelectDir) {
          syncDirStatus.value.isWaitingSelectDir = true
          syncDirStatus.value.isDiffing = false
          toast.add({
            severity: 'error',
            summary: 'Error',
            detail: t('hint.syncDiffFailed'),
            life: 5e3
          })
        }
        console.warn(error)
      })
  }

  async function doReceive() {
    if (status.value.isReceiving) {
      return
    }
    status.value.isReceiving = true
    status.value.isLock = true
    receiveFileIndex.value = 0
    totalTransmittedBytes.value = 0

    // ShareYouSee 行政特征:写入 pending 任务日志
    const snapshot = snapshotFromFileMap(
      peerFilesInfo.value.type,
      peerFilesInfo.value.fileMap,
      peerFilesInfo.value.root
    )
    const totalBytes = Object.values(peerFilesInfo.value.fileMap).reduce(
      (acc, f) => acc + (Number(f.size) || 0),
      0
    )
    currentTaskId = taskStore.addPending({
      id: '',
      role: 'recipient',
      type: peerFilesInfo.value.type,
      peerWalletId: peerUserInfo.value.walletId,
      peerDeviceLabel: peerUserInfo.value.deviceLabel as any,
      peerNickname: peerUserInfo.value.nickname,
      status: 'pending',
      startTime: Date.now(),
      totalBytes,
      transmittedBytes: 0,
      filesSnapshot: snapshot
    })

    if (peerFilesInfo.value.type === 'transDir') {
      waitReceiveFileList.value = Object.keys(selectedKeys.value).filter(
        (name) => !/\/$/.test(name)
      )
      if (waitReceiveFileList.value.length === 0) {
        toast.add({ severity: 'warn', summary: 'Warn', detail: '请至少选择一个文件', life: 5e3 })
        status.value.isReceiving = false
        status.value.isLock = false
        return
      }
      totalFileSize.value = waitReceiveFileList.value.reduce(
        (size: number, name: string) => size + (peerFilesInfo.value.fileMap[name]?.size || 0),
        0
      )
    } else if (peerFilesInfo.value.type === 'syncDir') {
      syncDirStatus.value.waitAddList = Object.keys(syncDirStatus.value.addKeys).filter(
        (name) => !/\/$/.test(name)
      )
      syncDirStatus.value.waitUpdateList = Object.keys(syncDirStatus.value.updateKeys).filter(
        (name) => !/\/$/.test(name)
      )
      syncDirStatus.value.waitDeleteList = Object.keys(syncDirStatus.value.deleteKeys).filter(
        (name) => !/\/$/.test(name)
      )

      if (
        syncDirStatus.value.waitAddList.length === 0 &&
        syncDirStatus.value.waitUpdateList.length === 0 &&
        syncDirStatus.value.waitDeleteList.length === 0
      ) {
        toast.add({ severity: 'warn', summary: 'Warn', detail: '请至少选择一个文件', life: 5e3 })
        status.value.isReceiving = false
        status.value.isLock = false
        return
      }

      totalFileSize.value = [
        ...syncDirStatus.value.waitAddList,
        ...syncDirStatus.value.waitUpdateList
      ].reduce((size, name) => size + (peerFilesInfo.value.fileMap[name]?.size || 0), 0)
    }

    try {
      if (peerFilesInfo.value.type === 'transFile') {
        if (isModernFileAPISupport.value) {
          const ext = curFile.value.name.match(/(\.\w+)$/)?.[1]
          const safeName = ext
            ? curFile.value.name.slice(0, -ext.length).replace(/\./g, '_') + ext
            : curFile.value.name
          saveFileFH = await window.showSaveFilePicker({
            startIn: 'downloads',
            suggestedName: safeName,
            ...(ext && {
              types: [{ description: '', accept: { 'application/x-fastsend': [ext] } }]
            })
          })
          curFileWriter = await saveFileFH?.createWritable()
        }
        startTime.value = Date.now()
        calcSpeedJobId = setInterval(calcSpeedFn, 1e3)
        receiveFileIndex.value = 1
        await requestFile(curFile.value.name)
      } else if (peerFilesInfo.value.type === 'transDir') {
        rootDirDH = await window.showDirectoryPicker()
        startTime.value = Date.now()
        calcSpeedJobId = setInterval(calcSpeedFn, 1e3)
        for (const key of waitReceiveFileList.value) {
          const paths = key.split('/')
          initCurFile(key)
          receiveFileIndex.value++
          let curFolder = rootDirDH
          for (let index = 0; index < paths.length - 1; index++) {
            curFolder = await curFolder?.getDirectoryHandle(getPathSegment(paths[index]), {
              create: true
            })
          }
          const curFH = await curFolder?.getFileHandle(getPathSegment(paths[paths.length - 1]), {
            create: true
          })
          curFileWriter = await curFH?.createWritable()
          await requestFile(key)
        }
      } else if (peerFilesInfo.value.type === 'syncDir') {
        startTime.value = Date.now()
        calcSpeedJobId = setInterval(calcSpeedFn, 1e3)
        for (const key of [
          ...syncDirStatus.value.waitAddList,
          ...syncDirStatus.value.waitUpdateList
        ]) {
          const paths = key.split('/')
          let curFolder = syncTargetDH
          for (let index = 0; index < paths.length - 1; index++) {
            curFolder = await curFolder?.getDirectoryHandle(getPathSegment(paths[index]), {
              create: true
            })
          }
          const curFH = await curFolder?.getFileHandle(getPathSegment(paths[paths.length - 1]), {
            create: true
          })
          curFileWriter = await curFH?.createWritable()
          initCurFile(key)
          receiveFileIndex.value++
          await requestFile(key)
        }

        for (const key of syncDirStatus.value.waitDeleteList) {
          const paths = key.split('/')
          let curFolder = syncTargetDH
          for (let index = 0; index < paths.length - 1; index++) {
            curFolder = await curFolder?.getDirectoryHandle(getPathSegment(paths[index]))
          }
          try {
            await curFolder?.removeEntry(getPathSegment(paths[paths.length - 1]))
          } catch (error) {
            console.warn('删除失败', key, error)
          }
        }

        // 删除文件后尝试清理空的父目录
        await cleanupEmptyDirs(syncTargetDH, syncDirStatus.value.waitDeleteList)
      }

      // ShareYouSee 行政特征:传输完成前同步最新身份(nickname/avatar 可能更新过)
      await pdc?.sendData(JSON.stringify({ type: 'user', data: userStore.userInfo }))
      await pdc?.sendData(JSON.stringify({ type: 'done' }))
      status.value.isReceiving = false
      status.value.isDone = true
      calcSpeedFn()
      // ShareYouSee 行政特征:任务完成
      taskStore.complete(currentTaskId, {
        status: 'done',
        transmittedBytes: totalTransmittedBytes.value,
        endTime: Date.now()
      })
      // ShareYouSee 行政特征:P2P 完成,告知服务端从 targets 移除本端点
      sendConsumePush(code.value)
      dispose()
      toast.add({
        severity: 'success',
        summary: 'Success',
        detail: t('hint.transCompleted'),
        life: 5e3
      })
    } catch (error) {
      console.warn(error)

      // 异常时关闭未完成的写入流，避免文件句柄泄漏
      await closeCurFileWriter()
      if (calcSpeedJobId) {
        clearInterval(calcSpeedJobId)
        calcSpeedJobId = undefined
      }
      // ShareYouSee 行政特征:任务失败落账
      if (currentTaskId) taskStore.setError(currentTaskId, -3)
      toast.add({ severity: 'error', summary: 'Error', detail: `${error}`, life: 5e3 })
      status.value.isLock = false
      status.value.isReceiving = false
    }
  }

  function initialize(receiveCode: string) {
    resetState()
    isModernFileAPISupport.value = isModernFileAPIAvailable()
    code.value = receiveCode
    // 锁定当前 code:服务端 register 后还会再下发一次,这里先过滤掉,避免红点复活
    lockedCode = receiveCode
    remoteTaskStore.lockCode(receiveCode)
    appStore.setFullScreenLoading(false)

    ws = new WebSocket(location.origin.replace('http', 'ws') + '/api/connect')
    ws.onopen = () => {
      status.value.isConnectServer = true
      // ShareYouSee:接收端先 register 自身 presence,服务端可立刻通知推送
      if (userStore.hasWallet) {
        ws?.send(
          JSON.stringify({
            type: 'register',
            walletId: userStore.walletInfo.walletId,
            publicKey: userStore.walletInfo.publicKey,
            deviceLabel: userStore.walletInfo.deviceLabel
          })
        )
      }
      ws?.send(JSON.stringify({ type: 'receive', code: code.value }))
      setTimeout(() => {
        if (status.value.isIniting) {
          dispose()
          if (status.value.error.code === 0) {
            status.value.error.code = -10
          }
        }
      }, 45e3)
    }
    ws.onmessage = async (event) => {
      const data = JSON.parse(event.data)
      if (data.type === 'status') {
        if (data.code === 404) {
          status.value.error.code = 404
          status.value.error.msg = '404'
          dispose()
        } else if (data.code === 0) {
          // 配对成功:保留原 initPDC 流程
          initPDC()
        }
        return
      }
      // ShareYouSee 行政特征:服务端主动 pushList 回执(register 后)
      if (data.type === 'pushList') {
        remoteTaskStore.setPendingList(data.data || [])
        return
      }
      if (data.type === 'sdp') {
        await pdc?.setRemoteSDP(data.data)
        return
      }
      if (data.type === 'candidate') {
        await pdc?.addICECandidate(data.data)
      }
    }
    ws.onclose = () => {
      status.value.isConnectServer = false
    }
    ws.onerror = (error) => {
      console.error(error)
      status.value.isConnectServer = false
    }
  }

  function redirectHomeIfInvalidCode(receiveCode: string) {
    if (!receiveCode) {
      router.replace(localePath('/'))
      return true
    }
    return false
  }

  // ShareYouSee 行政特征:P2P 完成后,通知服务端从 targets 移除本端点
  function sendConsumePush(codeToConsume: string) {
    if (!ws || !codeToConsume) return
    const walletId = userStore.walletInfo?.walletId || ''
    const deviceLabel = userStore.walletInfo?.deviceLabel || 'unknown'
    try {
      ws.send(
        JSON.stringify({
          type: 'consumePush',
          code: codeToConsume,
          walletId,
          deviceLabel
        })
      )
    } catch (e) {
      console.warn('consumePush send failed', e)
    }
  }

  function cleanup() {
    dispose()
  }

  return {
    isModernFileAPISupport,
    peerUserInfo,
    peerFilesInfo,
    selectedKeys,
    code,
    waitReceiveFileList,
    transmittedCount,
    receiveFileIndex,
    totalFileSize,
    totalTransmittedBytes,
    startTime,
    totalSpeed,
    durationTimeStr,
    remainingTimeStr,
    curFile,
    status,
    syncDirStatus,
    initialize,
    cleanup,
    redirectHomeIfInvalidCode,
    sendConsumePush,
    selectSyncDir,
    doReceive,
    downloadFile
  }
})
