# 🚀 前端登录功能 - 快速开始

## 一分钟快速测试

### 1. 启动服务

**终端 1 - 启动后端**:
```bash
cd backend
node src/server.js
```

**终端 2 - 启动前端**:
```bash
cd web
npm run dev
```

### 2. 访问应用

打开浏览器访问: **http://localhost:3000**

### 3. 登录

- 用户名: `admin`
- 密码: `admin123`
- 点击"登录"

✅ 成功!你应该看到首页显示 "欢迎回来, admin! 👋"

## 主要功能测试

### 🔐 登录
1. 访问 http://localhost:3000/login
2. 输入 admin/admin123
3. 点击登录

### 👤 查看用户菜单
- 点击右上角用户名
- 看到"账户设置"和"退出登录"选项

### ✏️ 修改用户名
1. 点击顶部"设置"或用户菜单"账户设置"
2. 在"修改用户名"表单输入新用户名
3. 点击"更新用户名"

### 🔒 修改密码
1. 在设置页面找到"修改密码"表单
2. 输入当前密码: admin123
3. 输入新密码 (至少6位)
4. 确认新密码
5. 点击"更新密码"

### 🚪 退出登录
1. 点击用户菜单"退出登录"
2. 确认退出
3. 自动跳转到登录页

### 🔒 路由保护
- 未登录时访问 http://localhost:3000/designer
- 应该自动跳转到登录页

## 架构说明

```
前端 (localhost:3000)
  ↓
  Axios Client (自动添加 token)
  ↓
后端 API (localhost:3001)
  ↓
  SQLite 数据库
```

## 关键文件

- `web/src/stores/auth.ts` - 认证状态管理
- `web/src/api/client.ts` - HTTP 客户端
- `web/src/views/LoginView.vue` - 登录页
- `web/src/components/AppLayout.vue` - 主布局
- `web/src/views/SettingsView.vue` - 设置页

## 技术实现

- **状态管理**: Pinia store 持久化到 localStorage
- **路由守卫**: 自动检查 token 并重定向
- **API 拦截器**: 自动添加 token 和处理 401 错误
- **JWT Token**: 7天有效期,存储在 localStorage

## 默认账户

| 字段 | 值 |
|------|------|
| 用户名 | admin |
| 密码 | admin123 |
| 角色 | 管理员 |

## 疑难解答

**Q: 登录后立即跳回登录页?**  
A: 检查浏览器 localStorage 是否保存了 token

**Q: API 请求 401 错误?**  
A: Token 可能过期,尝试重新登录

**Q: 修改用户名/密码失败?**  
A: 检查后端服务是否正常运行,查看 Network 标签

**Q: 端口冲突?**  
A: 确保 3000 (前端) 和 3001 (后端) 端口未被占用

## 更多信息

- 完整实现说明: `FRONTEND_LOGIN_SUMMARY.md`
- 详细测试指南: `FRONTEND_LOGIN_TEST.md`

---

🎉 **现在你可以开始使用完整的登录认证系统了!**
