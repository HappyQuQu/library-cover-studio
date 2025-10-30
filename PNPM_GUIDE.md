# LibraryCoverStudio - pnpm 使用指南

## 🚀 快速开始

### 1. 安装 pnpm

```powershell
# 全局安装 pnpm
npm install -g pnpm@8.15.0

# 验证安装
pnpm --version
```

### 2. 安装项目依赖

```powershell
# 在项目根目录安装所有依赖
pnpm install

# 或者使用别名
pnpm i
```

### 3. 开发环境启动

```powershell
# 同时启动前端和后端开发服务器
pnpm dev

# 或者分别启动
pnpm dev:web      # 启动前端开发服务器
pnpm dev:backend  # 启动后端开发服务器
```

### 4. 构建项目

```powershell
# 构建所有项目
pnpm build

# 构建指定项目
pnpm build:web    # 只构建前端
```

## 📦 pnpm 工作空间特性

### 项目结构
```
library-cover-studio/
├── package.json          # 根目录 package.json (工作空间配置)
├── pnpm-workspace.yaml   # pnpm 工作空间配置
├── pnpm-lock.yaml        # 锁定文件 (自动生成)
├── .npmrc                # pnpm 配置
├── web/                  # 前端项目
│   └── package.json
└── backend/              # 后端项目
    └── package.json
```

### 常用命令

#### 安装依赖
```powershell
# 为所有工作空间安装依赖
pnpm install

# 为特定工作空间安装依赖
pnpm --filter web install vue-router
pnpm --filter backend install express

# 安装开发依赖
pnpm --filter web add -D @types/node
```

#### 运行脚本
```powershell
# 在所有工作空间并行运行脚本
pnpm run --parallel dev

# 在所有工作空间递归运行脚本
pnpm run --recursive build
pnpm run --recursive test

# 在特定工作空间运行脚本
pnpm --filter web dev
pnpm --filter backend start
```

#### 管理依赖
```powershell
# 添加依赖到特定工作空间
pnpm --filter web add vue@^3.4.0
pnpm --filter backend add express@^4.18.2

# 移除依赖
pnpm --filter web remove lodash
pnpm --filter backend remove unused-package

# 更新依赖
pnpm update                    # 更新所有依赖
pnpm --filter web update vue   # 更新特定依赖
```

## 🔧 配置说明

### pnpm-workspace.yaml
```yaml
packages:
  - 'web'      # 前端项目
  - 'backend'  # 后端项目
```

### .npmrc 配置
```ini
shamefully-hoist=true          # 提升依赖到根目录
strict-peer-dependencies=false # 不严格检查 peer 依赖
auto-install-peers=true        # 自动安装 peer 依赖
node-linker=isolated          # 使用隔离的 node_modules
enable-pre-post-scripts=true   # 启用 pre/post 脚本
```

## 🎯 优势特性

### 1. 磁盘空间优化
- pnpm 使用硬链接和符号链接，相同版本的包只存储一次
- 比 npm/yarn 节省约 50% 的磁盘空间

### 2. 安装速度快
- 并行安装依赖
- 智能缓存机制
- 比 npm 快 2-3 倍

### 3. 严格的依赖管理
- 防止幽灵依赖 (phantom dependencies)
- 严格的 node_modules 结构

### 4. Monorepo 支持
- 原生支持工作空间 (workspaces)
- 高效的依赖共享
- 灵活的脚本执行

## 📝 常见问题

### Q: 如何从 npm 迁移到 pnpm？
A: 删除 node_modules 和 package-lock.json，然后运行 `pnpm install`

### Q: 如何处理 peer 依赖警告？
A: 在 .npmrc 中设置 `auto-install-peers=true` 或手动安装缺失的 peer 依赖

### Q: 如何调试依赖问题？
A: 使用 `pnpm why package-name` 查看依赖关系

### Q: 如何清理缓存？
A: 运行 `pnpm store prune` 清理未使用的包

## 🚀 部署

### 开发环境
```powershell
# 安装依赖并启动开发服务器
pnpm install
pnpm dev
```

### 生产环境
```powershell
# 构建项目
pnpm install --frozen-lockfile  # 使用锁定的依赖版本
pnpm build

# Docker 部署
docker-compose up -d
```

## 🔗 相关链接

- [pnpm 官方文档](https://pnpm.io/)
- [工作空间配置](https://pnpm.io/workspaces)
- [CLI 命令参考](https://pnpm.io/cli/add)