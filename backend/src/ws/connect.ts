// WebSocket 信令服务:从原 server/api/connect.ts 平移
// 框架:Fastify + @fastify/websocket,行为与 Nitro crossws 等价。
//
// 关键消息类型(前后端协议不变):
// - 'send'         : 发送端请求分配取件码
// - 'receive'      : 接收端用 code 配对(code 4 位数字)
// - 'register'     : ShareYouSee 行政特征:上报在线身份 + 触发 pushList 回执
// - 'pendingPush'  : 发送方定向推送(仅通知 targets,不改变取件码语义)
// - 'consumePush'  : 接收端 P2P 完成后,从 targets 中移除本端点
// - 'requestPushList' : 客户端主动要求服务端再下发一次 pushList
// - 'sdp' / 'candidate' : 已配对连接之间的 SDP/ICE 中转
// - 'code' / 'status' : 服务端回执
// - 'ping'         : 心跳

import { TTLCache } from '@isaacs/ttlcache'
import type { RawData, WebSocket } from 'ws'
import { increaseTransCount } from '../utils/TransCount'
import {
  registerPeer,
  unregisterPeer,
  createPush,
  consumePush,
  walletIdOfPeer,
  deviceLabelOfPeer,
  pushListToPeer,
  pendingPushes,
  type DeviceLabel,
  type FilesSnapshot,
  type TargetEndpoint,
  type SignalingPeer
} from './presence'

// 共享业务状态:从原 connect.ts 平移,保留 key 命名与 TTL 语义
// 客户端待初始化连接池,key 是 peer 的 id
export const initPool = new TTLCache<
  string,
  SignalingPeer & { isInited?: boolean; pairPeer?: any }
>({
  max: 8192,
  ttl: 600e3,
  dispose: (peer) => {
    if (!peer.isInited) {
      // 如果超时未初始化,则断开连接
      try {
        peer.close()
      } catch (e) {
        // ignore
      }
    }
  }
})

// 待连接连接池(key = code)
export const waitConnectPool = new TTLCache<
  string,
  SignalingPeer & { isInited?: boolean; pairPeer?: any }
>({
  max: 20000,
  ttl: 600e3,
  dispose: (peer) => {
    if (!peer.pairPeer) {
      try {
        peer.close()
      } catch (e) {
        // ignore
      }
    }
  }
})

// 已配对连接池
export const initedPool = new TTLCache<
  string,
  SignalingPeer & { isInited?: boolean; pairPeer?: any }
>({
  max: 20000,
  ttl: 30 * 60e3,
  dispose: (peer) => {
    try {
      peer.close()
    } catch (e) {
      // ignore
    }
  }
})

// 断开并清理连接
function disposePeer(peer: any) {
  initPool.delete(peer.id)
  initedPool.delete(peer.id)
  for (const [code, value] of waitConnectPool.entries()) {
    if (value === peer) waitConnectPool.delete(code)
  }
  unregisterPeer(peer)
  try {
    peer.close()
  } catch (e) {
    // ignore
  }
  if (peer.pairPeer && peer.pairPeer.readyState === 1) {
    disposePeer(peer.pairPeer)
  }
}

// 心跳检测,避免掉线
function heartbeat(peer: any) {
  try {
    peer.send(JSON.stringify({ type: 'ping' }))
  } catch (e) {
    // ignore
  }
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
    code = genDigitCode(4)
  }
  waitConnectPool.set(code, peer)
  peer.isInited = true
  initPool.delete(peer.id)
  // 初始化发送端成功,返回连接码
  peer.send(JSON.stringify({ type: 'code', code: code }))
  heartbeat(peer)
}

// 初始化接收端:任何持码人可取(原有取件码语义)
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

// 处理一条文本消息:从原 connect.ts 平移
export function handleMessage(peer: any, raw: string | Buffer) {
  try {
    const msg = typeof raw === 'string' ? raw : raw.toString('utf8')
    const data = JSON.parse(msg)
    if (data.type === 'send') {
      initSend(peer)
    } else if (data.type === 'receive') {
      const code = String(data.code || '')
      if (/^\d{4}$/.test(code)) {
        initReceive(peer, code)
      } else {
        // 如果 code 不是 4 位数字,则断开
        disposePeer(peer)
      }
    } else if (data.type === 'register') {
      registerPeer(
        peer,
        String(data.walletId || ''),
        String(data.publicKey || ''),
        (data.deviceLabel || 'unknown') as DeviceLabel
      )
    } else if (data.type === 'pendingPush') {
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
      const code = String(data.code || '')
      const walletId = String(data.walletId || walletIdOfPeer(peer) || '')
      const deviceLabel = String(
        data.deviceLabel || deviceLabelOfPeer(peer) || 'unknown'
      ) as DeviceLabel
      consumePush(code, walletId, deviceLabel)
    } else if (data.type === 'requestPushList') {
      const walletId = walletIdOfPeer(peer)
      const deviceLabel = deviceLabelOfPeer(peer)
      if (walletId && deviceLabel) {
        pushListToPeer(peer, walletId, deviceLabel)
      }
    } else if (data.type === 'ping') {
      // 心跳 echo:忽略,不 dispose(客户端 usePresenceWs 每 25s ping 一次保活)
    } else if (peer.pairPeer) {
      // 已配对的连接之间转发 SDP/ICE 等消息
      peer.pairPeer.send(typeof raw === 'string' ? raw : raw.toString('utf8'))
    } else {
      disposePeer(peer)
    }
  } catch (e) {
    disposePeer(peer)
  }
}

// 处理 ws 连接生命周期:open/close/message/error
// socket 来自 @fastify/websocket(底层是 ws 包的 WebSocket)
export function bindConnectionHandlers(socket: WebSocket, id: string) {
  // 包装 socket:WebSocket 实例本身禁止赋值 id / readyState 等字段,
  // 用一个 proxy 对象持有可写状态,内部委托 send / close / on 到原 socket。
  const peer: SignalingPeer & { isInited?: boolean; pairPeer?: any } = {
    id,
    readyState: socket.readyState,
    send(data: string) {
      try {
        socket.send(data)
      } catch (e) {
        // ignore
      }
    },
    close() {
      try {
        socket.close()
      } catch (e) {
        // ignore
      }
    }
  }

  socket.on('close', () => {
    console.log(`${new Date().toISOString()} close: #${id}`)
    peer.readyState = socket.readyState
    disposePeer(peer)
  })

  socket.on('message', (data: RawData) => {
    handleMessage(peer, data as any)
  })

  socket.on('error', (error: Error) => {
    console.warn(error)
    disposePeer(peer)
  })

  // 立刻把 peer 加入 initPool,因为 @fastify/websocket 暴露 socket 时已是 OPEN 状态
  console.log(`${new Date().toISOString()} open: #${id}`)
  peer.readyState = socket.readyState
  initPool.set(peer.id, peer as any)
}

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