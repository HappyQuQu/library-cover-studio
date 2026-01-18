# LibraryCoverStudio

**专业的媒体库海报设计工具，支持自动化更新 Jellyfin & Emby 海报**

## 🌟 核心功能

### 🎨 可视化海报设计器

- **拖拽式编辑**: 基于 Fabric.js 的专业画布编辑器
- **丰富的元素**: 文字、图片、形状、背景支持
- **实时预览**: 所见即所得的设计体验
- **模板系统**: 保存、复用、分享设计模板

### 🤖 智能自动化

- **定时更新**: 使用 Cron 表达式灵活调度
- **批量处理**: 一键更新整个媒体库
- **智能过滤**: 按类型、评分、年份等条件筛选
- **多平台支持**: Jellyfin、Emby、Plex

### 🛠️ 技术特性

- **Vue.js 3**: 现代化前端框架
- **Node.js**: 高性能后端 API
- **PostgreSQL**: 可靠的数据存储
- **Redis**: 任务队列和缓存
- **Docker**: 一键部署

## 🚀 快速开始

### 一键启动

```bash
# 克隆项目
git clone https://github.com/your-username/LibraryCoverStudio.git
cd LibraryCoverStudio

# 配置环境
cp .env.example .env

# 启动服务
docker-compose up -d

# 访问应用
open http://localhost:3001
```

### 开发环境

```bash
# 前端开发
cd web && npm install && npm run dev

# 后端开发  
cd backend && npm install && npm run dev
```

## 📖 使用教程

### 1. 设计海报模板

1. 🎨 打开设计器 → 选择画布尺寸
2. 🖼️ 添加背景 → 上传图片或设置颜色
3. ✏️ 添加文字 → 使用变量 `{{title}}` `{{year}}`
4. 🎛️ 调整样式 → 字体、大小、位置、颜色
5. 💾 保存模板 → 命名并添加标签

### 2. 连接媒体库

1. ⚙️ 进入设置页面
2. 🔌 添加媒体库连接
3. 🔑 配置 API 密钥
4. ✅ 测试连接状态

### 3. 设置自动任务

1. ⏰ 创建定时任务
2. 📋 选择模板和媒体库
3. 🕐 设置执行时间
4. 🎯 配置过滤条件
5. ▶️ 启动任务

## 🏗️ 项目结构

```
library-cover-studio/
├── web/                    # Vue.js 前端
│   ├── src/
│   │   ├── components/     # 设计器组件
│   │   ├── views/         # 页面视图
│   │   └── stores/        # 状态管理
├── backend/               # Node.js 后端
│   ├── src/
│   │   ├── controllers/   # 控制器
│   │   ├── services/      # 业务服务
│   │   ├── routes/        # API 路由
│   │   └── middleware/    # 中间件
├── database/              # 数据库脚本
├── docker-compose.yml     # 容器编排
└── docs/                 # 文档资源
    ├── AUTHENTICATION.md  # 认证指南
    ├── DESIGNER_GUIDE.md  # 设计器指南
    ├── JELLYFIN_GUIDE.md  # 媒体服务器集成
    └── TECHNICAL_GUIDE.md # 技术手册
```

## 📚 项目资源与文档

为了保持代码库整洁，我们对文档进行了深度整合。请参考以下核心指南：

- 🚀 [**快速上手指南**](#-快速开始) - 基础安装与启动。
- 📋 [**技术开发手册**](docs/TECHNICAL_GUIDE.md) - 系统架构、依赖管理及开发规范。
- 🔐 [**认证系统使用手册**](docs/AUTHENTICATION.md) - 用户登录、API 安全及权限配置。
- 🎬 [**媒体服务器集成**](docs/JELLYFIN_GUIDE.md) - Jellyfin/Emby 连接与自动化配置。
- 🎨 [**海报设计器指南**](docs/DESIGNER_GUIDE.md) - 变量系统、占位符及设计技巧。

## 🛠️ 技术栈

| 层级         | 技术选择                | 说明               |
| ------------ | ----------------------- | ------------------ |
| **前端**     | Vue.js 3 + TypeScript   | 现代化响应式框架   |
| **UI 库**    | Element Plus + Tailwind | 企业级组件库       |
| **画布**     | Fabric.js               | 专业 Canvas 编辑器 |
| **后端**     | Node.js + Express       | 高性能 RESTful API |
| **数据库**   | SQLite                  | 轻量级嵌入式数据库 |
| **图像处理** | Sharp                   | 高速图像合成处理   |
| **部署**     | Docker + Compose        | 容器化部署         |

## 📊 功能对比

| 功能       | LibraryCoverStudio   | 其他工具   |
| ---------- | -------------------- | ---------- |
| 可视化设计 | ✅ 专业级编辑器       | ❌ 基础功能 |
| 自动化更新 | ✅ 灵活调度           | ⚠️ 有限支持 |
| 模板系统   | ✅ 丰富模板库         | ⚠️ 模板较少 |
| 多平台支持 | ✅ Jellyfin/Emby/Plex | ⚠️ 单一平台 |
| 部署方式   | ✅ Docker 一键部署    | ❌ 复杂配置 |

## 🤝 贡献指南

我们欢迎所有形式的贡献！详细开发说明请参考 [技术开发手册](docs/TECHNICAL_GUIDE.md)。

## 📄 许可证

本项目基于 MIT 许可证开源 - 查看 [LICENSE](LICENSE) 了解详情

---

⭐ **如果这个项目对你有帮助，请给我们一个星标！**
