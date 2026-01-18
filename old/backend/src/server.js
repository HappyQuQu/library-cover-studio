require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const path = require("path");

// 数据库初始化
const database = require("./services/database");

// 路由导入
const authRoutes = require("./routes/auth");
const templateRoutes = require("./routes/templates");
const posterRoutes = require("./routes/posters");
const mediaLibRoutes = require("./routes/mediaLibs");
const scheduleRoutes = require("./routes/schedules");
const mediaSourcesRoutes = require("./routes/mediaSources");
const scheduledTasksRoutes = require("./routes/scheduledTasks");
const logsRoutes = require("./routes/logs");
const sysLogger = require("./services/logger").system;

// 中间件导入
const errorHandler = require("./middleware/errorHandler");
const requestLogger = require("./middleware/requestLogger");

const app = express();
const PORT = process.env.PORT || 3001;

// 安全中间件
app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  })
);

// 日志中间件
app.use(morgan("combined"));

// 请求日志中间件（记录到文件）
app.use(requestLogger);

// 解析JSON
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// 静态文件服务
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));
app.use(
  "/template/poster",
  express.static(path.join(__dirname, "../template/poster"))
);
app.use("/test", express.static(path.join(__dirname, "../public")));

// API路由
app.use("/api/auth", authRoutes);
app.use("/api/templates", templateRoutes);
app.use("/api/posters", posterRoutes);
app.use("/api/media-libs", mediaLibRoutes);
app.use("/api/schedules", scheduleRoutes);
app.use("/api/media-sources", mediaSourcesRoutes);
app.use("/api/scheduled-tasks", scheduledTasksRoutes);
app.use("/api/logs", logsRoutes);

// 健康检查
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || "1.0.0",
  });
});

// 404处理
app.use("*", (req, res) => {
  res.status(404).json({
    error: "API endpoint not found",
    path: req.originalUrl,
  });
});

// 错误处理中间件
app.use(errorHandler);

// 初始化数据库并启动服务器
const startServer = async () => {
  try {
    await sysLogger.info('========================================');
    await sysLogger.info('服务器启动中...', {
      nodeVersion: process.version,
      platform: process.platform,
      pid: process.pid,
      port: PORT,
    });

    // 初始化数据库
    await sysLogger.info('正在初始化数据库...');
    await database.initialize();
    await sysLogger.info('数据库初始化成功');

    // 加载定时任务配置
    await sysLogger.info('正在加载定时任务配置...');
    const { loadSchedulerConfig } = require("./config/loadScheduler");
    const taskCount = await loadSchedulerConfig();
    await sysLogger.info(`定时任务配置加载完成，共 ${taskCount || 0} 个任务`);

    // 服务器启动
    app.listen(PORT, async () => {
      const lines = [
        `🚀 LibraryCoverStudio Backend running on port ${PORT}`,
        `📊 Health check: http://localhost:${PORT}/health`,
        `🔐 Auth endpoints: http://localhost:${PORT}/api/auth`,
        `📅 Media Sources: http://localhost:${PORT}/api/media-sources`,
        `⏰ Scheduled Tasks: http://localhost:${PORT}/api/scheduled-tasks`,
        `🧾 Logs API: http://localhost:${PORT}/api/logs/{system|tasks}`,
      ];
      for (const l of lines) {
        console.log(l);
      }
      await sysLogger.info('服务器启动成功', {
        port: PORT,
        env: process.env.NODE_ENV || 'development',
        endpoints: ['/api/auth', '/api/templates', '/api/posters', '/api/media-sources', '/api/scheduled-tasks', '/api/logs'],
      });
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    await sysLogger.error(`服务器启动失败: ${error.message}`, {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  }
};

// 优雅关闭
process.on("SIGTERM", async () => {
  console.log("👋 SIGTERM received, shutting down gracefully");
  await sysLogger.warn("收到 SIGTERM 信号，正在优雅关闭服务器...");
  const { getInstance: getScheduler } = require("./services/schedulerService");
  getScheduler().stopAll();
  await database.close();
  await sysLogger.info("服务器已关闭");
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("👋 SIGINT received, shutting down gracefully");
  await sysLogger.warn("收到 SIGINT 信号，正在优雅关闭服务器...");
  const { getInstance: getScheduler } = require("./services/schedulerService");
  getScheduler().stopAll();
  await database.close();
  await sysLogger.info("服务器已关闭");
  process.exit(0);
});

// 未捕获异常处理
process.on('uncaughtException', async (error) => {
  console.error('❌ Uncaught Exception:', error);
  await sysLogger.error('未捕获的异常', {
    error: error.message,
    stack: error.stack,
  });
  process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  await sysLogger.error('未处理的 Promise 拒绝', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

// 启动服务器
startServer();

module.exports = app;
