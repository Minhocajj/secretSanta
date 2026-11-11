import { createRouter, createWebHistory, type RouteRecordRaw, type RouterHistory } from 'vue-router'
import QuickView from './views/QuickView.vue'

export const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/quick' },
  { path: '/quick', name: 'quick', component: QuickView },
  { path: '/:pathMatch(.*)*', redirect: '/quick' },
]

export function createAppRouter(history: RouterHistory = createWebHistory(import.meta.env.BASE_URL)) {
  return createRouter({ history, routes })
}
