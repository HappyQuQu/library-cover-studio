# 国际化更新说明

已完成国际化配置的文件:
- ✅ `TemplatesView.vue` - 模板管理页面

待应用国际化的文件及主要文本:

## DesignerView.vue (设计器)
需要替换的文本:
- "返回模板列表" → `t('templates.backToList')` 或 `t('designer.backToList')`
- "新建模板" → `t('designer.newTemplate')`
- "模板信息" → `t('designer.templateInfo')`
- "保存模板" → `t('designer.saveTemplate')`
- "导出海报" → `t('designer.exportPoster')`
- "标签" → `t('templates.tags')`
- "匹配字符" → `t('templates.matchTags')`
- 提示文本 → `t('designer.patternHint')`
- "纯色填充" / "图案填充" → `t('designer.colorFill')` / `t('designer.patternFill')`
- "选择图案" → `t('designer.selectPattern')`
- "填充颜色" → `t('designer.fillColor')`
- "应用" / "取消" → `t('common.confirm')` / `t('common.cancel')`
- "重置为适配模式" → `t('designer.resetToFit')`
- 各种成功/失败消息

需要import: `import { useI18n } from "vue-i18n";` 和 `const { t } = useI18n();`

## MediaSourcesView.vue (媒体源管理)
需要替换的文本:
- "媒体源管理" → `t('mediaSources.title')`
- "添加媒体源" → `t('mediaSources.addSource')`
- "编辑媒体源" → `t('mediaSources.editSource')`
- "测试连接" → `t('mediaSources.testConnection')`
- "连接成功" → `t('mediaSources.connectionSuccess')`
- "媒体库" → `t('mediaSources.libraries')`
- 各种字段标签和消息

需要import: `import { useI18n } from "vue-i18n";` 和 `const { t } = useI18n();`

## ScheduledTasksView.vue (定时任务)
需要替换的文本:
- "定时任务" → `t('scheduledTasks.title')`
- "新建任务" → `t('scheduledTasks.newTask')`
- "媒体源" → `t('scheduledTasks.mediaSource')`
- "请选择媒体源" → `t('scheduledTasks.selectMediaSource')`
- 各种状态和消息文本

需要import: `import { useI18n } from "vue-i18n";` 和 `const { t } = useI18n();`

## 国际化文件已更新
- ✅ `web/src/locales/zh-CN.ts` - 添加了完整的 templates、designer、mediaSources、scheduledTasks 翻译
- ✅ `web/src/locales/en-US.ts` - 添加了对应的英文翻译

## 下一步操作
由于文件较大（DesignerView.vue 有 1859 行），建议分批处理:
1. 先在各视图的 script setup 中引入 useI18n
2. 逐个替换固定的中文字符串为 t() 函数调用
3. 测试各页面切换语言时的显示效果
