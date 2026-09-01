# AGENTS.md — FastSend

Nuxt 4 + Vue 3 + WebRTC 点对点文件/目录传输项目。`app/` 是前端（Nuxt 4 默认 srcDir），`server/` 是 Nitro 信令服务端，`i18n/` 在 srcDir 外。

> 详细的代码级维护约束、错误码语义、编码规范全部见
> [`.github/copilot-instructions.md`](.github/copilot-instructions.md)。
> 本文件只补充**容易让 Agent 误判或漏掉**的关键事实与命令。

## 工具链与命令

- 包管理器：**Yarn 4**（`packageManager: "yarn@4.18.0"`），`yarnrc.yml` 启用 `nodeLinker: node-modules` 与 `npmMinimalAgeGate: 4320`（新依赖至少存在 3 天才能装）。
- **不要换用 npm / pnpm / bun**。`yarn.lock` 必须随 `package.json` 同步提交。
- 没有 ESLint / 测试框架。仅有 Prettier（`semi:false`、`singleQuote:true`、`trailingComma:"none"`、`printWidth:100`）。
- 常用命令：

```bash
yarn install            # 安装依赖（postinstall 会自动 nuxt prepare）
yarn dev                # 本地开发（已带 --host）
yarn build              # 生产构建，产物在 .output/
node .output/server/index.mjs   # 启动构建产物（端口 3000）
```

- 没有单独的 lint/test 命令。提交前自检顺序建议：**`yarn build`**（覆盖 TS 类型 + 打包）+ 浏览器手工冒烟。

## 目录与职责

| 路径                         | 职责                                                                                          |
| ---------------------------- | --------------------------------------------------------------------------------------------- |
| `app/pages/`                 | `index.vue`（首页）/ `sender.vue` / `recipient.vue`，页面要薄                                 |
| `app/stores/`                | Pinia 状态；新业务状态优先放现有 store，不要新建平行源                                        |
| `app/utils/`                 | 纯工具 + `PeerDataChannel.ts`（WebRTC 封装）+ `files.ts`（文件系统 API）+ `publicStunList.ts` |
| `app/composables/`           | 复用组合式逻辑（注意 `useFilesInfo.ts` 内部仍用 `useState`，是新代码的禁区）                  |
| `app/types/`                 | `transfer.ts`（核心类型 + 默认状态构造器）、`global.d.ts`（浏览器 API 扩展）                  |
| `server/api/`                | `connect.ts`（WebSocket 信令 + 4 位取件码配对）、`getIP.post.ts`、`transCount.post.ts`        |
| `server/utils/TransCount.ts` | 基于本地文件 `transCount` 的全局传输计数（无 DB）                                             |
| `i18n/i18n.config.ts`        | 中英文案；改文案必须**双语同步**                                                              |
| `app/presets/aura/`          | PrimeVue 主题预设（`importPT.from: '~/presets/aura'`,目录必须在 srcDir 内才能用别名）         |

Nuxt 配置要点：

- `srcDir: 'app'`、`imports.dirs: ['stores']` —— 所以 store 文件**直接 `useXxxStore()` 即可**，无需手动 import。
- `nitro.experimental.websocket: true` 是信令可用的前提，**别关**。
- `nitro.externals.inline: [/.*/]` 把所有依赖打进 server bundle，避免 Node 24+ ESM 解析失败。
- `pwa.strategies: 'injectManifest'`，service worker 来自 `public/sw.js`。

## 业务流程骨架（影响改动边界判断）

- 取件码 = 4 位数字，发送端通过 WebSocket 拿到，接收端用取件码配对。
- 信令只做配对和 SDP/ICE 中转；**实际文件数据走 WebRTC DataChannel**（`app/utils/PeerDataChannel.ts`）。
- 文件按 1 MiB 分片发送，接收端按 MD5 校验（CryptoJS Base64）。校验失败必须保留失败语义（错误码 `-3`），不能静默。
- 三种传输类型 `transFile` / `transDir` / `syncDir`，对应三种 UX 路径，详见 `scene.md`。
- 目录同步的三类结果：**add / update / delete**，删除后还会尝试清理空父目录。

## 错误码（保持兼容）

`403` 用户拒绝 · `404` 取件码/文件不存在 · `-1` 能力不支持（目录传输）· `-2` 连接断开 · `-3` 哈希失败 · `-5` 信令服务异常 · `-10` 超时。

新增错误码必须同时改：**server `connect.ts` / 收发端 store / `i18n` 文案 / 页面分支**，且加中文注释。

## 部署与运行约束

- 生产启动：`PORT=3002 node .output/server/index.mjs`（Docker 镜像和 `docker-compose.yaml` 用的就是这个）。
- 反向代理：`Caddyfile` 将 `https://share.armin.com.cn` 反代到 `127.0.0.1:3002`，并保留 `http://192.168.1.3:3002` 作为局域网调试入口。
- **不要直接以 HTTPS 形式生产部署**，应放在反向代理后（Nginx / Apache / Caddy / IIS）。
- 目录传输/同步 + 拖拽上传需要 **HTTPS + 现代浏览器**；`isModernFileAPIAvailable()` 检测。
- Docker Hub 官方镜像仅 `shouchenicu/fastsend`，README 里专门警告了仿冒镜像。
- 手动部署必须用 `scripts/package-deploy.sh` 生成 `dist/shareyousee-output.tar.gz`，服务器侧**必须**解压到名为 `.output` 的目录下（Nitro SSR 通过 `globalThis._importMeta_.url` 推导资源路径，路径层级不符会触发 `Cannot read properties of null (reading 'ce')`）。详见 README「手动部署」章节。
- 打包与传输**必须保留** `.output/server/node_modules/` 内的软链（Nitro 用软链隔离同名多版本依赖）；物化（`rsync -aL` / `cp -RL` / `tar -cZh` / Windows 不支持软链的文件系统）会破坏 SSR。
- `scripts/patch-hookable.mjs` 在 `postinstall` 自动修补 [`unjs/hookable`](https://github.com/unjs/hookable) v6.1.1：解决 `serialTaskCaller` / `parallelTaskCaller` 空钩子返回 `undefined` 导致 Nitro `await callHook().catch()` 崩溃。**上游未修复**（截至 main 2026-08-31），不可移除此 patch 和 `postinstall` 钩子。任何跳过 `yarn install` 的部署（如直接拷贝 `node_modules`）都会导致 SSR 启动崩溃。

## 改动前的硬性检查

1. 这次改动属于**发送端 / 接收端 / 信令**哪一段？影响双边？
2. 是否触碰取件码、SDP/ICE 消息、`PeerDataChannel` 协议结构？——这些是禁止重写的。
3. 是否引入新的全局状态？——优先复用 `app` / `user` / `transferConfig` / `home` / `senderTransfer` / `recipientTransfer`。
4. 文案改动是否同步到 `i18n/i18n.config.ts` 中英双份？
5. 是否动了 Tailwind/PrimeVue/Nuxt 大版本？——这些不主动升级，升级后至少跑一次 `yarn build`。

## 禁止事项（与 copilot-instructions.md 一致）

- 不重写 Pinia → useState，不重写 `PeerDataChannel` 协议。
- 不擅自改错误码语义，不删 `transDir/syncDir` 的能力检测。
- 不做无关重构、不把页面改成胖组件。
- 不改包管理器、不交只改 `package.json` 不更新 `yarn.lock` 的 PR。
- 中文注释为主，只解释**为什么**和**业务语义**，不写低价值注释。
