// 在线状态与定向推送注册表(ShareYouSee 行政特征)。
// 服务端不接触任何私钥/助记词,只持有 walletId + 公钥 + 设备标签 + 取件码-目标映射。
//
// 关键约束:
// - key = code(4 位数字),与现有取件码共用一个名字空间;唯一性由 waitConnectPool 保证
// - 不做实时推送:服务端不主动通知接收方,接收端 ws.onopen 时 register 一次,服务端顺势 pushList
// - 清理按现有条件:TTL 过期 + consumePush 删除对应 target

import { TTLCache } from '@isaacs/ttlcache'

export type DeviceLabel =
  'windows' | 'mac' | 'linux' | 'iphone' | 'ipad' | 'android' | 'web' | 'unknown'

export interface TargetEndpoint {
  walletId: string
  deviceLabel?: DeviceLabel
}

export interface FilesSnapshot {
  type: 'transFile' | 'transDir' | 'syncDir'
  root: string
  totalCount: number
  truncated: boolean
  items: Array<{ key: string; path: string; lastModified: number; size: number }>
}

export interface PendingPush {
  code: string
  senderWalletId: string
  senderPublicKey: string
  senderDevice: DeviceLabel
  filesSnapshot: FilesSnapshot
  targets: TargetEndpoint[]
  createdAt: number
  ttl: number
}

// 抽象的 peer 接口:与 ws 框架无关,便于在 Fastify / Bun / crossws 之间适配
export interface SignalingPeer {
  id: string
  readyState: number
  send(data: string): void
  close(): void
}

// 推送任务池;max 与 ttl 跟 waitConnectPool 解耦
export const pendingPushes = new TTLCache<string, PendingPush>({
  max: 4096,
  ttl: 600 * 1000 // 600 秒
})

// peer → walletId / deviceLabel,用于 initReceive 后服务端反查消费方
const peerToPresenceKey = new WeakMap<SignalingPeer, string>()
const peerToDeviceLabel = new WeakMap<SignalingPeer, DeviceLabel>()

// 注册在线,同时主动 pushList 给该端点
export function registerPeer(
  peer: SignalingPeer,
  walletId: string,
  _publicKey: string,
  deviceLabel: DeviceLabel
) {
  if (!walletId) return
  peerToPresenceKey.set(peer, walletId)
  peerToDeviceLabel.set(peer, deviceLabel)
  pushListToPeer(peer, walletId, deviceLabel)
}

export function unregisterPeer(peer: SignalingPeer) {
  peerToPresenceKey.delete(peer)
  peerToDeviceLabel.delete(peer)
}

// 主动给端点推送匹配的任务列表(单次)
export function pushListToPeer(peer: SignalingPeer, walletId: string, deviceLabel: DeviceLabel) {
  const list = findMatchingPushes(walletId, deviceLabel)
  if (list.length === 0) return
  const payload = JSON.stringify({
    type: 'pushList',
    data: list.map((p) => ({
      code: p.code,
      fromWalletId: p.senderWalletId,
      fromDevice: p.senderDevice,
      fromPublicKey: p.senderPublicKey,
      filesSnapshot: p.filesSnapshot,
      createdAt: p.createdAt
    }))
  })
  try {
    peer.send(payload)
  } catch (e) {
    console.warn('pushList send failed', e)
  }
}

// 过滤:targets 中任一项匹配 (walletId, deviceLabel)
export function findMatchingPushes(walletId: string, deviceLabel: DeviceLabel): PendingPush[] {
  const list: PendingPush[] = []
  for (const push of pendingPushes.values()) {
    const hit = push.targets.some(
      (t) => t.walletId === walletId && (!t.deviceLabel || t.deviceLabel === deviceLabel)
    )
    if (hit) list.push(push)
  }
  return list
}

// 消费一项 target;targets 全空才 delete(code);传输中断/超时由 TTL 兜底
export function consumePush(
  code: string,
  walletId: string,
  deviceLabel: DeviceLabel
): PendingPush | null {
  const push = pendingPushes.get(code)
  if (!push) return null
  const before = push.targets.length
  push.targets = push.targets.filter(
    (t) => !(t.walletId === walletId && (!t.deviceLabel || t.deviceLabel === deviceLabel))
  )
  if (push.targets.length === before) return null
  if (push.targets.length === 0) pendingPushes.delete(code)
  return push
}

// 创建推送(code 已由现有 initSend 生成,4 位取件码)
export function createPush(
  code: string,
  senderWalletId: string,
  senderPublicKey: string,
  senderDevice: DeviceLabel,
  targets: TargetEndpoint[],
  filesSnapshot: FilesSnapshot,
  ttl: number
): PendingPush {
  const rec: PendingPush = {
    code,
    senderWalletId,
    senderPublicKey,
    senderDevice,
    filesSnapshot,
    targets,
    createdAt: Date.now(),
    ttl
  }
  pendingPushes.set(code, rec)
  return rec
}

export function walletIdOfPeer(peer: SignalingPeer): string | undefined {
  return peerToPresenceKey.get(peer)
}

export function deviceLabelOfPeer(peer: SignalingPeer): DeviceLabel | undefined {
  return peerToDeviceLabel.get(peer)
}
