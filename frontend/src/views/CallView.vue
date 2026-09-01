<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useCallStore } from '@/stores/call'
import { useLocalePath } from '@/utils/localePath'
import { PeerMedia, type MediaMode } from '@/utils/PeerMedia'
import type { MediaDeviceInfoLite } from '@/utils/PeerMedia'

// ShareYouSee 行政特征:通话 + 屏幕共享 页面
// 发起按钮已分离(语音通话 / 共享屏幕),进入页面后自动按模式启动,
// 不再弹选择框;关闭 /call 页面即结束会话。
const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const router = useRouter()
const callStore = useCallStore()

const localVideoEl = ref<HTMLVideoElement | null>(null)
const remoteVideoEl = ref<HTMLVideoElement | null>(null)

const receiveCode = computed(() => {
  const v = route.query.code
  return typeof v === 'string' ? v : ''
})
// 是否被叫方:被叫方不启动本地媒体,直接接收发起方的流
const isCallee = computed(() => !!receiveCode.value)

// 当前模式(发起方由入口按钮决定,被叫方根据远端流反推)
const mode = computed<MediaMode | null>(() => callStore.status.mode)

// 控制状态
const audioEnabled = ref(true)
const cameraEnabled = ref(false) // 语音模式下可选开启摄像头
const audioInputs = ref<MediaDeviceInfoLite[]>([])
const videoInputs = ref<MediaDeviceInfoLite[]>([])
const selectedAudioDevice = ref('')
const selectedVideoDevice = ref('')

// 根据实际流判断远端是视频(屏幕共享)还是纯音频
const remoteHasVideo = computed(
  () => !!callStore.remoteStream?.getVideoTracks().length
)
const remoteHasAudio = computed(
  () => !!callStore.remoteStream?.getAudioTracks().length
)
// 本地是否有视频 track;用 tick 计数强制依赖 Stream 变化后重新求值
const localStreamTick = ref(0)
const localHasVideo = computed(
  () => {
    // 读 tick 让 computed 依赖它,调用处主动 +1 触发重算
    void localStreamTick.value
    return !!callStore.localStream?.getVideoTracks().length
  }
)

function bindStream(el: HTMLVideoElement | null, stream: MediaStream | null, muted = true) {
  if (!el) return
  if (el.srcObject !== stream) {
    el.srcObject = stream
    // 本地预览必须 muted(否则回声);远端音频不 muted
    el.muted = muted
    el.play().catch(() => {
      // autoplay may need user gesture, ignore
    })
  }
}

// 触发本地 stream 后绑定到本地预览 video/audio
function syncLocalBinding() {
  bindStream(localVideoEl.value, callStore.localStream, true)
}

// 监听 stream 变化
import { watch, nextTick } from 'vue'
watch(() => callStore.localStream, syncLocalBinding)
watch(
  () => callStore.remoteStream,
  async () => {
    // 远端流到达后再绑定,确保 <video>/<audio> 元素已渲染(根据是否有视频 track)
    await nextTick()
    bindStream(remoteVideoEl.value, callStore.remoteStream, false)
  }
)

// 加载可用设备列表(发起方需要选设备)
async function loadDevices() {
  const { audioInputs: ais, videoInputs: vis } = await PeerMedia.listDevices()
  audioInputs.value = ais
  videoInputs.value = vis
  if (ais.length && !selectedAudioDevice.value) {
    selectedAudioDevice.value = ais[0].deviceId
  }
  if (vis.length && !selectedVideoDevice.value) {
    selectedVideoDevice.value = vis[0].deviceId
  }
}

// 静音 / 取消静音
function toggleAudio() {
  audioEnabled.value = !audioEnabled.value
  callStore.setLocalAudioEnabled(audioEnabled.value)
}

// 语音模式:开启 / 关闭摄像头
async function toggleCamera() {
  cameraEnabled.value = !cameraEnabled.value
  await callStore.setLocalCameraEnabled(cameraEnabled.value)
  // 强制本地流相关 computed 重新求值(MediaStream 内部 track 增删不触发响应式)
  localStreamTick.value++
  await nextTick()
  bindStream(localVideoEl.value, callStore.localStream, true)
}

// 屏幕共享模式:停止共享视频(保留音频通话)
async function stopScreen() {
  await callStore.stopScreenShare()
  cameraEnabled.value = false
  localStreamTick.value++
}

// 切换麦克风设备
async function changeAudioDevice(deviceId: string) {
  selectedAudioDevice.value = deviceId
  await callStore.switchLocalAudioDevice(deviceId)
}

// 切换摄像头设备(仅语音模式且已开摄像头)
async function changeVideoDevice(deviceId: string) {
  selectedVideoDevice.value = deviceId
  await callStore.switchLocalVideoDevice(deviceId)
}

onMounted(() => {
  callStore.initialize(receiveCode.value || undefined)
  // 发起方预取设备列表
  if (!isCallee.value) {
    loadDevices()
  }
  syncLocalBinding()
})

onBeforeUnmount(() => {
  callStore.cleanup()
})

function endCall() {
  callStore.cleanup()
  router.replace(localePath('/'))
}
</script>

<template>
  <div class="md:px-[10vw] pb-6">
    <div
      class="fixed top-0 left-0 right-0 bottom-0 inset-0 -z-50 h-full w-full bg-white dark:bg-zinc-950 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] dark:bg-[radial-gradient(#25272b_1px,transparent_1px)] [background-size:16px_16px]"
    ></div>

    <div v-if="callStore.status.error.code !== 0" class="text-center py-20">
      <Icon name="solar:sad-square-line-duotone" size="100" />
      <p class="text-xl tracking-wider pt-8">{{ t('hint.callError') }}</p>
      <p class="text-sm text-neutral-500 pt-2">({{ callStore.status.error.msg || callStore.status.error.code }})</p>
      <Button class="mt-6 tracking-wider" severity="contrast" @click="endCall">
        <Icon name="solar:home-2-linear" class="mr-2" />{{ t('btn.toHome') }}
      </Button>
    </div>

    <div v-else class="flex flex-col items-center gap-4 pt-6">
      <div class="flex items-center gap-2">
        <Icon name="solar:card-recive-linear" />
        <span class="text-lg tracking-widest">{{ callStore.code }}</span>
        <span
          v-if="callStore.status.mode === 'audio'"
          class="text-xs px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
        >
          {{ t('call.audio') }}
        </span>
        <span
          v-else-if="callStore.status.mode === 'screen'"
          class="text-xs px-2 py-0.5 rounded bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300"
        >
          {{ t('call.screen') }}
        </span>
        <span v-else-if="isCallee && remoteHasVideo" class="text-xs px-2 py-0.5 rounded bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300">
          {{ t('call.screen') }}
        </span>
      </div>

      <!-- 远端画面:主区域 -->
      <div class="w-full max-w-[900px]">
        <div
          class="aspect-video w-full bg-neutral-900 rounded-lg flex items-center justify-center overflow-hidden"
        >
          <video
            v-if="remoteHasVideo"
            ref="remoteVideoEl"
            autoplay
            playsinline
            class="w-full h-full object-contain"
          />
          <div v-else class="flex flex-col items-center text-white/40 gap-2">
            <Icon name="solar:user-hand-up-broken" size="80" />
            <span class="text-xs">
              {{ remoteHasAudio ? t('call.audioInProgress') : t('call.waitingPeer') }}
            </span>
          </div>
          <audio
            v-if="remoteHasAudio && !remoteHasVideo"
            ref="remoteVideoEl"
            autoplay
            playsinline
          />
        </div>
      </div>

      <!-- 本地小窗:发起方有本地媒体时显示(屏幕共享或已开摄像头) -->
      <div
        v-if="!isCallee && localHasVideo"
        class="w-full max-w-[900px] flex justify-end -mt-24 pr-4 pointer-events-none"
      >
        <div class="w-40 md:w-56 aspect-video bg-neutral-900 rounded-lg overflow-hidden shadow-lg">
          <video
            ref="localVideoEl"
            autoplay
            playsinline
            muted
            class="w-full h-full object-contain pointer-events-none"
          />
        </div>
      </div>

      <!-- 控制条 -->
      <div class="w-full max-w-[900px] flex flex-wrap items-center justify-center gap-3 mt-4">
        <span v-if="!callStore.status.isConnected" class="text-xs text-neutral-500">
          {{ t('call.waitingPeer') }}
        </span>

        <!-- 发起方控制 -->
        <template v-if="!isCallee">
          <!-- 麦克风设备选择 -->
          <Select
            v-if="audioInputs.length > 1"
            v-model="selectedAudioDevice"
            :options="audioInputs"
            option-value="deviceId"
            option-label="label"
            class="w-40"
            size="small"
            @change="(e) => changeAudioDevice(String(e.value))"
          />
          <!-- 静音开关 -->
          <Button
            rounded
            :severity="audioEnabled ? 'contrast' : 'danger'"
            outlined
            :aria-label="audioEnabled ? t('call.mute') : t('call.unmute')"
            :title="audioEnabled ? t('call.mute') : t('call.unmute')"
            @click="toggleAudio"
          >
            <Icon :name="audioEnabled ? 'solar:user-circle-broken' : 'solar:close-circle-line-duotone'" />
          </Button>

          <!-- 语音模式:摄像头开关 + 摄像头设备选择 -->
          <template v-if="mode === 'audio'">
            <Button
              rounded
              :severity="cameraEnabled ? 'contrast' : 'secondary'"
              outlined
              :aria-label="t('call.camera')"
              :title="t('call.camera')"
              @click="toggleCamera"
            >
              <Icon
                :name="
                  cameraEnabled
                    ? 'solar:user-hand-up-broken'
                    : 'solar:close-circle-line-duotone'
                "
              />
            </Button>
            <Select
              v-if="cameraEnabled && videoInputs.length > 1"
              v-model="selectedVideoDevice"
              :options="videoInputs"
              option-value="deviceId"
              option-label="label"
              class="w-40"
              size="small"
              @change="(e) => changeVideoDevice(String(e.value))"
            />
          </template>

          <!-- 屏幕共享模式:停止共享(关闭视频) -->
          <Button
            v-if="mode === 'screen'"
            rounded
            severity="danger"
            outlined
            :aria-label="t('call.stopShare')"
            :title="t('call.stopShare')"
            @click="stopScreen"
          >
            <Icon name="solar:close-square-linear" />
          </Button>
        </template>

        <!-- 结束 -->
        <Button rounded severity="danger" @click="endCall">
          <Icon name="solar:close-square-linear" class="mr-1" />{{ t('call.end') }}
        </Button>
      </div>
    </div>
  </div>
</template>