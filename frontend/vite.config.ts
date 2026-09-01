import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import Icons from 'unplugin-icons/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'node:path'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

// HTTPS + 自签证书(沿用 Nuxt 行为,保证 WebCrypto 在局域网 HTTPS 下可用)
const DEV_HTTPS =
  existsSync(resolve(__dirname, '.dev-certs/cert.pem')) &&
  existsSync(resolve(__dirname, '.dev-certs/key.pem'))
    ? {
        cert: resolve(__dirname, '.dev-certs/cert.pem'),
        key: resolve(__dirname, '.dev-certs/key.pem')
      }
    : undefined

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '~': path.resolve(__dirname, 'src')
    }
  },
  plugins: [
    vue(),
    // unplugin-icons:把 iconify icon 自动注册为 Vue 组件
    // 组件名格式:Icon<Collection><Icon>(PascalCase)
    // 例如 solar:card-recive-linear → IconSolarCardReciveLinear
    Icons({
      autoInstall: false,
      compiler: 'vue3',
      defaultClass: 'icon'
    }),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'public',
      filename: 'sw.js',
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        name: 'ShareYouSee',
        short_name: 'ShareYouSee',
        theme_color: '#ffffff',
        icons: [
          {
            src: '/app-icon.svg',
            sizes: '512x512',
            type: 'image/webp',
            purpose: 'any'
          }
        ],
        screenshots: [
          { src: '/ogImg.webp', sizes: '1280x720', type: 'image/webp', form_factor: 'wide' },
          { src: '/mobile.webp', sizes: '990x1370', type: 'image/webp', form_factor: 'narrow' }
        ]
      }
    })
  ],
  optimizeDeps: {
    include: [
      '@noble/hashes/sha256',
      '@noble/hashes/utils',
      '@scure/bip39',
      '@scure/bip39/wordlists/english',
      '@noble/curves/p256',
      '@noble/curves/nist',
      'crypto-js'
    ]
  },
  server: {
    host: '0.0.0.0',
    https: DEV_HTTPS,
    port: 5173,
    strictPort: false,
    hmr: {
      // HMR ws 也走 HTTPS(避免 LAN 设备浏览器报警)
      protocol: 'wss'
    },
    proxy: {
      // 开发期:把 ws/api 反代到后端,避免 CORS
      '/api': {
        target: 'http://127.0.0.1:3002',
        changeOrigin: true,
        // secure:false 是必须的,否则 Vite 会用 TLS 客户端去连 3002 端口,触发 ECONNRESET
        secure: false,
        // ws 配置:让 Vite 把 wss://localhost:5173/api/connect 升级为 ws 到后端
        ws: true
      }
    }
  }
})
