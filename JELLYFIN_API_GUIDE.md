# Jellyfin 自动海报生成 - 完整使用指南

## 系统架构

本系统基于以下三个核心概念:

1. **模板 (Templates)** - 在设计器中创建,保存到数据库
2. **媒体源 (Media Sources)** - Jellyfin/Emby 服务器配置
3. **定时任务 (Scheduled Tasks)** - 配置媒体库与模板的映射关系和执行计划

## 使用流程

### 1. 创建模板

在设计器页面创建海报模板:

1. 添加图片元素,设置占位符 `poster1` - `poster10`
2. 添加文字元素,可以使用占位符:
   - `libraryName` - 媒体库名称
   - `itemName` - 媒体项名称
   - `year` - 年份
3. 保存模板到数据库

### 2. 配置媒体源

**创建媒体源**

```bash
POST /api/media-sources
Content-Type: application/json

{
  "name": "我的 Jellyfin 服务器",
  "type": "jellyfin",
  "baseURL": "http://localhost:8096",
  "apiKey": "你的API密钥",
  "userId": "你的用户ID"
}
```

**响应:**
```json
{
  "success": true,
  "message": "媒体源创建成功",
  "data": {
    "id": "uuid-123",
    "name": "我的 Jellyfin 服务器"
  }
}
```

**获取媒体源列表**

```bash
GET /api/media-sources
```

**测试连接**

```bash
POST /api/media-sources/{id}/test
```

**获取媒体库列表**

```bash
GET /api/media-sources/{id}/libraries
```

**响应:**
```json
{
  "success": true,
  "data": [
    {
      "id": "library-123",
      "name": "电影",
      "type": "movies"
    },
    {
      "id": "library-456",
      "name": "电视剧",
      "type": "tvshows"
    }
  ]
}
```

### 3. 创建定时任务

**创建任务**

```bash
POST /api/scheduled-tasks
Content-Type: application/json

{
  "name": "每日更新电影海报",
  "mediaSourceId": "uuid-123",
  "libraryTemplateMapping": {
    "library-123": "template-uuid-1",
    "library-456": "template-uuid-2"
  },
  "excludeLibraries": [],
  "cronExpression": "0 0 * * *",
  "posterCount": 9,
  "uploadEnabled": true,
  "sortBy": "DateCreated",
  "isActive": true
}
```

**参数说明:**

- `name`: 任务名称
- `mediaSourceId`: 媒体源ID
- `libraryTemplateMapping`: **核心配置** - 媒体库ID到模板ID的映射
  ```json
  {
    "library-123": "template-uuid-1",  // 电影库使用模板1
    "library-456": "template-uuid-2"   // 电视剧库使用模板2
  }
  ```
- `excludeLibraries`: 要排除的媒体库ID数组
- `cronExpression`: Cron 表达式
- `posterCount`: 每个媒体库下载的封面数量 (默认 9)
- `uploadEnabled`: 是否上传生成的海报回服务器
- `sortBy`: 排序方式 (`DateCreated`, `SortName`, `Random` 等)
- `isActive`: 是否激活

**获取任务列表**

```bash
GET /api/scheduled-tasks
```

**更新任务**

```bash
PUT /api/scheduled-tasks/{id}
Content-Type: application/json

{
  "name": "新任务名称",
  "libraryTemplateMapping": {
    "library-123": "template-uuid-3"
  }
}
```

**启用/禁用任务**

```bash
POST /api/scheduled-tasks/{id}/toggle
```

**手动触发任务**

```bash
POST /api/scheduled-tasks/{id}/trigger
```

**删除任务**

```bash
DELETE /api/scheduled-tasks/{id}
```

**查看执行历史**

```bash
GET /api/scheduled-tasks/{id}/executions?limit=10
```

## 完整示例

### 示例 1: 单个媒体库使用一个模板

```javascript
// 步骤 1: 创建媒体源
const source = await fetch('http://localhost:3001/api/media-sources', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'Home Jellyfin',
    type: 'jellyfin',
    baseURL: 'http://192.168.1.100:8096',
    apiKey: 'your_api_key',
    userId: 'your_user_id'
  })
});
const sourceData = await source.json();
const sourceId = sourceData.data.id;

// 步骤 2: 获取媒体库列表
const libs = await fetch(`http://localhost:3001/api/media-sources/${sourceId}/libraries`);
const libsData = await libs.json();
console.log('媒体库:', libsData.data);

// 步骤 3: 创建定时任务
const task = await fetch('http://localhost:3001/api/scheduled-tasks', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: '每天更新电影海报',
    mediaSourceId: sourceId,
    libraryTemplateMapping: {
      [libsData.data[0].id]: 'your-template-uuid'  // 第一个媒体库使用指定模板
    },
    cronExpression: '0 2 * * *',  // 每天凌晨2点
    posterCount: 9,
    uploadEnabled: true
  })
});
```

### 示例 2: 多个媒体库使用不同模板

```javascript
// 假设你有两个模板:
const movieTemplateId = 'template-uuid-movies';
const tvTemplateId = 'template-uuid-tv';

// 创建任务,为不同媒体库指定不同模板
await fetch('http://localhost:3001/api/scheduled-tasks', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: '多库任务',
    mediaSourceId: sourceId,
    libraryTemplateMapping: {
      'movie-library-id': movieTemplateId,  // 电影库用电影模板
      'tv-library-id': tvTemplateId,        // 电视剧库用电视剧模板
      'anime-library-id': movieTemplateId   // 动画库也用电影模板
    },
    excludeLibraries: ['music-library-id', 'photo-library-id'],  // 排除音乐和照片库
    cronExpression: '0 0 * * 0',  // 每周日午夜
    posterCount: 12
  })
});
```

### 示例 3: 手动触发测试

```javascript
// 创建任务但不激活
const task = await fetch('http://localhost:3001/api/scheduled-tasks', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: '测试任务',
    mediaSourceId: sourceId,
    libraryTemplateMapping: {
      'library-id': 'template-id'
    },
    cronExpression: '0 0 * * *',
    isActive: false  // 不自动执行
  })
});
const taskData = await task.json();

// 手动触发执行
await fetch(`http://localhost:3001/api/scheduled-tasks/${taskData.data.id}/trigger`, {
  method: 'POST'
});

// 等待一段时间后查看结果
setTimeout(async () => {
  const executions = await fetch(
    `http://localhost:3001/api/scheduled-tasks/${taskData.data.id}/executions?limit=1`
  );
  const executionData = await executions.json();
  console.log('执行结果:', executionData.data[0]);
}, 30000);  // 30秒后检查
```

## 数据库结构

### media_libraries (媒体源)

```sql
CREATE TABLE media_libraries (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,         -- 媒体源名称
    type VARCHAR(50) NOT NULL,          -- 类型: jellyfin, emby, plex
    base_url VARCHAR(500) NOT NULL,     -- 服务器地址
    api_key VARCHAR(255) NOT NULL,      -- API密钥
    user_id VARCHAR(255),               -- 用户ID
    is_active BOOLEAN DEFAULT true,     -- 是否激活
    last_sync TIMESTAMP,                -- 最后同步时间
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

### scheduled_tasks (定时任务)

```sql
CREATE TABLE scheduled_tasks (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,                      -- 任务名称
    media_source_id UUID REFERENCES media_libraries, -- 关联的媒体源
    library_template_mapping JSONB,                  -- 媒体库-模板映射 {"lib1": "tpl1"}
    exclude_libraries TEXT[],                        -- 排除的媒体库ID列表
    cron_expression VARCHAR(100) NOT NULL,           -- Cron表达式
    poster_count INTEGER DEFAULT 9,                  -- 下载封面数量
    upload_enabled BOOLEAN DEFAULT true,             -- 是否上传
    sort_by VARCHAR(50) DEFAULT 'DateCreated',       -- 排序方式
    is_active BOOLEAN DEFAULT true,                  -- 是否激活
    last_run TIMESTAMP,                              -- 最后运行时间
    run_count INTEGER DEFAULT 0,                     -- 运行次数
    success_count INTEGER DEFAULT 0,                 -- 成功次数
    error_count INTEGER DEFAULT 0,                   -- 失败次数
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

### task_executions (执行记录)

```sql
CREATE TABLE task_executions (
    id UUID PRIMARY KEY,
    task_id UUID REFERENCES scheduled_tasks,
    status VARCHAR(50),                -- running, completed, failed
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    processed_items INTEGER,           -- 处理的项目数
    failed_items INTEGER,              -- 失败的项目数
    error_message TEXT,
    execution_log JSONB                -- 执行日志
);
```

## 工作流程

```
用户创建模板
    ↓
保存模板到数据库
    ↓
配置媒体源 (Jellyfin/Emby)
    ↓
获取媒体库列表
    ↓
创建定时任务
    ├─ 选择媒体源
    ├─ 配置媒体库→模板映射
    ├─ 设置Cron表达式
    └─ 启用任务
        ↓
    定时触发
        ↓
    对每个媒体库:
        1. 获取媒体项
        2. 下载封面图片
        3. 使用对应模板生成海报
        4. 上传海报到媒体服务器
        ↓
    记录执行结果到数据库
```

## Cron 表达式参考

```
格式: 分 时 日 月 周

常用示例:
0 0 * * *      - 每天午夜
0 2 * * *      - 每天凌晨2点
0 */6 * * *    - 每6小时
0 0 * * 0      - 每周日午夜
0 0 1 * *      - 每月1号午夜
*/30 * * * *   - 每30分钟
```

## 故障排查

### 1. 连接失败

```bash
# 测试连接
POST /api/media-sources/{id}/test
```

检查:
- baseURL 是否正确
- apiKey 是否有效
- userId 是否正确
- 网络连接是否正常

### 2. 任务不执行

检查:
- `isActive` 是否为 true
- Cron 表达式是否正确
- 查看执行历史找出错误

```bash
GET /api/scheduled-tasks/{id}/executions
```

### 3. 海报生成失败

检查:
- 模板ID是否存在
- 模板是否包含正确的占位符
- `posterCount` 是否与模板占位符数量匹配

### 4. 上传失败

检查:
- API Key 是否有写权限
- 媒体库是否允许修改
- 文件大小是否超限

## 最佳实践

1. **测试优先**: 创建任务时先设置 `isActive: false`,手动触发测试
2. **合理的Cron**: 避免过于频繁的执行,推荐每天或每周
3. **错误处理**: 定期查看执行历史,及时发现问题
4. **模板维护**: 为不同类型的媒体库创建专门的模板
5. **资源管理**: `posterCount` 不要设置过大,避免下载太多图片
6. **分批处理**: 如果媒体库很多,可以创建多个任务分批执行

## 高级功能

### 按需生成 (不上传)

```json
{
  "uploadEnabled": false
}
```

生成的海报保存在 `uploads/posters/` 目录,可以手动查看后再上传。

### 自定义排序

```json
{
  "sortBy": "DateCreated"  // 最新添加的
}
```

可选值:
- `DateCreated` - 按添加时间
- `SortName` - 按名称
- `Random` - 随机

### 排除特定媒体库

```json
{
  "excludeLibraries": ["library-id-1", "library-id-2"]
}
```

## API 完整列表

### 媒体源管理

- `GET /api/media-sources` - 获取所有媒体源
- `GET /api/media-sources/:id` - 获取单个媒体源
- `POST /api/media-sources` - 创建媒体源
- `PUT /api/media-sources/:id` - 更新媒体源
- `DELETE /api/media-sources/:id` - 删除媒体源
- `POST /api/media-sources/:id/test` - 测试连接
- `GET /api/media-sources/:id/libraries` - 获取媒体库列表

### 定时任务管理

- `GET /api/scheduled-tasks` - 获取所有任务
- `GET /api/scheduled-tasks/:id` - 获取单个任务
- `POST /api/scheduled-tasks` - 创建任务
- `PUT /api/scheduled-tasks/:id` - 更新任务
- `DELETE /api/scheduled-tasks/:id` - 删除任务
- `POST /api/scheduled-tasks/:id/toggle` - 启用/禁用任务
- `POST /api/scheduled-tasks/:id/trigger` - 手动触发任务
- `GET /api/scheduled-tasks/:id/executions` - 查看执行历史

## 前端集成建议

### 媒体源管理页面

```vue
<template>
  <div>
    <el-button @click="showAddDialog">添加媒体源</el-button>
    <el-table :data="mediaSources">
      <el-table-column prop="name" label="名称" />
      <el-table-column prop="type" label="类型" />
      <el-table-column prop="base_url" label="地址" />
      <el-table-column label="操作">
        <template #default="{ row }">
          <el-button @click="testConnection(row.id)">测试</el-button>
          <el-button @click="editSource(row)">编辑</el-button>
          <el-button @click="deleteSource(row.id)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>
```

### 定时任务配置页面

```vue
<template>
  <el-form :model="form">
    <el-form-item label="任务名称">
      <el-input v-model="form.name" />
    </el-form-item>
    
    <el-form-item label="媒体源">
      <el-select v-model="form.mediaSourceId" @change="loadLibraries">
        <el-option 
          v-for="source in mediaSources"
          :key="source.id"
          :label="source.name"
          :value="source.id"
        />
      </el-select>
    </el-form-item>
    
    <el-form-item label="媒体库配置">
      <div v-for="lib in libraries" :key="lib.id">
        <span>{{ lib.name }}</span>
        <el-select v-model="form.libraryTemplateMapping[lib.id]">
          <el-option 
            v-for="tpl in templates"
            :key="tpl.id"
            :label="tpl.name"
            :value="tpl.id"
          />
        </el-select>
      </div>
    </el-form-item>
    
    <el-form-item label="执行时间">
      <el-input v-model="form.cronExpression" placeholder="0 0 * * *" />
    </el-form-item>
    
    <el-button @click="createTask">创建任务</el-button>
  </el-form>
</template>
```

这样,用户就可以完全通过界面配置媒体源、选择模板、创建定时任务了!
