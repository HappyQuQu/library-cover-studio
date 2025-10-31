# Jellyfin/Emby 自动海报生成功能

## 功能概述

本系统支持定时从 Jellyfin 或 Emby 媒体服务器获取媒体库信息,自动下载媒体封面,使用模板生成新的海报,并上传回媒体服务器。

## 工作流程

```
1. 定时任务触发
   ↓
2. 连接 Jellyfin/Emby 服务器
   ↓
3. 获取媒体库列表
   ↓
4. 对每个媒体库:
   a. 获取媒体项列表 (按时间/名称排序)
   b. 下载封面图片 (默认9张)
   c. 使用模板生成海报 (替换占位符)
   d. 上传海报到媒体库
   ↓
5. 完成,等待下次执行
```

## API 接口

### 1. 测试连接

测试 Jellyfin/Emby 服务器连接。

```bash
POST /api/jellyfin/test-connection
Content-Type: application/json

{
  "baseURL": "http://localhost:8096",
  "apiKey": "your_api_key",
  "userId": "your_user_id"
}
```

**响应:**
```json
{
  "success": true,
  "message": "连接成功",
  "serverInfo": {
    "serverName": "My Jellyfin",
    "version": "10.8.0",
    "operatingSystem": "Linux"
  }
}
```

### 2. 获取媒体库列表

```bash
POST /api/jellyfin/libraries
Content-Type: application/json

{
  "baseURL": "http://localhost:8096",
  "apiKey": "your_api_key",
  "userId": "your_user_id",
  "excludeLibraries": ["Music", "Photos"]
}
```

**响应:**
```json
{
  "success": true,
  "libraries": [
    {
      "id": "abc123",
      "name": "Movies",
      "type": "movies"
    },
    {
      "id": "def456",
      "name": "TV Shows",
      "type": "tvshows"
    }
  ]
}
```

### 3. 添加定时任务

```bash
POST /api/jellyfin/schedule/add
Content-Type: application/json

{
  "taskId": "jellyfin-daily",
  "cronExpression": "0 0 * * *",
  "servers": [
    {
      "name": "Main Server",
      "baseURL": "http://localhost:8096",
      "apiKey": "your_api_key",
      "userId": "your_user_id"
    }
  ],
  "excludeLibraries": ["Music"],
  "templateMapping": {
    "Movies": 1,
    "TV Shows": 2
  },
  "defaultTemplateId": 1,
  "posterCount": 9,
  "uploadEnabled": true,
  "runImmediately": false
}
```

**参数说明:**

- `taskId`: 任务唯一标识符
- `cronExpression`: Cron 表达式 (例: "0 0 * * *" = 每天午夜)
- `servers`: 服务器配置列表
- `excludeLibraries`: 要排除的媒体库名称
- `templateMapping`: 媒体库名称到模板ID的映射
- `defaultTemplateId`: 默认模板ID (当媒体库没有指定模板时使用)
- `posterCount`: 每个媒体库下载的封面数量 (默认9)
- `uploadEnabled`: 是否上传生成的海报 (默认true)
- `runImmediately`: 是否立即执行一次 (默认false)

### 4. 获取任务列表

```bash
GET /api/jellyfin/schedule/list
```

**响应:**
```json
{
  "success": true,
  "tasks": [
    {
      "taskId": "jellyfin-daily",
      "cronExpression": "0 0 * * *",
      "status": "running",
      "lastRun": "2024-01-01T00:00:00.000Z",
      "serverCount": 1
    }
  ]
}
```

### 5. 手动触发任务

```bash
POST /api/jellyfin/schedule/trigger/jellyfin-daily
```

### 6. 停止任务

```bash
POST /api/jellyfin/schedule/stop/jellyfin-daily
```

### 7. 启动任务

```bash
POST /api/jellyfin/schedule/start/jellyfin-daily
```

### 8. 删除任务

```bash
DELETE /api/jellyfin/schedule/jellyfin-daily
```

## Cron 表达式说明

```
┌───────────── 分钟 (0 - 59)
│ ┌───────────── 小时 (0 - 23)
│ │ ┌───────────── 日期 (1 - 31)
│ │ │ ┌───────────── 月份 (1 - 12)
│ │ │ │ ┌───────────── 星期 (0 - 6) (0是周日)
│ │ │ │ │
* * * * *
```

**常用示例:**

- `0 0 * * *` - 每天午夜执行
- `0 */6 * * *` - 每6小时执行一次
- `0 0 * * 0` - 每周日午夜执行
- `0 2 1 * *` - 每月1号凌晨2点执行
- `*/30 * * * *` - 每30分钟执行一次

## 配置文件

创建 `config/jellyfin.json` (参考 `config/jellyfin.example.json`):

```json
{
  "jellyfin": {
    "enabled": true,
    "servers": [
      {
        "name": "My Jellyfin Server",
        "baseURL": "http://localhost:8096",
        "apiKey": "your_api_key_here",
        "userId": "your_user_id_here"
      }
    ],
    "schedule": {
      "enabled": true,
      "cronExpression": "0 0 * * *",
      "runImmediately": false
    },
    "options": {
      "excludeLibraries": ["Music", "Photos"],
      "templateMapping": {
        "Movies": 1,
        "TV Shows": 2
      },
      "defaultTemplateId": 1,
      "posterCount": 9,
      "uploadEnabled": true
    }
  }
}
```

## 模板占位符

系统会自动将下载的封面映射到模板占位符:

### 图片占位符

- `poster1` - 第1张封面
- `poster2` - 第2张封面
- `poster3` - 第3张封面
- ... (最多 poster10)

### 文本占位符

- `libraryName` - 媒体库名称
- `itemName` - 第一个媒体项名称
- `year` - 年份

## 获取 Jellyfin API Key

1. 登录 Jellyfin Web 界面
2. 进入 **Dashboard** (控制台)
3. 选择 **API Keys** (API 密钥)
4. 点击 **New API Key** (新建 API 密钥)
5. 输入应用名称: `LibraryCoverStudio`
6. 复制生成的 API Key

## 获取 User ID

1. 登录 Jellyfin Web 界面
2. 进入 **Dashboard** → **Users** (用户)
3. 点击你的用户名
4. 在浏览器地址栏中,URL 最后的部分就是 User ID
   - 例: `http://localhost:8096/web/index.html#!/users/user.html?userId=abc123`
   - User ID 是: `abc123`

## 使用示例

### 示例 1: 每天自动更新

```javascript
// 添加每天午夜执行的任务
const response = await fetch('http://localhost:3001/api/jellyfin/schedule/add', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    taskId: 'daily-update',
    cronExpression: '0 0 * * *',
    servers: [{
      name: 'Home Server',
      baseURL: 'http://192.168.1.100:8096',
      apiKey: 'your_api_key',
      userId: 'your_user_id'
    }],
    excludeLibraries: ['Music', 'Photos', 'Audiobooks'],
    templateMapping: {
      'Movies': 1,
      'TV Shows': 2,
      'Anime': 3
    },
    posterCount: 9,
    uploadEnabled: true,
    runImmediately: true  // 立即执行一次
  })
});
```

### 示例 2: 多服务器支持

```javascript
// 同时管理多个 Jellyfin 服务器
const response = await fetch('http://localhost:3001/api/jellyfin/schedule/add', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    taskId: 'multi-server',
    cronExpression: '0 2 * * *',
    servers: [
      {
        name: 'Home Server',
        baseURL: 'http://192.168.1.100:8096',
        apiKey: 'api_key_1',
        userId: 'user_id_1'
      },
      {
        name: 'Remote Server',
        baseURL: 'https://jellyfin.example.com',
        apiKey: 'api_key_2',
        userId: 'user_id_2'
      }
    ],
    defaultTemplateId: 1
  })
});
```

### 示例 3: 手动触发

```javascript
// 手动触发任务执行
await fetch('http://localhost:3001/api/jellyfin/schedule/trigger/daily-update', {
  method: 'POST'
});
```

## 日志输出

系统会输出详细的日志信息:

```
================================================================================
🚀 开始处理服务器: Home Server
================================================================================

============================================================
📚 开始处理媒体库: Movies (abc123)
============================================================

[步骤 1/4] 获取媒体项...
📝 获取到 50 个媒体项
🔍 过滤后剩余 45/50 个有封面的媒体项

[步骤 2/4] 下载封面图片...
📥 开始下载 9 张封面...
✅ 成功下载 9/9 张封面

[步骤 3/4] 生成海报...
🖼️  替换占位符 poster1 (图片)
🖼️  替换占位符 poster2 (图片)
...
✅ 海报已生成: /uploads/posters/abc123_1704067200000.jpg

[步骤 4/4] 上传海报到媒体库...
✅ 成功上传海报到媒体库: abc123

✅ 媒体库 Movies 处理完成

================================================================================
📊 服务器处理完成,成功: 3/3
================================================================================
```

## 注意事项

1. **API Key 安全**: 请妥善保管 API Key,不要提交到代码仓库
2. **网络连接**: 确保后端服务器能访问 Jellyfin/Emby 服务器
3. **性能考虑**: 下载大量封面可能需要时间,建议使用合理的 cron 间隔
4. **模板配置**: 确保模板ID存在且包含正确的占位符
5. **权限要求**: API Key 需要有读取和修改媒体库的权限
6. **Emby 兼容**: Emby 使用相同的 API 格式,只需替换 baseURL 即可

## 故障排查

### 连接失败

- 检查 baseURL 是否正确
- 检查网络连接
- 检查 Jellyfin 服务器是否运行

### 认证失败

- 检查 API Key 是否正确
- 检查 User ID 是否正确
- 重新生成 API Key

### 上传失败

- 检查 API Key 权限
- 检查媒体库是否存在
- 查看服务器日志

### 定时任务不执行

- 检查 cron 表达式是否正确
- 检查任务状态 (GET /api/jellyfin/schedule/list)
- 查看后端日志输出

## 高级功能

### 自定义排序

不同媒体库可以使用不同的排序方式:

```javascript
{
  "templateMapping": {
    "Movies": 1,      // 使用模板1
    "TV Shows": 2     // 使用模板2
  }
}
```

### 仅生成不上传

用于测试或预览:

```javascript
{
  "uploadEnabled": false  // 只生成海报,不上传
}
```

### 自定义封面数量

```javascript
{
  "posterCount": 12  // 下载12张封面 (需要模板支持 poster1-poster12)
}
```

## 相关文档

- [占位符使用指南](../PLACEHOLDER_USAGE.md)
- [模板制作指南](../docs/TEMPLATE_GUIDE.md)
- [Jellyfin API 文档](https://api.jellyfin.org/)
