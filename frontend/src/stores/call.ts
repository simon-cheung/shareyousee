import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { PeerMedia, type MediaMode } from '@/utils/PeerMedia'
import { pubIceServers } from '@/utils/publicStunList'
import { useLocalePath } from '@/utils/localePath'
import { useUserStore } from './user'
import { useContactsStore } from './contacts'
import { useRemoteTaskStore } from './remoteTask'
import { useTaskStore } from './task'

interface CallStatusState {
  isConnectServer: boolean
  isIniting: boolean
  isWaitingConnect: boolean
  isConnected: boolean
  error: { code: number; msg: string }
  mode: MediaMode | null
}

function createCallStatusState(): CallStatusState {
  return {
    isConnectServer: false,
    isIniting: true,
    isWaitingConnect: true,
    isConnected: false,
    error: { code: 0, msg: '' },
    mode: null
  }
}

/**
 * ShareYouSee 行政特征:通话 / 屏幕共享 store
 * 复用现有 ws 配对协议(取件码 4 位 + SDP/ICE 转发),
 * 但传输通道独立于文件传输(PeerMedia 用 RTCPeerConnection + MediaStreamTrack)。
 *
 * 流程:
 * - 发送端选联系人 → 写 sessionStorage['sy-call-pending'] → router.push('/call')
 * - /call 页面 onMounted → initialize() → ws 连接 + register + send + 收到 code → 弹用户选 'audio' / 'screen'
 * - 接收端通过 pushList 收到通知,点接受 → /call?code=xxx → register + receive → 收到 status:0 → 同样弹选择
 *
 * 关闭 /call 页面时 dispose():停所有 track,关闭 PeerConnection,关闭 ws。
 */
export const useCallStore = defineStore('call', () => {
  const { t } = useI18n()
  const localePath = useLocalePath()
  const toast = useToast()
  const router = useRouter()

  const userStore = useUserStore()
  const contactsStore = useContactsStore()
  const remoteTaskStore = useRemoteTaskStore()
  const taskStore = useTaskStore()

  const code = ref('')
  const status = ref<CallStatusState>(createCallStatusState())
  const localStream = ref<MediaStream | null>(null)
  const remoteStream = ref<MediaStream | null>(null)
  const peerUserInfo = ref({ nickname: 'unknown', avatarURL: '' })

  let ws: WebSocket | null = null
  let peerMedia: PeerMedia | null = null
  // 会话角色:caller=发起方(主动选模式 + createOffer 发送本地媒体),
  // callee=接收方(不启动本地媒体,直接接收并应答对方 offer)
  let sessionRole: 'caller' | 'callee' = 'caller'

  function dispose() {
    try {
      peerMedia?.dispose()
    } catch (e) {
      console.warn(e)
    }
    peerMedia = null
    localStream.value = null
    remoteStream.value = null
    try {
      ws?.close()
    } catch (e) {
      console.warn(e)
    }
    ws = null
    if (status.value.error.code === 0) {
      status.value.isConnected = false
      status.value.isWaitingConnect = false
    }
  }

  function setupPeerMediaHandlers(pm: PeerMedia) {
    pm.onSDP = (sdp) => ws?.send(JSON.stringify({ type: 'sdp', data: sdp }))
    pm.onICECandidate = (c) => ws?.send(JSON.stringify({ type: 'candidate', data: c }))
    pm.onRemoteTrack = (stream) => {
      // 克隆新 MediaStream 再赋值:PeerMedia 内部复用同一个 remoteStream 引用,
      // 直接赋值引用不变化,Vue 的 remoteHasVideo/remoteHasAudio 不会重新求值,
      // 导致摄像头/屏幕共享后新增的 track 不显示。
      remoteStream.value = new MediaStream(stream.getTracks())
    }
    pm.onConnected = () => {
      status.value.isConnected = true
      status.value.isWaitingConnect = false
    }
    pm.onDisconnected = () => {
      status.value.isConnected = false
      toast.add({
        severity: 'warn',
        summary: 'Disconnected',
        detail: t('hint.callEnded'),
        life: 5e3
      })
      dispose()
    }
    pm.onError = (e) => {
      console.error('[call] peerMedia error', e)
      status.value.error.code = -5
      status.value.error.msg = e.message
    }
  }

  // 用户在 /call 页面选了 audio 或 screen 后调用(仅发起方 caller)
  async function startMedia(mode: MediaMode) {
    if (!peerMedia) return
    status.value.mode = mode
    try {
      const stream = await peerMedia.start(mode)
      localStream.value = stream
      // 发起方:加完本地媒体后主动发起 offer
      await peerMedia.createOffer()
      status.value.isWaitingConnect = false
    } catch (e: any) {
      console.error('[call] startMedia failed', e)
      toast.add({
        severity: 'error',
        summary: 'Error',
        detail: e?.message ?? String(e),
        life: 5e3
      })
      status.value.error.code = -5
    }
  }

  // 以下控制方法委托给 PeerMedia(仅发起方有本地媒体时有效)

  function setLocalAudioEnabled(enabled: boolean) {
    peerMedia?.setAudioEnabled(enabled)
  }

  async function setLocalCameraEnabled(enabled: boolean) {
    try {
      await peerMedia?.setCameraEnabled(enabled)
    } catch (e) {
      console.error('[call] setCameraEnabled failed', e)
      toast.add({ severity: 'error', summary: 'Error', detail: String(e), life: 5e3 })
    }
  }

  async function stopScreenShare() {
    try {
      await peerMedia?.stopScreenShare()
    } catch (e) {
      console.error('[call] stopScreenShare failed', e)
    }
  }

  async function switchLocalAudioDevice(deviceId: string) {
    try {
      await peerMedia?.switchAudioDevice(deviceId)
    } catch (e) {
      console.error('[call] switchAudioDevice failed', e)
      toast.add({ severity: 'error', summary: 'Error', detail: String(e), life: 5e3 })
    }
  }

  async function switchLocalVideoDevice(deviceId: string) {
    try {
      await peerMedia?.switchVideoDevice(deviceId)
    } catch (e) {
      console.error('[call] switchVideoDevice failed', e)
      toast.add({ severity: 'error', summary: 'Error', detail: String(e), life: 5e3 })
    }
  }

  function initialize(receiveCode?: string) {
    dispose()
    status.value = createCallStatusState()
    sessionRole = receiveCode ? 'callee' : 'caller'
    if (receiveCode) code.value = receiveCode

    // 锁定 code:服务端 register 后会下发 pushList,这里先过滤掉避免红点
    if (receiveCode) {
      remoteTaskStore.lockCode(receiveCode)
    }

    try {
      ws = new WebSocket(location.origin.replace('http', 'ws') + '/api/connect')
    } catch (e) {
      status.value.error.code = -5
      return
    }

    ws.onopen = () => {
      status.value.isConnectServer = true
      if (userStore.hasWallet) {
        ws?.send(
          JSON.stringify({
            type: 'register',
            walletId: userStore.walletInfo.walletId,
            publicKey: userStore.walletInfo.publicKey,
            deviceLabel: userStore.walletInfo.deviceLabel
          })
        )
      }
      if (receiveCode) {
        ws?.send(JSON.stringify({ type: 'receive', code: receiveCode }))
      } else {
        ws?.send(JSON.stringify({ type: 'send' }))
      }
      // 通话模式:把 pendingCall 同步给服务端(定向推送)
      const raw = sessionStorage.getItem('sy-call-pending')
      if (raw) {
        try {
          const meta = JSON.parse(raw)
          sessionStorage.removeItem('sy-call-pending')
          // pendingCall 等到收到 code 后再发(与文件传输对齐)
          // 这里仅记录到 module-level,catch 在 onmessage 'code' 中
          pendingCallMeta = meta
        } catch (e) {
          console.warn('parse call pending failed', e)
        }
      }
    }

    ws.onmessage = async (event) => {
      const data = JSON.parse(event.data)
      if (data.type === 'code') {
        code.value = data.code
        status.value.isIniting = false
        peerMedia = new PeerMedia({ iceServers: pubIceServers })
        setupPeerMediaHandlers(peerMedia)
        const meta = pendingCallMeta
        // 上报定向推送
        if (meta) {
          ws?.send(
            JSON.stringify({
              type: 'pendingPush',
              kind: 'call',
              code: code.value,
              targets: meta.targets,
              filesSnapshot: { type: 'transFile', root: '', totalCount: 0, truncated: false, items: [] },
              senderWalletId: meta.fromWalletId,
              senderPublicKey: meta.fromPublicKey,
              senderDevice: meta.fromDevice,
              ttlSec: 600
            })
          )
          pendingCallMeta = null
        }
        // 发起方:按入口按钮选择的模式自动启动媒体,不再弹选择框
        if (sessionRole === 'caller' && meta?.mode) {
          void startMedia(meta.mode)
        }
        return
      }
      if (data.type === 'status') {
        if (data.code === 404) {
          status.value.error.code = 404
          status.value.error.msg = '404'
          dispose()
        } else if (data.code === 0) {
          // 配对成功,接收端也需要 PeerMedia 实例(被动)
          if (!peerMedia) {
            peerMedia = new PeerMedia({ iceServers: pubIceServers })
            setupPeerMediaHandlers(peerMedia)
          }
        }
        return
      }
      if (data.type === 'user') {
        try {
          peerUserInfo.value = data.data
        } catch {
          // ignore
        }
        return
      }
      if (data.type === 'pushList') {
        remoteTaskStore.setPendingList(data.data || [])
        return
      }
      if (data.type === 'sdp') {
        // 兜底:极端情况下 offer 先于 status:0 到达,确保 PeerMedia 已存在
        if (!peerMedia) {
          peerMedia = new PeerMedia({ iceServers: pubIceServers })
          setupPeerMediaHandlers(peerMedia)
        }
        try {
          // callee 不启动本地媒体,收到 offer 直接 setRemoteSDP(内部对 offer 自动 createAnswer)
          await peerMedia.setRemoteSDP(data.data)
        } catch (e) {
          console.error(e)
        }
        return
      }
      if (data.type === 'candidate') {
        try {
          await peerMedia?.addICECandidate(data.data)
        } catch (e) {
          console.warn(e)
        }
      }
    }

    ws.onclose = () => {
      status.value.isConnectServer = false
      if (status.value.isIniting) {
        status.value.error.code = -5
      } else if (status.value.isWaitingConnect && !status.value.isConnected) {
        status.value.error.code = -10
      }
    }
    ws.onerror = (e) => {
      console.error(e)
    }
  }

  let pendingCallMeta: {
    mode?: MediaMode
    targets: Array<{ walletId: string; deviceLabel?: string }>
    fromWalletId: string
    fromPublicKey: string
    fromDevice: string
  } | null = null

  function cleanup() {
    dispose()
  }

  return {
    code,
    status,
    localStream,
    remoteStream,
    peerUserInfo,
    initialize,
    startMedia,
    setLocalAudioEnabled,
    setLocalCameraEnabled,
    stopScreenShare,
    switchLocalAudioDevice,
    switchLocalVideoDevice,
    cleanup
  }
})