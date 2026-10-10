# 🎨 LibraryCoverStudio

**为 Jellyfin / Emby 设计媒体库封面，让电影、剧集和动漫分类按计划自动焕新。**

[![CI](https://github.com/HappyQuQu/library-cover-studio/actions/workflows/ci.yml/badge.svg)](https://github.com/HappyQuQu/library-cover-studio/actions/workflows/ci.yml)
[![Docker](https://img.shields.io/badge/Docker-amd64%20%7C%20arm64-2496ED?logo=docker&logoColor=white)](https://hub.docker.com/r/evanqu/library-cover-studio-web)
![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)

[Docker 部署](#-docker-部署) · [自动化教程](#-自动化任务教程) · [界面预览](#-界面预览) · [完整部署指南](doc/Docker_Deployment.md) · [发布流程](doc/Publishing.md)

![可视化设计器：左侧添加元素，中间编辑封面，右侧管理图层](doc/images/screenshots/editor.jpg)

## ✨ 能做什么

| 功能 | 使用方式 |
| --- | --- |
| 可视化设计 | 拖拽海报、文字和形状，调整图层、圆角、旋转、描边与背景，实时查看画布。 |
| 六套内置模板 | 首次启动即可使用 1920 × 1080 模板，也可以复制后修改、导入或导出模板。 |
| Jellyfin / Emby | 连接媒体服务器，读取媒体库海报，为每个选中的媒体库生成一张分类封面。 |
| 自动更新 | 按天、周、月或自定义 Cron 执行；每个媒体库可单独设置模板、标题和素材排序。 |
| 真实样张 | 保存任务前读取媒体库海报生成样张，预览不会上传或修改媒体服务器。 |
| 执行历史 | 查看每次执行的结果、逐库封面预览，并下载当次生成的原图。 |
| AI 设计助手 | 配置自己的 AI 服务，通过文字或参考图生成可编辑设计；基础功能无需 AI。 |
| 数据维护 | 配置 PNG / JPEG / WebP 输出、历史保留上限、自定义字体、配置导出和缓存清理。 |

## 🖼️ 界面预览

### 模板库：选择风格，复制后开始设计

内置柔彩扇形、直列海报墙、倾斜圆角海报墙、斜切大图、柔雾居中标题和圆角叠卡。默认模板已锁定，可直接用于任务；修改时建议先复制，保留原始样式。模板保存历史最多保留最近 50 条，支持回退。

![模板库中的六套内置封面布局](doc/images/screenshots/templates.jpg)

### 媒体源：连接服务器，查看媒体库

支持 Jellyfin / Emby 基础地址及反向代理子路径，图片通过应用的认证代理读取。

![媒体源页面展示示例服务器及电影、电视剧、动漫媒体库](doc/images/screenshots/servers.jpg)

### 自动化：查看计划和执行结果

![自动化任务列表中的定时任务、手动任务和下次运行时间](doc/images/screenshots/tasks.jpg)

> 文档截图来自实际运行的应用，使用隔离的演示账号、示例媒体库和项目内置海报；不包含真实服务器配置或密钥。

## 🐳 Docker 部署

推荐使用 Docker Compose，同时启动 **web 前端 + backend 后端**。镜像面向 `linux/amd64` 和 `linux/arm64`；镜像标签以 Docker Hub 实际发布结果为准。尚无可用标签时，可使用下方的源码构建方式。

| 镜像 | 用途 |
| --- | --- |
| [`evanqu/library-cover-studio-web`](https://hub.docker.com/r/evanqu/library-cover-studio-web) | 网页界面与 `/api` 反向代理 |
| [`evanqu/library-cover-studio-backend`](https://hub.docker.com/r/evanqu/library-cover-studio-backend) | API、SQLite、封面生成与任务调度 |

### 1. 获取部署文件

安装 Docker Engine / Docker Desktop、Docker Compose v2、Git 和 OpenSSL，然后执行：

```bash
git clone https://github.com/HappyQuQu/library-cover-studio.git
cd library-cover-studio
```

### 2. 首次生成配置

下面的命令只在 `.env` 不存在时创建配置。已有安装请保留原有密钥，尤其是 `ENCRYPTION_KEY`，否则已保存的媒体服务器和 AI 密钥将无法解密。

```bash
if [ -e .env ]; then
  echo ".env 已存在，请保留现有配置和密钥"
else
  umask 077
  cat > .env <<ENV
JWT_SECRET=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)
WEB_PORT=8080
BACKEND_PORT=3000
LCS_IMAGE_TAG=latest
ENV
fi
```

### 3. 启动并访问

```bash
docker compose -f docker-compose.release.yml pull
docker compose -f docker-compose.release.yml up -d --wait
docker compose -f docker-compose.release.yml ps
```

打开 **http://localhost:8080**，点击「立即注册」。第一个注册的账号成为管理员，随后添加媒体服务器。

默认端口只绑定宿主机 `127.0.0.1`。在 NAS / Linux 服务器上供其他设备访问时，按照 [局域网访问配置](doc/Docker_Deployment.md#nas--局域网访问) 配置前端端口和访问地址。浏览器访问 web 即可，无需直接访问 backend。

### 源码构建方式

同样先配置 `.env`，在项目根目录执行：

```bash
docker compose up -d --build --wait
```

两种方式使用相同的数据卷；在同一目录切换部署方式前先停止原来的服务，避免同名容器冲突。更完整的端口说明、NAS 配置、升级、备份、恢复和故障排查见 **[Docker 部署教程](doc/Docker_Deployment.md)**。

## ⚡ 自动化任务教程

一次配置，即可定期更新所选媒体库的封面。以下示例每周一 04:00 更新电影、电视剧和动漫三个分类。

### 1. 连接媒体服务器

在「媒体源 → 添加服务器」填写名称、类型、**后端容器可以访问的服务器地址**和 API 密钥。保存后测试连接并查看媒体库。Docker 容器中的 `localhost` 指向容器自身；媒体服务器在 NAS 或局域网时，应填写它的局域网地址或可访问的域名。

### 2. 选择范围、配置封面

进入「自动化 → 新建任务」，填写任务名称并勾选媒体库。下一步批量应用模板，再按媒体库调整主标题、副标题和素材排序，点击「生成真实样张」检查效果。

![任务配置：每个媒体库设置模板和标题，右侧显示真实样张](doc/images/screenshots/task-cover.jpg)

### 3. 设置执行时间

在「设置时间」选择「按计划运行」，使用「每周一」预设，或者设置频率和时间。查看调度时区与未来三次执行时间，勾选「保存后启用此计划」。

![执行时间设置：每周一凌晨四点，展示调度时区和未来三次执行](doc/images/screenshots/task-schedule.jpg)

| 想要的计划 | Cron 表达式 |
| --- | --- |
| 每天 04:00 | `0 4 * * *` |
| 每周一 04:00 | `0 4 * * 1` |
| 每月 1 日 04:00 | `0 4 1 * *` |
| 每小时整点 | `0 * * * *` |

默认调度时区是 `Asia/Shanghai`，以任务页面显示的时区为准。任务执行需要后端持续运行；暂停后停止未来触发，重启后会重新加载已启用的计划。关机期间错过的时间不会自动补跑。

### 4. 确认、执行、查看历史

检查「预览确认」页后保存任务。保存本身不会立即上传；可以先点一次「立即执行」，再在「执行历史」查看结果、封面大图和下载按钮。

![执行历史：逐媒体库展示当次上传结果和封面预览](doc/images/screenshots/task-history.jpg)

**执行会替换所选媒体库的封面。** 应先生成样张，必要时自行备份媒体服务器原封面；执行历史保存的是本项目生成的图片。默认每个任务保留最多 50 次、30 天内的已结束执行，管理员可修改上限。

完整四步教程、变量说明、手动运行、暂停、历史保留与问题排查见 **[自动化使用指南](doc/Automation_Guide.md)**。

## 🤖 AI 与自定义设计

在「设置 → AI 配置」添加自己的服务，填写地址与密钥，获取模型列表并选择默认模型。支持 OpenAI 兼容接口、Claude、Ollama 等服务；模型支持图片输入时，可添加最多 3 张 JPG / PNG / WebP 参考图。能力未知时需要手动确认，生成后可先预览再应用到画布。

自动化封面主要使用 `{{primaryTitle}}`、`{{secondaryTitle}}` 与 `post1`～`post9` 海报占位。勾选「生成任务时随机背景」可让同一布局每次采用不同配色，关闭后使用固定背景。修改后的模板需保存，任务执行才会读取新版本。

## 🧑‍💻 本地开发

环境：Node.js 22、pnpm 10.28.0。开发时前端默认 `5173`，后端默认 `3000`。

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
# 编辑 .env，将 JWT_SECRET 和 ENCRYPTION_KEY 改为随机字符串
pnpm db:migrate
pnpm dev
```

```bash
pnpm test          # 隔离数据库与本地模拟媒体 API 的回归测试
pnpm build         # 构建前后端
```

前端使用 React 19、Vite、Tailwind CSS、Fabric.js、Zustand 和 TanStack Query；后端使用 Node.js、Express、SQLite / Drizzle，渲染使用 `@napi-rs/canvas` 与 Sharp。

## 📚 文档与发布

- [Docker 部署教程](doc/Docker_Deployment.md)：安装、NAS 访问、升级与备份恢复。
- [自动化使用指南](doc/Automation_Guide.md)：连接、配置、定时执行与历史记录。
- [GitHub Actions 与 Docker Hub 发布](doc/Publishing.md)：自动检查、版本发布、镜像标签和 Overview 同步。
- [Docker Hub 专用说明](README.dockerhub.md)：适合镜像页面阅读的部署和使用教程。
- [用户手册](doc/Product_Manual.md) · [技术架构](doc/Technical_Architecture.md)。

## 📄 许可证

MIT License。
