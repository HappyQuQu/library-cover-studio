import { createRouter, createWebHistory } from "vue-router";
import AppLayout from "../components/AppLayout.vue";

const routes = [
  {
    path: "/login",
    name: "Login",
    component: () => import("../views/LoginView.vue"),
    meta: { requiresAuth: false },
  },
  {
    path: "/",
    component: AppLayout,
    children: [
      {
        path: "",
        name: "Home",
        component: () => import("../views/HomeView.vue"),
        meta: { requiresAuth: false },
      },
      {
        path: "/app/designer",
        name: "Designer",
        component: () => import("../views/DesignerView.vue"),
        meta: { requiresAuth: true },
      },
      {
        path: "/app/templates",
        name: "Templates",
        component: () => import("../views/TemplatesView.vue"),
        meta: { requiresAuth: false },
      },
      {
        path: "/app/settings",
        name: "Settings",
        component: () => import("../views/SettingsView.vue"),
        meta: { requiresAuth: true },
      },

      {
        path: "/app/media-sources",
        name: "MediaSources",
        component: () => import("../views/MediaSourcesView.vue"),
        meta: { requiresAuth: true },
      },
      {
        path: "/app/scheduled-tasks",
        name: "ScheduledTasks",
        component: () => import("../views/ScheduledTasksView.vue"),
        meta: { requiresAuth: true },
      },
      {
        path: "/app/logs",
        name: "Logs",
        component: () => import("../views/LogsView.vue"),
        meta: { requiresAuth: true },
      },
    ],
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

// 路由守卫
router.beforeEach((to, from, next) => {
  const token = localStorage.getItem("token");
  const requiresAuth = to.meta.requiresAuth;

  if (requiresAuth && !token) {
    // 需要认证但没有 token，跳转到登录页
    next({ name: "Login", query: { redirect: to.fullPath } });
  } else if (to.name === "Login" && token) {
    // 已登录用户访问登录页，跳转到首页
    next({ name: "Home" });
  } else {
    next();
  }
});

export default router;
