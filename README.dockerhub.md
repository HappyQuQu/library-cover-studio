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

镜像 **`evanqu/library-cover-studio`** 包含网页、API、SQLite、封面渲染和任务调度，容器端口为 `8080`，支持 `linux/amd64` / `linux/arm64`。

`latest` 对应主分支发布，正式版本使用 `MAJOR.MINOR.PATCH` / `MAJOR.MINOR`，`sha-*` 对应具体提交，`edge` 用于手动验证。请以 Docker Hub Tags 页实际可用的标签为准。旧版 `-web` / `-backend` 镜像不再随新版本发布，迁移方法见完整部署教程。

## Docker Compose 部署

只需 Docker 和 Compose v2。新建一个空目录，将下面内容保存为 **`compose.yaml`**（也可下载 [部署示例](https://github.com/HappyQuQu/library-cover-studio/blob/main/doc/compose.yaml)）：

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

尚未发布所需镜像标签时，可按 [源码构建教程](https://github.com/HappyQuQu/library-cover-studio/blob/main/doc/Docker_Deployment.md#从源码构建) 部署。

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

按上面的配置安装时，数据保存在部署目录的 `data` 文件夹。完整备份需要同时保存 **`compose.yaml` 和 `data`**；配置文件包含密钥，请妥善保管。配置导出不能代替完整备份。

先按 [备份与恢复教程](https://github.com/HappyQuQu/library-cover-studio/blob/main/doc/Docker_Deployment.md#备份) 备份。升级可修改镜像的版本标签，再执行：

```bash
docker compose pull
docker compose up -d
```

保留原密钥和 `data`。旧版两容器安装请先按完整教程迁移，保留原密钥和数据；新的目录挂载不会自动读取旧命名卷。

## 排查问题

```bash
docker compose ps
docker compose logs --tail=100 library-cover-studio
```

| 问题 | 处理 |
| --- | --- |
| 镜像无法拉取 | 检查镜像名、命名空间及目标标签是否已发布；未发布时使用源码构建。 |
| NAS 其他设备无法访问 | 使用 NAS 的局域网地址访问，检查端口映射和 NAS 防火墙。 |
| 连接服务器失败 | 检查容器网络可达性、API 密钥权限和地址，避免误用 `localhost`。 |
| CORS 错误 | 直接访问无需配置；HTTPS 反向代理时设置 `FRONTEND_URL` 为浏览器实际来源。 |
| 定时任务不执行 | 检查后端是否健康、任务是否启用、调度时区和下次运行时间。 |
| 升级后密钥无法解密 | 核对原 `ENCRYPTION_KEY` 和 `data` 中的加密盐是否保留。 |

[完整部署与故障排查](https://github.com/HappyQuQu/library-cover-studio/blob/main/doc/Docker_Deployment.md) · [自动化使用指南](https://github.com/HappyQuQu/library-cover-studio/blob/main/doc/Automation_Guide.md) · MIT License
