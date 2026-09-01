// 联系人与群组类型。
// ContactRecord 以 walletId 为主键,endpoints 数组承载同一用户的多个设备端点。
// GroupRecord 引用 walletId 列表,不嵌套群组。

import type { DeviceLabel } from '~/types/wallet'

export interface ContactEndpoint {
  walletId: string
  publicKey: string
  deviceLabel: DeviceLabel
  lastSeenAt: number
  lastSeenVia: 'transfer' | 'presence' | 'manual'
}

export interface ContactRecord {
  walletId: string
  publicKey: string
  alias?: string
  endpoints: ContactEndpoint[]
  lastInteractionAt: number
  isSelf?: boolean
}

export interface GroupRecord {
  id: string
  name: string
  memberWalletIds: string[]
  createdAt: number
  updatedAt: number
}

export function createContactRecord(): ContactRecord {
  return {
    walletId: '',
    publicKey: '',
    endpoints: [],
    lastInteractionAt: 0
  }
}

export function createGroupRecord(): GroupRecord {
  return {
    id: '',
    name: '',
    memberWalletIds: [],
    createdAt: 0,
    updatedAt: 0
  }
}
