import { defineStore } from 'pinia'
import { ref, shallowRef, reactive, computed } from 'vue'
import type { UserInfo } from '@/types/transfer'
import type { WalletInfo } from '@/types/wallet'
import {
  createWalletFromMnemonic,
  checkMnemonic,
  savePrivateKey,
  loadPrivateKey,
  clearPrivateKey
} from '@/utils/wallet'
import { genRandomString, selectAvatar } from '@/utils'
import { idbGet, idbSet, idbDel } from '@/utils/storage'

const DB_NAMESPACE = 'shareyousee-prefs'

// IndexedDB 是用户场景下唯一可用的持久化(localStorage 在调试/隐私模式下会失败),
// 这里用 shareyousee-store.kv 同一个 store,把用户偏好也放进去。
async function kvGet(key: string): Promise<string | null> {
  try {
    const v = await idbGet<string>(key)
    return v ?? null
  } catch {
    return null
  }
}

async function kvSet(key: string, value: string): Promise<void> {
  try {
    await idbSet(key, value)
    console.log(`[user] kvSet ${key} OK (len=${value.length})`)
  } catch (e) {
    console.error(`[user] kvSet ${key} failed`, e)
  }
}

async function kvDel(key: string): Promise<void> {
  try {
    await idbDel(key)
  } catch (e) {
    console.error(`[user] kvDel ${key} failed`, e)
  }
}

/**
 * 用户偏好与身份信息仓库。
 * 调试模式 / 隐私模式下 localStorage 写入会被浏览器静默丢弃,
 * 因此所有持久化都走 IndexedDB.shareyousee-store.kv,这样不管浏览器什么模式都可靠。
 * 私钥(CryptoKey) 走 shareyousee-wallet.keys(extractable:false);
 * 其他元数据(nickname/avatar/isConfirm/wallet) 走 shareyousee-store.kv。
 */
export const useUserStore = defineStore('user', () => {
  const userInfo = reactive<UserInfo>({
    nickname: '',
    avatarURL: ''
  })
  const isConfirmDefault = ref(false)
  const hasInitialized = ref(false)
  const hasInitStarted = ref(false)

  const walletInfo = reactive<WalletInfo>({
    walletId: '',
    publicKey: '',
    createdAt: 0,
    deviceLabel: 'unknown',
    mnemonicAcknowledged: false
  })

  // CryptoKey 不能放进 reactive。用 shallowRef 避免 Vue 深度遍历 CryptoKey 内部字段
  // (CryptoKey 是 host object,内部 slot Vue 不能也不应遍历)。
  const privateKey = shallowRef<CryptoKey | null>(null)

  function persistNickname() {
    void kvSet(`${DB_NAMESPACE}:nickname`, userInfo.nickname)
  }

  function persistAvatar() {
    void kvSet(`${DB_NAMESPACE}:avatarURL`, userInfo.avatarURL)
  }

  function persistWallet() {
    void kvSet(`${DB_NAMESPACE}:wallet`, JSON.stringify(walletInfo))
  }

  function persistConfirmDefault() {
    void kvSet(`${DB_NAMESPACE}:isConfirmDefault`, JSON.stringify(isConfirmDefault.value))
  }

  function setNickname(nickname: string) {
    const nextNickname = nickname.trim().substring(0, 16)
    userInfo.nickname = nextNickname || `User_${genRandomString(6)}`
    console.log('[user] setNickname ->', userInfo.nickname)
    persistNickname()
  }

  function setAvatarURL(url: string) {
    userInfo.avatarURL = url
    console.log('[user] setAvatarURL len=%d', url.length)
    persistAvatar()
  }

  function setConfirmDefault(value: boolean) {
    isConfirmDefault.value = value
    console.log('[user] setConfirmDefault ->', value)
    persistConfirmDefault()
  }

  function initAvatar() {
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
      if (url) setAvatarURL(url)
    })
  }

  const hasWallet = computed(() => Boolean(walletInfo.walletId))
  const hasPrivateKey = computed(() => privateKey.value !== null)

  async function generateWalletFromMnemonic(mnemonic: string) {
    const normalized = mnemonic
      .trim()
      .replace(/[\s,，;；]+/g, ' ')
      .toLowerCase()
    if (!checkMnemonic(normalized)) {
      throw new Error('invalid mnemonic')
    }
    console.log('[user] generateWalletFromMnemonic: deriving keypair')
    const { keyPair, publicKeyBase64, walletId } = await createWalletFromMnemonic(normalized)
    console.log('[user] derive done, walletId=%s pubKey.len=%d', walletId, publicKeyBase64.length)
    privateKey.value = keyPair.privateKey
    console.log('[user] saving private key to IDB shareyousee-wallet/keys...')
    await savePrivateKey(privateKey.value)
    console.log('[user] private key saved')
    walletInfo.walletId = walletId
    walletInfo.publicKey = publicKeyBase64
    walletInfo.createdAt = Date.now()
    walletInfo.deviceLabel = detectDeviceLabelRuntime()
    walletInfo.mnemonicAcknowledged = false
    persistWallet()
    syncUserInfoFromWallet()
    console.log(
      '[user] generateWalletFromMnemonic done: walletId=%s hasWallet=%s hasPrivateKey=%s',
      walletId,
      hasWallet.value,
      hasPrivateKey.value
    )
  }

  function acknowledgeMnemonic() {
    walletInfo.mnemonicAcknowledged = true
    persistWallet()
  }

  async function resetWallet() {
    privateKey.value = null
    await clearPrivateKey()
    walletInfo.walletId = ''
    walletInfo.publicKey = ''
    walletInfo.createdAt = 0
    walletInfo.mnemonicAcknowledged = false
    await kvDel(`${DB_NAMESPACE}:wallet`)
    userInfo.walletId = undefined
    userInfo.publicKey = undefined
    userInfo.deviceLabel = undefined
  }

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

  function getPrivateKey(): CryptoKey | null {
    return privateKey.value
  }

  function detectDeviceLabelRuntime() {
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

  // 异步初始化:从 IndexedDB 读取所有用户偏好 + 钱包元数据 + 私钥
  // 必须在 useUserStore() 被调用后尽快触发一次。
  // 因为 store factory 不能 await,所以 fire-and-forget,但 hasInitialized 会变成 true 反映完成。
  function initializeFromStorage() {
    if (hasInitStarted.value) return
    hasInitStarted.value = true
    console.log('[user] initializeFromStorage start (IDB only)')
    void (async () => {
      try {
        const [nickname, avatarURL, isConfirm, walletRaw] = await Promise.all([
          kvGet(`${DB_NAMESPACE}:nickname`),
          kvGet(`${DB_NAMESPACE}:avatarURL`),
          kvGet(`${DB_NAMESPACE}:isConfirmDefault`),
          kvGet(`${DB_NAMESPACE}:wallet`)
        ])

        console.log(
          '[user] IDB read nickname=%s avatar=%s isConfirm=%s wallet=%s',
          nickname || '(empty)',
          avatarURL ? `${avatarURL.slice(0, 30)}...` : '(empty)',
          isConfirm,
          walletRaw ? 'present' : 'missing'
        )

        if (nickname) {
          userInfo.nickname = nickname
        } else {
          setNickname('')
        }

        if (avatarURL) {
          userInfo.avatarURL = avatarURL
        } else {
          initAvatar()
        }

        if (isConfirm !== null) {
          try {
            isConfirmDefault.value = JSON.parse(isConfirm) === true
          } catch {
            isConfirmDefault.value = false
          }
        }

        if (walletRaw) {
          try {
            const parsed = JSON.parse(walletRaw) as WalletInfo
            Object.assign(walletInfo, parsed)
            syncUserInfoFromWallet()
            console.log('[user] wallet restored from IDB:', parsed.walletId)
          } catch (e) {
            console.warn('[user] wallet parse failed', e)
          }
        }

        try {
          const k = await loadPrivateKey()
          privateKey.value = k
          console.log('[user] private key loaded:', k !== null)
        } catch (e) {
          console.warn('[user] load private key failed', e)
        }
      } catch (e) {
        console.error('[user] initializeFromStorage error', e)
      } finally {
        hasInitialized.value = true
        console.log('[user] initializeFromStorage done, hasInitialized=true')
      }
    })()
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
