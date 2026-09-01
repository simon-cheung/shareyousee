<h1 align="center">ShareYouSee 文件快传 🚀</h1>

<p align="center">
  <img alt="Version" src="https://img.shields.io/badge/version-0.7.3-blue.svg?style=flat-square" />
  <a href="#" target="_blank">
    <img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square" />
  </a>
</p>

<p align="center">
  <img src="./public/ogImg.webp" />
</p>

## 📖 项目介绍

ShareYouSee 是一个基于 WebRTC 技术的点对点文件传输工具，支持快速的目录同步和文件传输。通过浏览器即可实现安全、高效的文件共享。

🌐 在线体验：[share.armin.com.cn](https://share.armin.com.cn)

## ✨ 特性

- 🔒 点对点加密传输，确保数据安全
- 📁 支持文件和文件夹传输
- 🚀 局域网自动优化，传输更快
- 🎯 简单易用的界面设计
- 🌍 支持中英文界面
- 📲 支持PWA轻量安装

## 🛠️ 技术栈

- WebRTC
- Vue.js
- Nuxt 4
- Pinia
- TypeScript
- Modern File System API

## 🗂️ 目录结构

项目已按 Nuxt 4 默认约定迁移为 `app/` 目录结构：

- `app/`：前端应用层源码，包括页面、组件、stores、composables、utils、全局样式与 `app.vue`
- `server/`：Nitro 服务端接口与 WebSocket 信令逻辑
- `public/`：静态资源与 PWA 相关文件
- `presets/`：PrimeVue 主题预设

这样可以更清晰地分离前端应用层与服务端上下文，也更符合 Nuxt 4 的默认扫描方式。

## 📦 安装与构建

```bash
# 安装依赖
yarn install

# 构建项目
yarn build
```

## 🚀 使用方法

```bash
# 启动服务
node .output/server/index.mjs
```

### 手动部署（非 Docker）

通过 `scripts/package-deploy.sh` 脚本打包。脚本会在 `dist/` 下生成 `shareyousee-output.tar.gz`，**保留 `.output/server/node_modules/` 内的符号链接**（Nitro 用软链隔离同名多版本包）。

```bash
# 本地打包
yarn build
./scripts/package-deploy.sh

# 上传到服务器
scp dist/shareyousee-output.tar.gz user@host:~/

# 在服务器上解压到 .output 目录（注意：解压目标必须是名为 .output 的目录）
ssh user@host '
  mkdir -p ~/armingg/html-root/share/.output &&
  tar -xzf ~/shareyousee-output.tar.gz -C ~/armingg/html-root/share/.output
'

# 启动
ssh user@host 'cd ~/armingg/html-root/share/.output/server && PORT=3002 node index.mjs'
```

> [!IMPORTANT]
>
> **解压目录必须是 `.output`**（即 `server/index.mjs` 与 `nitro.json` 同级的父目录）。
>
> Nitro 在 SSR 渲染时依赖 `globalThis._importMeta_.url` 推导资源路径，路径不在 `.output/` 结构下会触发 SSR 错误：
>
> ```
> Cannot read properties of null (reading 'ce')
> ```
>
> 无论部署到 `/srv/app/.output` 还是 `~/myapp/.output`，只要顶层目录名是 `.output` 即可正常启动。

> [!WARNING]
>
> 传输与解压时**必须保留符号链接**。下面任一操作会物化软链、破坏 SSR：
>
> - `rsync -aL ...` / `cp -RL ...` / `tar -cZh ...` / `scp` 默认行为
> - 解压到不支持软链的文件系统（如 Windows NTFS、某些 FTP/WebDAV）
>
> 安全的传输方式：`scp`（不带 `-r` 的隐式物化）、`rsync -avz --exclude='.DS_Store'`、或先在本地 `tar -czf` 再上传压缩包。

### `node_modules` 补丁说明

`yarn install` 后会自动运行 `scripts/patch-hookable.mjs`(见 `package.json` 的 `postinstall`)。补丁内容：

- **目标库**：[`unjs/hookable`](https://github.com/unjs/hookable) v6.1.1（`yarn.lock` 当前锁定的版本）
- **修复内容**：`serialTaskCaller` / `parallelTaskCaller` 在 `hooks.length === 0` 时返回 `undefined`，导致 Nitro 中 `await callHook(...).catch()` 抛 `Cannot read properties of undefined (reading 'catch')`。补丁让空钩子时返回 `Promise.resolve()`。
- **上游状态**：[hookable 仓库](https://github.com/unjs/hookable/issues)（截至 main 分支 2026-08-31 仍未合并修复）。一旦官方版本修复，可移除本补丁及对应 `postinstall` 脚本。
- **必须运行 `yarn install`**：补丁依赖 `postinstall` 钩子写入 `node_modules/hookable/dist/index.mjs`。把 `node_modules` 直接拷到服务器、或 Docker 镜像里只 `COPY node_modules` 不重跑 install，会让 SSR 启动时崩溃。
- **服务器上不需要再装依赖**：Nitro 把依赖全部 inline 在 `.output/server/node_modules/` 里（`nitro.externals.inline: [/.*/]`），仅 `.output/server/node_modules/hookable/dist/index.mjs` 仍需保持 patch 状态。如果重新 build，patch 会重新应用一次。

> [!IMPORTANT]
> 目录传输和同步需要 `HTTPS` 以及浏览器支持，一般新版本的桌面浏览器都支持
>
> 本项目自身的 HTTPS 配置方式（测试环境）请参考：
>
> - [置顶 Issue](https://github.com/ShouChenICU/FastSend/issues/9#issuecomment-2562353775)
> - [Nuxt 部署教程（英文）](https://nuxt.com/docs/4.x/getting-started/deployment#entry-point)
>
> ShareYouSee 不建议直接以 HTTPS 形式进行生产环境部署，而应当位于反向代理服务器之后，请参考：
>
> - [Nginx](https://nginx.org/en/docs/http/configuring_https_servers.html)
> - [Apache httpd](https://httpd.apache.org/docs/current/ssl/)
> - [Caddy](https://caddyserver.com/docs/quick-starts/https)
> - [Windows IIS](https://learn.microsoft.com/zh-cn/iis/manage/configuring-security/how-to-set-up-ssl-on-iis)

## 🐳 Docker 和 Docker Compose

### 使用 Docker Hub 发行版

```bash
docker run -d --name fastsend -p 3000:3000 shouchenicu/fastsend:latest
```

> [!CAUTION]
>
> `shouchenicu/fastsend` 是此项目在 Docker Hub 上的 **唯一** 官方镜像！
>
> 当前已发现 12 个第三方镜像，其中5个[^1]的下载使用量高于官方镜像。请注意甄别，风险自负！

[^1]: 比如 `niliaerith/fastsend`

### Docker 构建

```bash
docker build -t fastsend .
docker run -d --name fastsend -p 3000:3000 fastsend
```

### Docker Compose

将项目拉取到本地，然后运行：

```bash
docker-compose up -d
```

访问 `http://localhost:3000` 即可使用。

## 💡 使用提示

1. 确保浏览器启用了 WebRTC 功能
2. 如需传输文件夹或同步目录，请确保浏览器支持现代文件系统 API 并已启用 HTTPS 传输
3. 在同一局域网内传输速度最快
4. 建议在网络状态良好时使用，部分网络环境可能会阻止 P2P / WebRTC 正确建立连接，从而导致传输失败

## 👨‍💻 作者

**ShouChen**

- 博客: [shouchen.blog](https://shouchen.blog)
- X: [@ShouChen\_](https://x.com/ShouChen_)

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

[![Contributors](https://contrib.nn.ci/api?no_bot=true&repo=shouchenicu/fastsend)](https://github.com/shouchenicu/fastsend/graphs/contributors)

## 📝 开源协议

本项目基于 MIT 协议开源。

## ⭐ 支持项目

如果这个项目对你有帮助，欢迎给一个 star 支持一下！
