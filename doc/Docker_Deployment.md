# Docker 部署教程

[返回项目首页](../README.md) · [配置自动化任务](Automation_Guide.md)

新安装只需要一份 `compose.yaml`，前后端一起启动，数据保存在旁边的 `data` 目录。无需挂载电影文件目录，应用通过 Jellyfin / Emby API 读取海报和上传媒体库封面。

## 快速开始

只需 Docker 和 Compose v2。新建一个空目录，将下面内容保存为 **`compose.yaml`**（也可下载 [部署示例](compose.yaml)）：

```yaml
services:
  backend:
    image: evanqu/library-cover-studio-backend:latest
    restart: unless-stopped
    environment:
      NODE_ENV: production
      JWT_SECRET: "REPLACE_WITH_RANDOM_JWT_SECRET"
      ENCRYPTION_KEY: "REPLACE_WITH_RANDOM_ENCRYPTION_KEY"
      FRONTEND_URL: "http://192.168.1.10:8080"
    volumes:
      - ./data:/app/backend/data
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      start_period: 20s
      interval: 10s
      timeout: 5s
      retries: 3

  web:
    image: evanqu/library-cover-studio-web:latest
    restart: unless-stopped
    ports:
      - "8080:80"
    depends_on:
      backend:
        condition: service_healthy
```

启动前修改三处：

- `FRONTEND_URL`：换成实际访问地址，例如 NAS 的 `http://192.168.1.10:8080`；本机使用 `http://localhost:8080`。
- `JWT_SECRET`、`ENCRYPTION_KEY`：分别换成不同的随机密钥。可执行两次 `openssl rand -hex 32`，将结果填入对应位置。**升级时保留这两个值。**

在这个目录执行：

```bash
docker compose up -d
```

打开 **[http://192.168.1.10:8080](http://192.168.1.10:8080)**（换成自己的地址），点击「立即注册」，第一个账号成为管理员。

数据自动保存在同目录的 **`data` 文件夹**；只开放网页端口 `8080`，后端通过容器网络访问。改端口时同步修改 `8080:80` 的左侧和 `FRONTEND_URL`。前后端镜像保持相同标签，具体以 Docker Hub 已发布标签为准。

首次启动后可进入仪表盘，添加服务器和创建任务：

![仪表盘：连接服务器、创建模板和进入自动化](images/screenshots/dashboard.jpg)

## NAS / 局域网访问

快速开始的配置已经可以用于 NAS。将 `FRONTEND_URL` 换成浏览器实际使用的地址，并访问该地址。例如 NAS 是 `192.168.1.10`，使用 `http://192.168.1.10:8080`。NAS 防火墙应允许局域网设备访问网页端口。

| 要调整的内容 | 修改位置 |
| --- | --- |
| 网页端口改为 `8088` | web 的端口改为 `"8088:80"`，`FRONTEND_URL` 改为 `http://192.168.1.10:8088` |
| 仅本机访问 | 端口改为 `"127.0.0.1:8080:80"`，`FRONTEND_URL` 改为 `http://localhost:8080` |
| 反向代理域名 | 代理整个站点至网页端口，`FRONTEND_URL` 改为实际来源，如 `https://cover.example.com` |
| 固定版本 | 将两个镜像的 `latest` 换成 Docker Hub 已发布的相同版本标签 |
| 数据目录位置 | 将 `./data` 改为 NAS 上的绝对目录，保持容器路径 `/app/backend/data` |

修改后在部署目录执行 `docker compose up -d`。建议反向代理部署在域名根路径；web 已处理 `/api` 转发，后端不需要映射宿主机端口。

## 连接 Jellyfin / Emby

进入「媒体源 → 添加服务器」，填写名称、服务器类型、基础地址及 API 密钥。例如地址 `http://192.168.1.20:8096`，密钥需要读取海报和更新媒体库封面的权限。

地址必须能从后端容器访问。容器中的 `localhost` 指向容器自身；连接 NAS 上的媒体服务器通常应使用 NAS 的局域网地址。反向代理有子路径时，应包含该路径。

![连接成功后查看服务器状态和媒体库](images/screenshots/servers.jpg)

看到「在线」后点击「媒体库」，确认分类和海报，再按 [自动化教程](Automation_Guide.md) 设置封面任务。

## 升级与数据

按照快速开始安装后，目录结构如下：

```text
library-cover-studio/
├── compose.yaml       # 镜像、端口、访问地址及密钥
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

先完成备份，再将两个镜像改为相同的已发布版本标签（使用 `latest` 时不必改文件），执行：

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

## 已有命名卷部署

之前使用 `docker-compose.release.yml` / `docker-compose.yml` 安装的实例，数据保存在 `backend_data` 命名卷中，另外保留了 `backend_uploads` 挂载。**继续使用原文件和 `.env` 即可升级**：

```bash
docker compose -f docker-compose.release.yml pull
docker compose -f docker-compose.release.yml up -d
```

源码部署使用 `docker-compose.yml`。此前有局域网覆盖文件的，继续沿用原来的 `-f` 参数。不要直接把新安装示例放到原目录：新的 `./data` 挂载不会自动导入命名卷，会显示为空的新安装。

迁移前先保存原 `.env`、Compose 配置及命名卷备份。可暂停原服务后导出数据（下面假设原容器名为 `lcs-backend`）：

```bash
mkdir -p backup
chmod 700 backup
docker compose -f docker-compose.release.yml stop
docker run --rm --volumes-from lcs-backend \
  -v "$(pwd)/backup:/backup" alpine:3.22 \
  tar czf /backup/legacy-data.tar.gz -C /app/backend data uploads
sudo chmod 600 backup/legacy-data.tar.gz
docker compose -f docker-compose.release.yml start
```

新建一个部署目录，放入新示例 `compose.yaml`，填入原 `.env` 中的密钥与实际访问地址；解压导出的数据后再启动。新配置使用解压出来的 `data`；`uploads` 是旧版保留目录，可以另行存档。切换前先停止原实例，避免定时任务重复上传；确认新实例的数据与连接正常后再停用旧部署，保留原备份和卷。

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

源码配置沿用命名卷，默认仅本机访问。需要 NAS 访问时，直接编辑 `docker-compose.yml`：把 web 端口改为 `"8080:80"`，把 backend 的 `FRONTEND_URL` 改为自己的实际访问地址，然后用同一条命令重建。

## 常见问题

| 现象 | 检查与处理 |
| --- | --- |
| `manifest unknown` / `pull access denied` | 检查目标镜像和标签是否已发布；尚未发布时使用源码构建。 |
| 端口已占用 | 修改 web 端口映射左侧与 `FRONTEND_URL`，重新启动。 |
| NAS 本机可打开，其他设备打不开 | 使用 NAS 局域网地址，检查端口映射与防火墙。 |
| 页面出现 CORS 错误 | `FRONTEND_URL` 必须与浏览器来源一致，包括协议、域名和端口。 |
| 媒体服务器连接失败 | 检查容器网络、密钥权限和代理路径，避免误用 `localhost`。 |
| 网页正常，任务没有执行 | 检查后端状态、任务启用状态、时区和下次执行时间。 |
| API 密钥升级后无法解密 | 核对原 `ENCRYPTION_KEY`、数据目录和加密盐是否保留。 |

```bash
docker compose ps
docker compose logs --tail=100 backend web
```

[继续：配置第一个自动化任务 →](Automation_Guide.md)
