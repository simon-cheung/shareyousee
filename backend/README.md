# ShareYouSee 后端 (Fastify + Bun)

WebSocket 信令 + 在线状态/定向推送服务,原 Nuxt 4 `server/` 平移版本。

## 启动

```bash
bun install
bun run dev      # 开发(热重载)
bun run build    # 构建到 dist/
bun run start    # 生产运行
```

默认监听 `0.0.0.0:3002`,可通过 `PORT` 覆盖。

## 路由

| 方法 | 路径              | 说明                           |
| ---- | ----------------- | ------------------------------ |
| GET  | `/api/health`     | 健康检查                       |
| POST | `/api/getIP`      | 客户端公网 IP(X-Forwarded-For) |
| POST | `/api/transCount` | 全局传输计数                   |
| WS   | `/api/connect`    | WebSocket 信令                 |

WebSocket 协议详见 `src/ws/connect.ts`。

## 静态资源

启动时会检查 `../frontend/dist`,若存在则直接 serve 前端 SPA(便于单仓部署)。
生产建议用 Caddy/Nginx 反代,前端静态资源独立托管,后端只承担 ws/api。
