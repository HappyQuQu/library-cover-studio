const jwt = require("jsonwebtoken");

const JWT_SECRET =
  process.env.JWT_SECRET || "your-secret-key-change-in-production";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

/**
 * 认证中间件 - 验证JWT token
 */
const authenticate = (req, res, next) => {
  try {
    // 从请求头获取token
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "No token provided",
      });
    }

    const token = authHeader.substring(7); // 移除 'Bearer ' 前缀

    // 验证token
    const decoded = jwt.verify(token, JWT_SECRET);

    // 将用户信息附加到请求对象
    req.user = {
      id: decoded.userId,
      username: decoded.username,
    };

    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Invalid token",
      });
    }
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Token expired",
      });
    }

    return res.status(500).json({
      error: "Internal Server Error",
      message: "Authentication error",
    });
  }
};

/**
 * 可选认证中间件 - 如果有token则验证，没有则继续
 */
const optionalAuthenticate = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      const decoded = jwt.verify(token, JWT_SECRET);

      req.user = {
        id: decoded.userId,
        username: decoded.username,
      };
    }

    next();
  } catch (error) {
    // 忽略错误，继续执行
    next();
  }
};

/**
 * 生成JWT token
 */
const generateToken = (userId, username) => {
  return jwt.sign({ userId, username }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
};

module.exports = {
  authenticate,
  optionalAuthenticate,
  generateToken,
  JWT_SECRET,
  JWT_EXPIRES_IN,
};
