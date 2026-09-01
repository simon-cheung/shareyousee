FROM oven/bun:1.1-alpine

WORKDIR /app

# 后端依赖
COPY backend/package.json backend/bun.lock* ./
RUN bun install --frozen-lockfile --production=false

# 前端构建产物(若存在,Fastify 会自动 serve)
COPY frontend/dist ./public-dist 2>/dev/null || true
ENV STATIC_DIR=/app/public-dist

# 后端源码
COPY backend/src ./src
COPY backend/tsconfig.json ./

# 构建生产 bundle
RUN bun build src/server.ts --target=bun --outdir=dist --minify

# 暴露端口
EXPOSE 3002

# 启动生产版
CMD ["bun", "run", "dist/server.js"]