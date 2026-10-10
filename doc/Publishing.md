# GitHub Actions 与 Docker Hub 自动发布

[返回项目首页](../README.md) · [部署镜像](Docker_Deployment.md)

本项目的发布工作流负责测试、生成版本、发布单容器镜像和同步 Docker Hub Overview。它不会自动升级用户已经部署的容器；部署更新使用 [Docker 教程](Docker_Deployment.md#升级) 中的命令。

## 发布顺序

1. Pull request 运行隔离测试、前后端构建、单容器运行与备份恢复验收，以及 amd64 / arm64 两个平台的统一镜像构建。
2. 合入 `master` 后运行相同检查，通过后由 Release Please 创建版本 PR。
3. 工作流自动 squash merge 版本 PR，更新 `CHANGELOG.md`、三个 `package.json` 和版本清单，并创建 GitHub Release。
4. 检查生成的版本提交，再构建并推送镜像，附带 SBOM 和 provenance。
5. 将根目录 `README.dockerhub.md` 同步到镜像仓库的 Overview。

如果提交不需要新版本，会按当前主分支发布 `latest` 与提交标签。被新提交取代的旧 `master` 发布运行会跳过发布，避免过期代码覆盖新镜像。

## 仓库配置

在 **Settings → Actions → General** 开启 **Allow GitHub Actions to create and approve pull requests**。PR 检查保持只读，仅发布 job 取得必要写权限。

在 **Settings → Secrets and variables → Actions** 配置：

| 类型 | 名称 | 用途 |
| --- | --- | --- |
| Secret | `DOCKERHUB_USERNAME` | Docker Hub 登录账号 |
| Secret | `DOCKERHUB_TOKEN` | 推送镜像并更新 Overview 的 access token |
| Secret，可选 | `DOCKERHUB_DESCRIPTION_TOKEN` | 单独更新 Overview 的 token；未配置时复用 `DOCKERHUB_TOKEN` |
| Variable，可选 | `DOCKERHUB_NAMESPACE` | 镜像命名空间，默认 `evanqu` |

提前创建或确认账号有权访问镜像仓库：

- `evanqu/library-cover-studio`

Fork / 改名发布时，除修改命名空间变量，也应调整 Compose 默认命名空间、文档中的 Docker Hub 链接，以及 Docker Hub README 的截图绝对地址。

## 镜像标签

| 触发方式 | 标签 |
| --- | --- |
| 推送 `master` | `latest`、`sha-<7位提交号>`；生成正式版本时增加 `MAJOR.MINOR.PATCH` 和 `MAJOR.MINOR` |
| 推送 `v*.*.*` Git 标签 | 对应语义化版本、主次版本及提交标签；Git 标签必须与包版本一致 |
| Actions 手动运行 | 默认 `edge` 和提交标签，也可填写明确的 Docker 标签；填写语义化版本时元数据规则还会生成对应版本标签 |

网页和后端包含在同一个镜像标签中。正式升级优先选择 Docker Hub 已存在的明确版本号；`latest` 跟随主分支发布，`edge` 用于手动验证。

## 提交与更新日志

PR 标题和提交使用 Conventional Commits，例如 `fix: 修复封面生成缺失图形`。`feat:`、`fix:`、`perf:`、`refactor:`、`note:` 进入面向用户的更新日志；`ci:`、`build:`、`test:`、`docs:`、`chore:` 不进入。

版本由 Release Please 清单维护。后端健康接口、媒体服务器请求头和前端设置页从各自包版本读取版本号。

## Overview 和截图维护

GitHub 首页使用 `README.md`，通过相对路径引用 `doc/images/screenshots/*.jpg`。Docker Hub 使用 `README.dockerhub.md`，所有图片和教程链接都是完整 HTTPS 地址，以便在镜像页面渲染。

**Docker Hub 的截图外链需要 GitHub 仓库和对应文件可以匿名访问。** 私有仓库或尚未合入 `master` 的新截图无法通过这些公开地址加载；应在仓库公开且图片进入 `master` 后执行 Overview 同步。不要把个人服务器、API 密钥或生产账号截入图片。

当前截图来自隔离演示账号、模拟媒体 API 和内置海报。更新截图时使用相同的演示方式，检查图片加载完成、表单含义与教程一致，再替换对应文件。

| 文件 | 内容 |
| --- | --- |
| `editor.jpg` | 设计器与图层 |
| `templates.jpg` | 六套内置模板 |
| `servers.jpg` | 媒体源与示例媒体库 |
| `dashboard.jpg` | 首次上手仪表盘 |
| `tasks.jpg` | 任务列表 |
| `task-select.jpg` | 选择媒体库 |
| `task-cover.jpg` | 封面配置与真实样张 |
| `task-schedule.jpg` | 定时计划与未来执行时间 |
| `task-review.jpg` | 预览确认 |
| `task-history.jpg` | 执行历史与封面快照 |

## 工作流文件

- [CI 检查](../.github/workflows/ci.yml)
- [Docker Hub 发布](../.github/workflows/dockerhub.yml)
- [Release Please 配置](../release-please-config.json)
- [新安装 Compose 示例](compose.yaml) · [已有命名卷部署配置](../docker-compose.release.yml)

发布失败时先看失败的 job：检查错误先修复源码，登录 / 推送错误核对命名空间和 token，Overview 错误核对 description token 权限及 README 路径。Overview 同步失败时应检查镜像构建 job 是否已成功推送，避免把文档错误误判为镜像不存在。
