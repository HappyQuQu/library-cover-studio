# LibraryCoverStudio 技术架构

前端通过 API 管理模板、媒体源和自动化任务；后端负责鉴权、持久化、定时执行与封面渲染。生产部署在一个容器、同一个端口提供网页与 API，开发时分别运行 Vite 和后端服务。

## 源码结构

| 路径 | 职责 |
| --- | --- |
| `web/src/pages/`、`components/` | React 页面、设计器和交互组件 |
| `web/src/stores/`、`hooks/` | 登录、主题、画布状态及编辑草稿 |
| `web/src/api/`、`lib/` | API 请求、数据处理和双语显示 |
| `backend/src/config/`、`database/` | 环境配置、SQLite / Drizzle 表结构与初始化 |
| `backend/src/routes/`、`controllers/`、`middleware/` | Express 路由、业务接口、鉴权和校验 |
| `backend/src/services/` | 调度、媒体 API、渲染、模板商店与历史管理 |
| `backend/src/template/defaults/`、`poster/` | 七套内置模板及示例素材 |
| `tests/`、`scripts/` | 隔离回归、翻译检查和发布验证 |

前端使用 React 19、Vite、Tailwind CSS、Fabric.js、Zustand 和 TanStack Query。Fabric 序列化后的画布 JSON 用于保存、恢复和导出模板；后端使用 `@napi-rs/canvas` 与 Sharp 解析图层并合成图片。后端不依赖浏览器或 Fabric 的 Node 运行时，支持的几何、文字、背景和蒙版通过渲染测试验证。

## 自动化封面生成

`scheduler.service.ts` 注册计划并恢复启用的任务；`taskRunner.service.ts` 按媒体库配置执行任务：

1. 读取服务器密钥、模板、主副标题、排序及启用状态。
2. 通过 `mediaClient.service.ts` 访问 Jellyfin / Emby，下载所需海报和可选影片背景。
3. 使用 `renderer.service.ts` 替换标题及海报变量，按保存的画布合成一张媒体库封面。
4. 保存执行历史中的独立封面快照，将图片上传为媒体库封面，记录逐库成功或失败。
5. 执行结束时应用历史保留策略；额外保存原海报或生成封面由存储设置控制。

调度采用 node-cron，未来执行时间由 cron-parser 按调度时区计算。界面语言只改变显示，不改变 Cron、任务参数、模板源内容或持久化时间。

## 模板维护边界

应用仓库保留 `defaults/manifest.json` 列出的七套模板、初始化缩略图和示例海报，用于离线首次启动、默认还原及渲染回归。初始化不会覆盖用户已有的修改或恢复用户主动删除的模板。

社区模板统一维护在 [library-cover-store](https://github.com/HappyQuQu/library-cover-store)，每套设计以 `template.json`、唯一预览图和可选字体文件作为发布源。商店工作流生成单套 ZIP、发布目录和下载统计；应用通过模板商店按需下载，不在镜像中包含社区设计副本、合集 ZIP 或评审图。

模板内容和打包校验在商店仓库运行；渲染、模板导入、权限、更新与历史回归在应用仓库运行。国际化浏览器演示环境使用应用内置模板，不依赖相邻商店仓库。

## 数据与部署

JWT 与 Refresh Token 用于鉴权；媒体源和 AI 服务密钥加密保存。数据目录由 `LCS_DATA_DIR` 指定，集中保存数据库、加密盐、上传字体、图片、模板历史与任务历史。

根目录 `Dockerfile` 编译前后端并构建生产镜像。`LCS_WEB_DIR` 指向网页构建文件，Express 支持 SPA 深链接，未知 API 和缺失资源返回 404，带哈希的静态资源使用长期缓存。跨源访问由 `FRONTEND_URL` 配置。

部署、备份恢复和旧容器迁移见 [Docker 部署教程](Docker_Deployment.md)；任务配置见 [自动化使用指南](Automation_Guide.md)；构建及镜像发布见 [发布流程](Publishing.md)。
