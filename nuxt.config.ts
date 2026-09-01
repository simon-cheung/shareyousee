// https://nuxt.com/docs/api/configuration/nuxt-config
import path from 'path'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export default defineNuxtConfig({
  srcDir: 'app',
  // 关闭 Nuxt DevTools(默认开启,会拖慢 dev 启动);保留 Vite 内置 inspector
  devtools: { enabled: false },
  css: ['@/assets/main.css'],

  imports: {
    dirs: ['stores']
  },

  vite: {
    // 预声明 subpath imports,避免 Vite 每次刷新都重新 optimize deps
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
    // HTTPS + 自签证书:让局域网 IP(192.168.x.x)也能跑 WebCrypto
    // 使用方式:
    //   1. 一次性生成证书: yarn dev:cert  (生成 .dev-certs/cert.pem + key.pem)
    //   2. 浏览器首次访问 https://你的IP:3000 时,点击"高级"→"继续访问"信任证书
    server: {
      host: '0.0.0.0',
      https:
        existsSync(resolve(__dirname, '.dev-certs/cert.pem')) &&
        existsSync(resolve(__dirname, '.dev-certs/key.pem'))
          ? {
              cert: resolve(__dirname, '.dev-certs/cert.pem'),
              key: resolve(__dirname, '.dev-certs/key.pem')
            }
          : false
    }
  },

  devServer: {
    host: '0.0.0.0',
    https:
      existsSync(resolve(__dirname, '.dev-certs/cert.pem')) &&
      existsSync(resolve(__dirname, '.dev-certs/key.pem'))
        ? {
            cert: resolve(__dirname, '.dev-certs/cert.pem'),
            key: resolve(__dirname, '.dev-certs/key.pem')
          }
        : undefined
  },

  modules: [
    '@pinia/nuxt',
    '@nuxtjs/color-mode',
    '@nuxtjs/i18n',
    '@nuxtjs/tailwindcss',
    '@nuxtjs/seo',
    '@nuxt/icon',
    '@vite-pwa/nuxt',
    '@primevue/nuxt-module'
  ],

  app: {
    head: {
      charset: 'utf-8',
      viewport: 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0',
      link: [{ rel: 'icon', href: '/favicon.webp' }]
    }
  },

  i18n: {
    baseUrl: 'https://share.armin.com.cn',
    locales: [
      { code: 'en', language: 'en-US' },
      { code: 'zh', language: 'zh-CN' }
    ],
    defaultLocale: 'en',
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'i18n_redirected',
      redirectOn: 'root'
    }
  },

  site: {
    // url: 'http://localhost:3002',
    url: 'https://share.armin.com.cn',
    name: 'ShareYouSee',
    // 一个基于 WebRTC 实现点对点快速目录同步、文件传输与定向分享的工具站
    description:
      'A tool station based on WebRTC to achieve point-to-point fast directory synchronization, file transfer and targeted sharing'
    // defaultLocale: 'zh'
  },

  ogImage: {
    enabled: false
  },

  icon: {
    serverBundle: {
      collections: ['solar', 'icon-park-outline']
    },
    provider: 'iconify',
    iconifyApiEndpoint: 'https://api.iconify.design'
  },

  primevue: {
    options: {
      unstyled: true,
      ripple: true
    },
    // 用 nuxt 别名引用 srcDir(app/)内的目录,避免绝对路径被序列化到 __NUXT__ config
    // presets 目录在 PR 阶段已挪到 app/presets/aura/
    importPT: { from: '~/presets/aura' }
  },

  colorMode: {
    preference: 'system', // default value of $colorMode.preference
    fallback: 'light', // fallback value if not system preference found
    globalName: '__NUXT_COLOR_MODE__',
    componentName: 'ColorScheme',
    classPrefix: '',
    classSuffix: '',
    storageKey: 'nuxt-color-mode'
  },

  pwa: {
    strategies: 'injectManifest',
    srcDir: '../public',
    filename: 'sw.js',
    registerType: 'prompt',

    // workbox: {
    //   runtimeCaching: [
    //     {
    //       urlPattern: /.*/,
    //       handler: 'StaleWhileRevalidate',
    //       options: {
    //         cacheName: 'main'
    //       }
    //     }
    //   ]
    // },

    manifest: {
      name: 'ShareYouSee',
      short_name: 'ShareYouSee',
      theme_color: '#ffffff',

      icons: [
        {
          src: '/favicon.webp',
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
  },

  nitro: {
    experimental: {
      websocket: true
    },
    // 将所有依赖内联打包进 server bundle，
    // 避免外置 node_modules 中传递依赖缺失（Node 24+ ESM 严格解析）
    externals: {
      inline: [/.*/]
    }
  },

  compatibilityDate: '2026-04-13'
})
