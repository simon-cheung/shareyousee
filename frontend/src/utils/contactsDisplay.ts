// 联系人展示名解析工具
// alias 优先,缺则兜底 walletId 短串;若关联端点存在,附带设备标签
import type { ContactRecord } from '@/types/contacts'

function shortId(id: string): string {
  return id ? `${id.slice(0, 6)}…${id.slice(-4)}` : ''
}

/**
 * 取得联系人展示名 + 设备标签
 * - alias + 最近一个端点 deviceLabel: "Alice@mac"
 * - alias 缺: "1a2b…ef9c@iphone"
 * - 端点缺: alias 或 walletId 短串
 */
export function getContactDisplay(
  rec: ContactRecord | null | undefined,
  walletId: string,
  deviceLabel?: string
): string {
  const alias = rec?.alias?.trim()
  // 端点:优先显式传入,其次取最近一个端点
  const ep = deviceLabel || rec?.endpoints?.[rec.endpoints.length - 1]?.deviceLabel
  const idShort = shortId(walletId)
  if (alias && ep) return `${alias}@${ep}`
  if (alias) return alias
  if (ep) return `${idShort}@${ep}`
  return idShort
}

/** 仅获取 alias 兜底短串,不含设备标签(用于窄空间) */
export function getContactShort(rec: ContactRecord | null | undefined, walletId: string): string {
  const alias = rec?.alias?.trim()
  return alias || shortId(walletId)
}
