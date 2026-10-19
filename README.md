# LibraryCoverStudio

<p align="center">
  <strong>简体中文</strong> · <a href="README.en.md">English</a> · <a href="CHANGELOG.md">更新日志</a>
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="web/public/logo-d.png">
    <img src="web/public/logo-l.png" alt="LibraryCoverStudio 标志" width="96">
  </picture>
</p>

<p align="center">
  <strong>🎨 为 Jellyfin / Emby 设计媒体库封面，按计划自动焕新。</strong>
</p>

<p align="center">
  选模板、改设计、预览效果，让电影、剧集和动漫分类拥有统一风格。
</p>

<p align="center">
  <a href="https://github.com/HappyQuQu/library-cover-studio/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/HappyQuQu/library-cover-studio/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://hub.docker.com/r/evanqu/library-cover-studio"><img alt="Docker Hub" src="https://img.shields.io/badge/docker-evanqu%2Flibrary--cover--studio-2496ED?logo=docker&logoColor=white"></a>
  <img alt="Platforms: Linux amd64 and arm64" src="https://img.shields.io/badge/platform-linux%2Famd64%20%7C%20linux%2Farm64-lightgrey.svg">
  <img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-green.svg">
</p>

<p align="center">
  <a href="#quick-start">快速开始</a> · <a href="#screenshots">界面预览</a> · <a href="#automation">自动化教程</a> · <a href="https://github.com/HappyQuQu/library-cover-store">社区模板</a> · <a href="#documentation">更多文档</a>
</p>

LibraryCoverStudio 是一个自托管的媒体库封面设计与自动化工具。通过 Jellyfin / Emby API
读取海报素材，生成并上传**媒体库分类封面**：选择三个媒体库，就为它们分别生成一张封面。
无需挂载电影文件目录，基础功能无需配置 AI 服务。

![可视化设计器：左侧添加元素，中间编辑封面，右侧管理图层](doc/images/screenshots/editor.jpg)

## ✨ 主要功能

| 功能 | 能做什么 |
| --- | --- |
| 可视化设计器 | 拖拽海报、文字和形状，调整图层、圆角、旋转、描边与背景，实时预览。 |
| 七套内置模板 | 1920 × 1080，开箱即用；支持复制修改、ZIP 导入导出和设计历史回退。 |
| 社区模板商店 | 搜索和下载社区设计，查看作者、版本与累计下载次数，一键加入模板库。 |
| Jellyfin / Emby | 连接媒体服务器，为每个媒体库或合集分别配置模板、主副标题和素材排序。 |
| 横向剧照素材 | 横图模板逐部读取影片背景图或缩略图，可生成横版与竖版封面，预览和定时任务使用相同素材规则。 |
| 自动化更新 | 手动执行，或按天、周、月及自定义 Cron 定时生成并上传封面。 |
| 真实样张与执行历史 | 上传前用媒体库真实海报预览，执行后查看逐库结果并下载当次原图。 |
| 可选 AI 助手 | 接入自己的 AI 服务，通过文字或参考图生成可编辑设计。 |
| 字体与数据管理 | 自定义字体、PNG / JPEG / WebP 输出、历史保留、配置导出与缓存清理。 |
| 中英文界面 | 中文默认，可随时切换英文；切换保留草稿、画布、任务配置与 AI 对话。 |
| 版本提醒 | 在设置中查看正式版本更新说明，发现新版本时显示提醒。 |

## 🌐 界面语言

支持简体中文与英文，**首次访问默认中文**。可在登录页、账号菜单或「设置 → 外观设置 → 语言」切换；任务向导、模板信息和 AI 工作区也提供原地切换入口。选择保存在当前浏览器，同源标签页同步，刷新或退出登录后继续保留。

语言切换仅改变界面与日期、数字的显示格式，不会清空未保存表单、画布与撤销记录、任务向导或参考图，也不会重发样张和 AI 生成请求。任务的 Cron、调度时区与执行时刻保持不变。

模板和媒体库名称、画布文字、用户输入、社区说明、发布正文、日志诊断及 AI 指令/对话/输出保留原文。生成内容的语言由你的需求或提示词决定。无可用翻译时回退中文；首次访问不根据浏览器语言自动切换。

![英文任务向导：保留中文内容与服务器调度时区](doc/images/screenshots/i18n-task-wizard-en.png)

> 以上为隔离环境中的英文界面演示，使用示例账号、媒体库、内置海报和模拟样张响应。

<a id="quick-start"></a>

## 🚀 快速开始

需要 Docker 和 Compose v2，镜像支持 Linux `amd64` / `arm64`。
**一个镜像、一个容器、一个端口**，包含网页、API、封面渲染与定时任务。

新建一个空目录，将下面内容保存为 `compose.yaml`，也可使用 [部署示例](doc/compose.yaml)：

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

分别运行两次 `openssl rand -hex 32`，将两个不同的结果填入对应密钥，然后启动：

```bash
docker compose up -d
```

打开 `http://<服务器局域网地址>:8080`（本机使用 [http://localhost:8080](http://localhost:8080)），
点击「立即注册」。**第一个账号成为管理员。**

### 配置说明

| 配置项 | 如何修改 |
| --- | --- |
| `image` | 默认使用 `latest`；需要固定版本时，选择 Docker Hub 已发布的版本标签。 |
| `JWT_SECRET` | 登录令牌签名密钥，首次部署时替换为随机值，升级时保留。 |
| `ENCRYPTION_KEY` | 用于加密媒体服务器与 AI 密钥，首次部署时替换为另一个随机值，升级时保留。 |
| `ports` | 修改左侧端口，例如 `"9000:8080"`，随后访问宿主机的 `9000` 端口。 |
| `./data:/app/data` | 保存数据库、模板、字体、设置和执行历史；可修改左侧为 NAS 上的绝对目录。 |

升级前备份 `compose.yaml` 和完整 `data` 目录，保留原密钥与 `data/.encryption-salt`。
NAS 访问、反向代理、备份恢复和旧版迁移见 [Docker 部署教程](doc/Docker_Deployment.md)。

<a id="screenshots"></a>

## 🖼️ 界面预览

### 模板库：选一种风格，复制后开始设计

内置柔彩扇形、直列海报墙、倾斜圆角海报墙、斜切大图、柔雾居中标题、圆角叠卡和横幅背景海报列。
默认模板已锁定，可直接用于任务；复制后即可修改。模板历史最多保留最近 50 条，支持回退；
管理员也可在「设置 → 数据管理」一键还原默认模板，保留自建与复制的模板。

![模板库中的七套默认模板](doc/images/screenshots/templates.jpg)

### 社区模板商店：发现并添加新设计

按模板、作者或说明搜索，按下载次数排序，支持分页浏览。下载后自动加入模板库、设计器和自动化的模板菜单，
同一版本不会重复添加。同名模板更新时，可先复制备份；更新保留原模板 ID、任务引用与历史。

![社区模板商店：模板预览、累计下载次数与添加状态](doc/images/screenshots/template-store-demo.png)

### 自动化：预览真实效果，再查看执行结果

每个媒体库可以使用不同模板和标题。保存前生成真实样张，执行后逐库查看上传结果和封面原图。

![执行历史：逐媒体库展示上传结果和封面预览](doc/images/screenshots/task-history.jpg)

<details>
<summary>查看更多界面：媒体源、背景设置、模板信息与任务计划</summary>

### 媒体源

![媒体源：连接服务器并查看媒体库](doc/images/screenshots/servers.jpg)

### 影片背景

可使用首张海报或首个影片的横向背景图，并调节模糊与压暗程度；横向背景图缺失时回退到首张海报。

![设计器中的影片背景设置](doc/images/screenshots/editor-background.jpg)

### 模板信息

版本、作者主页、说明、更新记录与最低应用版本会随 ZIP 导入导出、复制和历史回退保留。

![模板信息：版本、作者与更新记录](doc/images/screenshots/template-metadata-demo.png)

### 默认模板恢复

![数据管理中的默认模板恢复](doc/images/screenshots/default-template-reset.jpg)

### 任务配置与计划

![按媒体库配置模板、标题与真实样张](doc/images/screenshots/task-cover.jpg)

![执行计划：时区与未来三次执行时间](doc/images/screenshots/task-schedule.jpg)

![自动化任务列表](doc/images/screenshots/tasks.jpg)

</details>

> 截图来自隔离演示环境，使用示例账号、媒体库和项目内置海报。商店下载次数及模板版本为演示数据。

<a id="automation"></a>

## ⚡ 从连接到自动更新

1. **连接服务器**：进入「媒体源 → 添加服务器」，填写类型、地址与 API 密钥，测试连接并查看媒体库。地址必须能从后端容器访问；NAS 或局域网服务器使用局域网 IP 或可访问的域名。
2. **配置封面**：进入「自动化 → 新建任务」，选择媒体库或合集，批量应用模板，再逐项调整主副标题和素材排序。合集会使用其成员的海报生成封面，并上传到该合集；每个已选媒体库或合集生成一张封面。点击「生成真实样张」确认效果，预览不会上传或修改媒体服务器。
3. **设置计划**：选择手动运行，或按天、周、月及 Cron 执行。核对调度时区和未来三次执行时间，再启用计划。
4. **保存并执行**：保存本身不会立即上传；可点击「立即执行」验收，之后在「执行历史」查看逐库结果并下载封面。

| 计划 | Cron 表达式 |
| --- | --- |
| 每天 04:00 | `0 4 * * *` |
| 每周一 04:00 | `0 4 * * 1` |
| 每月 1 日 04:00 | `0 4 1 * *` |
| 每小时整点 | `0 * * * *` |

默认调度时区为 `Asia/Shanghai`，以任务页面显示为准。后端需持续运行；重启后恢复已启用的计划，
关机期间错过的执行不会自动补跑。执行历史默认每个任务保留最多 50 次、30 天内的已结束记录，管理员可调整上限。

**执行会替换所选媒体库或合集的封面。** 需要保留原封面时请提前备份；执行历史保存的是本项目生成的图片。
完整图文步骤、暂停计划与问题排查见 [自动化使用指南](doc/Automation_Guide.md)。

## 🎨 自定义与分享模板

横图模板会优先使用每部影片的横向背景图（Backdrop），缺失时尝试缩略图（Thumb）和普通海报；素材不足时复用已有图片。设计器的素材列表、海报变量缩略图及保存历史会保留横图来源，适合「横图＋横版封面」与「横图＋竖版封面」。模板作者可在画布 JSON 顶层设置 `"posterSource": "backdrop"`，普通模板仍按原有规则取海报。

设计器的海报和横图各有 9 张不同的内置示例，均按 3×3 展示。点击示例会添加并绑定对应编号的图位，右侧也可切换；真实样张和任务生成会使用媒体库中的实际图片。

在设计器中使用 `{{primary_title}}`、`{{secondary_title}}` 和 `post1`～`post9` 海报占位，
让同一布局适配不同媒体库。可设置固定背景或「生成任务时随机背景」，修改后先保存模板再执行任务。

从模板库导出 ZIP，即可备份、迁移或分享设计。导出会附带实际使用的自定义字体，导入和商店下载时自动安装；
同名但内容不同的字体会另存并调整引用，保留原字体。系统字体不会自动打包。

分享至 [library-cover-store](https://github.com/HappyQuQu/library-cover-store)：
解压 ZIP，将 `template.json`、`preview.jpg` 及随包的 `fonts/` 放入独立模板文件夹，再提交 Pull Request。
格式、文件大小限制与上架流程见 [模板提交指南](https://github.com/HappyQuQu/library-cover-store#提交模板)。

商店与版本检查需要后端访问 GitHub，无需配置 GitHub Token。连接失败时，可在「设置 → 网络」测试连接，
选择直连、跟随环境变量或指定代理，详见 [GitHub 网络设置](doc/Docker_Deployment.md#github-网络设置)。

## 🤖 可选 AI 设计助手

在「设置 → AI 配置」接入自己的服务，填写地址与密钥，获取模型列表并选择默认模型。
支持 OpenAI 兼容接口、Claude 和 Ollama；支持图片输入的模型可使用最多 3 张 JPG / PNG / WebP 参考图。
模型图片能力未知时需手动确认。生成结果可先预览，再应用到画布继续编辑。

<a id="development"></a>

## 🧑‍💻 本地开发

环境：Node.js 22、pnpm 10.28.0。前端默认 `5173`，后端默认 `3000`。

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
# 编辑 .env，将 JWT_SECRET 和 ENCRYPTION_KEY 改为不同的随机密钥
pnpm db:migrate
pnpm dev
```

```bash
pnpm check:i18n  # 全前端文案、词典、插值与复数检查
pnpm test   # 使用隔离数据库与本地模拟媒体 API 的回归测试
pnpm build  # 构建前后端
```

前端使用 React 19、Vite、Tailwind CSS、Fabric.js、Zustand 和 TanStack Query；
后端使用 Node.js、Express、SQLite / Drizzle，通过 `@napi-rs/canvas` 与 Sharp 渲染封面。

<a id="documentation"></a>

## 📖 更多文档

- [贡献规则](CONTRIBUTING.md) · [双语回归清单](doc/I18n_QA.md)：文案约定、源内容边界和隔离验证方法。

- [Docker 部署教程](doc/Docker_Deployment.md)：NAS 访问、反向代理、升级与备份恢复。
- [自动化使用指南](doc/Automation_Guide.md)：任务配置、变量、定时执行与历史记录。
- [发布流程](doc/Publishing.md)：GitHub Actions、Docker Hub 镜像与版本发布。
- [Docker Hub 说明](README.dockerhub.md)：镜像页面的部署与使用教程。
- [技术架构](doc/Technical_Architecture.md)：源码结构、封面生成流程与模板维护边界。
- [模板商店仓库](https://github.com/HappyQuQu/library-cover-store)：社区模板源文件、预览图、贡献与发布。
- [更新日志](CHANGELOG.md) · [问题反馈](https://github.com/HappyQuQu/library-cover-studio/issues)。

## 📄 许可证

MIT License。
