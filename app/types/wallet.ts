// 钱包身份相关类型。walletId 是用户的对外标识,由公钥派生而来,不可逆。
// 私钥/助记词/种子永远不离开浏览器,服务端只看到 walletId + 公钥。

export type MnemonicStrength = 128 | 160 | 192 | 224 | 256

export interface WalletInfo {
  // 由公钥 SHA-256 前 16 hex 派生,作为用户对外 ID
  walletId: string
  // base64 SPKI,用于签名验签
  publicKey: string
  // 钱包创建时间(epoch ms)
  createdAt: number
  // 当前设备标签(同 walletId 多端点共享一份公钥,但每个端点有自己的 deviceLabel)
  deviceLabel: DeviceLabel
  // 标记用户是否已确认抄写助记词
  mnemonicAcknowledged: boolean
}

export type DeviceLabel =
  | 'windows'
  | 'mac'
  | 'linux'
  | 'iphone'
  | 'ipad'
  | 'android'
  | 'web'
  | 'unknown'

export function createWalletInfo(): WalletInfo {
  return {
    walletId: '',
    publicKey: '',
    createdAt: 0,
    deviceLabel: 'unknown',
    mnemonicAcknowledged: false
  }
}
