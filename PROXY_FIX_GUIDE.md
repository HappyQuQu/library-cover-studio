# 图案填充功能 - 快速测试指南

## 问题分析

### ❌ 原始问题
访问 `http://localhost:3000/template/poster/7.jpg` 返回 200 但显示空白图片

### ✅ 根本原因
前端开发服务器 (Vite) 运行在 3000 端口，后端 API 运行在 3001 端口。
Vite 的代理配置只包含了 `/api`，没有包含 `/template` 和 `/uploads` 路径。

### 🔧 解决方案
在 `web/vite.config.ts` 中添加代理配置：

```typescript
server: {
  port: 3000,
  proxy: {
    '/api': {
      target: 'http://localhost:3001',
      changeOrigin: true
    },
    '/template': {
      target: 'http://localhost:3001',
      changeOrigin: true
    },
    '/uploads': {
      target: 'http://localhost:3001',
      changeOrigin: true
    }
  }
}
```

## 启动步骤

### 1. 启动后端服务 (端口 3001)
```bash
# 终端 1
cd backend
node src/server.js
```

**验证后端：**
- 访问: http://localhost:3001/template/poster/1.jpg
- 应该能直接看到图片

### 2. 启动前端开发服务器 (端口 3000)
```bash
# 终端 2
cd web
pnpm dev
```

**验证代理：**
- 访问: http://localhost:3000/template/poster/1.jpg
- 现在应该能通过前端代理看到图片了

### 3. 测试图案填充功能

#### 方式 1: 使用测试页面
访问: http://localhost:3001/test/pattern-test.html

查看所有 9 张图片是否正常加载

#### 方式 2: 使用设计器
1. 访问: http://localhost:3000
2. 进入"海报设计器"
3. 添加一个形状（矩形、圆形等）
4. 在右侧属性面板:
   - "填充类型" → 选择"图案"
   - 点击任意图案（应该能看到 9 张图片的缩略图）
   - 选择"填充模式":
     - **适应 (Fit)** - 推荐，图片完整显示不变形
     - **平铺 (Repeat)** - 图案重复平铺
     - **拉伸 (Stretch)** - 拉伸填满

## 端口说明

| 服务     | 端口 | 说明                             |
| -------- | ---- | -------------------------------- |
| 后端 API | 3001 | Express 服务器，提供静态资源     |
| 前端开发 | 3000 | Vite Dev Server，代理请求到 3001 |
| 前端生产 | -    | 构建后由后端 3001 提供           |

## 路径对照表

### 开发环境
| 前端访问                                       | 代理到 | 实际路径                                       |
| ---------------------------------------------- | ------ | ---------------------------------------------- |
| http://localhost:3000/template/poster/1.jpg    | →      | http://localhost:3001/template/poster/1.jpg    |
| http://localhost:3000/uploads/previews/xxx.jpg | →      | http://localhost:3001/uploads/previews/xxx.jpg |
| http://localhost:3000/api/auth/login           | →      | http://localhost:3001/api/auth/login           |

### 生产环境
所有请求都由后端 3001 端口处理（前端构建文件放在 backend/public）

## 故障排除

### 问题：图片仍然空白
**检查清单：**
1. ✅ 后端是否在运行？`curl http://localhost:3001/health`
2. ✅ 前端是否在运行？访问 `http://localhost:3000`
3. ✅ 图片文件是否存在？`ls backend/template/poster/*.jpg`
4. ✅ 是否重启了前端服务？（修改 vite.config.ts 后需重启）

### 问题：CORS 错误
**检查：**
- Vite 代理配置中是否有 `changeOrigin: true`
- 浏览器控制台是否显示 CORS 错误

### 问题：图片显示不完整
**解决：**
- 切换到"适应 (Fit)"填充模式
- 这会等比例缩放图片以完整显示

## 快速验证命令

```bash
# 检查图片文件
ls backend/template/poster/*.jpg

# 测试后端直接访问
curl -I http://localhost:3001/template/poster/1.jpg

# 测试前端代理访问（需先启动前端）
curl -I http://localhost:3000/template/poster/1.jpg

# 查看文件大小
Get-Item backend/template/poster/*.jpg | Measure-Object -Property Length -Sum
```

## 重要提示

⚠️ **开发环境必须同时启动后端和前端**
- 前端 (3000) 依赖后端 (3001) 提供静态资源
- 如果只启动前端，图片会加载失败

✅ **生产环境只需启动后端**
- 前端构建文件已打包到 backend/public
- 后端同时提供前端页面和 API 服务
