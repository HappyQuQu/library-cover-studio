const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const logger = require("../services/logger");
const { authenticate } = require("../middleware/auth");

// 获取系统日志（尾部若干行）
router.get("/system", authenticate, async (req, res) => {
  const lines = Math.min(parseInt(req.query.lines || "200", 10) || 200, 5000);
  const text = await logger.tail.system(lines);
  res.type("text/plain").send(text);
});

// 获取定时任务日志（尾部若干行）
router.get("/tasks", authenticate, async (req, res) => {
  const lines = Math.min(parseInt(req.query.lines || "200", 10) || 200, 5000);
  const text = await logger.tail.tasks(lines);
  res.type("text/plain").send(text);
});

// 下载日志文件
router.get("/:type/download", (req, res, next) => {
  // 允许从 query 参数获取 token，因为 window.open 无法设置 header
  if (req.query.token) {
    req.headers.authorization = `Bearer ${req.query.token}`;
  }
  next();
}, authenticate, async (req, res) => {
  const { type } = req.params;
  let filePath;
  if (type === "system") filePath = logger.files.SYSTEM_LOG;
  else if (type === "tasks") filePath = logger.files.TASKS_LOG;
  else return res.status(400).json({ error: "unknown log type" });

  res.download(filePath, path.basename(filePath));
});

module.exports = router;
