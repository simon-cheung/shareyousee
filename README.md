# ShareYouSee 文件快传

基于 WebRTC 的点对点文件 / 目录传输工具。浏览器间直连传输,支持文件、目录、目录同步,以及定向推送、语音通话、屏幕共享。

在线体验:https://share.armin.com.cn

## 特性

- 点对点加密传输(WebRTC DataChannel)
- 支持文件和文件夹传输,支持目录同步(add / update / delete)
- 取件码配对(4 位数字),普通发送凭码可取,定向发送推送给指定联系人 / 群组
- 基于 BIP39 助记词的身份系统(世界 ID、联系人、群组、定向推送)
- 语音通话、屏幕共享(WebRTC MediaStream)
- 局域网自动优化
- 中英双语界面
- PWA 可安装

## 技术栈

- WebRTC + Modern File System API
- 前端:Vue 3 + Vite + Pinia + TypeScript + PrimeVue 4 + Tailwind CSS + vue-i18n
- 后端:Fastify + Bun + @fastify/websocket
- PWA:vite-plugin-pwa(workbox)

## 目录结构

    shareyousee/
    ├── frontend/                 # Vue 3 + Vite SPA 前端
    │   ├── src/
    │   │   ├── views/            # 路由页面(Home / Sender / Recipient / Tasks / Call)
    │   │   ├── components/       # UI 组件
    │   │   ├── stores/           # Pinia 状态(含 senderTransfer / recipientTransfer / call)
    │   │   ├── composables/      # 组合式逻辑(含 usePresenceWs 全局 ws)
    │   │   ├── utils/            # 工具(PeerDataChannel / PeerMedia / wallet / files)
    │   │   ├── types/            # 类型定义
    │   │   ├── locales/          # vue-i18n 中英双语文案
    │   │   ├── presets/aura/     # PrimeVue Aura 主题
    │   │   ├── router/index.ts   # Vue Router 路由表
    │   │   ├── App.vue           # 根组件
    │   │   └── main.ts           # 应用入口
    │   ├── public/               # 静态资源 + PWA sw.js
    │   ├── vite.config.ts        # Vite + PWA + 图标插件配置
    │   └── package.json
    ├── backend/                  # Fastify + Bun 后端
    │   ├── src/
    │   │   ├── server.ts         # Fastify 入口(WebSocket + REST + 可选静态托管)
    │   │   ├── ws/connect.ts     # WebSocket 信令(取件码配对 + SDP/ICE 中转 + Push 协议)
    │   │   ├── ws/presence.ts    # 在线状态 + 定向推送注册表
    │   │   └── utils/TransCount.ts
    │   └── Dockerfile
    ├── Caddyfile                 # 反代配置(静态资源 + /api/* 反代)
    ├── docker-compose.yaml
    └── scripts/package-deploy.sh # 一键打包脚本

## 环境要求

- Bun 1.1+（包管理器,不要用 npm / yarn / pnpm）
- 现代浏览器(目录传输、屏幕共享需要 HTTPS + 现代 File System API)

## 安装依赖

    cd backend && bun install
    cd frontend && bun install

## 编译 / 构建

    # 后端
    cd backend && bun run build      # 产物 → backend/dist/

    # 前端
    cd frontend && bun run build     # 产物 → frontend/dist/

## 本地开发

    # 启动后端(端口 3002)
    cd backend && bun run dev

    # 启动前端(另一终端,端口 5173,自带 HTTPS 自签证书)
    cd frontend && bun run dev

Vite 已配置 /api 反代到 http://127.0.0.1:3002。前端访问 http://localhost:5173(或局域网 IP https://192.168.x.x:5173)即可联调完整流程。

自签证书生成:

    cd frontend && bun run scripts/gen-dev-certs.mjs

## 生产部署

### 反向代理 + 静态托管(推荐)

1. 构建产物:

       cd frontend && bun run build
       cd backend && bun run build

2. 前端静态资源由 Caddy / Nginx 直托管(frontend/dist/)
3. 后端:

       cd backend && PORT=3002 bun run dist/server.js

4. Caddy 反代 /api/* 与 WebSocket 到 127.0.0.1:3002(见仓库 Caddyfile)

### 一键打包

    ./scripts/package-deploy.sh
    # 生成 dist/shareyousee-output.tar.gz

### Docker

    docker compose up -d
    # 后端监听 3002,前端 dist 挂载到 /app/public-dist 由 Fastify serve

## 使用提示

1. 取件码为 4 位数字,发送端通过 WebSocket 获取,接收端凭码配对。
2. 实际文件数据走 WebRTC DataChannel(信令只做配对和 SDP/ICE 中转)。
3. 传输目录或同步目录需要 HTTPS + 现代浏览器支持。
4. 同一局域网内传输速度最快;部分网络环境可能阻止 P2P 连接导致传输失败。
5. 语音通话 / 屏幕共享:先选联系人或群组,再点首页对应入口;被叫方从推送通知进入直接接收。

## 错误码

- 403 用户拒绝
- 404 取件码 / 文件不存在
- -1 能力不支持(目录传输)
- -2 连接断开
- -3 哈希失败
- -5 信令服务异常
- -10 超时

## 开源协议

MIT
