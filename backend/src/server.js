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

// 中间件导入
const errorHandler = require("./middleware/errorHandler");

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
    // 初始化数据库
    await database.initialize();

    // 加载定时任务配置
    const { loadSchedulerConfig } = require("./config/loadScheduler");
    await loadSchedulerConfig();

    // 服务器启动
    app.listen(PORT, () => {
      console.log(`🚀 LibraryCoverStudio Backend running on port ${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/health`);
      console.log(`🔐 Auth endpoints: http://localhost:${PORT}/api/auth`);
      console.log(
        `📅 Media Sources: http://localhost:${PORT}/api/media-sources`
      );
      console.log(
        `⏰ Scheduled Tasks: http://localhost:${PORT}/api/scheduled-tasks`
      );
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
};

// 优雅关闭
process.on("SIGTERM", async () => {
  console.log("👋 SIGTERM received, shutting down gracefully");
  const { getInstance: getScheduler } = require("./services/schedulerService");
  getScheduler().stopAll();
  await database.close();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("👋 SIGINT received, shutting down gracefully");
  const { getInstance: getScheduler } = require("./services/schedulerService");
  getScheduler().stopAll();
  await database.close();
  process.exit(0);
});

// 启动服务器
startServer();

module.exports = app;
