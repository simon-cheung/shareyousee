// 设备标签识别与展示相关工具
import type { DeviceLabel } from '@/types/wallet'

export function getDeviceLabel(): DeviceLabel {
  if (typeof navigator === 'undefined') return 'unknown'
  const ua = navigator.userAgent || ''
  if (/iPhone/i.test(ua)) return 'iphone'
  if (/iPad/i.test(ua)) return 'ipad'
  if (/Android/i.test(ua)) return 'android'
  if (/Windows/i.test(ua)) return 'windows'
  if (/Mac/i.test(ua)) return 'mac'
  if (/Linux/i.test(ua)) return 'linux'
  return 'unknown'
}

const ICONS: Record<DeviceLabel, string> = {
  windows: 'solar:windows-broken',
  mac: 'solar:mac-broken',
  linux: 'solar:linux-broken',
  iphone: 'solar:smartphone-line-duotone',
  ipad: 'solar:tablet-line-duotone',
  android: 'solar:smartphone-line-duotone',
  web: 'solar:browser-line-duotone',
  unknown: 'solar:question-square-line-duotone'
}

export function getDeviceIcon(label: DeviceLabel): string {
  return ICONS[label] || ICONS.unknown
}
