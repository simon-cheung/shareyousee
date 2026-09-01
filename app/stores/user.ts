import type { UserInfo } from '~/types/transfer'
import type { WalletInfo } from '~/types/wallet'
import {
  createWalletFromMnemonic,
  checkMnemonic,
  savePrivateKey,
  loadPrivateKey,
  clearPrivateKey
} from '~/utils/wallet'

/**
 * 用户偏好与身份信息仓库。
 * ShareYouSee 行政特征扩展:增加钱包(walletId/publicKey/deviceLabel)。
 * 私钥(CryptoKey)存于 IndexedDB,其他元数据存于 localStorage。
 */
export const useUserStore = defineStore('user', () => {
  const userInfo = reactive<UserInfo>({
    nickname: '',
    avatarURL: ''
  })
  const isConfirmDefault = ref(false)
  const hasInitialized = ref(false)

  // 钱包信息:只在加载本地存储后填充。walletInfo.walletId === '' 表示未生成
  const walletInfo = reactive<WalletInfo>({
    walletId: '',
    publicKey: '',
    createdAt: 0,
    deviceLabel: 'unknown',
    mnemonicAcknowledged: false
  })

  // CryptoKey 不能放进 reactive,放到 ref 之外独立持有
  let privateKey: CryptoKey | null = null

  function persistNickname() {
    if (import.meta.client) {
      localStorage.setItem('nickname', userInfo.nickname)
    }
  }

  function persistAvatar() {
    if (import.meta.client) {
      localStorage.setItem('avatarURL', userInfo.avatarURL)
    }
  }

  function persistWallet() {
    if (!import.meta.client) return
    localStorage.setItem('wallet', JSON.stringify(walletInfo))
  }

  function setNickname(nickname: string) {
    const nextNickname = nickname.trim().substring(0, 16)
    userInfo.nickname = nextNickname || `User_${genRandomString(6)}`
    persistNickname()
  }

  function setAvatarURL(url: string) {
    userInfo.avatarURL = url
    persistAvatar()
  }

  function setConfirmDefault(value: boolean) {
    isConfirmDefault.value = value
    if (import.meta.client) {
      localStorage.setItem('isConfirmDefault', JSON.stringify(value))
    }
  }

  function initAvatar() {
    if (!import.meta.client) {
      return
    }
    const fr = new FileReader()
    fr.onload = () => {
      setAvatarURL(`${fr.result || ''}`)
    }
    fetch('/akari.webp')
      .then((res) => res.blob())
      .then((blob) => fr.readAsDataURL(blob))
      .catch(console.warn)
  }

  function resetUserInfo() {
    setNickname('')
    initAvatar()
  }

  function openAvatarPicker() {
    selectAvatar((url) => {
      if (url) {
        setAvatarURL(url)
      }
    })
  }

  // ---------- 钱包相关 ----------

  // 当前是否已生成钱包
  const hasWallet = computed(() => Boolean(walletInfo.walletId))

  // 当前是否持有可用私钥(可能用户清过浏览器数据导致只剩元信息)
  const hasPrivateKey = computed(() => privateKey !== null)

  // 把外部传入的助记词生成为钱包
  async function generateWalletFromMnemonic(mnemonic: string) {
    // 兼容多种分隔形式(空格/换行/逗号/中文逗号)
    const normalized = mnemonic
      .trim()
      .replace(/[\s,，;；]+/g, ' ')
      .toLowerCase()
    if (!checkMnemonic(normalized)) {
      throw new Error('invalid mnemonic')
    }
    const { keyPair, publicKeyBase64, walletId } = await createWalletFromMnemonic(normalized)
    privateKey = keyPair.privateKey
    await savePrivateKey(privateKey)
    walletInfo.walletId = walletId
    walletInfo.publicKey = publicKeyBase64
    walletInfo.createdAt = Date.now()
    walletInfo.deviceLabel = detectDeviceLabelRuntime()
    walletInfo.mnemonicAcknowledged = false
    persistWallet()
    syncUserInfoFromWallet()
  }

  // 用户确认抄写完助记词
  function acknowledgeMnemonic() {
    walletInfo.mnemonicAcknowledged = true
    persistWallet()
  }

  // 重置(清掉私钥与元信息),用于换设备或销毁
  async function resetWallet() {
    privateKey = null
    await clearPrivateKey()
    walletInfo.walletId = ''
    walletInfo.publicKey = ''
    walletInfo.createdAt = 0
    walletInfo.mnemonicAcknowledged = false
    if (import.meta.client) {
      localStorage.removeItem('wallet')
    }
    // 同时清掉 userInfo 上的钱包标识
    userInfo.walletId = undefined
    userInfo.publicKey = undefined
    userInfo.deviceLabel = undefined
  }

  // 同步把 wallet 信息塞进 userInfo(用于 PeerDataChannel 的 user 消息)
  function syncUserInfoFromWallet() {
    if (!walletInfo.walletId) {
      userInfo.walletId = undefined
      userInfo.publicKey = undefined
      userInfo.deviceLabel = undefined
      return
    }
    userInfo.walletId = walletInfo.walletId
    userInfo.publicKey = walletInfo.publicKey
    userInfo.deviceLabel = walletInfo.deviceLabel
  }

  // 取私钥用于签名;仅在业务侧必要的地方被调用,避免泄露
  function getPrivateKey(): CryptoKey | null {
    return privateKey
  }

  // 设备标签检测(运行时)
  function detectDeviceLabelRuntime() {
    // 用同样逻辑的同步工具,避免与 utils/device 模块形成循环依赖
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

  function initializeFromStorage() {
    if (!import.meta.client || hasInitialized.value) {
      return
    }

    const nickname = localStorage.getItem('nickname')
    if (nickname) {
      userInfo.nickname = nickname
    } else {
      setNickname('')
    }

    const avatarURL = localStorage.getItem('avatarURL')
    if (avatarURL) {
      userInfo.avatarURL = avatarURL
    } else {
      initAvatar()
    }

    isConfirmDefault.value = getValFromLocalStorage('isConfirmDefault', false) || false

    // 恢复钱包元信息
    const walletRaw = localStorage.getItem('wallet')
    if (walletRaw) {
      try {
        const parsed = JSON.parse(walletRaw) as WalletInfo
        Object.assign(walletInfo, parsed)
        syncUserInfoFromWallet()
      } catch (e) {
        console.warn('wallet parse failed', e)
      }
    }

    // 异步尝试加载私钥(失败仅记录)
    loadPrivateKey()
      .then((k) => {
        privateKey = k
      })
      .catch((e) => console.warn('load private key failed', e))

    hasInitialized.value = true
  }

  return {
    userInfo,
    isConfirmDefault,
    hasInitialized,
    walletInfo,
    hasWallet,
    hasPrivateKey,
    setNickname,
    setAvatarURL,
    setConfirmDefault,
    initAvatar,
    resetUserInfo,
    openAvatarPicker,
    initializeFromStorage,
    generateWalletFromMnemonic,
    acknowledgeMnemonic,
    resetWallet,
    getPrivateKey
  }
})
