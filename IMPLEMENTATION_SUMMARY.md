# Jellyfin 自动海报生成系统 - 实现总结

## 系统设计

基于你的需求,我实现了一个完全由数据库驱动的系统,而不是 Python v1 的配置文件方式。

### 核心概念

1. **模板 (Templates)** - 用户在设计器中创建,保存到数据库
2. **媒体源 (Media Sources)** - Jellyfin/Emby 服务器配置,保存到数据库
3. **定时任务 (Scheduled Tasks)** - 媒体库与模板的映射关系,保存到数据库

### 与 Python v1 的区别

| 特性       | Python v1               | 新系统                            |
| ---------- | ----------------------- | --------------------------------- |
| 模板存储   | 文件 (style1/, style2/) | 数据库 (templates 表)             |
| 服务器配置 | config.py               | 数据库 (media_libraries 表)       |
| 任务配置   | config.py               | 数据库 (scheduled_tasks 表)       |
| 模板选择   | TEMPLATE_MAPPING 字典   | library_template_mapping JSON字段 |
| 任务管理   | 手动修改配置文件        | Web界面 (API操作)                 |
| 执行历史   | 日志文件                | 数据库 (task_executions 表)       |

## 已实现的功能

### 1. 后端服务

#### JellyfinService (`backend/src/services/jellyfinService.js`)
- 连接 Jellyfin/Emby 服务器
- 获取媒体库列表
- 获取媒体项列表 (支持排序)
- 下载封面图片
- 上传生成的海报

#### WorkflowService (`backend/src/services/workflowService.js`)
- 协调整个工作流程
- 处理单个媒体库
- 处理多个媒体库
- 支持模板映射

#### SchedulerService (`backend/src/services/schedulerService.js`)
- 管理定时任务
- Cron 表达式解析
- 任务启动/停止/触发
- 任务状态管理

### 2. API 路由

#### 媒体源管理 (`backend/src/routes/mediaSources.js`)
- `GET /api/media-sources` - 获取列表
- `POST /api/media-sources` - 创建媒体源
- `PUT /api/media-sources/:id` - 更新
- `DELETE /api/media-sources/:id` - 删除
- `POST /api/media-sources/:id/test` - 测试连接
- `GET /api/media-sources/:id/libraries` - 获取媒体库

#### 定时任务管理 (`backend/src/routes/scheduledTasks.js`)
- `GET /api/scheduled-tasks` - 获取任务列表
- `POST /api/scheduled-tasks` - 创建任务
- `PUT /api/scheduled-tasks/:id` - 更新任务
- `DELETE /api/scheduled-tasks/:id` - 删除任务
- `POST /api/scheduled-tasks/:id/toggle` - 启用/禁用
- `POST /api/scheduled-tasks/:id/trigger` - 手动触发
- `GET /api/scheduled-tasks/:id/executions` - 执行历史

### 3. 数据库结构

#### media_libraries 表
```sql
- id: UUID
- name: 媒体源名称
- type: jellyfin/emby/plex
- base_url: 服务器地址
- api_key: API密钥
- user_id: 用户ID
- is_active: 是否激活
- last_sync: 最后同步时间
```

#### scheduled_tasks 表
```sql
- id: UUID
- name: 任务名称
- media_source_id: 关联的媒体源
- library_template_mapping: JSON {"libraryId": "templateId"}
- exclude_libraries: 排除的媒体库数组
- cron_expression: Cron表达式
- poster_count: 下载封面数量
- upload_enabled: 是否上传
- sort_by: 排序方式
- is_active: 是否激活
- last_run: 最后运行时间
- run_count/success_count/error_count: 统计信息
```

#### task_executions 表
```sql
- id: UUID
- task_id: 关联的任务
- status: running/completed/failed
- started_at/completed_at: 时间戳
- processed_items/failed_items: 统计
- error_message: 错误信息
- execution_log: JSON 执行日志
```

### 4. 自动加载机制

`backend/src/config/loadScheduler.js` 在服务器启动时:
- 从数据库读取所有激活的任务
- 为每个任务创建定时调度
- 任务会按 Cron 表达式自动执行

## 使用流程

### 第一步:创建模板
```
用户在设计器中:
1. 添加图片元素,设置占位符 poster1-poster10
2. 添加文字元素,可用占位符: libraryName, itemName, year
3. 保存模板到数据库
```

### 第二步:配置媒体源
```javascript
POST /api/media-sources
{
  "name": "我的 Jellyfin",
  "type": "jellyfin",
  "baseURL": "http://localhost:8096",
  "apiKey": "your_api_key",
  "userId": "your_user_id"
}

// 测试连接
POST /api/media-sources/{id}/test

// 获取媒体库列表
GET /api/media-sources/{id}/libraries
// 返回: [{"id": "lib1", "name": "电影"}, {"id": "lib2", "name": "电视剧"}]
```

### 第三步:创建定时任务
```javascript
POST /api/scheduled-tasks
{
  "name": "每日更新",
  "mediaSourceId": "source-uuid",
  "libraryTemplateMapping": {
    "lib1": "template-uuid-1",  // 电影库用模板1
    "lib2": "template-uuid-2"   // 电视剧库用模板2
  },
  "cronExpression": "0 0 * * *",  // 每天午夜
  "posterCount": 9,
  "uploadEnabled": true,
  "isActive": true
}
```

### 第四步:任务自动执行
```
定时到达 → 触发任务
  ↓
对每个配置的媒体库:
  1. 获取最新的 N 个媒体项
  2. 下载封面图片
  3. 使用对应模板生成海报
  4. 上传到媒体服务器
  ↓
记录执行结果到数据库
```

## 核心特性

### 1. 灵活的模板映射
```json
{
  "libraryTemplateMapping": {
    "library-id-1": "template-uuid-1",
    "library-id-2": "template-uuid-2",
    "library-id-3": "template-uuid-1"  // 可以共用模板
  }
}
```

### 2. 媒体库排除
```json
{
  "excludeLibraries": ["music-lib-id", "photo-lib-id"]
}
```

### 3. 自定义排序
```json
{
  "sortBy": "DateCreated"  // 或 "SortName", "Random"
}
```

### 4. 可选上传
```json
{
  "uploadEnabled": false  // 仅生成,不上传
}
```

### 5. 执行历史跟踪
```javascript
GET /api/scheduled-tasks/{id}/executions
// 返回:执行时间、状态、处理数量、错误信息等
```

## 前端待实现

### 媒体源管理页面
- 媒体源列表展示
- 添加/编辑/删除媒体源
- 测试连接功能
- 查看媒体库列表

### 定时任务配置页面
- 任务列表展示
- 创建任务向导:
  1. 选择媒体源
  2. 自动加载该媒体源的媒体库列表
  3. 为每个媒体库选择模板
  4. 配置 Cron 表达式
  5. 设置其他选项
- 任务启用/禁用
- 手动触发任务
- 查看执行历史

### 建议的 UI 组件

```vue
<!-- 媒体源管理 -->
<MediaSourceManager>
  <MediaSourceList />
  <MediaSourceForm />
  <MediaSourceTester />
</MediaSourceManager>

<!-- 定时任务配置 -->
<ScheduledTaskManager>
  <TaskList />
  <TaskWizard>
    <Step1SelectSource />
    <Step2MapLibraries />  <!-- 关键:为每个媒体库选模板 -->
    <Step3ConfigSchedule />
    <Step4Review />
  </TaskWizard>
  <TaskExecutionHistory />
</ScheduledTaskManager>
```

## 数据流

```
用户设计模板 → 保存到 templates 表
                    ↓
用户配置媒体源 → 保存到 media_libraries 表
                    ↓
用户创建任务 → 保存到 scheduled_tasks 表
              (包含 library_template_mapping)
                    ↓
服务器启动 → loadScheduler 读取数据库
                    ↓
创建定时调度 → 按 cron 表达式执行
                    ↓
执行任务 → WorkflowService 处理
              ↓
对每个媒体库:
  - 获取对应的 templateId
  - 下载封面
  - 生成海报
  - 上传
              ↓
记录结果 → task_executions 表
```

## 优势

1. **完全 Web 化** - 所有配置通过 API 完成,无需修改文件
2. **灵活映射** - 每个媒体库可以使用不同模板
3. **历史追踪** - 完整的执行记录和统计
4. **实时管理** - 无需重启服务器即可修改任务
5. **模板复用** - 一个模板可以用于多个媒体库
6. **多服务器** - 支持配置多个 Jellyfin/Emby 服务器

## 文件清单

### 新增文件
- `backend/src/services/jellyfinService.js` - Jellyfin API 集成
- `backend/src/services/workflowService.js` - 工作流编排
- `backend/src/services/schedulerService.js` - 定时任务管理
- `backend/src/routes/mediaSources.js` - 媒体源 API
- `backend/src/routes/scheduledTasks.js` - 定时任务 API
- `backend/database/migration_001_jellyfin.sql` - 数据库迁移
- `JELLYFIN_API_GUIDE.md` - API 使用指南

### 修改文件
- `backend/src/server.js` - 注册新路由
- `backend/src/config/loadScheduler.js` - 从数据库加载任务

### 配置文件
- `config/jellyfin.example.json` - 配置示例(已不再使用)

## 下一步

1. **前端开发** - 创建媒体源和任务管理页面
2. **测试** - 与真实 Jellyfin 服务器测试
3. **优化** - 性能优化、错误处理
4. **文档** - 用户使用手册

## API 测试示例

```bash
# 1. 创建媒体源
curl -X POST http://localhost:3001/api/media-sources \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Jellyfin",
    "type": "jellyfin",
    "baseURL": "http://localhost:8096",
    "apiKey": "your_key",
    "userId": "your_user_id"
  }'

# 2. 获取媒体库
curl http://localhost:3001/api/media-sources/{id}/libraries

# 3. 创建任务
curl -X POST http://localhost:3001/api/scheduled-tasks \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Task",
    "mediaSourceId": "source-id",
    "libraryTemplateMapping": {
      "library-1": "template-1"
    },
    "cronExpression": "0 0 * * *",
    "posterCount": 9
  }'

# 4. 手动触发
curl -X POST http://localhost:3001/api/scheduled-tasks/{id}/trigger
```

这样你就有了一个完全由数据库驱动、通过 Web 界面管理的自动化海报生成系统!
