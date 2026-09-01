// Vue Router 4 显式路由表,替代 Nuxt 4 文件路由
// 路由名 / 路径 与原 pages/*.vue 一致
import { createRouter, createWebHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/HomeView.vue')
    },
    {
      path: '/sender',
      name: 'sender',
      component: () => import('@/views/SenderView.vue')
    },
    {
      path: '/recipient',
      name: 'recipient',
      component: () => import('@/views/RecipientView.vue')
    },
    {
      path: '/tasks',
      name: 'tasks',
      component: () => import('@/views/TasksView.vue')
    },
    {
      path: '/call',
      name: 'call',
      component: () => import('@/views/CallView.vue')
    },
    // 兜底:未匹配跳首页
    {
      path: '/:pathMatch(.*)*',
      redirect: '/'
    }
  ],
  scrollBehavior() {
    return { top: 0 }
  }
})
