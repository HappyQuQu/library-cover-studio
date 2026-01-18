# 🛠️ 技术开发与维护手册

本文档面向开发者，介绍 LibraryCoverStudio 的架构、环境配置及开发规范。

## 🏗️ 系统架构

### 1. 前端 (Vue.js 3)
- **核心**: Vue 3 + TypeScript + Vite.
- **UI**: Element Plus + Tailwind CSS.
- **编辑器**: Fabric.js (Canvas 处理).
- **状态管理**: Pinia.

### 2. 后端 (Node.js)
- **框架**: Express.
- **数据库**: SQLite (通过 `sqlite-async` 处理异步).
- **调度**: `node-cron`.
- **图像处理**: `sharp`.
- **认证**: JWT (`jsonwebtoken` + `bcryptjs`).

### 3. 目录布局
- `/web`: 前端源代码。
- `/backend`: 后端源代码及数据文件夹。
- `/docs`: 开发与用户手册。

## 🚀 开发环境配置

### 使用 pnpm (推荐)
```bash
# 安装依赖
pnpm install

# 启动开发服务器 (Root)
pnpm dev
```

### 数据库维护
SQLite 数据库位于 `backend/data/library-cover-studio.db`。
- **备份**: 定期复制该文件即可。
- **迁移**: 如果需要修改结构，请参考 `backend/database/schema.sqlite.sql`。

## 📦 部署指南

### Docker (推荐)
```bash
docker-compose up -d
```
Docker 配置涵盖了所有必要的环境变量及卷挂载（持久化存储数据库及生成的海报）。

### 环境变量 (`.env`)
- `JWT_SECRET`: 必须修改的认证密钥。
- `PORT`: 后端监听端口（默认 3001）。

## 📝 贡献规范
1. **代码风格**: 请遵循 ESLint 配置。
2. **提交**: 使用语义化 Commit（如 `feat:`, `fix:`, `docs:`）。

---
*最后更新: 2025-12-30*
