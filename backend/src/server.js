require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const path = require("path");

// 路由导入
const templateRoutes = require("./routes/templates");
const posterRoutes = require("./routes/posters");
const mediaLibRoutes = require("./routes/mediaLibs");
const scheduleRoutes = require("./routes/schedules");

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

// API路由
app.use("/api/templates", templateRoutes);
app.use("/api/posters", posterRoutes);
app.use("/api/media-libs", mediaLibRoutes);
app.use("/api/schedules", scheduleRoutes);

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

// 服务器启动
app.listen(PORT, () => {
  console.log(`🚀 LibraryCoverStudio Backend running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
});

// 优雅关闭
process.on("SIGTERM", () => {
  console.log("👋 SIGTERM received, shutting down gracefully");
  process.exit(0);
});

module.exports = app;
