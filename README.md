# 🎨 LibraryCoverStudio

> 媒体库封面设计与自动化系统 - 让您的 Jellyfin/Emby 媒体库焕然一新

[![Node.js](https://img.shields.io/badge/Node.js-22_LTS-339933?logo=node.js)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript)](https://www.typescriptlang.org/)

## ✨ 特性

- 🎯 **可视化设计器** - 基于 Fabric.js 的专业级 Canvas 编辑器
- 🔗 **媒体源集成** - 无缝对接 Jellyfin / Emby 服务器
- ⚡ **自动化引擎** - Cron 任务自动批量生成海报
- 🎨 **动态模板** - 支持 `{{title}}`, `{{year}}` 等变量
- 🚀 **高性能渲染** - node-canvas + Sharp 混合渲染引擎

## 🛠️ 技术栈

| 层级 | 技术                                                    |
| ---- | ------------------------------------------------------- |
| 前端 | React 19, Vite, TailwindCSS v4, shadcn/ui, Fabric.js v6 |
| 后端 | Node.js 22, Express, TypeScript, SQLite                 |
| 状态 | Zustand, TanStack Query                                 |
| 渲染 | node-canvas, Sharp                                      |

## 🚀 快速开始

### 前置要求

- Node.js >= 22.0.0
- pnpm >= 9.0.0

### 安装

```bash
# 克隆项目
git clone https://github.com/your-username/library-cover-studio.git
cd library-cover-studio

# 安装依赖
pnpm install

# 复制环境变量
cp .env.example .env
# 编辑 .env 配置

# 初始化数据库
pnpm db:migrate

# 启动开发服务器
pnpm dev
```

### 访问

- 前端: http://localhost:5173
- 后端 API: http://localhost:3000

## 🐳 Docker 部署

```bash
# 构建并启动
docker-compose up -d

# 查看日志
docker-compose logs -f
```

## 📁 项目结构

```
library-cover-studio/
├── backend/          # Node.js 后端
│   ├── src/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── routes/
│   │   ├── services/
│   │   └── server.ts
│   └── database/
├── web/              # React 前端
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── stores/
│   │   └── api/
│   └── index.html
└── docker-compose.yml
```

## 📖 文档

- [用户手册](./doc/Product_Manual.md)
- [技术架构](./doc/Technical_Architecture.md)

## 📄 License

MIT License
