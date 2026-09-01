import type { TaskRecord } from '~/types/task'

/**
 * 任务日志仓库。
 * 记录每次传输的元数据 + 文件清单快照,持久化到 localStorage。
 */
export const useTaskStore = defineStore('task', () => {
  const tasks = ref<TaskRecord[]>([])
  const hasInitialized = ref(false)
  const MAX_TASKS = 200

  function persist() {
    if (!import.meta.client) return
    localStorage.setItem('sy-tasks', JSON.stringify(tasks.value))
  }

  function initialize() {
    if (!import.meta.client || hasInitialized.value) return
    try {
      const raw = localStorage.getItem('sy-tasks')
      if (raw) tasks.value = JSON.parse(raw)
    } catch (e) {
      console.warn('tasks parse failed', e)
    }
    hasInitialized.value = true
  }

  // 创建并入栈 pending 任务;返回 id
  function addPending(record: TaskRecord): string {
    const id = record.id || crypto.randomUUID()
    const rec: TaskRecord = {
      ...record,
      id,
      status: 'pending',
      startTime: record.startTime || Date.now()
    }
    tasks.value.unshift(rec)
    if (tasks.value.length > MAX_TASKS) {
      tasks.value = tasks.value.slice(0, MAX_TASKS)
    }
    persist()
    return id
  }

  function complete(id: string, patch: Partial<TaskRecord>) {
    const rec = tasks.value.find((t) => t.id === id)
    if (!rec) return
    Object.assign(rec, patch, {
      status: patch.status || 'done',
      endTime: patch.endTime || Date.now()
    })
    persist()
  }

  // 刷新对端信息(任务进行中获取到更准确的昵称/设备标签时)
  function updatePeer(id: string, patch: Partial<TaskRecord>) {
    const rec = tasks.value.find((t) => t.id === id)
    if (!rec) return
    if (patch.peerWalletId) rec.peerWalletId = patch.peerWalletId
    if (patch.peerDeviceLabel) rec.peerDeviceLabel = patch.peerDeviceLabel
    if (patch.peerNickname) rec.peerNickname = patch.peerNickname
    persist()
  }

  function setError(id: string, errorCode: number) {
    complete(id, { status: 'err', errorCode, endTime: Date.now() })
  }

  function clear() {
    tasks.value = []
    persist()
  }

  return {
    tasks,
    hasInitialized,
    initialize,
    addPending,
    complete,
    updatePeer,
    setError,
    clear
  }
})
