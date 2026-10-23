# 参与贡献

**简体中文** · [English](CONTRIBUTING.en.md) · [项目说明](README.md)

欢迎提交修复、功能与翻译。请先说明要解决的问题；界面功能需同时提供简体中文和英文，中文作为内容与 key 的维护基准。

## 开发与提交

使用 Node.js 24.22.1 LTS 和 pnpm 10.28.0，按 [README](README.md#development) 安装依赖并启动。不要提交 `.env`、密钥、数据库、用户海报、构建产物或个人测试数据。

提交前运行：

```bash
pnpm check:i18n
pnpm test
pnpm build
```

PR 说明写清问题、修改后的行为和验证结果。界面改动附中英文截图，标注数据是否来自隔离环境。涉及渲染、计划或接口时，验证实际业务参数与现有数据的兼容性。不要为了更新界面文案重写模板或历史数据。

## 双语文案规则

- 同时修改 `web/src/locales/zh-CN/<模块>.ts` 与 `en-US/<模块>.ts`。英文使用 `satisfies TranslationShape<typeof zh>`；新增模块同时登记两个语言的 `index.ts`。
- 使用语义 key、完整句子与命名插值，例如 `t('templates.deleteConfirm', { name })`。不要拼接词片段、给英文统一追加复数后缀，或在调用处写 `defaultValue` 掩盖缺失翻译。
- 数量使用 `count`，两份词典均提供 `_one` / `_other`。数字和日期使用 `formatDisplayNumber` / `formatDisplayDate`；调度显示传入任务的 `timezone`，不改变 Cron 或时间戳。
- 英文使用句式大小写，例如 “Save changes”“Template details”；产品名、格式名、模型 ID 和字段标识保持原有拼写。中文统一使用“模板”“媒体库”“真实样张”“执行历史”。同时翻译 `aria-label`、`title`、`alt`、空状态、错误和通知。
- 在 React 渲染中调用 `t`。持久显示的错误、进度和缓存说明保存 code 或 `DisplayMessage`，渲染时翻译；异步通知在完成时调用 `i18n.t`，使用当时的语言。已经出现的旧通知无需追溯翻译。

## 状态与源内容保护

首次访问始终使用中文；显式偏好保存到浏览器的 `lcs-language`，同源标签页同步。不要新增浏览器语言检测、数据库语言字段或按界面语言变化的页面 key。

语言只控制显示：切换时不得重新挂载画布、清空表单/向导、重置撤销历史、重发样张或 AI 请求。用户输入、模板和媒体库名称、画布文字与变量绑定、AI 系统指令/对话/输出、社区说明、发布正文与旧日志诊断保留原文。新元素示例文案或 AI 快捷提示只在用户主动创建/点击时填入一次。

接口优先新增稳定 `code` 与结构化参数，同时保留旧 `message` / `error` / `note` 等字段和 HTTP 行为。通过 `getLocalizedApiError` 或显式映射翻译，未知反馈显示通用提示，原文放在 `ErrorDetails`；不要用中文错误字符串猜测业务含义。

## 检查范围与验收

`pnpm check:i18n` 扫描整个 `web/src` 的 TS/TSX（词典单独校验），检查 key、插值、复数、英文遗漏中文和固定中文。注释不属于界面文案。源内容的精确例外在 `scripts/i18n-check.ts` 的 `sourceTextExceptions` 中列出文件、原值和理由；不要豁免整页或整个目录。新增英文硬编码仍需人工校对，工具不能替代文案和布局检查。

使用 [双语验收清单](doc/I18n_QA.md) 检查成功、失败、语言切换与未保存状态，并在 390、1024、1440 像素宽度检查英文操作是否可达。隔离演示接口可复现页面行为；真实业务正确性还需 `pnpm test` 中的后端集成回归。记录未验证项，不把模拟响应当成真实媒体上传或外部 AI 服务成功。
