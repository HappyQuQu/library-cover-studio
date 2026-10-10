import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { router as apiRouter } from './routes/index.js';
import { errorHandler } from './middleware/errorHandler.js';
import { initDatabase } from './config/database.js';
import { seedDefaultTemplates } from './services/defaultTemplates.service.js';
import { initializeTemplateHistory } from './services/templateHistory.service.js';
import { initScheduler } from './services/scheduler.service.js';
import { addLogClient, logger } from './utils/logger.js';
import { migrateLegacyEncryption } from './utils/migrateEncryption.js';
import { consumeStreamTicket } from './utils/streamTicket.js';
import { ensureDataDirs, UPLOADS_DIR } from './config/paths.js';

// 启动时校验必需的环境变量
const REQUIRED_ENV_VARS = ['JWT_SECRET', 'ENCRYPTION_KEY'];
const missingVars = REQUIRED_ENV_VARS.filter(v => !process.env[v]);
if (missingVars.length > 0) {
  console.error(`❌ Missing required environment variables: ${missingVars.join(', ')}`);
  console.error('Please set these variables in your .env file before starting the server.');
  process.exit(1);
}

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

// 静态文件
// 注意: COVERS_DIR / POSTERS_DIR / THUMBNAILS_DIR 未挂载为静态目录 —
// 这些是用户生成/下载的资产，不应公开访问。如果需要前端读取，应通过受认证的 controller 输出。
app.use('/api/uploads', express.static(UPLOADS_DIR));

// 模板图片 (源代码内置，公开)
app.use('/api/templates/posters', express.static('src/template/poster'));


// 日志流端点 (SSE) — 需要短期 ticket（前端先 POST /api/auth/stream-ticket 取得）
app.get('/api/logs/stream', (req, res) => {
  const ticketId = typeof req.query.ticket === 'string' ? req.query.ticket : '';
  const consumed = consumeStreamTicket(ticketId);
  if (!consumed) {
    res.status(401).json({ error: 'Invalid or expired stream ticket' });
    return;
  }
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
    await seedDefaultTemplates();
    await initializeTemplateHistory();

    // 加密数据迁移 (从硬编码 salt 升级到每部署独立 salt)
    migrateLegacyEncryption();

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
