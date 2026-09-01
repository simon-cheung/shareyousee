#!/usr/bin/env bash
# 打包前后端分离后的产物体
# 产物结构:
#   shareyousee-output/
#   - frontend-dist/   (Vite build 产物)
#   - backend/         (Bun 编译产物 + 必要 node_modules)

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
FRONTEND_DIST="$ROOT_DIR/frontend/dist"
BACKEND_DIST="$ROOT_DIR/backend/dist"
OUTPUT_BASE="$ROOT_DIR/dist"
NAME="shareyousee-output"
STAGE_DIR="$OUTPUT_BASE/$NAME"

if [[ ! -d "$FRONTEND_DIST" ]]; then
  echo "❌ $FRONTEND_DIST 不存在,请先执行 cd frontend && bun run build"
  exit 1
fi

if [[ ! -d "$BACKEND_DIST" ]]; then
  echo "❌ $BACKEND_DIST 不存在,请先执行 cd backend && bun run build"
  exit 1
fi

rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR"

echo "📦 打包 frontend 静态资源..."
cp -r "$FRONTEND_DIST" "$STAGE_DIR/frontend-dist"

echo "📦 打包 backend 产物..."
mkdir -p "$STAGE_DIR/backend"
cp -r "$BACKEND_DIST" "$STAGE_DIR/backend/dist"
# Bun 编译为单文件 bundle(362 modules 已内联),无需携带 node_modules

# 启动脚本:前端静态目录由 STATIC_DIR 指向,后端产物指向 frontend-dist
cat > "$STAGE_DIR/backend/start.sh" <<'EOF'
#!/usr/bin/env bash
# 启动 Fastify 后端,并服务同目录下的 frontend-dist 静态资源
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
export STATIC_DIR="${STATIC_DIR:-$SCRIPT_DIR/../frontend-dist}"
export PORT="${PORT:-3002}"
exec bun run "$SCRIPT_DIR/dist/server.js"
EOF
chmod +x "$STAGE_DIR/backend/start.sh"

ARCHIVE="$OUTPUT_BASE/${NAME}.tar.gz"
rm -f "$ARCHIVE"

echo "📦 压缩..."
# BSD/GNU tar 都默认保留软链
tar -czf "$ARCHIVE" \
  --exclude='.DS_Store' \
  --exclude='._*' \
  -C "$STAGE_DIR" .

rm -rf "$STAGE_DIR"

ARCHIVE_SIZE=$(du -h "$ARCHIVE" | awk '{print $1}')

echo ""
echo "✅ 完成"
echo "   压缩包: $ARCHIVE ($ARCHIVE_SIZE)"
echo ""
echo "部署:"
echo "  scp $ARCHIVE user@host:~/"
echo "  ssh user@host 'cd /var/www/shareyousee && tar -xzf ~/${NAME}.tar.gz'"
echo ""
echo "服务器启动:"
echo "  cd /var/www/shareyousee/${NAME}/backend"
echo "  ./start.sh"