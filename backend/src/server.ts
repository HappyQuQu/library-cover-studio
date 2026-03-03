import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { router as apiRouter } from './routes/index.js';
import { errorHandler } from './middleware/errorHandler.js';
import { initDatabase } from './config/database.js';
import { initScheduler } from './services/scheduler.service.js';
import { addLogClient, logger } from './utils/logger.js';
import { ensureDataDirs, UPLOADS_DIR, COVERS_DIR, POSTERS_DIR, THUMBNAILS_DIR } from './config/paths.js';

// Ensure data directories exist on startup
ensureDataDirs();

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(helmet({
  crossOriginResourcePolicy: false,
}));
app.use(cors({
  origin: (origin, callback) => {
    const allowedOrigins = [
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:5175',
      'http://localhost:5176',
      process.env.FRONTEND_URL
    ].filter(Boolean);

    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(morgan('dev')); // Dev output to console
app.use(morgan(':method :url :status :response-time ms - :res[content-length]', {
  stream: logger.stream,
  skip: (req) => req.url === '/api/health' || req.url === '/api/logs/stream' // Skip noise
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// 静态文件 (统一数据目录)
app.use('/api/uploads', express.static(UPLOADS_DIR));
app.use('/api/covers', express.static(COVERS_DIR));
app.use('/api/thumbnails', express.static(THUMBNAILS_DIR));
app.use('/api/posters', express.static(POSTERS_DIR));

// 模板图片 (保持原样，因为是源代码的一部分)
app.use('/api/templates/posters', express.static('src/template/poster'));


// 日志流端点 (SSE)
app.get('/api/logs/stream', (_req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  // @ts-ignore
  if (res.flushHeaders) res.flushHeaders();

  addLogClient(res);

  // Send initial ping to confirm connection
  res.write(`data: ${JSON.stringify({ timestamp: new Date().toLocaleTimeString(), level: 'info', message: 'Connected to log stream' })}\n\n`);

  // Keep connection alive
  const interval = setInterval(() => {
    res.write(': keep-alive\n\n');
  }, 30000);

  res.on('close', () => {
    clearInterval(interval);
    res.end();
  });
});


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
    logger.info('✅ Database initialized');

    // 初始化任务调度器
    initScheduler();
    logger.info('✅ Scheduler initialized');

    // 启动 HTTP 服务器
    app.listen(PORT, () => {
      logger.info(`🚀 Server running on http://localhost:${PORT}`);
      logger.info(`📚 API docs: http://localhost:${PORT}/api/health`);
    });
  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

bootstrap();
