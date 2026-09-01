# ShareYouSee 功能清单与拆分迁移规划

> 本文档梳理当前 Nuxt 4 一体化项目的全部功能点,作为下一步"前后端分离"的基线参考。
>
> **目标架构**(下一步):
>
> - **前端**: **Vue 3 + Vite SPA**(保留当前 `app/` 全部 SFC / Pinia / 工具函数,放弃 Nuxt 运行时,改为纯 SPA + PWA)
> - **后端**: 独立 Node.js 服务(取代 Nuxt 4 的 `server/` 部分,纯 WebSocket + REST,Hono 或 Fastify)
> - **复用最大化**: Vue 组件、Pinia store、composables、utils、i18n、文案全部零修改平移,只剥离 Nuxt runtime
> - **现有协议不变**: SDP/ICE/取件码/MD5/PushList/User 消息格式沿用,服务端业务逻辑可平移

---

## 1. 当前架构概览

### 1.1 项目结构

```
shareyousee/
├── app/                          # 前端(Nuxt 4 srcDir)
│   ├── pages/                    # 路由:index / sender / recipient / tasks
│   ├── components/               # UI 组件(NavBar / Panels / Dialogs)
│   ├── stores/                   # Pinia 状态管理(9 个 store)
│   ├── composables/              # 复用组合式逻辑(5 个,含 usePresenceWs 全局 ws)
│   ├── utils/                    # 工具(PeerDataChannel / wallet / files / storage)
│   ├── types/                    # 类型定义
│   ├── presets/aura/             # PrimeVue Aura PassThrough 主题(已挪进 srcDir)
│   └── app.vue                   # 根组件
├── server/                       # Nitro 服务端
│   ├── api/connect.ts            # WebSocket 信令(取件码配对 + Push 协议)
│   ├── api/getIP.post.ts         # 客户端公网 IP 查询
│   ├── api/transCount.post.ts    # 全局传输计数
│   └── utils/presence.ts         # 在线状态 + 定向推送注册表
├── i18n/i18n.config.ts           # 中英双语文案
├── public/                       # 静态资源 + PWA manifest + sw.js
├── scripts/                      # 构建/部署工具脚本
├── Caddyfile                     # 反向代理
├── Dockerfile / docker-compose.yaml
└── nuxt.config.ts                # Nuxt 4 + PrimeVue + PWA 配置
```

### 1.2 技术栈

| 层         | 当前                                          | 拆分后(目标)                              |
| ---------- | --------------------------------------------- | ----------------------------------------- |
| 视图       | Vue 3 SFC + PrimeVue (unstyled)               | **Vue 3 SFC**(零修改) + PrimeVue unstyled |
| 路由       | Nuxt 4 文件路由                               | **Vue Router 4**(显式路由表)              |
| 状态       | Pinia                                         | **Pinia**(零修改)                         |
| 国际化     | @nuxtjs/i18n                                  | **vue-i18n**(从 Nuxt i18n config 平移)    |
| SSR        | Nuxt SSR(当前未使用,纯 SPA)                   | 移除,纯 SPA                               |
| PWA        | @vite-pwa/nuxt + injectManifest               | **vite-plugin-pwa**(API 一致)             |
| 样式       | Tailwind CSS + PrimeVue unstyled + 自定义     | 沿用 Tailwind                             |
| 工具函数   | `~/utils/*` / `~/types/*` / `~/stores/*` 别名 | `@/` Vite alias(去 Nuxt 内部别名)         |
| 信令后端   | Nitro + h3 + WebSocket                        | **Hono / Fastify** + `ws`                 |
| API 客户端 | useFetch / $fetch                             | **原生 fetch** + 自封装函数               |
| Node       | 18+                                           | 20+(WSS / WebCrypto 完善)                 |
| 包管理     | Yarn 4                                        | 沿用 Yarn 4                               |

---

## 2. 功能点详细清单

### 2.1 钱包身份系统(`app/utils/wallet.ts` + `app/stores/user.ts`)

| #    | 功能                                                    | 现状 | 备注                                |
| ---- | ------------------------------------------------------- | ---- | ----------------------------------- |
| W-01 | 助记词生成(BIP39 12/15/18/21/24 词)                     | ✅   | 128/160/192/224/256 bit 强度可选    |
| W-02 | 助记词校验 + 多种分隔符容忍(空格/逗号/中文逗号)         | ✅   | `normalizeMnemonic` 处理            |
| W-03 | BIP39 → seed → P-256 ECDH 派生公私钥                    | ✅   | 走 `@noble/curves` 不依赖 WebCrypto |
| W-04 | walletId = SHA-256(SPKI) 前 16 hex                      | ✅   | 确定性,不可逆                       |
| W-05 | 公钥 SPKI base64 序列化                                 | ✅   | 与 Node + 浏览器互操作              |
| W-06 | 私钥导入 WebCrypto(extractable:false)                   | ✅   | IndexedDB 持久化                    |
| W-07 | ECDH / ECDSA 签名验签                                   | ✅   | 预留接口,当前未在主流程使用         |
| W-08 | 设备标签自动检测(mac/win/linux/iphone/ipad/android/web) | ✅   | UA + 屏幕特征                       |
| W-09 | WalletSetupDialog(生成/导入,12 词确认)                  | ✅   | ClientOnly 包裹                     |
| W-10 | 钱包重置(清除 IndexedDB 私钥)                           | ✅   |                                     |
| W-11 | 切换 ID(重置 + 重新打开 setup 对话框)                   | ✅   | 个人头像 Popover 入口               |
| W-12 | 私钥恢复(助记词 → 公私钥 → walletId 校验)               | ✅   | 导入路径                            |

### 2.2 联系人与群组(`app/stores/contacts.ts` + `app/components/Contacts*.vue` + `Groups*.vue`)

| #    | 功能                                                                    | 现状 | 备注                     |
| ---- | ----------------------------------------------------------------------- | ---- | ------------------------ |
| C-01 | 联系人以 walletId 为主键,endpoints 数组承载多设备                       | ✅   |                          |
| C-02 | 端点记录(walletId + publicKey + deviceLabel + lastSeenAt + lastSeenVia) | ✅   |                          |
| C-03 | "我"的记录(isSelf),跨端点共享同一公钥                                   | ✅   | `selfRecord`             |
| C-04 | 最近协作列表(最多 5 人,按 lastInteractionAt)                            | ✅   | `recentContacts`         |
| C-05 | 全部联系人列表                                                          | ✅   | `otherContacts`          |
| C-06 | 联系人 upsertEndpoint(transfer / presence / manual 三种来源)            | ✅   |                          |
| C-07 | 联系人重命名(alias)                                                     | ✅   | `renameContact`          |
| C-08 | 联系人删除                                                              | ✅   | `removeContact`          |
| C-09 | 群组 CRUD(name + memberWalletIds)                                       | ✅   |                          |
| C-10 | 群组成员增删                                                            | ✅   | 群组不能嵌套             |
| C-11 | 群组成员解析(展开 walletId 列表)                                        | ✅   | `resolveGroupMembers`    |
| C-12 | 选择联系人(用于定向发送)                                                | ✅   | `selectedContactId`      |
| C-13 | 联系人展示(头像 + 昵称@设备 + 最近交互时间)                             | ✅   | `getContactDisplay`      |
| C-14 | 设备自动识别:首次 P2P 后把对方 walletId + 设备加入联系人                | ✅   | `upsertEndpoint` in P2P  |
| C-15 | 收到对端 user 消息时把对方 nickname 同步到 alias(过滤占位名)            | ✅   | `applyAliasFromNickname` |

### 2.3 任务日志(`app/stores/task.ts` + `TasksPanel.vue` + `pages/tasks.vue`)

| #    | 功能                                                     | 现状 | 备注                |
| ---- | -------------------------------------------------------- | ---- | ------------------- |
| T-01 | 每次传输创建 TaskRecord(pending → done/err)              | ✅   | localStorage 持久化 |
| T-02 | 文件清单快照(前 200 项 + truncated 标记)                 | ✅   |                     |
| T-03 | 任务详情页(`/tasks?id=...`)                              | ✅   |                     |
| T-04 | 状态:sender / recipient + transFile / transDir / syncDir | ✅   |                     |
| T-05 | 进度:transmittedBytes + totalBytes + errorCode           | ✅   |                     |
| T-06 | 任务列表 Panel(NavBar 浮层入口)                          | ✅   | 最近 N 条           |
| T-07 | 清空历史(confirm 后)                                     | ✅   |                     |
| T-08 | 任务日志同步刷新对端信息(P2P 中收到 user 时)             | ✅   | `updatePeer`        |

### 2.4 定向推送(`server/utils/presence.ts` + Push\*Dialog/Panel + usePresenceWs)

| #    | 功能                                                                                           | 现状 | 备注                             |
| ---- | ---------------------------------------------------------------------------------------------- | ---- | -------------------------------- |
| P-01 | 服务端维护 pendingPushes(TTLCache 600s)                                                        | ✅   | key = code                       |
| P-02 | 目标 endpoints:Array<{ walletId, deviceLabel? }>                                               | ✅   | deviceLabel 可空                 |
| P-03 | 创建推送(createPush,带 filesSnapshot)                                                          | ✅   |                                  |
| P-04 | 消费推送(consumePush,移除匹配的端点)                                                           | ✅   | targets 全空才删除 code          |
| P-05 | 匹配规则:walletId 必匹配 + deviceLabel 可选匹配                                                | ✅   | `findMatchingPushes`             |
| P-06 | register 时主动 pushList 给刚 register 的端点                                                  | ✅   |                                  |
| P-07 | WebSocket 消息协议:`register` / `pendingPush` / `consumePush` / `pushList` / `requestPushList` | ✅   |                                  |
| P-08 | 客户端全局常驻 ws(NavBar 注册,后台断开重连)                                                    | ✅   | `usePresenceWs`                  |
| P-09 | 待接收任务列表 store(支持锁定 code 防红点复活)                                                 | ✅   | `useRemoteTaskStore.lockCode`    |
| P-10 | 推送面板(NavBar 头像旁的对话框入口)                                                            | ✅   | `PushTasksDialog`                |
| P-11 | 推送面板刷新按钮(发 requestPushList)                                                           | ✅   |                                  |
| P-12 | 接收任务(跳 `/recipient?code=CODE`)走现有取件码流程                                            | ✅   |                                  |
| P-13 | 群组定向发送(展开为 walletId 列表)                                                             | ✅   | `resolveGroupMembers`            |
| P-14 | 推送列表过滤掉 lockedCode                                                                      | ✅   | store.setPendingList 自动 filter |

### 2.5 P2P 传输(`app/utils/PeerDataChannel.ts` + senderTransfer / recipientTransfer)

| #    | 功能                                                               | 现状 | 备注                              |
| ---- | ------------------------------------------------------------------ | ---- | --------------------------------- |
| X-01 | 取件码 = 4 位数字(2048 次重试保证唯一)                             | ✅   | `genDigitCode`                    |
| X-02 | 发送端:信令连接 → 获取 code → 等待对方 → P2P 建立 → 传输文件       | ✅   | `senderTransfer`                  |
| X-03 | 接收端:输入 code → 信令连接 → 等待对方 → P2P 建立 → 接收文件       | ✅   | `recipientTransfer`               |
| X-04 | WebRTC DataChannel 封装(EventQueue 串行化消息)                     | ✅   | `PeerDataChannel`                 |
| X-05 | ICE 候选中转 + SDP offer/answer                                    | ✅   | server 只做转发                   |
| X-06 | 三种传输类型:`transFile` 单文件 / `transDir` 目录 / `syncDir` 同步 | ✅   |                                   |
| X-07 | 1 MiB 分片传输                                                     | ✅   | `calcMD5` + 校验                  |
| X-08 | 文件 MD5 校验失败 → 错误码 -3                                      | ✅   |                                   |
| X-09 | 同步目录三类结果:add / update / delete                             | ✅   | 删后尝试清理空父目录              |
| X-10 | 进度回调(transmittedCount + totalBytes + 速度 + 剩余时间)          | ✅   | `calcSpeedFn`                     |
| X-11 | 暂停 / 取消(可选,未实现 UI)                                        | ❌   |                                   |
| X-12 | 断点续传                                                           | ❌   | 大文件重新传                      |
| X-13 | 多文件并发传输(限流)                                               | ❌   | 串行                              |
| X-14 | STUN 服务器列表(Google + 备选)                                     | ✅   | `publicStunList`                  |
| X-15 | HTTPS + 现代浏览器能力检测                                         | ✅   | `isModernFileAPIAvailable`        |
| X-16 | 拖拽文件发送                                                       | ✅   | window-level drop handler         |
| X-17 | 现代文件 API(FileSystemFileHandle / DirectoryHandle)               | ✅   | `files.ts`                        |
| X-18 | 自动确认开关(isConfirmDefault,发送方)                              | ✅   | i18n: `label.autoConfirmBySender` |

### 2.6 错误码(`server/api/connect.ts` + 两端 store)

| 码    | 含义                | 触发场景                                |
| ----- | ------------------- | --------------------------------------- |
| `0`   | 正常                | 通用 OK                                 |
| `403` | 用户拒绝            | 接收端拒绝接收 / 发送方取消             |
| `404` | 取件码 / 文件不存在 | 接收端用 code 配对但发送端已断开        |
| `-1`  | 能力不支持          | 对方不支持目录传输(现代文件 API 不可用) |
| `-2`  | 连接断开            | ICE / DataChannel disconnected          |
| `-3`  | 哈希失败            | MD5 不匹配(保留失败语义)                |
| `-5`  | 信令服务异常        | server 内部错误 / WebSocket 中断        |
| `-10` | 超时                | 等待对方超时                            |

### 2.7 UI / UX(`app/components/` + `app/pages/`)

| #    | 功能                                                        | 现状 | 备注                     |
| ---- | ----------------------------------------------------------- | ---- | ------------------------ |
| U-01 | 首页三按钮(发送文件 / 发送目录 / 同步目录)                  | ✅   | 横排一行                 |
| U-02 | 首页取件码面板(InputOtp 4 位)                               | ✅   | 顶部居中                 |
| U-03 | 联系人/最近协作 tab + 列表(端点/联系人/群组平铺)            | ✅   | `ContactsAndRecentPanel` |
| U-04 | NavBar:钱包/联系人/群组/任务/推送/头像 Popover              | ✅   |                          |
| U-05 | 个人头像 Popover:头像/昵称编辑/自动确认开关/切换 ID 按钮    | ✅   |                          |
| U-06 | 钱包信息 Panel(walletId 短串 + 公钥指纹 + 复制 + 重置)      | ✅   | `WalletPanel`            |
| U-07 | 推送任务 Dialog(刷新按钮 + 单任务接收)                      | ✅   |                          |
| U-08 | 群组 CRUD Dialog                                            | ✅   |                          |
| U-09 | 发送方页面(`/sender`):文件清单 + 进度条 + 速度/剩余时间     | ✅   |                          |
| X-10 | 接收方页面(`/recipient`):文件清单 + 同步目录差异对比 + 确认 | ✅   |                          |
| U-11 | 任务详情页(`/tasks?id=...`)                                 | ✅   |                          |
| U-12 | PWA 安装提示                                                | ✅   | `InstallPWA.vue`         |
| U-13 | 全屏 loading + Toast                                        | ✅   |                          |
| U-14 | 暗色模式(系统偏好 + 手动切换)                               | ✅   | `@nuxtjs/color-mode`     |
| U-15 | 国际化(中英双语,顶部切换)                                   | ✅   | `@nuxtjs/i18n`           |
| U-16 | DocPanel(关于 + 帮助)                                       | ✅   |                          |
| U-17 | Avatar 选择器(打开 userStore.openAvatarPicker)              | ✅   |                          |
| U-18 | SEO / sitemap / robots                                      | ✅   | `@nuxtjs/seo`            |

### 2.8 服务端能力

| #    | 功能                                               | 现状 | 备注                                 |
| ---- | -------------------------------------------------- | ---- | ------------------------------------ |
| S-01 | WebSocket 信令(取件码配对 + Push 协议)             | ✅   | `server/api/connect.ts`              |
| S-02 | Nitro WebSocket 实验性 API                         | ✅   | `nitro.experimental.websocket: true` |
| S-03 | 在线状态注册(register / unregister / WeakMap 反查) | ✅   | `presence.ts`                        |
| S-04 | TTLCache 自动过期(600s)                            | ✅   | `@isaacs/ttlcache`                   |
| S-05 | 客户端公网 IP 查询                                 | ✅   | `/api/getIP`                         |
| S-06 | 全局传输计数(本地文件持久化)                       | ✅   | `TransCount.ts`                      |
| S-07 | 静态资源托管(`public/`)                            | ✅   |                                      |
| S-08 | SSR 渲染入口(当前未使用,纯 SPA fallback)           | ✅   |                                      |
| S-09 | Nitro 把所有依赖 inline 到 server bundle           | ✅   | `nitro.externals.inline: [/.*/]`     |

### 2.9 构建 / 部署

| #    | 功能                                                        | 现状 | 备注                        |
| ---- | ----------------------------------------------------------- | ---- | --------------------------- |
| B-01 | Yarn 4 + node-modules linker + npmMinimalAgeGate 4320       | ✅   |                             |
| B-02 | Prettier(semi:false / singleQuote / no trailingComma / 100) | ✅   | 无 ESLint / 测试框架        |
| B-03 | 手动部署脚本(`scripts/package-deploy.sh`)                   | ✅   | 保留软链 + tar.gz           |
| B-04 | HTTPS dev server(自签证书生成)                              | ✅   | `scripts/gen-dev-certs.mjs` |
| B-05 | hookable 6.1.1 patch(`scripts/patch-hookable.mjs`)          | ✅   | 上游未修,见 AGENTS.md       |
| B-06 | Caddyfile 反代(share.armin.com.cn + 局域网入口)             | ✅   |                             |
| B-07 | Dockerfile + docker-compose                                 | ✅   | shouchenicu/fastsend 镜像   |
| B-08 | AGENTS.md / copilot-instructions.md 维护约束                | ✅   |                             |
| B-09 | 路径敏感:.output 目录结构 + 软链保留 + .output 父目录名约束 | ✅   | 见 README                   |

---

## 3. 下一步:前后端分离迁移计划

### 3.1 目标架构

```
shareyousee-frontend/             # Vue 3 + Vite SPA(从 app/ 整包搬过来)
├── src/
│   ├── views/                    # Vue Router 页面(原 app/pages/*.vue 零修改)
│   ├── components/               # 原 app/components/*.vue 零修改
│   ├── stores/                   # 原 app/stores/*.ts 零修改(Pinia)
│   ├── composables/              # 原 app/composables/*.ts 零修改
│   ├── utils/                    # 原 app/utils/*.ts 零修改(纯 TS)
│   ├── types/                    # 原 app/types/*.ts 零修改
│   ├── locales/                  # 原 i18n/i18n.config.ts 转 vue-i18n
│   ├── presets/aura/             # 原 app/presets/aura/ 零修改
│   ├── styles/
│   ├── App.vue                   # 原 app.vue 零修改
│   ├── router.ts                 # 新增:Vue Router 4 显式路由表
│   └── main.ts                   # 新增:挂载 Vue + Pinia + PrimeVue + i18n
├── public/                       # 静态资源 + PWA manifest + sw.js
├── index.html
├── vite.config.ts                # 新增(替代 nuxt.config.ts 的 SPA 部分)
└── package.json                  # vue / vue-router / pinia / vue-i18n / primevue / vite-plugin-pwa

shareyousee-backend/              # Node + Hono + ws
├── src/
│   ├── ws/connect.ts             # 现有 server/api/connect.ts 平移
│   ├── ws/presence.ts            # 现有 server/utils/presence.ts 平移
│   ├── api/transCount.ts         # 现有 server/api/transCount.post.ts
│   ├── api/getIP.ts              # 现有 server/api/getIP.post.ts
│   ├── utils/TransCount.ts       # 现有 server/utils/TransCount.ts
│   └── server.ts                  # Hono app + ws upgrade
├── package.json
└── Dockerfile
```

### 3.2 拆分原则

- **前端最大化复用**(关键收益):
  - `app/components/*.vue` 16 个组件:**零修改**
  - `app/pages/*.vue` 4 个页面:**零修改**
  - `app/stores/*.ts` 9 个 Pinia store:**零修改**
  - `app/composables/*.ts` 5 个(含 usePresenceWs):**零修改**
  - `app/utils/*.ts` 8 个工具函数(纯 TS):**零修改**
  - `app/types/*.ts` 类型定义:**零修改**
  - `app/presets/aura/` PrimeVue 主题:**零修改**
  - `app.vue` 根组件:**零修改**(移除 Nuxt 特有的 `<NuxtRouteAnnouncer>` 等)
  - i18n 文案(中英):**零修改**,只换加载方式
- **需要新增/替换**:
  - `nuxt.config.ts` → `vite.config.ts`(SPA 配置 + 路径别名)
  - `app/router.options.ts`(原本隐式)→ `src/router.ts`(显式路由表)
  - 新增 `src/main.ts`(挂载入口)
  - i18n 配置从 Nuxt 模块改为 vue-i18n
- **后端平移**:
  - `server/api/connect.ts` → `src/ws/connect.ts`(WebSocket 处理逻辑不变,适配 Hono/Fastify 的 upgrade 钩子)
  - `server/utils/presence.ts` → `src/ws/presence.ts`(纯逻辑,无依赖)
  - `server/utils/TransCount.ts` → 复用
  - `server/api/transCount.post.ts` / `getIP.post.ts` → 转为普通 HTTP handler
- **协议不变**: WebSocket 消息格式、SDP/ICE 转发、TTLCache 取件码、Push 协议全部平移到新后端,前端代码无需感知
- **构建产物分离**: 前端构建到 `dist/` 静态目录,后端单独部署
- **部署解耦**: 前端可托管在任意静态服务器 + CDN(Caddy / Nginx),后端独立运行

### 3.3 拆分后通信

- 静态资源: 前端 `https://share.armin.com.cn/` 直接 nginx/caddy serve
- WebSocket: `wss://share.armin.com.cn/ws/connect`(同一域,经反代到后端)
- REST API: `https://share.armin.com.cn/api/transCount` 等
- 静态资源跨域: 后端启用 CORS(开发期)/ 同源(生产期)

### 3.4 迁移优先级(从大到小)

> **关键变化**: 由于前端保留 Vue,组件 / 页面 / store / utils 几乎零改动,迁移工作量从 15-20 天缩减到 **5-7 天**。

| 阶段     | 工作                                                                                                                    | 估计工作量 | 备注                                   |
| -------- | ----------------------------------------------------------------------------------------------------------------------- | ---------- | -------------------------------------- |
| P0       | 后端 Hono/Fastify 骨架 + WebSocket + presence + REST,平移 server/ 全部逻辑                                              | 1.5-2 天   | Hono 的 ws upgrade 处理比 Nitro 更直接 |
| P1       | 新建 `shareyousee-frontend/` 项目骨架(Vite + Vue Router + Pinia + vue-i18n + PrimeVue + vite-plugin-pwa)                | 0.5 天     | Vite config + 路径别名 + manifest      |
| P2       | 把 `app/{components,pages,stores,composables,utils,types,presets}/` 整包复制到 `frontend/src/`,`app.vue` 改名 `App.vue` | 0.5 天     | **零修改**复制                         |
| P3       | i18n 配置从 Nuxt 模块改为 vue-i18n(原 `i18n/i18n.config.ts` 内容平移)                                                   | 0.5 天     | 移除 `@nuxtjs/i18n` 依赖               |
| P4       | 写 `src/main.ts` + `src/router.ts`,挂载 Vue + Pinia + PrimeVue + vue-i18n + PWA                                         | 0.5 天     | 替代 Nuxt 自动注入                     |
| P5       | 全局 import 路径替换:`~/` → `@/`(批量 sed),移除 Nuxt 特有 API(`useFetch` → `fetch` + 自封装,`useNuxtApp` 移除)          | 0.5 天     | 仅少量文件需要改                       |
| P6       | 联调:本地 Vite dev + 后端独立运行,P2P / 推送 / 取件码端到端测试                                                         | 1 天       |                                        |
| P7       | 部署脚本 + Caddyfile 适配(前端静态 + 反代 ws 到后端) + README 更新                                                      | 0.5-1 天   |                                        |
| **合计** |                                                                                                                         | **5-7 天** |                                        |

### 3.5 风险与对策

| 风险                                                                         | 影响 | 对策                                                                            |
| ---------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------- |
| `~/` → `@/` 别名替换遗漏                                                     | 中   | `grep -r "from '~/" src/` 批量 sed;TypeScript 编译会立刻报错                    |
| Nuxt 自动 import(`useXxxStore` 无需 import)丢失                              | 中   | 在 `src/main.ts` 中显式 import + 注册;Pinia plugin `autoImports` 仍支持         |
| `@nuxtjs/i18n` 服务端 cookie 重定向丢失                                      | 低   | 改用纯前端 localStorage 持久化语言偏好;初次访问走 `navigator.language` 检测     |
| `@nuxtjs/color-mode` SSR 逻辑丢失                                            | 低   | 改用 `useColorMode`(vueuse)或自实现,纯客户端                                    |
| `useFetch` / `$fetch` 行为差异                                               | 低   | 替换为自封装 `apiFetch()`(基于原生 fetch + 错误处理);改动局限在少量调用点       |
| `<NuxtLink>` / `<NuxtPwaManifest>` / `<NuxtRouteAnnouncer>` 等 Nuxt 内置组件 | 低   | 全局替换:`NuxtLink` → `router-link`,移除 Nuxt 特有组件(基本不影响功能)          |
| PrimeVue 的 `usePrimeVue()` / Toast service 注入                             | 低   | 在 `main.ts` 中 `app.use(PrimeVue, {...})` + `app.use(ToastService)` 手动注入   |
| `app.vue` 中 `<NuxtPage>` 路由出口                                           | 低   | 替换为 `<router-view />`                                                        |
| 后端 Hono/Fastify ws upgrade 与 Nitro API 差异                               | 中   | WebSocket 消息处理逻辑可逐行平移,仅适配框架的 peer / send API                   |
| hookable patch 在新后端缺失                                                  | 低   | 在新后端的 `package.json` 复制 `postinstall: "node scripts/patch-hookable.mjs"` |
| 部署路径变更:前端在静态目录,后端独立进程                                     | 低   | Caddyfile 调整:`/` serve 静态,`/ws/` `/api/` 反代到 `127.0.0.1:3002`            |
| 部署 pipeline(Caddy 反代路径变化)                                            | 低   | Caddyfile 加 `/ws/*` → ws 后端的反代段                                          |

### 3.6 不在拆分范围

以下维持现状或延后处理:

- **错误码语义**: 全部沿用(`-1 / -2 / -3 / -5 / -10 / 403 / 404`)
- **业务消息协议**: WebSocket JSON 消息格式、SDP/ICE 转发、TTLCache、Push 协议全部不变
- **i18n 文案**: 中英双语对照保留,key 不变,只换加载方式(Nuxt 模块 → vue-i18n)
- **功能行为**: 取件码机制、P2P 数据流、定向推送流程、任务日志、钱包系统全部不变
- **样式系统**: Tailwind CSS + PrimeVue unstyled 保持
- **Docker 镜像**: 可拆分为前后端两个镜像,也可继续单镜像内多阶段构建
- **测试**: 当前无测试,拆分后引入 vitest(可选,后置)

### 3.7 验收标准

- [ ] 前端 Vite 构建产物 `dist/` < 1MB gzipped,首屏加载 < 2s
- [ ] 前端所有 4 个页面 + 16 个组件 + 9 个 store 零修改可运行
- [ ] 后端独立运行在 `127.0.0.1:3002`,WebSocket `wss://share.armin.com.cn/ws/connect` 配对成功
- [ ] 三种传输模式(transFile / transDir / syncDir)端到端可用
- [ ] 定向推送 + 取件码 + 联系人 / 群组全部功能保留
- [ ] 钱包生成 / 导入 / 重置 / 切换 ID 全流程
- [ ] 错误码 -1 / -2 / -3 / -5 / -10 / 403 / 404 全部能复现并显示
- [ ] i18n 切换 + 暗色模式 + PWA 安装可用
- [ ] hookable patch 在新后端同样有效
- [ ] Caddyfile 反代:静态资源 + /ws/ + /api/ 路径正确
- [ ] README + AGENTS.md 更新前后端分离的部署步骤
- [ ] 旧 Nuxt 项目可平稳下线(分阶段切流)

---

## 4. 待用户确认

迁移前需要明确:

1. **后端框架选型**: Hono(轻量 + 边缘友好)还是 Fastify(更成熟的 Node 生态)?
2. **是否保留旧 Nuxt 项目**: 拆分时是保留旧 Nuxt 仓库 + 新建 frontend/backend 双仓,还是原地重构 Nuxt 项目目录结构?
3. **部署形态**: 单域名(share.armin.com.cn 同时反代前端静态 + ws/api 到后端)还是前后端分离域名?
4. **新前端仓库位置**: 在当前 git 仓库新建 `frontend/` 子目录(保持单仓),还是新建独立仓库?
5. **是否迁移 PrimeVue Aura PassThrough**: 现有 `app/presets/aura/` 110+ 个 PT 文件可零修改平移,确认保留
6. **i18n 持久化方式**: 拆 Nuxt cookie 后,改为 localStorage 持久化,初次访问用 `navigator.language` 检测,是否可接受

请逐项确认后再开工。
