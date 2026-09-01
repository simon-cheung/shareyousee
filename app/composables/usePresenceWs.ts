// 全局常驻 ws,ShareYouSee 行政特征:
// - 仅用于 register 自身 presence + 接收服务端 pushList
// - 与 recipientTransfer 的"业务 ws"独立,二者可同存于不同 ws 连接
// - 后台默默连接,不暴露给用户;断线自动重连
// - 等待 wallet hydrate 后才连接(hasWallet 变 true 立即触发)
import { useRemoteTaskStore } from '~/stores/remoteTask'
import { useUserStore } from '~/stores/user'

let socket: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let pingTimer: ReturnType<typeof setInterval> | null = null
let currentWalletId = ''
let currentPublicKey = ''
let currentDeviceLabel = ''
let stopped = false
let stopWatcher: (() => void) | null = null

function getWsUrl() {
  if (typeof window === 'undefined') return ''
  return window.location.origin.replace(/^http/, 'ws') + '/api/connect'
}

function scheduleReconnect() {
  if (stopped) return
  if (reconnectTimer) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connect()
  }, 5e3)
}

function tryRequestPushList() {
  if (!socket || socket.readyState !== WebSocket.OPEN) return
  try {
    socket.send(JSON.stringify({ type: 'requestPushList' }))
  } catch (e) {
    console.warn('[presenceWs] requestPushList failed', e)
  }
}

function connect() {
  if (typeof window === 'undefined') return
  if (stopped) return
  const userStore = useUserStore()
  if (!userStore.hasWallet) return

  currentWalletId = userStore.walletInfo.walletId
  currentPublicKey = userStore.walletInfo.publicKey
  currentDeviceLabel = userStore.walletInfo.deviceLabel

  if (
    socket &&
    (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)
  ) {
    return
  }

  try {
    socket = new WebSocket(getWsUrl())
  } catch (e) {
    console.warn('[presenceWs] connect failed', e)
    scheduleReconnect()
    return
  }

  socket.onopen = () => {
    socket?.send(
      JSON.stringify({
        type: 'register',
        walletId: currentWalletId,
        publicKey: currentPublicKey,
        deviceLabel: currentDeviceLabel
      })
    )
    if (pingTimer) clearInterval(pingTimer)
    pingTimer = setInterval(() => {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'ping' }))
      }
    }, 25e3)
  }

  socket.onmessage = (ev) => {
    let data: any
    try {
      data = JSON.parse(ev.data)
    } catch {
      return
    }
    const remoteTaskStore = useRemoteTaskStore()
    if (data.type === 'pushList') {
      remoteTaskStore.setPendingList(data.data || [])
    }
  }

  socket.onclose = () => {
    if (pingTimer) {
      clearInterval(pingTimer)
      pingTimer = null
    }
    socket = null
    scheduleReconnect()
  }

  socket.onerror = () => {
    socket?.close()
  }
}

export function usePresenceWs() {
  if (typeof window === 'undefined') return { refresh: () => {}, requestPushList: () => {} }

  onMounted(() => {
    stopped = false
    const userStore = useUserStore()

    // watch hasWallet:钱包 hydrate / 切换 ID 时立即触发连接
    stopWatcher = watch(
      () => userStore.hasWallet,
      (now) => {
        if (now) {
          connect()
        } else if (socket) {
          try {
            socket.close()
          } catch (e) {
            console.warn(e)
          }
          socket = null
        }
      },
      { immediate: true }
    )
  })

  onBeforeUnmount(() => {
    stopped = true
    if (stopWatcher) {
      stopWatcher()
      stopWatcher = null
    }
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    if (pingTimer) {
      clearInterval(pingTimer)
      pingTimer = null
    }
    if (socket) {
      try {
        socket.close()
      } catch (e) {
        console.warn(e)
      }
      socket = null
    }
  })

  // 注册身份可能变更(切换 ID),允许手动触发立即重连
  function refresh() {
    if (socket) {
      try {
        socket.close()
      } catch (e) {
        console.warn(e)
      }
      socket = null
    }
    connect()
  }

  // 主动请求服务端再下发一次 pushList(用于"刷新"按钮)
  function requestPushList() {
    tryRequestPushList()
  }

  return { refresh, requestPushList }
}
