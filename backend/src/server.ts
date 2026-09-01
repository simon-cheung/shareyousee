// Fastify + Bun 后端入口
// 路由:
//   GET  /api/health           健康检查
//   POST /api/getIP            客户端公网 IP 查询
//   POST /api/transCount       全局传输计数
//   WS   /api/connect          WebSocket 信令(取件码配对 + Push 协议)
// 可选:serve frontend dist/ 静态资源(便于单容器部署)

import Fastify from 'fastify'
import websocket from '@fastify/websocket'
import fastifyStatic from '@fastify/static'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { WebSocket } from 'ws'
import { bindConnectionHandlers } from './ws/connect'
import { getTransCount } from './utils/TransCount'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const PORT = Number(process.env.PORT || 3002)
const HOST = process.env.HOST || '0.0.0.0'

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info'
  }
})

// 放宽 body 解析:让所有 content-type(包括 text/plain、application/x-www-form-urlencoded
// 等)都接受为字符串。原始 Nitro 的 defineEventHandler 不严格校验 content-type。
app.addContentTypeParser('*', (_req, payload, done) => {
  let data = ''
  payload.on('data', (chunk) => {
    data += chunk
  })
  payload.on('end', () => {
    done(null, data)
  })
  payload.on('error', (err) => {
    done(err)
  })
})

// WebSocket 插件
await app.register(websocket)

// 静态资源:若 frontend 产出的 dist 存在,直接 serve(单仓部署)
// 路径:优先 env STATIC_DIR(单容器部署时挂载到 /app/public-dist),
// 否则相对后端:backend/.. → repo root,然后 frontend/dist
const staticDir = process.env.STATIC_DIR || resolve(__dirname, '../../frontend/dist')
if (existsSync(staticDir)) {
  await app.register(fastifyStatic, {
    root: staticDir,
    prefix: '/',
    wildcard: false,
    index: ['index.html']
  })
  app.log.info(`static files served from ${staticDir}`)
}

// 健康检查
app.get('/api/health', async () => {
  return { status: 'ok', ts: Date.now() }
})

// 公网 IP 查询:从原 server/api/getIP.post.ts 平移
app.post('/api/getIP', async (req) => {
  const xff = req.headers['x-forwarded-for']
  let ip = req.ip
  if (typeof xff === 'string' && xff.length > 0) {
    ip = xff.split(',')[0]!.trim()
  } else if (Array.isArray(xff) && xff.length > 0) {
    ip = String(xff[0])
  }
  return ip || ''
})

// 全局传输计数:从原 server/api/transCount.post.ts 平移
app.post('/api/transCount', async () => {
  return getTransCount()
})

// WebSocket 信令入口
app.register(async (instance) => {
  instance.get('/api/connect', { websocket: true }, (connection, req) => {
    // @fastify/websocket v10:connection 可能是 SocketStream(socket 字段)或直接是 socket
    const socket = (connection as any).socket ?? (connection as any)
    if (!socket || typeof (socket as any).on !== 'function') {
      instance.log.warn('WS: invalid socket')
      return
    }
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    bindConnectionHandlers(socket as WebSocket, id)
  })
})

// SPA fallback:非 /api 路径的 GET 请求,若有静态产物则回退到 index.html(history 路由)
if (existsSync(staticDir)) {
  app.setNotFoundHandler((req, reply) => {
    if (req.method !== 'GET' || req.url.startsWith('/api/') || req.url.startsWith('/ws/')) {
      reply.code(404).send({ error: 'Not Found' })
      return
    }
    reply.type('text/html').sendFile('index.html')
  })
}

// 启动
try {
  await app.listen({ port: PORT, host: HOST })
  app.log.info(`ShareYouSee backend listening on ${HOST}:${PORT}`)
} catch (err) {
  app.log.error(err)
  process.exit(1)
}

// graceful shutdown
const shutdown = async (sig: string) => {
  app.log.info(`Received ${sig}, shutting down`)
  try {
    await app.close()
  } finally {
    process.exit(0)
  }
}
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
