import { TTLCache } from '@isaacs/ttlcache'
import { increaseTransCount } from '../utils/TransCount'
import {
  registerPeer,
  unregisterPeer,
  createPush,
  consumePush,
  walletIdOfPeer,
  deviceLabelOfPeer,
  pushListToPeer,
  type DeviceLabel,
  type FilesSnapshot,
  type TargetEndpoint
} from '../utils/presence'

// 客户端待初始化连接池,key 是 peer 的 id
const initPool = new TTLCache<string, any>({
  max: 8192,
  ttl: 600e3,
  dispose: (peer) => {
    if (!peer.isInited) {
      // 如果超时未初始化,则断开连接
      peer.close()
    }
  }
})

// 待连接连接池
// key 为:连接 ID
const waitConnectPool = new TTLCache<string, any>({
  max: 20000,
  ttl: 600e3,
  dispose: (peer) => {
    if (!peer.pairPeer) {
      peer.close()
    }
  }
})

// 已配对连接池
const initedPool = new TTLCache<string, any>({
  max: 20000,
  ttl: 30 * 60e3,
  dispose: (peer) => {
    peer.close()
  }
})

// 断开并清理连接
function disposePeer(peer: any) {
  initPool.delete(peer.id)
  initedPool.delete(peer.id)
  // ShareYouSee 行政特征:断开时同时从在线 presence 移除
  unregisterPeer(peer)
  peer.close()
  if (peer.pairPeer && peer.pairPeer.readyState === 1) {
    disposePeer(peer.pairPeer)
  }
}

// 心跳检测,避免掉线
function heartbeat(peer: any) {
  peer.send(JSON.stringify({ type: 'ping' }))
  if (peer.readyState === 1) {
    setTimeout(() => {
      heartbeat(peer)
    }, 5e3)
  }
}

// 初始化发送端
function initSend(peer: any) {
  if (peer.isInited) {
    return
  }
  let code = genDigitCode(4)
  let retryCount = 2048
  while (waitConnectPool.has(code)) {
    if (retryCount-- <= 0) {
      peer.send(JSON.stringify({ type: 'err', data: -1, msg: 'Init code fail' }))
      throw new Error('Init code fail')
    }
    // 碰撞时重新生成取件码
    code = genDigitCode(4)
  }
  waitConnectPool.set(code, peer)
  peer.isInited = true
  initPool.delete(peer.id)
  // 初始化发送端成功,返回连接码
  peer.send(JSON.stringify({ type: 'code', code: code }))
  heartbeat(peer)
}

// 初始化接收端
function initReceive(peer: any, code: string) {
  if (peer.pairPeer) {
    return
  }
  const targetPeer = waitConnectPool.get(code)
  if (!targetPeer || targetPeer.pairPeer) {
    peer.send(JSON.stringify({ type: 'status', code: 404 }))
    disposePeer(peer)
    return
  }
  targetPeer.pairPeer = peer
  peer.pairPeer = targetPeer

  waitConnectPool.delete(code)

  peer.isInited = true
  initedPool.set(peer.id, peer)
  initPool.delete(peer.id)
  initedPool.set(targetPeer.id, targetPeer)
  // 配对成功
  peer.send(JSON.stringify({ type: 'status', code: 0 }))
  heartbeat(peer)
  increaseTransCount()
}

export default defineWebSocketHandler({
  open(peer) {
    console.log(`${new Date().toISOString()} open: #${peer.id}`)
    initPool.set(peer.id, peer)
  },

  close(peer) {
    console.log(`${new Date().toISOString()} close: #${peer.id}`)
    disposePeer(peer)
  },

  message(peer: any, msg) {
    try {
      const data = JSON.parse(msg.text())
      if (data.type === 'send') {
        // 发送端初始化
        initSend(peer)
      } else if (data.type === 'receive') {
        // 接收端初始化(取件码与推送码共用一个 4 位数字池)
        const code = String(data.code || '')
        if (/^\d{4}$/.test(code)) {
          initReceive(peer, code)
        } else {
          // 如果 code 不是 4 位数字,则断开
          disposePeer(peer)
        }
      } else if (data.type === 'register') {
        // ShareYouSee 行政特征:注册在线 + 触发 pushList 回执
        registerPeer(
          peer,
          String(data.walletId || ''),
          String(data.publicKey || ''),
          (data.deviceLabel || 'unknown') as DeviceLabel
        )
      } else if (data.type === 'pendingPush') {
        // 发送方上报定向推送(code 与取件码同池,4 位数字)
        const code = String(data.code || '')
        if (!/^\d{4}$/.test(code)) return
        const rawTargets = Array.isArray(data.targets) ? data.targets : []
        const targets: TargetEndpoint[] = rawTargets
          .map((t: any) => ({
            walletId: String(t.walletId || ''),
            deviceLabel: t.deviceLabel as DeviceLabel | undefined
          }))
          .filter((t: TargetEndpoint) => t.walletId)
        const filesSnapshot: FilesSnapshot = data.filesSnapshot || {
          type: 'transFile',
          root: '',
          totalCount: 0,
          truncated: false,
          items: []
        }
        const ttl = Math.min(Math.max(Number(data.ttlSec) || 600, 60), 3600)
        createPush(
          code,
          String(data.senderWalletId || ''),
          String(data.senderPublicKey || ''),
          (data.senderDevice || 'unknown') as DeviceLabel,
          targets,
          filesSnapshot,
          ttl * 1000
        )
      } else if (data.type === 'consumePush') {
        // 接收端 P2P 完成后,告知服务端从 targets 中移除本端点
        const code = String(data.code || '')
        const walletId = String(data.walletId || walletIdOfPeer(peer) || '')
        const deviceLabel = String(
          data.deviceLabel || deviceLabelOfPeer(peer) || 'unknown'
        ) as DeviceLabel
        consumePush(code, walletId, deviceLabel)
      } else if (data.type === 'requestPushList') {
        // 客户端主动要求服务端再下发一次 pushList(刷新按钮)
        const walletId = walletIdOfPeer(peer)
        const deviceLabel = deviceLabelOfPeer(peer)
        if (walletId && deviceLabel) {
          pushListToPeer(peer, walletId, deviceLabel)
        }
      } else if (peer.pairPeer) {
        // 已配对的连接之间转发 SDP/ICE 等消息
        peer.pairPeer.send(msg.text())
      } else {
        disposePeer(peer)
      }
    } catch (e) {
      // console.warn(e)
      disposePeer(peer)
    }
  },

  error(peer, error) {
    console.warn(error)
    disposePeer(peer)
  }
})

function genDigitCode(length: number): string {
  if (length <= 0) {
    throw new Error('长度必须大于0')
  }

  let code = ''

  for (let i = 0; i < length; i++) {
    // 生成一个0到9之间的随机整数
    const digit = Math.floor(Math.random() * 10)
    // 将数字拼接到字符串中
    code += digit
  }

  return code
}
