# 认证系统使用指南

## 概述

LibraryCoverStudio 现已集成简单的用户认证系统，使用 JWT (JSON Web Token) 进行身份验证。

## 数据库变更

- **从 PostgreSQL 迁移到 SQLite**
- 数据库文件位置：`backend/data/library-cover-studio.db`
- 自动创建表结构和默认管理员账户

## 默认管理员账户

- **用户名**: `admin`
- **密码**: `admin123`

⚠️ **重要**: 首次登录后请立即修改默认密码！

## API 端点

### 1. 用户登录

**POST** `/api/auth/login`

```json
// 请求体
{
  "username": "admin",
  "password": "admin123"
}

// 响应
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "user-id",
      "username": "admin",
      "created_at": "2025-10-30T00:00:00.000Z"
    }
  }
}
```

### 2. 获取当前用户信息

**GET** `/api/auth/me`

需要认证 (Bearer Token)

```bash
# 请求头
Authorization: Bearer <your-token>

# 响应
{
  "success": true,
  "data": {
    "id": "user-id",
    "username": "admin",
    "created_at": "2025-10-30T00:00:00.000Z",
    "updated_at": "2025-10-30T00:00:00.000Z"
  }
}
```

### 3. 修改用户名

**PUT** `/api/auth/username`

需要认证 (Bearer Token)

```json
// 请求体
{
  "newUsername": "myusername"
}

// 响应
{
  "success": true,
  "data": {
    "user": {
      "id": "user-id",
      "username": "myusername",
      "created_at": "2025-10-30T00:00:00.000Z",
      "updated_at": "2025-10-30T00:00:00.000Z"
    },
    "token": "new-jwt-token..."
  }
}
```

**用户名规则**:
- 长度: 3-20 个字符
- 只允许: 字母、数字、下划线
- 必须唯一

### 4. 修改密码

**PUT** `/api/auth/password`

需要认证 (Bearer Token)

```json
// 请求体
{
  "currentPassword": "admin123",
  "newPassword": "newSecurePassword123"
}

// 响应
{
  "success": true,
  "message": "Password updated successfully"
}
```

**密码规则**:
- 最小长度: 6 个字符

## 受保护的 API 端点

以下端点现在需要认证（Bearer Token）：

### 模板管理
- `POST /api/templates` - 创建模板
- `PUT /api/templates/:id` - 更新模板
- `DELETE /api/templates/:id` - 删除模板

### 海报生成
- `POST /api/posters/generate` - 生成海报
- `POST /api/posters/generate/batch` - 批量生成
- `POST /api/posters/preview` - 预览海报

### 媒体库管理
- `POST /api/media-libs` - 创建媒体库配置
- `PUT /api/media-libs/:id` - 更新媒体库配置
- `DELETE /api/media-libs/:id` - 删除媒体库配置
- `POST /api/media-libs/:id/test` - 测试连接
- `POST /api/media-libs/:id/sync` - 同步媒体库

### 定时任务管理
- `POST /api/schedules` - 创建定时任务
- `PUT /api/schedules/:id` - 更新定时任务
- `DELETE /api/schedules/:id` - 删除定时任务
- `POST /api/schedules/:id/trigger` - 手动触发任务
- `PATCH /api/schedules/:id/toggle` - 启用/禁用任务

## 使用示例

### 使用 curl

```bash
# 1. 登录获取 token
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# 2. 使用 token 访问受保护的端点
curl -X POST http://localhost:3001/api/templates \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-token>" \
  -d '{"name":"My Template","canvas_data":"{}"}'

# 3. 修改用户名
curl -X PUT http://localhost:3001/api/auth/username \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-token>" \
  -d '{"newUsername":"newuser"}'

# 4. 修改密码
curl -X PUT http://localhost:3001/api/auth/password \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-token>" \
  -d '{"currentPassword":"admin123","newPassword":"newpass123"}'
```

### 使用 JavaScript (fetch)

```javascript
// 1. 登录
const loginResponse = await fetch('http://localhost:3001/api/auth/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    username: 'admin',
    password: 'admin123'
  })
});

const { data } = await loginResponse.json();
const token = data.token;

// 2. 使用 token 访问受保护的端点
const templatesResponse = await fetch('http://localhost:3001/api/templates', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    name: 'My Template',
    canvas_data: '{}'
  })
});

// 3. 修改用户名
const updateUsernameResponse = await fetch('http://localhost:3001/api/auth/username', {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    newUsername: 'newuser'
  })
});

// 4. 修改密码
const updatePasswordResponse = await fetch('http://localhost:3001/api/auth/password', {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    currentPassword: 'admin123',
    newPassword: 'newpass123'
  })
});
```

## 环境变量配置

在 `backend/.env` 文件中配置：

```env
# JWT 配置
JWT_SECRET=your-secret-key-change-in-production
JWT_EXPIRES_IN=7d

# 数据库配置
DB_PATH=./data/library-cover-studio.db
```

## 错误响应

### 401 Unauthorized
```json
{
  "error": "Unauthorized",
  "message": "No token provided"
}
```

### 400 Bad Request
```json
{
  "error": "Bad Request",
  "message": "Username and password are required"
}
```

### 409 Conflict
```json
{
  "error": "Conflict",
  "message": "Username already exists"
}
```

## 安全建议

1. **修改默认密码**: 首次登录后立即修改 `admin` 账户的默认密码
2. **使用强密码**: 使用至少 12 个字符的复杂密码
3. **保护 JWT_SECRET**: 在生产环境中使用强随机字符串作为 JWT_SECRET
4. **HTTPS**: 在生产环境中使用 HTTPS 协议
5. **Token 存储**: 在前端安全地存储 token（例如使用 httpOnly cookies 或安全的 localStorage）

## 数据库备份

SQLite 数据库文件位于 `backend/data/library-cover-studio.db`

备份命令：
```bash
# 备份
cp backend/data/library-cover-studio.db backup/library-cover-studio-$(date +%Y%m%d).db

# 恢复
cp backup/library-cover-studio-20251030.db backend/data/library-cover-studio.db
```

## 故障排除

### 问题: "Database not initialized"
- 确保服务器成功启动并初始化了数据库
- 检查 `backend/data/` 目录是否存在

### 问题: "Invalid token"
- Token 可能已过期（默认 7 天）
- 重新登录获取新 token

### 问题: "Username already exists"
- 选择一个未被使用的用户名

## 开发计划

未来可能添加的功能：
- [ ] 多用户支持
- [ ] 角色和权限管理
- [ ] 密码重置功能
- [ ] 用户注册功能
- [ ] 登录日志记录
- [ ] 两步验证 (2FA)
