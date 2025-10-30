# 🚀 LibraryCoverStudio - pnpm 快速启动

## ✅ 已完成设置

您的 LibraryCoverStudio 项目现在已经完全配置为使用 **pnpm** 包管理器！

### 📦 已安装的依赖

- ✅ pnpm 8.15.0 (全局安装)
- ✅ 前端依赖 (Vue.js + Element Plus + Fabric.js)
- ✅ 后端依赖 (Node.js + Express + PostgreSQL + Redis)

### 🏗️ pnpm 工作空间结构

```
library-cover-studio/
├── package.json              # 根目录工作空间配置
├── pnpm-workspace.yaml       # pnpm 工作空间配置
├── pnpm-lock.yaml           # 依赖锁定文件
├── .npmrc                   # pnpm 配置文件
├── web/                     # 前端项目
├── backend/                 # 后端项目
└── PNPM_GUIDE.md           # 详细使用指南
```

## 🎯 快速开始

### 1. 开发环境启动

```powershell
# 同时启动前端和后端开发服务器
pnpm dev

# 或者分别启动
pnpm dev:web      # http://localhost:5173 (前端)
pnpm dev:backend  # http://localhost:3001 (后端API)
```

### 2. 生产环境构建

```powershell
# 构建所有项目
pnpm build

# 构建前端项目
pnpm build:web
```

### 3. Docker 部署

```powershell
# 一键部署 (包含数据库)
docker-compose up -d

# 或使用 Windows 部署脚本
.\scripts\deploy.ps1
```

## 📋 常用命令

### 依赖管理

```powershell
# 安装所有依赖
pnpm install

# 为前端添加依赖
pnpm --filter web add vue-router

# 为后端添加依赖  
pnpm --filter backend add express

# 移除依赖
pnpm --filter web remove lodash
```

### 脚本运行

```powershell
# 运行开发服务器
pnpm dev                    # 并行启动前后端
pnpm dev:web               # 只启动前端
pnpm dev:backend           # 只启动后端

# 构建项目
pnpm build                 # 构建所有项目
pnpm build:web             # 只构建前端

# 代码检查和格式化
pnpm lint                  # 检查所有项目
pnpm format               # 格式化代码
```

### 清理和维护

```powershell
# 清理 node_modules
pnpm clean

# 清理 pnpm 缓存
pnpm store prune

# 查看依赖关系
pnpm why package-name

# 更新依赖
pnpm update
```

## 🔥 pnpm 优势

### ⚡ 性能提升

- **安装速度**: 比 npm 快 2-3 倍
- **磁盘空间**: 节省约 50% 存储空间
- **网络效率**: 智能缓存和并行下载

### 🛡️ 安全性

- **严格依赖**: 防止幽灵依赖问题
- **隔离环境**: 每个项目独立的 node_modules
- **版本锁定**: pnpm-lock.yaml 确保一致性

### 🔧 Monorepo 支持

- **工作空间**: 原生支持多项目管理
- **依赖共享**: 高效的包共享机制
- **脚本执行**: 灵活的跨项目脚本运行

## 🎨 项目功能

### 前端功能

- ✅ 海报设计器 (Fabric.js)
- ✅ 拖拽式编辑界面
- ✅ 文字、图像、形状工具
- ✅ 模板管理系统
- ✅ 响应式UI设计

### 后端功能  

- ✅ RESTful API服务
- ✅ 海报生成引擎
- ✅ 定时任务调度
- ✅ 媒体库集成 (Jellyfin/Emby/Plex)
- ✅ 用户认证系统

### 自动化功能

- ✅ 批量海报生成
- ✅ 媒体库自动更新
- ✅ 任务队列管理
- ✅ 错误重试机制

## 🚀 下一步

1. **立即启动开发环境**:

   ```powershell
   pnpm dev
   ```

2. **访问应用**:
   - 前端界面: <http://localhost:5173>
   - 后端API: <http://localhost:3001>

3. **查看详细文档**:
   - `PNPM_GUIDE.md` - pnpm 使用指南
   - `README.md` - 项目完整文档
   - `QUICKSTART.md` - 快速开始指南

---

**🎉 恭喜！您的 LibraryCoverStudio 项目现在使用 pnpm 进行管理，享受更快的安装速度和更好的依赖管理体验！**
