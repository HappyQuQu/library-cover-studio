# LibraryCoverStudio - 快速开始指南

## 🚀 一键启动

### 1. 克隆项目
```bash
git clone https://github.com/your-username/LibraryCoverStudio.git
cd LibraryCoverStudio
```

### 2. 配置环境变量
```bash
cp .env.example .env
# 编辑 .env 文件，设置数据库密码等配置
```

### 3. 启动服务
```bash
# 使用 Docker Compose 一键启动所有服务
docker-compose up -d

# 查看服务状态
docker-compose ps
```

### 4. 访问应用
- 🌐 **前端界面**: http://localhost:3001
- 📊 **API 文档**: http://localhost:3001/health
- 🐘 **数据库**: localhost:5432
- 🔄 **Redis**: localhost:6379

## 📋 开发环境启动

### 前端开发
```bash
cd web
npm install
npm run dev
# 前端将在 http://localhost:3000 启动
```

### 后端开发
```bash
cd backend
npm install
npm run dev
# 后端 API 将在 http://localhost:3001 启动
```

## 🛠️ 功能概览

### ✨ 海报设计器功能
- 📝 **文字编辑**: 字体、大小、颜色、位置调整
- 🖼️ **图片处理**: 上传、缩放、旋转、裁剪
- 🎨 **背景设置**: 纯色、渐变、图片背景
- 📐 **拖拽交互**: 可视化编辑，所见即所得
- 💾 **模板管理**: 保存、加载、复制、导出模板

### 🔄 自动化功能
- ⏰ **定时任务**: 支持 Cron 表达式的灵活调度
- 📚 **媒体库集成**: 
  - Jellyfin 支持
  - Emby 支持
  - Plex 支持（计划中）
- 🎯 **智能过滤**: 按类型、评分、年份等条件筛选
- 🔄 **批量处理**: 一次性更新多个媒体项目
- 📊 **执行监控**: 任务状态跟踪和错误日志

## 📖 使用教程

### 1. 创建第一个海报模板
1. 访问设计器页面
2. 添加背景色或背景图片
3. 添加文字元素（支持变量如 {{title}}、{{year}}）
4. 调整字体、大小、位置
5. 保存模板

### 2. 配置媒体库连接
1. 进入设置页面
2. 添加媒体库配置：
   - 选择类型（Jellyfin/Emby）
   - 输入服务器地址
   - 配置 API 密钥
   - 测试连接
3. 激活媒体库

### 3. 设置自动化任务
1. 创建新的定时任务
2. 选择模板和媒体库
3. 设置 Cron 表达式（如：`0 2 * * *` 每天凌晨2点）
4. 配置过滤条件
5. 启用任务

## 🔧 配置说明

### 环境变量
```bash
# 数据库
POSTGRES_PASSWORD=your_password

# JWT 密钥
JWT_SECRET=your_jwt_secret

# 媒体库配置
JELLYFIN_URL=http://jellyfin:8096
JELLYFIN_API_KEY=your_api_key
```

### Cron 表达式示例
```
0 2 * * *     # 每天凌晨 2 点
0 */6 * * *   # 每 6 小时
0 0 * * 0     # 每周日午夜
0 0 1 * *     # 每月 1 号午夜
```

## 🐛 常见问题

### Q: Docker 启动失败？
A: 检查端口占用：`netstat -tlnp | grep :3001`

### Q: 无法连接媒体库？
A: 
1. 确认媒体库地址可访问
2. 验证 API 密钥正确性
3. 检查防火墙设置

### Q: 海报生成失败？
A: 
1. 检查模板变量是否正确
2. 确认图片文件权限
3. 查看错误日志

## 📚 技术栈

**前端**: Vue.js 3 + Fabric.js + Element Plus + Tailwind CSS
**后端**: Node.js + Express + PostgreSQL + Redis
**部署**: Docker + Docker Compose
**任务队列**: Bull + node-cron

## 🤝 贡献指南

1. Fork 项目
2. 创建功能分支: `git checkout -b feature/amazing-feature`
3. 提交更改: `git commit -m 'Add amazing feature'`
4. 推送分支: `git push origin feature/amazing-feature`
5. 提交 Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 🎯 路线图

- [ ] 更多模板样式
- [ ] Plex 媒体库支持
- [ ] 移动端适配
- [ ] 插件系统
- [ ] 多语言支持
- [ ] 主题系统

---

**享受设计的乐趣！** 🎨✨