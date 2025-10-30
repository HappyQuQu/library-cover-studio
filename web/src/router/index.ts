import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    name: 'Home',
    component: () => import('../views/HomeView.vue')
  },
  {
    path: '/designer',
    name: 'Designer',
    component: () => import('../views/DesignerView.vue')
  },
  {
    path: '/templates',
    name: 'Templates',
    component: () => import('../views/TemplatesView.vue')
  },
  {
    path: '/settings',
    name: 'Settings',
    component: () => import('../views/SettingsView.vue')
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router