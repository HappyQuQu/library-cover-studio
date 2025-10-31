const logger = require('../services/logger').system;

/**
 * 请求日志中间件 - 记录所有API请求
 */
const requestLogger = (req, res, next) => {
  // 排除日志查询接口，避免日志无限循环
  if (req.originalUrl.startsWith('/api/logs')) {
    return next();
  }

  const startTime = Date.now();
  const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  // 记录请求
  const meta = {
    requestId,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('user-agent'),
  };

  // 不记录敏感信息的请求体
  if (req.body && Object.keys(req.body).length > 0) {
    const sanitizedBody = { ...req.body };
    if (sanitizedBody.password) sanitizedBody.password = '***';
    if (sanitizedBody.currentPassword) sanitizedBody.currentPassword = '***';
    if (sanitizedBody.newPassword) sanitizedBody.newPassword = '***';
    if (sanitizedBody.apiKey) sanitizedBody.apiKey = '***';
    meta.body = sanitizedBody;
  }

  logger.info(`请求: ${req.method} ${req.originalUrl}`, meta);

  // 记录响应
  const originalSend = res.send;
  res.send = function (data) {
    const duration = Date.now() - startTime;
    const responseMeta = {
      requestId,
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
    };

    // 只在错误或慢请求时记录响应内容
    if (res.statusCode >= 400 || duration > 1000) {
      const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
      logger[level](
        `响应: ${req.method} ${req.originalUrl} [${res.statusCode}] ${duration}ms`,
        responseMeta
      );
    }

    originalSend.apply(res, arguments);
  };

  next();
};

module.exports = requestLogger;
