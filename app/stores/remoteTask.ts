import type { DeviceLabel } from '~/types/wallet'
import type { TaskFilesSnapshot } from '~/types/task'

/**
 * ShareYouSee 行政特征:接收端定向推送任务
 * 由服务端在 ws.register 后通过 pushList 消息下发,不入 localStorage
 */
export interface RemoteTask {
  code: string
  fromWalletId: string
  fromDevice: DeviceLabel
  fromPublicKey: string
  filesSnapshot: TaskFilesSnapshot
  createdAt: number
}

/**
 * 远程任务仓库。
 * 接收端 register 时由服务端 pushList 填充;用户点接收触发 consumePush 后本地移除。
 * 不持久化(只在当前 ws 会话内有效)。
 */
export const useRemoteTaskStore = defineStore('remoteTask', () => {
  const pendingList = ref<RemoteTask[]>([])
  // 锁定中的 code(正在接收中):pushList 写入时过滤,避免红点复活
  const lockedCode = ref('')

  function setPendingList(list: RemoteTask[]) {
    pendingList.value = list.filter((t) => t.code !== lockedCode.value)
  }

  function markLocalConsumed(code: string) {
    pendingList.value = pendingList.value.filter((t) => t.code !== code)
  }

  function lockCode(code: string) {
    lockedCode.value = code
    pendingList.value = pendingList.value.filter((t) => t.code !== code)
  }

  function unlockCode(code: string) {
    if (lockedCode.value === code) {
      lockedCode.value = ''
    }
  }

  function clear() {
    pendingList.value = []
    lockedCode.value = ''
  }

  return {
    pendingList,
    lockedCode,
    setPendingList,
    markLocalConsumed,
    lockCode,
    unlockCode,
    clear
  }
})
