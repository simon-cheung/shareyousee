// 钱包工具:完全在浏览器侧生成/导入 BIP39 助记词、派生密钥对、签名验签。
// 服务端永远不接触助记词、私钥或种子,只看到 walletId + 公钥。

import { mnemonicToSeedSync, generateMnemonic, validateMnemonic } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english'
import { sha256 } from '@noble/hashes/sha256'
import { p256 } from '@noble/curves/p256'
import type { DeviceLabel, MnemonicStrength } from '~/types/wallet'

const STORAGE_DB_NAME = 'shareyousee-wallet'
const STORAGE_STORE = 'keys'
const STORAGE_KEY_ID = 'self-signing'

// ---------- 助记词 ----------

// 生成指定强度的随机助记词(英文词表,默认 128-bit = 12 词)
export function genMnemonic(strength: MnemonicStrength = 128): string {
  return generateMnemonic(wordlist, strength)
}

// 校验助记词是否合法(checksum + 词表);接受空格/换行/Tab/英文逗号/中文逗号 分隔
export function checkMnemonic(words: string): boolean {
  const normalized = normalizeMnemonic(words)
  return validateMnemonic(normalized, wordlist)
}

// 把任意分隔形式(空格/换行/逗号/中文逗号)统一为单空格
export function normalizeMnemonic(input: string): string {
  return String(input || '')
    .replace(/[\s,，;；]+/g, ' ')
    .trim()
    .toLowerCase()
}

// 把助记词切成单词数组,过滤空字符串
export function mnemonicToWords(words: string): string[] {
  return words.trim().split(/\s+/).filter(Boolean)
}

// 把单词数组还原为单行字符串(空格分隔)
export function wordsToMnemonic(words: string[]): string {
  return words.map((w) => w.trim().toLowerCase()).join(' ')
}

// ---------- 派生 ----------

// 助记词 → 64 字节种子(同步,使用 PBKDF2-HMAC-SHA512),纯前端
function deriveSeed(words: string, passphrase = ''): Uint8Array {
  return mnemonicToSeedSync(words, passphrase)
}

// 种子 → ECDSA P-256 密钥对(extractable:false 保证私钥不能被导出为明文)
async function deriveKeyPairFromSeed(seed: Uint8Array): Promise<CryptoKeyPair> {
  // 用种子 SHA-256 后作为 IKM 输入,保证固定 32 字节
  const ikm = sha256(seed)
  return importEccKeyFromIkm(ikm)
}

// 从 IKM 派生稳定的 ECDSA P-256 密钥对
// 用 @noble/curves 在 JS 端做确定性私钥 → 公钥推导(避开浏览器 WebCrypto 对 raw 私钥
// 导入 ECDH 的兼容性差异),然后用 PKCS8 / SPKI 包装后导入 WebCrypto 仅用于 sign / verify。
async function importEccKeyFromIkm(ikm: Uint8Array): Promise<CryptoKeyPair> {
  // 兼容浏览器与 Node 19+ 全局 WebCrypto
  const g: any = globalThis as any
  const subtle: SubtleCrypto | undefined = g.crypto?.subtle
  if (!subtle) {
    // 给出清晰错误:Secure Context 检查(浏览器在非 HTTPS / 非 localhost 时禁用 SubtleCrypto)
    const isSecure = typeof g.isSecureContext === 'boolean' ? g.isSecureContext : null
    const loc =
      typeof g.location !== 'undefined' ? `${g.location.protocol}//${g.location.host}` : 'n/a'
    throw new Error(
      `SubtleCrypto unavailable. isSecureContext=${isSecure}, location=${loc}. ` +
        `WebCrypto requires HTTPS or http://localhost / http://127.0.0.1.`
    )
  }
  try {
    // HKDF 派生 32 字节私钥标量
    const hkdfKey = await subtle.importKey('raw', ikm, { name: 'HKDF' }, false, ['deriveBits'])
    const rawPriv = new Uint8Array(
      await subtle.deriveBits(
        {
          name: 'HKDF',
          hash: 'SHA-256',
          salt: new Uint8Array(),
          info: new TextEncoder().encode('shareyousee:signing:v1')
        },
        hkdfKey,
        256
      )
    )
    console.log('[wallet] step 2: rawPriv length', rawPriv.length)
    // 用 @noble/curves 在 JS 端计算 P-256 公钥(确定性,跨设备稳定)
    const pubPoint = p256.ProjectivePoint.fromPrivateKey(rawPriv)
    // 要 uncompressed(0x04 || X || Y)以拆 X 与 Y;默认 true 是 compressed,会截断 Y
    const rawPub = pubPoint.toRawBytes(false)
    if (rawPub.length !== 65) {
      throw new Error(`Unexpected pubPoint length: ${rawPub.length}`)
    }
    const x = bufToB64u(rawPub.slice(1, 33))
    const y = bufToB64u(rawPub.slice(33, 65))
    const d = bufToB64u(rawPriv)

    // 导入不可导出私钥(只能 sign)
    const privJwk: JsonWebKey = {
      kty: 'EC',
      crv: 'P-256',
      x,
      y,
      d,
      ext: false,
      key_ops: ['sign']
    }
    const privKey = await subtle.importKey(
      'jwk',
      privJwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign']
    )
    console.log('[wallet] step 4: privKey imported')
    // 导入可导出公钥(只能 verify);用同样的 X, Y 构造
    const pubJwk: JsonWebKey = {
      kty: 'EC',
      crv: 'P-256',
      x,
      y,
      ext: true,
      key_ops: ['verify']
    }
    const pubKeyFinal = await subtle.importKey(
      'jwk',
      pubJwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['verify']
    )
    console.log('[wallet] step 5: pubKey imported, all done')
    return { privateKey: privKey, publicKey: pubKeyFinal }
  } catch (e) {
    console.error('[wallet] importEccKeyFromIkm failed:', e)
    throw e
  }
}

// 把 32 字节私钥标量包装成 P-256 的 JWK(ext:true 必须配 extractable:true)
// 注:WebCrypto 不允许只含 d 的私钥 jwk,需同时提供 x, y,故此函数已被替换。
// function buildEcJwkFromPrivateScalar(d: Uint8Array): JsonWebKey {
//   return {
//     kty: 'EC',
//     crv: 'P-256',
//     d: bufToB64u(d),
//     key_ops: ['sign'],
//     ext: true
//   }
// }

function bufToB64u(buf: Uint8Array): string {
  let s = ''
  for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i])
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64uToBuf(s: string): Uint8Array {
  s = s.replace(/-/g, '+').replace(/_/g, '/')
  while (s.length % 4) s += '='
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

// 从助记词生成完整钱包(返回 CryptoKeyPair,公钥 base64 SPKI,以及 walletId)
export async function createWalletFromMnemonic(
  words: string
): Promise<{ keyPair: CryptoKeyPair; publicKeyBase64: string; walletId: string }> {
  const seed = deriveSeed(words)
  const keyPair = await deriveKeyPairFromSeed(seed)
  const spki = new Uint8Array(await window.crypto.subtle.exportKey('spki', keyPair.publicKey))
  const walletId = await deriveWalletId(spki)
  return {
    keyPair,
    publicKeyBase64: bufToB64(spki),
    walletId
  }
}

// 公钥 SPKI → walletId(SHA-256 前 8 字节,hex 16 位)
export async function deriveWalletId(spki: Uint8Array): Promise<string> {
  const h = sha256(spki)
  let s = ''
  for (let i = 0; i < 8; i++) s += h[i].toString(16).padStart(2, '0')
  return s
}

// ---------- 公钥导入/导出 ----------

export async function importPublicKey(base64Spki: string): Promise<CryptoKey> {
  const bytes = base64ToBuf(base64Spki)
  return window.crypto.subtle.importKey(
    'spki',
    bytes,
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['verify']
  )
}

export async function exportPublicKey(pub: CryptoKey): Promise<string> {
  const spki = new Uint8Array(await window.crypto.subtle.exportKey('spki', pub))
  return bufToB64(spki)
}

function bufToB64(buf: Uint8Array): string {
  let s = ''
  for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i])
  return btoa(s)
}

function base64ToBuf(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

// ---------- 签名 / 验签 ----------

export async function signMessage(privKey: CryptoKey, message: string): Promise<string> {
  const sig = await window.crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privKey,
    new TextEncoder().encode(message)
  )
  return bufToB64(new Uint8Array(sig))
}

export async function verifyMessage(
  pubKey: CryptoKey,
  message: string,
  signatureBase64: string
): Promise<boolean> {
  const sig = base64ToBuf(signatureBase64)
  return window.crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    pubKey,
    sig,
    new TextEncoder().encode(message)
  )
}

// ---------- IndexedDB 包装:仅用于持久化 non-extractable 私钥 ----------

// 浏览器侧轻量 IDB 封装:不开新依赖,只为存一个 CryptoKey
// 私钥以 extractable:false 存储,即使数据被读出,也不能被还原成原始字节
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(STORAGE_DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORAGE_STORE)) {
        db.createObjectStore(STORAGE_STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function savePrivateKey(priv: CryptoKey): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORAGE_STORE, 'readwrite')
    tx.objectStore(STORAGE_STORE).put(priv, STORAGE_KEY_ID)
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error)
    }
  })
}

export async function loadPrivateKey(): Promise<CryptoKey | null> {
  try {
    const db = await openDb()
    return await new Promise<CryptoKey | null>((resolve, reject) => {
      const tx = db.transaction(STORAGE_STORE, 'readonly')
      const req = tx.objectStore(STORAGE_STORE).get(STORAGE_KEY_ID)
      req.onsuccess = () => {
        const result = req.result as CryptoKey | undefined
        db.close()
        // 校验:必须是 CryptoKey 且 type === 'private'
        if (result && typeof result === 'object' && 'type' in result && result.type === 'private') {
          resolve(result)
        } else {
          // 类型不符,清理掉脏数据
          clearPrivateKey().catch(() => undefined)
          resolve(null)
        }
      }
      req.onerror = () => {
        db.close()
        reject(req.error)
      }
    })
  } catch (e) {
    // 任何 I/O 错误(数据库坏/版本不兼容)都清空重来
    console.warn('loadPrivateKey failed, resetting', e)
    try {
      await clearPrivateKey()
    } catch {
      // ignore
    }
    return null
  }
}

export async function clearPrivateKey(): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORAGE_STORE, 'readwrite')
    tx.objectStore(STORAGE_STORE).delete(STORAGE_KEY_ID)
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error)
    }
  })
}

// ---------- 设备标签 ----------

export function detectDeviceLabel(): DeviceLabel {
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

export { b64uToBuf }
