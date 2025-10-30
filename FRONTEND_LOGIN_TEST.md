# 前端登录功能测试指南

## 🚀 启动服务

### 1. 启动后端服务 (端口 3001)
```bash
cd backend
node src/server.js
```

### 2. 启动前端服务 (端口 3000)
```bash
cd web
npm run dev
```

## 🧪 测试流程

### 1. 访问登录页面
1. 打开浏览器访问: http://localhost:3000/login
2. 你应该看到一个漂亮的登录界面,包含:
   - 用户名输入框
   - 密码输入框
   - 登录按钮
   - 默认凭据提示 (admin/admin123)

### 2. 测试登录功能
#### 测试默认管理员账户:
- **用户名**: admin
- **密码**: admin123
- 点击"登录"按钮

**预期结果**:
- 显示"登录成功"消息
- 自动跳转到首页
- 顶部导航栏显示用户名和下拉菜单

### 3. 测试首页显示
登录成功后,首页应该显示:
- 欢迎信息,包含用户名 "欢迎回来, admin! 👋"
- 三个功能卡片:
  - 海报设计器 (需要登录)
  - 模板管理
  - 系统设置 (需要登录)
- 快速统计面板

### 4. 测试用户下拉菜单
点击顶部导航栏右侧的用户名下拉菜单,应该看到:
- "账户设置" 选项
- "退出登录" 选项

### 5. 测试账户设置页面
1. 点击导航栏的"设置"或用户下拉菜单的"账户设置"
2. 在账户设置页面,你应该看到:
   - 当前用户名显示
   - 修改用户名表单
   - 修改密码表单

#### 测试修改用户名:
1. 输入新用户名 (例如: "testuser")
2. 点击"更新用户名"按钮
3. **预期结果**: 显示"用户名更新成功",顶部导航栏的用户名更新

#### 测试修改密码:
1. 输入当前密码: admin123
2. 输入新密码: (至少6位字符)
3. 确认新密码
4. 点击"更新密码"按钮
5. **预期结果**: 显示"密码更新成功"

### 6. 测试路由守卫
#### 未登录时访问受保护页面:
1. 退出登录或清空浏览器 localStorage
2. 尝试直接访问: http://localhost:3000/designer
3. **预期结果**: 自动重定向到登录页面

#### 已登录时访问登录页:
1. 在已登录状态下访问: http://localhost:3000/login
2. **预期结果**: 自动重定向到首页

### 7. 测试退出登录
1. 点击用户下拉菜单的"退出登录"
2. 确认退出对话框
3. **预期结果**:
   - 显示"已退出登录"消息
   - 跳转到登录页面
   - localStorage 中的 token 被清除

## 🔍 验证要点

### localStorage 检查
打开浏览器开发者工具 -> Application -> Local Storage -> http://localhost:3000

应该看到:
- `token`: JWT token 字符串
- `user`: 用户信息 JSON 字符串

### 网络请求检查
打开浏览器开发者工具 -> Network

**登录请求**:
- URL: `http://localhost:3001/api/auth/login`
- Method: POST
- Request Body: `{ username, password }`
- Response: `{ token, user: { id, username } }`

**获取用户信息请求**:
- URL: `http://localhost:3001/api/auth/me`
- Method: GET
- Headers: `Authorization: Bearer <token>`
- Response: `{ user: { id, username } }`

**更新用户名请求**:
- URL: `http://localhost:3001/api/auth/username`
- Method: PUT
- Headers: `Authorization: Bearer <token>`
- Request Body: `{ username }`
- Response: `{ message, user }`

**更新密码请求**:
- URL: `http://localhost:3001/api/auth/password`
- Method: PUT
- Headers: `Authorization: Bearer <token>`
- Request Body: `{ currentPassword, newPassword }`
- Response: `{ message }`

## 🎨 UI 特性

### 登录页面
- 渐变紫色背景
- 居中的白色卡片
- Element Plus 表单组件
- 表单验证提示
- 加载状态显示

### 主应用布局
- 顶部导航栏 (紫色渐变背景)
- Logo 和导航链接
- 用户下拉菜单
- 响应式设计

### 账户设置页面
- 侧边栏菜单
- 账户设置面板
- 用户名和密码修改表单
- 表单验证

## 🐛 常见问题排查

### 1. 登录失败
- 检查后端服务是否运行在 3001 端口
- 检查 Network 标签中的请求是否成功
- 确认使用正确的用户名和密码

### 2. Token 未保存
- 检查浏览器 localStorage
- 确认登录响应包含 token

### 3. 路由守卫不工作
- 检查 localStorage 中是否有 token
- 确认路由配置中的 meta.requiresAuth 设置正确

### 4. API 请求 401 错误
- 检查 token 是否过期
- 确认 axios interceptor 正确添加 Authorization header

## 📝 技术实现清单

### 已完成功能 ✅
- [x] 登录页面 UI (`LoginView.vue`)
- [x] Axios HTTP 客户端配置 (`api/client.ts`)
- [x] 认证 API 函数 (`api/auth.ts`)
- [x] Pinia 认证状态管理 (`stores/auth.ts`)
- [x] 路由守卫 (`router/index.ts`)
- [x] 应用布局组件 (`AppLayout.vue`)
- [x] 用户下拉菜单
- [x] 退出登录功能
- [x] 首页登录状态显示 (`HomeView.vue`)
- [x] 账户设置页面 (`SettingsView.vue`)
- [x] 修改用户名功能
- [x] 修改密码功能
- [x] Token 自动注入请求头
- [x] 401 自动跳转登录页

### 后端 API ✅
- [x] POST /api/auth/login - 登录
- [x] GET /api/auth/me - 获取当前用户
- [x] PUT /api/auth/username - 修改用户名
- [x] PUT /api/auth/password - 修改密码
- [x] POST /api/auth/logout - 退出登录

## 🎉 完成标志

当你完成以下所有测试,前端登录功能就完全实现了:
1. ✅ 可以使用 admin/admin123 登录
2. ✅ 登录后在首页看到用户名
3. ✅ 可以修改用户名
4. ✅ 可以修改密码
5. ✅ 未登录时无法访问受保护页面
6. ✅ 可以正常退出登录
7. ✅ 所有 API 请求自动携带 token
8. ✅ Token 过期或无效时自动跳转登录页

---

## 📖 默认账户信息
- **用户名**: admin
- **密码**: admin123

祝你测试顺利! 🎊
