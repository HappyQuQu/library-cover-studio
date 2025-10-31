/**
 * API配置
 * 统一管理后端API地址
 *
 * 开发环境: 使用Vite代理到 http://localhost:3001
 * 生产环境: 可以通过环境变量 VITE_API_BASE_URL 配置
 */

// 判断是否为开发环境
const isDevelopment = import.meta.env.DEV;

// API基础URL
// 开发环境使用空字符串(通过Vite代理)
// 生产环境可以通过环境变量配置,默认为空(同源)
export const API_BASE_URL = isDevelopment
  ? ""
  : (import.meta.env?.VITE_API_BASE_URL as string) || "";

// 各个模块的API路径
export const API_ENDPOINTS = {
  // 认证相关
  auth: {
    login: `${API_BASE_URL}/api/auth/login`,
    register: `${API_BASE_URL}/api/auth/register`,
  },

  // 模板相关
  templates: {
    base: `${API_BASE_URL}/api/templates`,
    byId: (id: string) => `${API_BASE_URL}/api/templates/${id}`,
    duplicate: (id: string) => `${API_BASE_URL}/api/templates/${id}/duplicate`,
    export: (id: string) => `${API_BASE_URL}/api/templates/${id}/export`,
  },

  // 海报相关
  posters: {
    base: `${API_BASE_URL}/api/posters`,
    generate: `${API_BASE_URL}/api/posters/generate`,
  },

  // 媒体源相关
  mediaSources: {
    base: `${API_BASE_URL}/api/media-sources`,
    byId: (id: string) => `${API_BASE_URL}/api/media-sources/${id}`,
    test: (id: string) => `${API_BASE_URL}/api/media-sources/${id}/test`,
    libraries: (id: string) =>
      `${API_BASE_URL}/api/media-sources/${id}/libraries`,
  },

  // 定时任务相关
  scheduledTasks: {
    base: `${API_BASE_URL}/api/scheduled-tasks`,
    byId: (id: string) => `${API_BASE_URL}/api/scheduled-tasks/${id}`,
    toggle: (id: string) => `${API_BASE_URL}/api/scheduled-tasks/${id}/toggle`,
    trigger: (id: string) =>
      `${API_BASE_URL}/api/scheduled-tasks/${id}/trigger`,
    executions: (id: string) =>
      `${API_BASE_URL}/api/scheduled-tasks/${id}/executions`,
  },

  // 媒体库相关(旧的API,可能需要保留用于兼容)
  mediaLibs: {
    base: `${API_BASE_URL}/api/media-libs`,
  },

  // 计划相关(旧的API,可能需要保留用于兼容)
  schedules: {
    base: `${API_BASE_URL}/api/schedules`,
  },
};

export default {
  API_BASE_URL,
  API_ENDPOINTS,
};
