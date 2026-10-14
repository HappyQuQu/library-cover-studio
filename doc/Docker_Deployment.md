# Docker 部署教程

[返回项目首页](../README.md) · [配置自动化任务](Automation_Guide.md)

新安装只需要一份 `compose.yaml`，网页和后端在同一个容器运行，数据保存在旁边的 `data` 目录。无需挂载电影文件目录，应用通过 Jellyfin / Emby API 读取海报和上传媒体库封面。

## 快速开始

只需 Docker 和 Compose v2。新建一个空目录，将下面内容保存为 **`compose.yaml`**（也可下载 [部署示例](compose.yaml)）：

```yaml
services:
  library-cover-studio:
    image: evanqu/library-cover-studio:latest
    restart: unless-stopped
    environment:
      JWT_SECRET: "REPLACE_WITH_RANDOM_JWT_SECRET"
      ENCRYPTION_KEY: "REPLACE_WITH_RANDOM_ENCRYPTION_KEY"
    ports:
      - "8080:8080"
    volumes:
      - ./data:/app/data
```

把 `JWT_SECRET` 和 `ENCRYPTION_KEY` 分别换成不同的随机密钥。可执行两次 `openssl rand -hex 32`，将结果填入对应位置。**升级时保留这两个值。**

在这个目录执行：

```bash
docker compose up -d
```

打开 **[http://192.168.1.10:8080](http://192.168.1.10:8080)**（换成自己的服务器地址；本机使用 `http://localhost:8080`），点击「立即注册」，第一个账号成为管理员。

**一个镜像、一个容器、一个端口。** 网页、API、封面渲染和定时任务均在这个容器中运行，数据自动保存在同目录的 **`data` 文件夹**。改端口只需修改 `8080:8080` 的左侧；NAS 直接使用局域网地址访问，不必另配 `FRONTEND_URL`。镜像标签以 Docker Hub 实际发布结果为准。

首次启动后可进入仪表盘，添加服务器和创建任务：

![仪表盘：连接服务器、创建模板和进入自动化](images/screenshots/dashboard.jpg)

## NAS / 局域网访问

快速开始的配置已经可以用于 NAS，直接访问 NAS 地址即可。例如 NAS 是 `192.168.1.10`，使用 `http://192.168.1.10:8080`。NAS 防火墙应允许局域网设备访问网页端口。

| 要调整的内容 | 修改位置 |
| --- | --- |
| 网页端口改为 `8088` | 端口改为 `"8088:8080"`，访问 `http://192.168.1.10:8088` |
| 仅本机访问 | 端口改为 `"127.0.0.1:8080:8080"`，访问 `http://localhost:8080` |
| 反向代理域名 | 代理整个站点至 `8080`，在 `environment` 下增加 `FRONTEND_URL: https://cover.example.com`（不要带路径或尾斜杠） |
| 固定版本 | 将镜像的 `latest` 换成 Docker Hub 已发布的版本标签 |
| 数据目录位置 | 将 `./data` 改为 NAS 上的绝对目录，保持容器路径 `/app/data` |

修改后在部署目录执行 `docker compose up -d`。建议反向代理部署在域名根路径，并支持长连接；网页和 `/api` 都转发到同一个端口。

## 连接 Jellyfin / Emby

进入「媒体源 → 添加服务器」，填写名称、服务器类型、基础地址及 API 密钥。例如地址 `http://192.168.1.20:8096`，密钥需要读取海报和更新媒体库封面的权限。

地址必须能从后端容器访问。容器中的 `localhost` 指向容器自身；连接 NAS 上的媒体服务器通常应使用 NAS 的局域网地址。反向代理有子路径时，应包含该路径。

![连接成功后查看服务器状态和媒体库](images/screenshots/servers.jpg)

看到「在线」后点击「媒体库」，确认分类和海报，再按 [自动化教程](Automation_Guide.md) 设置封面任务。

## 升级与数据

按照快速开始安装后，目录结构如下：

```text
library-cover-studio/
├── compose.yaml       # 镜像、端口及密钥
└── data/              # SQLite、加密盐、模板、字体、图片和执行历史
```

重建、停止或删除容器不会删除宿主机上的 `data`。不要删除这个目录；保留 `ENCRYPTION_KEY` 与 `data/.encryption-salt` 才能解密已保存的媒体服务器及 AI 密钥。全局输出格式、渲染并发、时区和历史保留在应用「设置」中调整。

### 备份

先停止服务，确保数据库不再写入，再打包配置与数据。在部署目录执行：

```bash
mkdir -p backup
chmod 700 backup
chmod 600 compose.yaml
docker compose stop
backup_name="lcs-$(date +%Y%m%d-%H%M%S)"
sudo tar czf "backup/${backup_name}.tar.gz" compose.yaml data
sudo chmod 600 "backup/${backup_name}.tar.gz"
docker compose start
```

`data` 中的文件可能由容器 root 创建，因此备份使用 `sudo`。压缩包包含数据库、图片和密钥，应妥善保管。应用里的配置导出不含账号、密钥或图片，不能代替完整备份。

### 升级

先完成备份，再将镜像改为已发布版本标签（使用 `latest` 时不必改文件），执行：

```bash
docker compose pull
docker compose up -d
docker compose ps
```

保留原 `compose.yaml` 中的密钥和 `data` 目录。

### 恢复

在一个空的部署目录解压备份：

```bash
sudo tar xzf /完整路径/lcs-YYYYMMDD-HHMMSS.tar.gz
sudo chown "$(id -u):$(id -g)" compose.yaml
chmod 600 compose.yaml
docker compose up -d
```

需要替换已有安装时，先停止原服务并备份当前状态，再恢复。优先使用备份时的镜像版本，启动确认后再升级。

## 从旧版两个容器迁移

旧版镜像 `evanqu/library-cover-studio-web` / `evanqu/library-cover-studio-backend` 不再随新版本发布。迁移前先停止旧服务并备份；不要让两个实例同时运行同一套定时任务。

### 之前按文档使用 `./data` 的安装

1. 用旧 Compose 文件执行 `docker compose down`。
2. 将旧文件与 `data` 一起备份，再把配置改为本教程的单容器示例。
3. 保留原来的两个密钥，将数据挂载目标从 `/app/backend/data` 改为 `/app/data`；`./data` 内容不需要调整。
4. 执行 `docker compose up -d`，检查账号、模板、服务器连接和任务。

### 之前使用仓库命名卷的安装

旧数据在 `backend_data` 卷中，另有旧版 `backend_uploads` 挂载。先保存原 `.env`、Compose 文件及卷备份。仓库保留了 [旧版源码配置](../docker-compose.legacy.yml) 和 [旧版镜像配置](../docker-compose.legacy.release.yml)，用于识别旧部署及迁移。

继续使用旧版双容器配置时，本机可通过 `localhost` 或 `127.0.0.1` 访问相同网页端口，协议和端口仍需一致；来源校验也兼容 IPv6 回环地址 `[::1]`（访问时需配置 IPv6 监听）。通过公网 IP、局域网 IP 或反向代理域名访问时，在部署目录 `.env` 中设置 `LCS_PUBLIC_URL` 为浏览器实际来源（例如 `https://cover.example.com`），再用原 Compose 文件执行 `up -d --force-recreate`。也可设置 `FRONTEND_URL`；两者都存在时优先使用 `LCS_PUBLIC_URL`。

下面假设旧容器名为 `lcs-backend`，在原部署目录执行（已有局域网覆盖文件的命令继续加上原 `-f` 参数）：

```bash
mkdir -p backup
chmod 700 backup
docker compose -f docker-compose.legacy.release.yml stop
docker run --rm --volumes-from lcs-backend \
  -v "$(pwd)/backup:/backup" alpine:3.22 \
  tar czf /backup/legacy-data.tar.gz -C /app/backend data uploads
sudo chmod 600 backup/legacy-data.tar.gz
```

在新目录保存单容器 `compose.yaml`，填入原 `.env` 中的两个密钥，解压备份：

```bash
sudo tar xzf /完整路径/legacy-data.tar.gz
docker compose up -d
```

新配置使用解压出来的 `data`；`uploads` 是旧版保留目录，可另行存档。确认账号、服务器连接和任务正常后再停用旧部署，保留原备份和数据卷。

如果继续使用仓库里的 Compose 文件，新的 `docker-compose.yml` 和 `docker-compose.release.yml` 都把原 `backend_data` 卷挂载到 `/app/data`；**保持相同部署目录和 Compose 项目名，并先停止旧容器**，即可沿用原数据。HTTPS 反向代理的公开地址可以继续通过 `.env` 的 `LCS_PUBLIC_URL` 或 `FRONTEND_URL` 传入。旧容器可用备份的原 Compose 文件执行 `down`（不加 `-v`），或在明确确认后用新配置的 `up -d --remove-orphans` 清理。不要对旧数据卷执行 `down -v`。

## 从源码构建

没有可拉取的镜像标签时，可从源码构建。这个方式需要 Git 和 OpenSSL：

```bash
git clone https://github.com/HappyQuQu/library-cover-studio.git
cd library-cover-studio
cp .env.example .env
# 执行两次 openssl rand -hex 32，将结果分别填入 .env 的两个密钥
# 配置后启动：
docker compose -f docker-compose.yml up -d --build
```

源码构建使用根目录 `Dockerfile`，输出相同的单容器应用，数据沿用 `backend_data` 命名卷。默认网页端口 `8080`，NAS 可直接访问。

## GitHub 网络设置

模板商店和版本检查由后端连接 GitHub。浏览器可以访问 GitHub，并不代表 Docker 容器也可以访问。

管理员打开「设置 → 网络」，选择「使用指定代理」，填写容器可访问的地址，例如 `http://192.168.1.10:7890` 或 `socks5h://192.168.1.10:1080`。支持 HTTP、HTTPS、SOCKS5 和 SOCKS5H；SOCKS5H 将域名交给代理解析。认证代理可填写 `http://username:password@192.168.1.10:7890`，凭据加密保存，读取设置时不会回显。

先点击「测试连接」检查商店目录、发布页和 GitHub API，再保存。测试使用当前填写的配置，不修改已保存设置；保存后立即生效，无需重启。目录、预览图、模板 ZIP、下载统计和版本检查共用此配置。API 限流时仍可从目录读取统计，并使用发布页检查版本。

容器里的 `localhost` / `127.0.0.1` 指向容器自身。代理在 NAS 或局域网设备上时使用它的局域网 IP，并允许容器访问代理端口。Docker Desktop 可填写 `http://host.docker.internal:7890`；Linux Docker 若要使用这个名字，需在 Compose 的应用服务中增加：

```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```

默认「跟随服务器环境变量」读取后端进程的 `HTTPS_PROXY`、`HTTP_PROXY` 和 `NO_PROXY`；宿主机变量需显式传入容器才会生效。全局环境变量也可能影响其他后端请求，需要仅调整 GitHub 时使用界面的指定代理。「直接连接」会忽略 GitHub 请求的环境代理。

## 常见问题

| 现象 | 检查与处理 |
| --- | --- |
| `manifest unknown` / `pull access denied` | 检查目标镜像和标签是否已发布；尚未发布时使用源码构建。 |
| 端口已占用 | 修改端口映射左侧，重新启动。 |
| NAS 本机可打开，其他设备打不开 | 使用 NAS 局域网地址，检查端口映射与防火墙。 |
| 页面出现 CORS 错误 | 单容器直接访问自动识别来源；本机回环地址可互换，端口和协议需一致。旧版双容器公网访问或 HTTPS 反向代理时设置 `LCS_PUBLIC_URL` / `FRONTEND_URL` 为浏览器实际来源，并重建容器。拒绝来源返回 403 和 `CORS_ORIGIN_DENIED`。 |
| 媒体服务器连接失败 | 检查容器网络、密钥权限和代理路径，避免误用 `localhost`。 |
| 模板商店无法连接或版本检查失败 | 在「设置 → 网络」测试 GitHub 连接，并按上方说明配置容器可访问的代理地址。 |
| 网页正常，任务没有执行 | 检查后端状态、任务启用状态、时区和下次执行时间。 |
| API 密钥升级后无法解密 | 核对原 `ENCRYPTION_KEY`、数据目录和加密盐是否保留。 |

```bash
docker compose ps
docker compose logs --tail=100 library-cover-studio
```

[继续：配置第一个自动化任务 →](Automation_Guide.md)
