# Docker 部署教程

[返回项目首页](../README.md) · [配置自动化任务](Automation_Guide.md)

LibraryCoverStudio 由 **web 前端**和 **backend 后端**两个容器组成。前端提供网页并代理 `/api`；后端保存 SQLite 数据、生成封面并运行定时任务。两个容器需要一起启动。

## 部署前准备

- 安装 Docker Engine 或 Docker Desktop，以及 Docker Compose v2。
- 使用 Git 获取项目；生成配置时需要 OpenSSL。
- NAS 局域网覆盖配置使用 `!override`，需要 **Compose 2.24.4 或更新版本**，参见 [Docker 官方合并规则](https://docs.docker.com/reference/compose-file/merge/)。
- 准备 Jellyfin / Emby 地址和具有封面更新权限的 API 密钥。无需挂载媒体文件目录，应用通过媒体服务器 API 读取海报和上传分类封面。

```bash
docker version
docker compose version
git clone https://github.com/HappyQuQu/library-cover-studio.git
cd library-cover-studio
```

## 方式一：使用发布镜像

适用于普通部署，无需安装 Node.js 或 pnpm。两个镜像使用**相同标签**，支持 `linux/amd64` 和 `linux/arm64`。

| 镜像 | 容器内端口 | 用途 |
| --- | --- | --- |
| `evanqu/library-cover-studio-web` | `80` | 网页和 API 代理 |
| `evanqu/library-cover-studio-backend` | `3000` | 接口、渲染和定时调度 |

### 第一步：创建 `.env`

仅首次安装运行下面的命令；已有配置不会被覆盖。

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

| 配置 | 说明 |
| --- | --- |
| `JWT_SECRET` | 登录令牌签名密钥，使用随机值。 |
| `ENCRYPTION_KEY` | 加密媒体服务器和 AI 密钥；升级和恢复时必须保留。 |
| `WEB_PORT` | 宿主机网页端口，默认 `8080`。 |
| `BACKEND_PORT` | 宿主机后端端口，默认 `3000`；网页通过容器网络访问后端。 |
| `LCS_IMAGE_TAG` | 默认 `latest`，稳定部署建议改成 Docker Hub 已发布的明确版本号。 |
| `LCS_IMAGE_NAMESPACE` | 可选，镜像命名空间默认 `evanqu`，自行发布镜像时可修改。 |

`.env.example` 面向本地开发，复制它后也应更换示例密钥。全局输出格式、质量、渲染并发和调度时区在应用「设置」中调整。

### 第二步：拉取并启动

```bash
docker compose -f docker-compose.release.yml pull
docker compose -f docker-compose.release.yml up -d --wait
docker compose -f docker-compose.release.yml ps
```

`--wait` 等待容器达到运行 / 健康状态，具体行为见 [Docker 官方命令说明](https://docs.docker.com/reference/cli/docker/compose/up/)。镜像标签以 Docker Hub 实际发布结果为准；没有可拉取的标签时使用下方源码构建方式。

### 第三步：访问并注册

在**运行 Docker 的机器**上打开 `http://localhost:8080`，点击「立即注册」。第一个注册的账号是管理员，可以修改系统设置、配置 AI 和管理用户。

![注册后可以从仪表盘连接服务器、创建模板和进入自动化](images/screenshots/dashboard.jpg)

默认前后端端口只监听宿主机 `127.0.0.1`。如果 Docker 部署在 NAS 或另一台 Linux 机器上，请继续配置局域网访问。修改 `WEB_PORT` 后，浏览器访问相应端口。

## NAS / 局域网访问

以下示例假设 **NAS 地址为 `192.168.1.10`，网页端口为 `8080`**，请换成自己的地址。

1. 在 `.env` 中增加 `LCS_PUBLIC_URL=http://192.168.1.10:8080`。
2. 创建 `docker-compose.lan.yml`，覆盖前端监听地址和后端允许的网页来源。

```yaml
services:
  backend:
    environment:
      FRONTEND_URL: ${LCS_PUBLIC_URL:?请在 .env 中设置 LCS_PUBLIC_URL}
  web:
    ports: !override
      - "${WEB_PORT:-8080}:80"
```

3. 使用两份配置启动；之后的 `pull`、`up`、`stop`、`start` 等命令都使用相同的 `-f` 参数。

```bash
docker compose -f docker-compose.release.yml -f docker-compose.lan.yml config --quiet
docker compose -f docker-compose.release.yml -f docker-compose.lan.yml up -d --wait
```

打开 `http://192.168.1.10:8080`。此时网页端口面向宿主机所有网络接口，后端宿主机端口仍只绑定本机。为 NAS 防火墙允许网页端口，并按需要限制为可信局域网设备。

Compose 低于 2.24.4 时，可直接编辑 `docker-compose.release.yml`：将 **web** 的端口改为 `"${WEB_PORT:-8080}:80"`，将 **backend** 的 `FRONTEND_URL` 改为自己的访问地址，然后用单份配置启动。

如果使用 Nginx / Caddy / NAS 反向代理，将整个网页站点（包括 `/api`）转发至 web 容器，`LCS_PUBLIC_URL` 改为用户实际访问的完整来源，例如 `https://cover.example.com`。建议部署在域名根路径，API 代理由 web 自带的 Nginx 处理。

## 方式二：从源码构建

配置 `.env` 后，在项目根目录执行：

```bash
docker compose up -d --build --wait
docker compose ps
```

本机访问地址与发布镜像方式相同。局域网配置同样适用，将命令中的 `docker-compose.release.yml` 换为 `docker-compose.yml`。

源码构建和发布镜像配置使用相同的命名卷及容器名。在同一项目目录切换时，先用原配置执行 `down`（**不加 `-v`**），然后用新配置启动。保留目录及项目名称才能继续使用原数据卷。

## 连接 Jellyfin / Emby

进入「媒体源 → 添加服务器」：

| 字段 | 示例与说明 |
| --- | --- |
| 名称 | `家庭影院`，便于识别。 |
| 类型 | 选择服务器实际使用的 Jellyfin 或 Emby。 |
| 地址 | 如 `http://192.168.1.20:8096`，填写后端容器可访问的基础地址；反向代理子路径也应包含。 |
| API 密钥 | 从媒体服务器管理后台获取，需有读取海报及更新媒体库封面的权限。 |

容器中的 `localhost` 指向容器自身，不能用于连接 NAS 上的另一个服务。Docker Desktop 访问宿主机服务时可使用其支持的 `host.docker.internal`；其他环境优先使用可达的局域网地址或容器网络服务名。

![连接成功后查看服务器版本、状态和媒体库](images/screenshots/servers.jpg)

看到「在线」后点击「媒体库」，确认出现所需分类，再按 [自动化教程](Automation_Guide.md) 设置封面任务。

## 数据卷、升级与备份

### 哪些数据会保留

| 数据卷 | 容器路径 | 内容 |
| --- | --- | --- |
| `backend_data` | `/app/backend/data` | SQLite、加密盐、模板缩略图、任务历史及生成文件等 |
| `backend_uploads` | `/app/backend/uploads` | 保留的上传目录挂载；当前字体位于数据目录内的 `uploads/fonts` |

实际卷名通常带 Compose 项目名前缀。普通 `up`、重建容器和 `down` 会保留命名卷，`down -v` 会删除数据卷。配置导出不含账号、API 密钥或图片文件，不能替代完整备份。

### 备份

以下命令假设使用默认容器名 `lcs-backend`，并在部署目录执行。暂停期间无法访问应用或执行定时任务。

```bash
mkdir -p backup
chmod 700 backup
docker compose -f docker-compose.release.yml stop
backup_name="lcs-$(date +%Y%m%d-%H%M%S)"
cp .env "backup/${backup_name}.env"
chmod 600 "backup/${backup_name}.env"
docker run --rm --volumes-from lcs-backend \
  -v "$(pwd)/backup:/backup" alpine:3.22 \
  tar czf "/backup/${backup_name}.tar.gz" -C /app/backend data uploads
chmod 600 "backup/${backup_name}.tar.gz"
docker compose -f docker-compose.release.yml start --wait
```

备份包和配套 `.env` 应成对保存。使用局域网覆盖配置时，停止和恢复命令也加上 `-f docker-compose.lan.yml`；其他自行修改的 Compose 配置也应备份。

### 升级

先完成备份，再修改 `.env` 的 `LCS_IMAGE_TAG` 为已发布版本，**前后端保持同一标签**，执行：

```bash
docker compose -f docker-compose.release.yml pull
docker compose -f docker-compose.release.yml up -d --wait
docker compose -f docker-compose.release.yml ps
```

保留 `.env`、`ENCRYPTION_KEY`、数据卷和原目录 / 项目名称。源码部署则先更新源码，再执行 `docker compose up -d --build --wait`。

### 恢复备份

恢复会覆盖当前卷里的应用数据，应先备份当前状态。下面用 `lcs-YYYYMMDD-HHMMSS` 作为文件名前缀，请替换为自己的备份名。全新机器需要先下载项目，将配套 `.env` 放回部署目录并拉取对应镜像。

```bash
backup_name=lcs-YYYYMMDD-HHMMSS
# 老部署先停止；新部署通过 create 创建尚未启动的容器和卷
docker compose -f docker-compose.release.yml stop
cp "backup/${backup_name}.env" .env
chmod 600 .env
docker compose -f docker-compose.release.yml create
docker run --rm --volumes-from lcs-backend \
  -v "$(pwd)/backup:/backup:ro" alpine:3.22 \
  sh -c 'find /app/backend/data /app/backend/uploads -mindepth 1 -maxdepth 1 -exec rm -rf {} + && tar xzf "/backup/$1.tar.gz" -C /app/backend' sh "$backup_name"
docker compose -f docker-compose.release.yml up -d --wait
```

不要用新生成的加密密钥配合旧数据库恢复，必须恢复同一份 `.env` 与数据目录中的加密盐。跨版本恢复优先使用备份当时的镜像版本，再按升级流程更新。

## 常见问题

| 现象 | 检查与处理 |
| --- | --- |
| `manifest unknown` / `pull access denied` | 检查 Docker Hub 是否已有目标镜像及标签、命名空间是否正确；尚未发布时改用源码构建。 |
| 端口已占用 | 修改 `.env` 中 `WEB_PORT` / `BACKEND_PORT`，重新 `up -d --wait`；局域网访问地址也要同步修改。 |
| NAS 本机可打开，其他设备打不开 | 默认只绑定 `127.0.0.1`；启用局域网覆盖配置，并检查 NAS 防火墙。 |
| 页面出现 CORS 错误 | 后端 `FRONTEND_URL` 应与浏览器实际访问来源一致，包括协议、域名和端口。 |
| 媒体服务器连接失败 | 从容器网络检查服务器地址可达性、API 密钥权限和反向代理路径，避免使用错误的 `localhost`。 |
| 网页正常，任务没有执行 | 检查后端健康状态、任务是否启用、调度时区和「下次执行」时间。 |
| API 密钥升级后无法解密 | 核对 `.env` 的 `ENCRYPTION_KEY` 和原数据卷 / 加密盐是否保留。 |
| 修改端口后仍访问旧地址 | 使用新的 `WEB_PORT`，重新创建容器；网页 API 请求由 web 代理，无需更改前端源码。 |

```bash
# 查看容器状态和最近日志
docker compose -f docker-compose.release.yml ps
docker compose -f docker-compose.release.yml logs --tail=100 backend web

# 从后端容器内检查应用健康状态
docker compose -f docker-compose.release.yml exec backend \
  node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>r.json()).then(console.log)"
```

[继续：配置第一个自动化任务 →](Automation_Guide.md)
