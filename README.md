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
git clone https://github.com/HappyQuQu/library-cover-studio.git
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
# 首次部署：复制配置并设置 JWT_SECRET、ENCRYPTION_KEY 为随机字符串
cp .env.example .env

# 构建并启动
docker compose up -d --build --wait

# 查看日志
docker compose logs -f
```

默认访问 `http://localhost:8080`，前端会代理 `/api` 到后端。端口冲突时可在 `.env` 中修改 `WEB_PORT` 和 `BACKEND_PORT`。数据保存在 Docker 命名卷中；首次使用请在页面注册管理员账号。

### GitHub Actions 与 Docker Hub 发布

发布流程参照 FolioPath：PR 运行测试、前后端构建和 amd64/arm64 镜像构建；合入 `main` 后通过同样的检查，再由 Release Please 自动创建并 squash merge 版本 PR、更新 `CHANGELOG.md` 和三个 `package.json`，创建 GitHub Release。新版本提交会再次检查后发布前后端镜像，包含 SBOM 与 provenance，并同步 Docker Hub Overview。该流程只发布镜像，部署由使用者执行。

在仓库 **Settings → Actions → General** 开启 **Allow GitHub Actions to create and approve pull requests**。工作流只对发布 job 授予写权限，PR 检查保持只读。

在 **Settings → Secrets and variables → Actions** 配置：

| 类型 | 名称 | 用途 |
| --- | --- | --- |
| Secret | `DOCKERHUB_USERNAME` | Docker Hub 登录账号 |
| Secret | `DOCKERHUB_TOKEN` | 可推送两个目标镜像并更新 Overview 的 access token |
| Secret（可选） | `DOCKERHUB_DESCRIPTION_TOKEN` | 独立 Overview 更新 token，未设置时复用上述 token |
| Variable（可选） | `DOCKERHUB_NAMESPACE` | 镜像命名空间，默认 `evanqu` |

默认镜像为 `evanqu/library-cover-studio-backend` 和 `evanqu/library-cover-studio-web`，支持 `linux/amd64` 与 `linux/arm64`。`main` 发布 `latest`、`sha-*`；创建正式版本时追加 `MAJOR.MINOR.PATCH`、`MAJOR.MINOR`。手工推送 `v*.*.*` 标签也可触发发布。Actions 手动运行默认只发布 `edge` 与 `sha-*`，可填写其他明确的 Docker 标签。

PR 标题和提交使用 Conventional Commits，例如 `fix: 修复封面生成缺失图形`。`feat:`、`fix:`、`perf:`、`refactor:`、`note:` 进入面向用户的更新日志；`ci:`、`build:`、`test:`、`docs:`、`chore:` 不进入。自动发布从当前 `1.3.0` 基线开始，后端健康接口、媒体服务器请求头和前端设置页从各自包版本读取版本号。

已发布镜像可以使用独立 Compose 文件部署，与源码构建使用相同的端口和数据卷：

```bash
# .env 中仍需配置 JWT_SECRET 和 ENCRYPTION_KEY；升级前备份数据卷
# 使用已发布的明确版本号，也可通过 LCS_IMAGE_NAMESPACE 指定其他命名空间
LCS_IMAGE_TAG=1.3.1 docker compose -f docker-compose.release.yml pull
LCS_IMAGE_TAG=1.3.1 docker compose -f docker-compose.release.yml up -d --wait
```

首次发布完成后，上例的 `1.3.1` 才可拉取。工作流配置见 [CI](.github/workflows/ci.yml) 和 [Docker Hub 发布](.github/workflows/dockerhub.yml)。

## Jellyfin / Emby 接口兼容

按 [Jellyfin 12.2 官方接口](https://github.com/jellyfin/jellyfin/releases/tag/v12.2)与 [Emby REST API](https://dev.emby.media/doc/restapi/index.html)对接：

- 填写服务器基础地址，支持反向代理子路径；Emby 自动识别 `/emby`，也兼容代理直接暴露的根路径。
- 媒体源显示实际连接结果和服务器版本。媒体库图片走同源认证代理，访问令牌不会拼入图片 URL。
- 根据电影、剧集、音乐等媒体库类型读取素材；旧任务的 `Name` / `DateLastPlayed` 排序自动兼容为 `SortName` / `DatePlayed`。
- 封面上传使用两家接口要求的 Base64 请求体，并根据文件实际格式设置 Content-Type。API 密钥需要管理权限。
- `pnpm test` 包含本地接口模拟测试，不会上传图片到已配置的真实媒体服务器。

## 默认模板与随机配色

内置六套 1920 × 1080 布局：柔彩扇形（五张圆角海报、居中双标题）、直列海报墙（右侧 2/3 竖直无缝拼接海报、左侧大标题）、倾斜圆角海报墙（参考动漫封面，保留圆角、海报间距和斜向边界）、斜切大图（左侧标题、右侧一张斜切图片）、柔雾居中标题（渐变背景、居中双标题，无需图片）和圆角叠卡（左侧标题、右侧半透明叠卡）。每次生成真实样张或执行任务时按各自风格随机配色，标题与海报自动替换。配色变化不会改动已保存的布局；关闭设计器中的「生成任务时随机背景」可固定当前背景。

这六套模板的布局 JSON 和预览 JPG 固定保存在 `backend/src/template/defaults/`，由 `manifest.json` 列出，示例海报随项目一同提供，无需连接媒体服务器或 AI 服务即可初始化。首次启动后端时自动写入数据库、复制预览图并建立初始历史记录，新注册用户可直接在模板库使用。Docker 镜像同样包含这些文件。初始化只执行一次，后续启动不会覆盖用户的修改、锁定状态或恢复已删除的模板。维护内置样式时应同时更新对应 JSON 和预览图；更改项目文件只影响新安装，已有安装保留自己的版本。

模板锁定后为只读，可预览、查看保存历史或复制，需解锁才能编辑、保存、回退或删除；复制得到的模板默认不锁定。每次保存保留独立设计和预览图，在设计器「历史」中可查看并回退，最多保留最近 50 条；回退本身会保存为新记录。现有模板从当前版本开始记录历史。旧版按颜色拆分的默认模板会合并，对应任务引用随之迁移；无缝海报墙保留原 ID 并改为竖直排列，倾斜圆角样式作为独立模板添加。后续重启保留编辑和删除结果。

## 自动化定时执行

在自动化任务的「设置时间」中选择「按计划运行」，设置时间并启用任务，即可由后端到点自动生成和上传封面；「手动运行」任务只在点击运行时执行。默认计划时区为 `Asia/Shanghai`。暂停或删除任务后停止后续触发，修改计划会重新注册；Docker 重启后自动加载已启用的定时任务。

自动执行同样保存执行记录和封面预览。任务尚未完成时，后续定时触发会跳过重复执行；「下次运行时间」随启用、暂停及时间触发同步更新。后端需要保持运行才能按计划执行。

## AI 模型与参考图

在「设置 → AI 配置」填写服务地址和密钥，点击「获取模型列表」选择默认模型。编辑已有服务会自动读取列表，密钥留空即可继续使用已保存的密钥。支持 OpenAI 兼容接口、MiMo、Claude 和 Ollama；设计助手也可以刷新和切换接口返回的模型。

只有确认支持图片理解的模型才能添加参考图（最多 3 张，支持 JPG / PNG / WebP、拖入和粘贴）。能力优先读取接口信息；MiMo 官方模型与部分 OpenAI 官方模型依据官方文档补充。接口不提供能力时显示「待确认」，可在「手动模型与图片能力」中确认当前模型是否支持图片输入。上传后可让 AI 分析配色、构图和文字层级，生成可编辑海报并预览后应用。

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

### 发布前修复与数据保留

- 字体删除仅接受字体目录中的普通文件；任务详情限制为所有者或管理员访问。并发首次注册只产生一个管理员。
- 全局渲染、存储、调度时区和 AI 系统指令仅管理员可修改；主题偏好保存在当前浏览器。渲染设置应用于真实样张和自动化执行，输出格式支持 PNG、JPEG、WebP，质量设置应用于 JPEG/WebP，并发数量限制同时渲染的图片。
- 正在被任务引用的模板需先解除引用才能删除，包括暂停任务的引用；正在执行的任务不能删除或重复手动触发。重启后被中断的执行记录标记失败，保留已有封面，不会自动重试上传。
- “保存生成的封面”控制额外导出文件；执行历史独立保存上传原图和预览图。默认每个任务最多保留 50 次、30 天内的已结束执行，超出任一限制在启动或执行结束后清理；管理员可调整上限。
- 配置导出包含模板和配置 JSON，不含账号密码、API 密钥、历史图片和字体文件，恢复连接时需重新填写密钥。缓存清理先显示数量与大小，仅清理超过 24 小时的临时文件和没有历史引用的图片。
- 设计器离开未保存设计时显示提示，并尝试将草稿保存到当前浏览器，可在再次打开同一模板时选择恢复。含大量嵌入图片的设计可能超出浏览器存储容量，仍应及时保存模板。
- 旧任务中的 `skipLocked` / `overwriteExisting` 从未参与执行，现不再接受这两个选项；已有记录中的这两个值会忽略。媒体库封面任务始终替换目标媒体库封面，可先生成真实样张确认效果。

后端支持 `LCS_DATA_DIR` 指定独立数据目录，便于隔离测试或部署；不设置时继续使用后端工作目录下的 `data/`。根目录数据库迁移与初始化模板命令分别为 `pnpm db:migrate`、`pnpm db:seed`。
