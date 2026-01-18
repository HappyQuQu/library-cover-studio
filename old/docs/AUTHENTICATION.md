# 🔐 认证系统指南

本文档介绍 LibraryCoverStudio 的用户认证系统，包括 API 接口、配置方法及安全建议。

## 🌟 核心特性

- **基于 JWT 的认证**: 使用 JSON Web Tokens 进行安全的状态无关认证。
- **用户管理**: 支持修改用户名和密码。
- **API 保护**: 敏感操作（如模板保存、定时任务管理）均受 JWT 保护。
- **SQLite 存储**: 用户凭据安全地存储在 SQLite 数据库中。

## 🚀 快速上手

### 默认账户
- **用户名**: `admin`
- **密码**: `admin123`
⚠️ **请在首次登录后立即修改密码！**

### 登录流程 (CLI)
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```
返回结果将包含一个 `token`，请在后续请求中将其放入 Header：`Authorization: Bearer <your_token>`

## 🎯 API 端点

### 1. 用户认证
- `POST /api/auth/login`: 用户登录并获取 Token
- `GET /api/auth/me`: 获取当前登录用户信息

### 2. 账户管理 (需认证)
- `PUT /api/auth/username`: 修改当前登录用户的用户名
- `PUT /api/auth/password`: 修改当前登录用户的密码

### 3. 受保护的 API
以下资源的所有管理性接口（增删改及触发）均需要认证：
- `/api/templates/*`
- `/api/media-sources/*`
- `/api/scheduled-tasks/*`
- `/api/logs/*`

## 🛠️ 开发者集成

### JavaScript (Axios)
```javascript
import axios from 'axios';

const api = axios.create({
  baseURL: '/api'
});

// 添加请求拦截器拼接 Token
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
```

## 🛡️ 安全建议

1. **JWT_SECRET**: 在生产环境的 `.env` 中设置复杂的 `JWT_SECRET`。
2. **HTTPS**: 强烈建议在生产环境通过 Nginx 等代理启用 HTTPS。
3. **Token 过期**: 默认 Token 有效期为 7 天。
4. **日志下载**: 下载日志接口支持通过 Query 参数 `?token=xxx` 进行认证，以方便浏览器直接下载。

---
*最后更新: 2025-12-30*
