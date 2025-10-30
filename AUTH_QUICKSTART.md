# 🔐 认证功能快速上手

## 新功能概述

LibraryCoverStudio 现已支持用户认证和数据库已迁移到 SQLite！

### ✨ 主要特性

- 🔐 **用户登录认证**: 基于 JWT 的安全认证
- 👤 **用户管理**: 支持修改用户名和密码
- 🗄️ **SQLite 数据库**: 轻量级、无需额外配置
- 🔒 **API 保护**: 敏感操作需要登录验证

## 🚀 快速开始

### 1. 启动服务器

```bash
cd backend
pnpm install
pnpm run dev
```

### 2. 登录获取 Token

```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

### 3. 使用 Token 访问 API

```bash
# 使用登录返回的 token
TOKEN="your-token-here"

# 创建模板（需要认证）
curl -X POST http://localhost:3001/api/templates \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"我的模板","canvasData":{}}'
```

## 📖 完整文档

- 📘 [认证系统使用指南](./AUTH_GUIDE.md) - 完整的 API 文档和使用示例
- 📗 [迁移总结](./MIGRATION_SUMMARY.md) - 技术实现细节
- 📕 [完成报告](./COMPLETION_REPORT.md) - 功能清单和测试结果

## ⚠️ 安全提醒

**默认管理员账户**:
- 用户名: `admin`
- 密码: `admin123`

⚠️ **请首次登录后立即修改密码！**

## 🎯 API 端点

### 认证相关
- `POST /api/auth/login` - 用户登录
- `GET /api/auth/me` - 获取当前用户信息
- `PUT /api/auth/username` - 修改用户名
- `PUT /api/auth/password` - 修改密码

### 受保护的端点
以下端点需要在请求头中包含 `Authorization: Bearer <token>`:

- 模板: 创建、更新、删除
- 海报: 生成、批量生成、预览
- 媒体库: 创建、更新、删除、测试、同步
- 定时任务: 创建、更新、删除、触发、切换

## 💡 使用示例

### JavaScript / Fetch API

```javascript
// 登录
const loginResponse = await fetch('http://localhost:3001/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: 'admin',
    password: 'admin123'
  })
});

const { data } = await loginResponse.json();
const token = data.token;

// 使用 token 创建模板
const createResponse = await fetch('http://localhost:3001/api/templates', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    name: '我的模板',
    description: '模板描述',
    canvasData: { version: '1.0', objects: [] }
  })
});
```

### Python / Requests

```python
import requests

# 登录
login_response = requests.post(
    'http://localhost:3001/api/auth/login',
    json={'username': 'admin', 'password': 'admin123'}
)
token = login_response.json()['data']['token']

# 使用 token 创建模板
headers = {'Authorization': f'Bearer {token}'}
create_response = requests.post(
    'http://localhost:3001/api/templates',
    headers=headers,
    json={
        'name': '我的模板',
        'description': '模板描述',
        'canvasData': {'version': '1.0', 'objects': []}
    }
)
```

## 🔧 环境变量配置

在 `backend/.env` 文件中配置：

```env
PORT=3001
DB_PATH=./data/library-cover-studio.db
JWT_SECRET=your-secret-key-here
JWT_EXPIRES_IN=7d
```

## 📦 数据库

- **类型**: SQLite3
- **位置**: `backend/data/library-cover-studio.db`
- **备份**: 定期复制数据库文件即可

```bash
# 备份数据库
cp backend/data/library-cover-studio.db backup/db-$(date +%Y%m%d).db
```

## 🎉 测试状态

✅ 所有核心功能已测试通过
- ✅ 用户登录
- ✅ 获取用户信息
- ✅ 修改用户名
- ✅ 修改密码
- ✅ Token 验证
- ✅ API 保护
- ✅ 数据库 CRUD 操作

---

**更新日期**: 2025-10-30  
**版本**: 1.0.0
