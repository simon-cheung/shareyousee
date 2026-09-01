#!/usr/bin/env node
// 物化 .output/server/node_modules/ 下的符号链接
//
// 关键约束: 每个软链 node_modules/<link_name> 必须被替换为
// node_modules/<link_target> 的内容(整个目录树拷贝)。
//
// 错误做法: 用 fs.readlinkSync + cp -R(会把所有同名链接的目标内容堆到同一目录,
// 多版本同名包会冲突,node 解析到错误版本 → 运行时 500)
//
// 正确做法: 按软链 → 目标的目录树精确覆盖。即:
//   rm -rf node_modules/perfect-debounce
//   cp -R node_modules/.nitro/perfect-debounce@2.1.0 node_modules/perfect-debounce
//
// 这里用 Node fs.cp 实现(支持 recursive,force,errorOnExist=false)。

import { cp, lstat, readlink, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const root = process.argv[2]
if (!root) {
  console.error('用法: node materialize-symlinks.mjs <.output 路径>')
  process.exit(1)
}

const nm = join(root, 'server', 'node_modules')

async function* walk(dir) {
  const { readdir } = await import('node:fs/promises')
  const entries = await readdir(dir, { withFileTypes: true })
  for (const e of entries) {
    const p = join(dir, e.name)
    yield p
    if (e.isDirectory() && e.name !== '.nitro') {
      yield* walk(p)
    }
  }
}

let count = 0
for await (const path of walk(nm)) {
  let st
  try {
    st = await lstat(path)
  } catch {
    continue
  }
  if (!st.isSymbolicLink()) continue

  // 软链路径必须是 node_modules/<name> 这种顶层结构(我们的 .nitro/... 目标都在 node_modules 内)
  const target = await readlink(path)
  if (!target.startsWith('.nitro/')) {
    console.warn('  跳过(目标非 .nitro/*):', path, '->', target)
    continue
  }

  // 解析软链目标为绝对路径(相对 path 的父目录)
  const targetAbs = join(dirname(path), target)
  // 物化:删软链,拷贝目标目录内容
  await rm(path, { recursive: true, force: true })
  await cp(targetAbs, path, { recursive: true, force: true, errorOnExist: false })
  count++
}

console.log(`✅ 物化 ${count} 个软链`)
