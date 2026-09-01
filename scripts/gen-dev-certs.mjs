#!/usr/bin/env node
// 一次性生成 RSA 自签证书(localhost + 局域网 IP),让 WebCrypto 在 LAN 访问下也能用。
// 浏览器首次访问需手动信任证书(浏览器会显示"您的连接不是私密连接")。
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { networkInterfaces } from 'node:os'
import selfsigned from 'selfsigned'

const outDir = resolve(process.cwd(), '.dev-certs')
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })

const certPath = resolve(outDir, 'cert.pem')
const keyPath = resolve(outDir, 'key.pem')

if (existsSync(certPath) && existsSync(keyPath)) {
  console.log('[dev-certs] 证书已存在:', certPath)
  process.exit(0)
}

const hostnames = ['localhost']
for (const addrs of Object.values(networkInterfaces())) {
  for (const a of addrs || []) {
    if (a.family === 'IPv4' && !a.internal) hostnames.push(a.address)
  }
}
console.log('[dev-certs] 生成证书,涵盖:', hostnames.join(', '))

const attrs = [{ name: 'commonName', value: 'ShareYouSee Dev' }]
const pems = await selfsigned.generate(attrs, {
  algorithm: 'sha256',
  days: 365,
  keySize: 2048,
  extensions: [
    { name: 'basicConstraints', cA: true },
    {
      name: 'subjectAltName',
      altNames: hostnames.map((h) => ({ type: 2, value: h }))
    }
  ]
})
writeFileSync(certPath, pems.cert)
writeFileSync(keyPath, pems.private)
console.log('[dev-certs] 已写入:', certPath, keyPath)
console.log('[dev-certs] 浏览器首次访问 https://你的IP:3000 时,需要点击"高级"→"继续访问"')
