/**
 * ShareYouSee 行政特征:媒体通话/屏幕共享 PeerConnection
 * 与 PeerDataChannel 平行,只负责 RTCPeerConnection + MediaStreamTrack,
 * 不涉及 DataChannel。复用现有 ws 配对协议(SDP / candidate 转发)。
 */

interface PeerMediaConfig {
  iceServers?: RTCIceServer[]
}

export type MediaMode = 'audio' | 'screen'

export interface MediaDeviceInfoLite {
  deviceId: string
  label: string
  kind: 'audioinput' | 'videoinput'
}

export class PeerMedia {
  private pc: RTCPeerConnection
  private localStream: MediaStream | null = null
  private remoteStream: MediaStream | null = null
  private mode: MediaMode = 'audio'
  private _disposed = false
  private _negotiating = false

  // 本地音视频 track 引用(用于开关/切换设备)
  private localAudioTrack: MediaStreamTrack | null = null
  private localVideoTrack: MediaStreamTrack | null = null
  private audioSender: RTCRtpSender | null = null
  private videoSender: RTCRtpSender | null = null

  public onSDP: (sdp: RTCSessionDescriptionInit) => void = () => {}
  public onICECandidate: (candidate: RTCIceCandidate) => void = () => {}
  public onRemoteTrack: (stream: MediaStream) => void = () => {}
  public onError: (e: Error) => void = () => {}
  public onConnected: () => void = () => {}
  public onDisconnected: () => void = () => {}

  constructor(config: PeerMediaConfig = {}) {
    this.pc = new RTCPeerConnection({ iceServers: config.iceServers })
    this.setupPeerConnection()
  }

  /** 枚举可用设备 */
  static async listDevices(): Promise<{
    audioInputs: MediaDeviceInfoLite[]
    videoInputs: MediaDeviceInfoLite[]
  }> {
    if (!navigator.mediaDevices?.enumerateDevices) {
      return { audioInputs: [], videoInputs: [] }
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      return {
        audioInputs: devices
          .filter((d) => d.kind === 'audioinput')
          .map((d) => ({ deviceId: d.deviceId, label: d.label || `Microphone ${d.deviceId.slice(0, 4)}`, kind: 'audioinput' as const })),
        videoInputs: devices
          .filter((d) => d.kind === 'videoinput')
          .map((d) => ({ deviceId: d.deviceId, label: d.label || `Camera ${d.deviceId.slice(0, 4)}`, kind: 'videoinput' as const }))
      }
    } catch {
      return { audioInputs: [], videoInputs: [] }
    }
  }

  private setupPeerConnection() {
    this.pc.onicecandidate = (e) => e.candidate && this.onICECandidate(e.candidate)
    this.pc.onicecandidateerror = () => {
      // 局域网不通的 STUN 候选会触发,忽略
    }
    this.pc.onconnectionstatechange = () => this.handleConnectionStateChange()
    this.pc.onnegotiationneeded = () => this.negotiate()
    this.pc.ontrack = (e) => {
      if (!this.remoteStream) this.remoteStream = new MediaStream()
      // 视频/音频 track 在远端可能被停止(对方关摄像头/停止共享),
      // 监听结束事件并刷新,让 UI 能响应 remoteHasVideo/remoteHasAudio
      e.track.addEventListener('ended', () => {
        this.remoteStream?.removeTrack(e.track)
        this.onRemoteTrack(this.remoteStream!)
      })
      e.track.addEventListener('mute', () => {
        // 对端移除 track 时,本地 muted 事件也会触发;仅刷新即可
        this.onRemoteTrack(this.remoteStream!)
      })
      this.remoteStream.addTrack(e.track)
      this.onRemoteTrack(this.remoteStream)
    }
  }

  private handleConnectionStateChange() {
    if (this._disposed) return
    const state = this.pc.connectionState
    if (state === 'connected') {
      this.onConnected()
    } else if (state === 'failed' || state === 'disconnected' || state === 'closed') {
      this.onDisconnected()
    }
  }

  /**
   * 申请本地媒体并加入 PeerConnection
   * mode='audio':麦克风;mode='screen':屏幕共享 + 麦克风(默认同时说话)
   * 返回本地 MediaStream(便于 caller 在 <video> 上 preview)
   */
  async start(mode: MediaMode): Promise<MediaStream> {
    this.mode = mode
    this.localStream = new MediaStream()

    if (mode === 'audio') {
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      const audioTrack = audioStream.getAudioTracks()[0]
      this.localStream.addTrack(audioTrack)
      this.localAudioTrack = audioTrack
      this.audioSender = this.pc.addTrack(audioTrack, this.localStream)
    } else {
      // 屏幕共享:视频 + 麦克风(默认同时讲解)
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
      })
      const videoTrack = displayStream.getVideoTracks()[0]
      this.localStream.addTrack(videoTrack)
      this.localVideoTrack = videoTrack
      this.videoSender = this.pc.addTrack(videoTrack, this.localStream)

      const audioTrack = displayStream.getAudioTracks()[0]
      if (audioTrack) {
        this.localStream.addTrack(audioTrack)
        this.localAudioTrack = audioTrack
        this.audioSender = this.pc.addTrack(audioTrack, this.localStream)
      }

      // 用户中途从浏览器 UI 停止共享时,主动结束通话
      videoTrack.addEventListener('ended', () => {
        this.onDisconnected()
      })
    }
    return this.localStream
  }

  /** 本地音频静音/恢复(不停止采集) */
  setAudioEnabled(enabled: boolean): void {
    if (this.localAudioTrack) {
      this.localAudioTrack.enabled = enabled
    }
  }

  /** 本地是否有音频 track(用于 UI 判断) */
  hasLocalAudio(): boolean {
    return !!this.localAudioTrack
  }

  /** 本地是否有视频 track(摄像头/屏幕) */
  hasLocalVideo(): boolean {
    return !!this.localVideoTrack
  }

  /**
   * 通话模式:开启/关闭摄像头(带本地音频,摄像头是纯视频)
   * 开启会触发 renegotiation,对端因此能收到新的 video track
   */
  async setCameraEnabled(enabled: boolean): Promise<void> {
    if (this.mode !== 'audio') return
    if (enabled && !this.localVideoTrack) {
      const camStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true })
      const videoTrack = camStream.getVideoTracks()[0]
      this.localStream?.addTrack(videoTrack)
      this.localVideoTrack = videoTrack
      this.videoSender = this.pc.addTrack(videoTrack, this.localStream!)
      await this.negotiate()
    } else if (!enabled && this.localVideoTrack) {
      this.closeVideoTrack()
      await this.negotiate()
    }
  }

  /**
   * 屏幕共享模式:停止共享(关闭视频)。音频(麦克风)保留,通话仍继续。
   */
  async stopScreenShare(): Promise<void> {
    if (this.mode !== 'screen') return
    this.closeVideoTrack()
    await this.negotiate()
  }

  /**
   * 切换本地麦克风设备(用 replaceTrack,无需重新协商)
   */
  async switchAudioDevice(deviceId: string): Promise<void> {
    if (!this.audioSender || !this.localStream) return
    const newStream = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: { exact: deviceId } },
      video: false
    })
    const newTrack = newStream.getAudioTracks()[0]
    const oldTrack = this.localAudioTrack
    // 保留当前 enabled 状态(静音切设备后保持静音)
    newTrack.enabled = oldTrack ? oldTrack.enabled : true
    await this.audioSender.replaceTrack(newTrack)
    this.localStream.removeTrack(oldTrack!)
    oldTrack?.stop()
    this.localStream.addTrack(newTrack)
    this.localAudioTrack = newTrack
  }

  /**
   * 切换本地摄像头设备(通话模式,replaceTrack 无需重新协商)
   */
  async switchVideoDevice(deviceId: string): Promise<void> {
    if (!this.videoSender || !this.localStream || !this.localVideoTrack) return
    const newStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { deviceId: { exact: deviceId } }
    })
    const newTrack = newStream.getVideoTracks()[0]
    const oldTrack = this.localVideoTrack
    await this.videoSender.replaceTrack(newTrack)
    this.localStream.removeTrack(oldTrack)
    oldTrack?.stop()
    this.localStream.addTrack(newTrack)
    this.localVideoTrack = newTrack
  }

  private closeVideoTrack(): void {
    if (this.videoSender) {
      try {
        this.pc.removeTrack(this.videoSender)
      } catch {
        // ignore
      }
      this.videoSender = null
    }
    const vt = this.localVideoTrack
    if (vt) {
      this.localStream?.removeTrack(vt)
      vt.stop()
      this.localVideoTrack = null
    }
  }

  /**
   * 发起方生成 SDP offer 发给对端(带防重入,供 renegotiation 复用)
   */
  async createOffer(): Promise<void> {
    await this.negotiate()
  }

  private async negotiate(): Promise<void> {
    if (this._negotiating || this._disposed) return
    this._negotiating = true
    try {
      const offer = await this.pc.createOffer()
      await this.pc.setLocalDescription(offer)
      if (this.pc.localDescription) this.onSDP(this.pc.localDescription)
    } catch (e) {
      this.onError(e instanceof Error ? e : new Error('Unknown error during negotiation'))
    } finally {
      this._negotiating = false
    }
  }

  /**
   * 接收方收到 offer 后回 answer;或纯 caller 模式
   */
  async setRemoteSDP(sdp: RTCSessionDescriptionInit): Promise<void> {
    await this.pc.setRemoteDescription(sdp)
    if (sdp.type === 'offer') {
      const answer = await this.pc.createAnswer()
      await this.pc.setLocalDescription(answer)
      this.onSDP(answer)
    }
  }

  async addICECandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (this.pc.remoteDescription) {
      await this.pc.addIceCandidate(candidate)
    }
  }

  isConnected(): boolean {
    return this.pc.connectionState === 'connected'
  }

  getMode(): MediaMode {
    return this.mode
  }

  getLocalStream(): MediaStream | null {
    return this.localStream
  }

  getRemoteStream(): MediaStream | null {
    return this.remoteStream
  }

  /**
   * 关闭并清理所有本地/远端 track + PeerConnection
   */
  dispose(): void {
    if (this._disposed) return
    this._disposed = true
    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop())
      this.localStream = null
    }
    if (this.remoteStream) {
      this.remoteStream.getTracks().forEach((t) => t.stop())
      this.remoteStream = null
    }
    this.localAudioTrack = null
    this.localVideoTrack = null
    this.audioSender = null
    this.videoSender = null
    this.pc.onicecandidate = null
    this.pc.ontrack = null
    this.pc.onconnectionstatechange = null
    this.pc.onnegotiationneeded = null
    try {
      this.pc.close()
    } catch {
      // ignore
    }
  }
}