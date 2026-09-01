# AGENTS.md — ShareYouSee(前后端分离版)

Vue 3 + Vite SPA 前端,Fastify + Bun 后端,基于 WebRTC 的点对点文件/目录传输项目。

> 详细的代码级维护约束、错误码语义、编码规范全部见
> [`.github/copilot-instructions.md`](.github/copilot-instructions.md)。
> 本文件只补充**容易让 Agent 误判或漏掉**的关键事实与命令。

## 工具链与命令

- **包管理器**: **Bun 1.1+**(`packageManager: "bun@1.1.0"`)。**不要换用 npm / yarn / pnpm**。
- **后端**: `backend/` 目录下 `bun run dev` / `bun run build` / `bun run start`。
- **前端**: `frontend/` 目录下 `bun run dev` / `bun run build` / `bun run preview`。
- 开发期:`bun run dev` 启动后端(端口 3002),再 `bun run dev` 启动前端(Vite 已配置 `/api` 反代到 `http://127.0.0.1:3002`)。
- 没有 ESLint / 测试框架。仅有 Prettier(`semi:false`、`singleQuote:true`、`trailingComma:"none"`、`printWidth:100`)。

```bash
# 启动后端
cd backend && bun install && bun run dev

# 启动前端(另一终端)
cd frontend && bun install && bun run dev
```

## 目录与职责

| 路径                                     | 职责                                                              |
| ---------------------------------------- | ----------------------------------------------------------------- |
| `frontend/`                              | Vue 3 + Vite SPA 前端                                             |
| `frontend/src/views/`                    | 路由页面(原 `app/pages/*.vue` 平移)                               |
| `frontend/src/components/`               | UI 组件(原 `app/components/*.vue` 平移,**零修改**)                |
| `frontend/src/stores/`                   | Pinia 状态(原 `app/stores/*.ts` 平移,**零修改**)                  |
| `frontend/src/composables/`              | 复用组合式逻辑(含 `usePresenceWs` 全局 ws,**零修改**)             |
| `frontend/src/utils/`                    | 工具(PeerDataChannel / wallet / files / storage,**零修改**)       |
| `frontend/src/types/`                    | 类型定义 + global.d.ts                                            |
| `frontend/src/locales/`                  | vue-i18n 中英双语文案(从 `i18n/i18n.config.ts` 平移)              |
| `frontend/src/presets/aura/`             | PrimeVue Aura PassThrough 主题(从 `app/presets/aura/` 平移)       |
| `frontend/src/styles/main.css`           | 全局 CSS(Tailwind + PrimeVue unstyled 变量)                       |
| `frontend/src/router/index.ts`           | Vue Router 4 显式路由表                                           |
| `frontend/src/main.ts`                   | 应用入口(Pinia + PrimeVue + vue-i18n + Vue Router)                |
| `frontend/src/App.vue`                   | 根组件(原 `app/app.vue` 平移,移除 Nuxt 元素)                      |
| `frontend/src/utils/colorMode.ts`        | 暗色模式(`useColorMode()`,持久化到 localStorage,挂 `<html>.dark`) |
| `frontend/src/utils/localePath.ts`       | 替代 Nuxt `useLocalePath()`,当前直接返回原路径                    |
| `frontend/src/utils/seoMeta.ts`          | 替代 Nuxt `useSeoMeta()`,SPA 下为 no-op                           |
| `frontend/src/utils/useState.ts`         | 替代 Nuxt `useState()`,module-level Map shim(旧 composables 使用) |
| `frontend/src/components/ClientOnly.vue` | `<ClientOnly>` 真实 Vue 组件                                      |
| `frontend/src/components/Icon.vue`       | `<Icon name="collection:name" />` 真实 Vue 组件                   |
| `frontend/public/`                       | 静态资源 + PWA sw.js + manifest                                   |
| `frontend/vite.config.ts`                | Vite + unplugin-icons + PWA 配置                                  |
| `backend/`                               | Fastify + Bun 后端                                                |
| `backend/src/server.ts`                  | Fastify 入口(WebSocket + REST + 可选静态托管)                     |
| `backend/src/ws/connect.ts`              | WebSocket 信令(取件码配对 + SDP/ICE 中转 + Push 协议)             |
| `backend/src/ws/presence.ts`             | 在线状态 + 定向推送注册表                                         |
| `backend/src/utils/TransCount.ts`        | 全局传输计数(本地文件持久化)                                      |

## 业务流程骨架(影响改动边界判断)

业务流程与旧版完全一致,**未改变任何协议语义**:

- 取件码 = 4 位数字,发送端通过 WebSocket 拿到,接收端用取件码配对。
- 信令只做配对和 SDP/ICE 中转;**实际文件数据走 WebRTC DataChannel**(`frontend/src/utils/PeerDataChannel.ts`)。
- 文件按 1 MiB 分片发送,接收端按 MD5 校验(CryptoJS Base64)。校验失败必须保留失败语义(错误码 `-3`),不能静默。
- 三种传输类型 `transFile` / `transDir` / `syncDir`,对应三种 UX 路径。
- 目录同步的三类结果:**add / update / delete**,删除后还会尝试清理空父目录。

## 错误码(保持兼容)

`403` 用户拒绝 · `404` 取件码/文件不存在 · `-1` 能力不支持(目录传输)· `-2` 连接断开 · `-3` 哈希失败 · `-5` 信令服务异常 · `-10` 超时。

错误码定义见 `backend/src/ws/connect.ts` / `frontend/src/stores/` / `frontend/src/locales/i18n.config.ts`。

## 部署与运行约束

- **生产启动**:
  - 后端:`cd backend && PORT=3002 bun run start`(默认 3002)
  - 前端:静态资源由 Caddy/Nginx 直托管(`frontend/dist/`)
- **反代配置**: `Caddyfile` 将 `https://share.armin.com.cn` 反代 `ws/api` 到 `127.0.0.1:3002`,静态资源由 Caddy 直接 serve。
- **Docker 镜像**: `shouchenicu/fastsend` 后端 + `backend/Dockerfile`。前端不打镜像,由 Caddy 静态托管。
- **目录传输/同步 + 拖拽上传需要 HTTPS + 现代浏览器**;`isModernFileAPIAvailable()` 检测。
- **手动部署**: `scripts/package-deploy.sh` 生成 `dist/shareyousee-output.tar.gz`,解压到部署目录后启动后端。
- **Fastify 后端**: Bun 原生运行,不依赖 hookable patch(原 Nuxt `hookable 6.1.1` 补丁问题已随 Nitro 一起剥离)。

## 改动前的硬性检查

1. 这次改动属于**发送端 / 接收端 / 信令**哪一段?影响双边?
2. 是否触碰取件码、SDP/ICE 消息、`PeerDataChannel` 协议结构?——这些是禁止重写的。
3. 是否引入新的全局状态?——优先复用 `app` / `user` / `transferConfig` / `home` / `senderTransfer` / `recipientTransfer`。
4. 文案改动是否同步到 `frontend/src/locales/i18n.config.ts` 中英双份?
5. 是否动了 Tailwind/ PrimeVue / Vue Router 大版本?——这些不主动升级。

## 禁止事项(与 copilot-instructions.md 一致)

- 不重写 Pinia → `useState`,不重写 `PeerDataChannel` 协议。
- 不擅自改错误码语义,不删 `transDir/syncDir` 的能力检测。
- 不做无关重构、不把页面改成胖组件。
- 不改包管理器(必须用 **Bun**)、不交只改 `package.json` 不更新 `bun.lock` 的 PR。
- 不动 Nuxt 专属元素(如 `<NuxtPage>` / `<NuxtRouteAnnouncer>`)——已通过 `utils/colorMode.ts` + `utils/localePath.ts` + `components/ClientOnly.vue` + `components/Icon.vue` 等真实实现替代,新代码不要再用 Nuxt 元素。
- 中文注释为主,只解释**为什么**和**业务语义**,不写低价值注释。

## 与 Nuxt 旧版的差异(迁移对照)

| Nuxt 4 元素                | Vue 3 + Vite 等价物                                                |
| -------------------------- | ------------------------------------------------------------------ |
| `app/` (srcDir)            | `frontend/src/`                                                    |
| `app/pages/*.vue`          | `frontend/src/views/*View.vue`                                     |
| `<NuxtPage />`             | `<RouterView />`                                                   |
| `<NuxtLink>`               | `<NuxtLink>`(别名指向 `RouterLink`)或 `<RouterLink>`               |
| `<NuxtPwaManifest>`        | 空组件(SPA 中由 index.html 注入 manifest link)                     |
| `<NuxtRouteAnnouncer>`     | 空组件(无障碍提示,Vue Router 自带)                                 |
| `<ClientOnly>`             | `<ClientOnly>`(`components/ClientOnly.vue` 真实 .vue 组件)         |
| `useI18n()`                | `useI18n()`(vue-i18n,各文件显式 import)                            |
| `useLocalePath()`          | `useLocalePath()`(`utils/localePath.ts` 固定返回原路径)            |
| `useColorMode()`           | `useColorMode()`(`utils/colorMode.ts`,localStorage 持久化)         |
| `useFetch / $fetch`        | 原生 `fetch`(各 store 暂无迁移需求)                                |
| `useState()`               | `useState()`(`utils/useState.ts` module-level Map shim,新代码禁用) |
| `imports.dirs: ['stores']` | 各 `<script setup>` 显式 `import { useXxxStore } from '@/stores'`  |
| `@primevue/nuxt-module`    | 手动 `app.use(PrimeVue)` + 全局注册组件                            |
| `@nuxt/icon`               | `unplugin-icons` + 自定义 `<Icon name="collection:icon" />`        |
| `@nuxtjs/i18n`             | `vue-i18n`(纯前端,localStorage 持久化)                             |
| `@nuxtjs/color-mode`       | 自实现 `useColorMode`(`utils/colorMode.ts`)                        |
| `@vite-pwa/nuxt`           | `vite-plugin-pwa`(API 一致)                                        |
| `server/api/connect.ts`    | `backend/src/ws/connect.ts`(Nitro WS → Fastify WS)                 |
| `server/utils/presence.ts` | `backend/src/ws/presence.ts`(纯逻辑平移)                           |
