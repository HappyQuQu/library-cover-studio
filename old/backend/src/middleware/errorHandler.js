const errorHandler = (err, req, res, next) => {
  console.error("Error:", err);

  // Multer 错误处理
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({
      error: "文件太大",
      message: "上传的文件超过50MB限制",
    });
  }

  if (err.code === "LIMIT_FILE_COUNT") {
    return res.status(413).json({
      error: "文件数量超限",
      message: "最多只能上传10个文件",
    });
  }

  if (err.code === "LIMIT_UNEXPECTED_FILE") {
    return res.status(400).json({
      error: "意外的文件字段",
      message: err.message,
    });
  }

  // 数据库错误处理
  if (err.code === "23505") {
    // PostgreSQL unique constraint
    return res.status(409).json({
      error: "数据冲突",
      message: "该记录已存在",
    });
  }

  if (err.code === "23503") {
    // PostgreSQL foreign key constraint
    return res.status(400).json({
      error: "关联数据不存在",
      message: "引用的记录不存在",
    });
  }

  if (err.code === "23502") {
    // PostgreSQL not null constraint
    return res.status(400).json({
      error: "必填字段缺失",
      message: "必填字段不能为空",
    });
  }

  // JWT 错误处理
  if (err.name === "JsonWebTokenError") {
    return res.status(401).json({
      error: "无效的访问令牌",
      message: "JWT token is invalid",
    });
  }

  if (err.name === "TokenExpiredError") {
    return res.status(401).json({
      error: "访问令牌已过期",
      message: "JWT token has expired",
    });
  }

  // Redis 错误处理
  if (err.code === "ECONNREFUSED" && err.address === "127.0.0.1") {
    return res.status(503).json({
      error: "缓存服务不可用",
      message: "Redis连接失败",
    });
  }

  // 自定义业务错误
  if (err.status) {
    return res.status(err.status).json({
      error: err.message || "业务处理失败",
      code: err.code || "BUSINESS_ERROR",
    });
  }

  // 默认服务器错误
  const isDev = process.env.NODE_ENV === "development";

  res.status(500).json({
    error: "服务器内部错误",
    message: isDev ? err.message : "请稍后重试",
    ...(isDev && { stack: err.stack }),
  });
};

module.exports = errorHandler;
