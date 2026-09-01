// 任务日志类型:每次传输收发写入一条 task 记录,持久化在 localStorage
import type { DeviceLabel } from './wallet'
import type { TransferType } from './transfer'

export interface TaskFilesSnapshot {
  type: TransferType
  root: string
  totalCount: number
  truncated: boolean
  items: Array<{
    key: string
    path: string
    lastModified: number
    size: number
  }>
}

export interface TaskRecord {
  id: string
  role: 'sender' | 'recipient'
  type: TransferType
  peerWalletId?: string
  peerDeviceLabel?: DeviceLabel
  peerNickname?: string
  status: 'pending' | 'done' | 'err'
  startTime: number
  endTime?: number
  totalBytes: number
  transmittedBytes: number
  errorCode?: number
  isPushed?: boolean
  filesSnapshot: TaskFilesSnapshot
}

export function createTaskRecord(): TaskRecord {
  return {
    id: '',
    role: 'sender',
    type: '',
    status: 'pending',
    startTime: 0,
    totalBytes: 0,
    transmittedBytes: 0,
    filesSnapshot: {
      type: '',
      root: '',
      totalCount: 0,
      truncated: false,
      items: []
    }
  }
}

// 从 fileMap 抽取快照(只保留元数据,不含文件 blob)
export function snapshotFromFileMap(
  type: TransferType,
  fileMap: Record<string, any>,
  root: string
): TaskFilesSnapshot {
  const items = Object.entries(fileMap).map(([key, item]) => ({
    key,
    path: (item.paths || []).join('/'),
    lastModified: Number(item.lastModified) || 0,
    size: Number(item.size) || 0
  }))
  // 单条限制 16 KB,文件过多时截断到前 200 条
  const MAX_ITEMS = 200
  const truncated = items.length > MAX_ITEMS
  return {
    type,
    root,
    totalCount: items.length,
    truncated,
    items: truncated ? items.slice(0, MAX_ITEMS) : items
  }
}
