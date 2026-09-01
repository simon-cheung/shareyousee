#!/usr/bin/env bash
# 打包整个 .output 用于部署
#
# 保留 node_modules/ 内的软链(macOS BSD tar 与 Linux GNU tar 默认都支持)
# 服务器侧部署: cd ~/.output && tar -xzf /path/to/shareyousee-output.tar.gz

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/.output"
DIST_DIR="$ROOT_DIR/dist"
NAME="shareyousee-output"

if [[ ! -d "$OUTPUT_DIR" ]]; then
  echo "❌ $OUTPUT_DIR 不存在,请先执行 yarn build"
  exit 1
fi

mkdir -p "$DIST_DIR"

ARCHIVE="$DIST_DIR/${NAME}.tar.gz"
rm -f "$ARCHIVE"

echo "📦 打包..."
# Unix tar 默认保留软链
tar -czf "$ARCHIVE" \
  --exclude='.DS_Store' \
  --exclude='._*' \
  -C "$OUTPUT_DIR" .

ARCHIVE_SIZE=$(du -h "$ARCHIVE" | awk '{print $1}')

echo ""
echo "✅ 完成"
echo "   压缩包: $ARCHIVE ($ARCHIVE_SIZE)"
echo ""
echo "部署:"
echo "  scp $ARCHIVE user@host:~/"
echo "  ssh user@host 'cd ~/armingg/html-root/share/.output && tar -xzf ~/${NAME}.tar.gz'"
echo ""
echo "服务器启动:"
echo "  cd ~/armingg/html-root/share/.output/server"
echo "  PORT=3002 node index.mjs"