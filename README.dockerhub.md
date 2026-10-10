# LibraryCoverStudio

**Jellyfin / Emby 媒体库封面设计与自动化工具。** 使用内置模板或可视化设计器，为电影、电视剧和动漫分类生成封面，再按计划自动上传更新。

[项目源码](https://github.com/HappyQuQu/library-cover-studio) · [完整部署教程](https://github.com/HappyQuQu/library-cover-studio/blob/main/doc/Docker_Deployment.md) · [自动化图文教程](https://github.com/HappyQuQu/library-cover-studio/blob/main/doc/Automation_Guide.md)

![可视化封面设计器与图层面板](https://raw.githubusercontent.com/HappyQuQu/library-cover-studio/main/doc/images/screenshots/editor.jpg)

## 主要功能

- **可视化设计**：拖拽海报、文字和形状，调整图层、背景、圆角及旋转。
- **六套内置模板**：1920 × 1080，首次启动即可使用，支持复制、编辑和模板历史回退。
- **Jellyfin / Emby**：通过 API 读取媒体库海报，无需挂载电影文件目录。
- **自动化更新**：每个媒体库可单独选择模板和标题，按天、周、月或 Cron 执行。
- **真实样张与执行历史**：上传前预览，执行后查看当次封面、逐库结果并下载原图。
- **可选 AI 助手**：接入自己的 AI 服务生成可编辑设计，基础功能无需 AI。

![模板库：六套内置样式](https://raw.githubusercontent.com/HappyQuQu/library-cover-studio/main/doc/images/screenshots/templates.jpg)

## 镜像说明

**部署需要前后端两个镜像一起运行。** 当前 Overview 会同步至以下两个仓库：

| 镜像 | 用途 | 容器内端口 |
| --- | --- | --- |
| `evanqu/library-cover-studio-web` | 网页与 `/api` 反向代理 | `80` |
| `evanqu/library-cover-studio-backend` | API、SQLite、渲染和调度 | `3000` |

支持 `linux/amd64` / `linux/arm64`。两个镜像应使用相同标签；`latest` 对应主分支发布，正式版本使用 `MAJOR.MINOR.PATCH` / `MAJOR.MINOR`，`sha-*` 对应具体提交，`edge` 用于手动验证。请以 Docker Hub Tags 页实际可用的标签为准。

## Docker Compose 部署

准备 Docker Engine / Docker Desktop、Compose v2、Git 和 OpenSSL。无需安装 Node.js 或 pnpm。

### 1. 获取配置文件

```bash
git clone https://github.com/HappyQuQu/library-cover-studio.git
cd library-cover-studio
```

### 2. 首次生成随机密钥

下面的命令不会覆盖已有 `.env`。升级时必须保留原来的 `ENCRYPTION_KEY` 与数据卷，否则已保存的媒体服务器和 AI 密钥无法解密。

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

端口冲突时修改 `WEB_PORT` / `BACKEND_PORT`。稳定部署可将 `LCS_IMAGE_TAG` 改为已经发布的明确版本号；自行发布镜像时设置 `LCS_IMAGE_NAMESPACE`。

### 3. 拉取并启动

```bash
docker compose -f docker-compose.release.yml pull
docker compose -f docker-compose.release.yml up -d --wait
docker compose -f docker-compose.release.yml ps
```

在 Docker 宿主机打开 **http://localhost:8080**，点击「立即注册」。第一个注册的账号成为管理员。浏览器通过 web 访问 API，无需单独访问后端端口。

默认端口只绑定宿主机 `127.0.0.1`，其他设备访问 NAS 部署时，请使用下面的局域网配置。

### NAS / 局域网访问

假设 NAS 地址为 `192.168.1.10`，在 `.env` 增加：

```dotenv
LCS_PUBLIC_URL=http://192.168.1.10:8080
```

创建 `docker-compose.lan.yml`（需 Compose 2.24.4+，详见 [Docker 合并规则](https://docs.docker.com/reference/compose-file/merge/)）：

```yaml
services:
  backend:
    environment:
      FRONTEND_URL: ${LCS_PUBLIC_URL:?请在 .env 中设置 LCS_PUBLIC_URL}
  web:
    ports: !override
      - "${WEB_PORT:-8080}:80"
```

```bash
docker compose -f docker-compose.release.yml -f docker-compose.lan.yml up -d --wait
```

打开 `http://192.168.1.10:8080`。换成自己的地址和端口，并设置 NAS 防火墙允许可信设备访问网页端口。后续升级、停止和重启也使用这两份配置。反向代理域名则将 `LCS_PUBLIC_URL` 设置为真实的网页来源，并把整个站点转发至 web。

### 尚未发布镜像时：源码构建

同样配置 `.env`，改用项目中的源码构建配置：

```bash
docker compose up -d --build --wait
```

## 自动化图文教程

### 1. 连接服务器

在「媒体源 → 添加服务器」填写名称、Jellyfin / Emby 类型、服务器基础地址与 API 密钥。地址必须能从后端容器访问，例如局域网地址 `http://192.168.1.20:8096`；容器中的 `localhost` 指的是容器自身。

保存后测试连接，点击「媒体库」确认目标分类和海报可读取。密钥需要读取素材与更新封面的权限。

![媒体源：在线状态与三个示例媒体库](https://raw.githubusercontent.com/HappyQuQu/library-cover-studio/main/doc/images/screenshots/servers.jpg)

### 2. 选择媒体库并配置封面

进入「自动化 → 新建任务」，选择服务器和需要更新的媒体库。下一步批量设置模板，再按库调整主标题、副标题和素材排序。右侧「生成真实样张」读取媒体库海报进行实际渲染，**不会上传或修改服务器**。

![封面配置与真实样张预览](https://raw.githubusercontent.com/HappyQuQu/library-cover-studio/main/doc/images/screenshots/task-cover.jpg)

### 3. 设置时间并启用

选择「按计划运行」，设置频率和执行时间，核对调度时区及未来三次执行，勾选「保存后启用此计划」。默认时区为 `Asia/Shanghai`，以任务页面显示为准。

![定时计划：每周一凌晨四点、未来三次执行与启用选项](https://raw.githubusercontent.com/HappyQuQu/library-cover-studio/main/doc/images/screenshots/task-schedule.jpg)

| 执行计划 | Cron |
| --- | --- |
| 每天 04:00 | `0 4 * * *` |
| 每周一 04:00 | `0 4 * * 1` |
| 每月 1 日 04:00 | `0 4 1 * *` |
| 每小时整点 | `0 * * * *` |

不需要定时则选择「手动运行」，保存后点击「立即执行」。后端需持续运行才能按计划执行，关机期间错过的执行时间不会自动补跑。

### 4. 保存、执行和查看历史

在「预览确认」核对配置后保存。**保存不会立即上传，执行会替换所选媒体库的分类封面**；需要保留原封面时请提前自行备份。每个选中的媒体库生成一张封面，不会逐部更换电影 / 剧集海报。

可以先点一次「立即执行」验收，再打开「查看执行历史」，检查逐库状态、放大图片并下载原图。

![执行历史和当次封面预览](https://raw.githubusercontent.com/HappyQuQu/library-cover-studio/main/doc/images/screenshots/task-history.jpg)

历史默认每个任务保留最多 50 次、30 天内的已结束执行，可在「设置 → 数据管理」调整。「保存生成的封面」开关控制额外导出，关闭后历史仍会保存独立图片。

> 截图来自实际应用的隔离演示环境，使用示例账号、模拟媒体库和内置海报。截图链接需要 GitHub 仓库及图片可以匿名访问。

## 升级与数据维护

数据保存在 `backend_data` / `backend_uploads` 命名卷中。普通重建容器会保留卷，`docker compose down -v` 会删除它们。完整备份需同时保存数据卷与 `.env`，配置导出不包含账号、密钥和图片，不能代替备份。

先按 [备份与恢复教程](https://github.com/HappyQuQu/library-cover-studio/blob/main/doc/Docker_Deployment.md#备份) 备份，再修改 `.env` 中的版本标签并执行：

```bash
docker compose -f docker-compose.release.yml pull
docker compose -f docker-compose.release.yml up -d --wait
```

保持原部署目录、项目名、加密密钥与数据卷。使用局域网覆盖配置时，在命令中继续加上 `-f docker-compose.lan.yml`。

## 排查问题

```bash
docker compose -f docker-compose.release.yml ps
docker compose -f docker-compose.release.yml logs --tail=100 backend web
```

| 问题 | 处理 |
| --- | --- |
| 镜像无法拉取 | 检查镜像名、命名空间及目标标签是否已发布；未发布时使用源码构建。 |
| NAS 其他设备无法访问 | 默认绑定本机地址，需启用局域网覆盖配置并允许网页端口。 |
| 连接服务器失败 | 检查容器网络可达性、API 密钥权限和地址，避免误用 `localhost`。 |
| CORS 错误 | `FRONTEND_URL` / `LCS_PUBLIC_URL` 与浏览器实际来源一致，包括协议和端口。 |
| 定时任务不执行 | 检查后端是否健康、任务是否启用、调度时区和下次运行时间。 |
| 升级后密钥无法解密 | 核对原 `ENCRYPTION_KEY` 和数据卷中的加密盐是否保留。 |

[完整部署与故障排查](https://github.com/HappyQuQu/library-cover-studio/blob/main/doc/Docker_Deployment.md) · [自动化使用指南](https://github.com/HappyQuQu/library-cover-studio/blob/main/doc/Automation_Guide.md) · MIT License
