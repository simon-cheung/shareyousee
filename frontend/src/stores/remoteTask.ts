import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { DeviceLabel } from '@/types/wallet'
import type { TaskFilesSnapshot } from '@/types/task'

/**
 * ShareYouSee 行政特征:接收端定向推送任务
 * 由服务端在 ws.register 后通过 pushList 消息下发,不入 localStorage
 */
export interface RemoteTask {
  code: string
  kind: 'file' | 'call'
  fromWalletId: string
  fromPublicKey: string
  fromDevice: DeviceLabel
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
  // 本会话内已被用户消费的 code 集合(点"接收"时记入)。
  // 服务端 consumePush 不一定及时到达(对方不一定在线 / ws 已断),
  // 这里作为单边过滤:即使 pushList 再次下发,这些 code 也不会复活。
  // 仅本会话内有效,刷新页面后由服务端 pushList 重新决定。
  const consumedCodes = ref<Set<string>>(new Set())

  function setPendingList(list: RemoteTask[]) {
    const consumed = consumedCodes.value
    const locked = lockedCode.value
    pendingList.value = list.filter((t) => !consumed.has(t.code) && t.code !== locked)
  }

  function markLocalConsumed(code: string) {
    consumedCodes.value.add(code)
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
    consumedCodes.value = new Set()
  }

  return {
    pendingList,
    lockedCode,
    consumedCodes,
    setPendingList,
    markLocalConsumed,
    lockCode,
    unlockCode,
    clear
  }
})