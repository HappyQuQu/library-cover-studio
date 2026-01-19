import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { router as apiRouter } from './routes/index.js';
import { errorHandler } from './middleware/errorHandler.js';
import { initDatabase } from './config/database.js';
import { initScheduler } from './services/scheduler.service.js';

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(helmet({
  crossOriginResourcePolicy: false,
}));
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// 静态文件 (上传目录)
app.use('/api/uploads', express.static('uploads'));
// 模板图片
app.use('/api/templates/posters', express.static('src/template/poster'));


// API 路由
app.use('/api', apiRouter);

// 健康检查
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.3.0'
  });
});

// 404 处理
app.use((_req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// 错误处理
app.use(errorHandler);

// 启动服务器
async function bootstrap() {
  try {
    // 初始化数据库
    await initDatabase();
    console.log('✅ Database initialized');

    // 初始化任务调度器
    initScheduler();
    console.log('✅ Scheduler initialized');

    // 启动 HTTP 服务器
    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`📚 API docs: http://localhost:${PORT}/api/health`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

bootstrap();
