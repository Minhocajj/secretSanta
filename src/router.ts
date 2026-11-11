import { createRouter, createWebHistory, type RouteRecordRaw, type RouterHistory } from 'vue-router'
import HomeView from './views/HomeView.vue'
import JoinView from './views/JoinView.vue'
import QuickView from './views/QuickView.vue'

export const routes: RouteRecordRaw[] = [
  { path: '/', name: 'home', component: HomeView },
  { path: '/quick', name: 'quick', component: QuickView },
  { path: '/join/:id', name: 'join', component: JoinView },
  { path: '/admin/:id', name: 'admin', component: () => import('./views/AdminView.vue') },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

export function createAppRouter(history: RouterHistory = createWebHistory(import.meta.env.BASE_URL)) {
  return createRouter({ history, routes })
}
