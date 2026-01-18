const bcrypt = require("bcryptjs");
const database = require("../services/database");
const { generateToken } = require("../middleware/auth");
const logger = require("../services/logger").system;

/**
 * 用户登录
 */
const login = async (req, res, next) => {
  try {
    const { username, password } = req.body;

    // 验证输入
    if (!username || !password) {
      await logger.warn('登录失败：缺少用户名或密码', { username });
      return res.status(400).json({
        error: "Bad Request",
        message: "Username and password are required",
      });
    }

    const db = database.getDb();

    // 查找用户
    const user = await db.get("SELECT * FROM users WHERE username = ?", [
      username,
    ]);

    if (!user) {
      await logger.warn('登录失败：用户不存在', { username });
      return res.status(401).json({
        error: "Unauthorized",
        message: "Invalid username or password",
      });
    }

    // 验证密码
    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      await logger.warn('登录失败：密码错误', { username });
      return res.status(401).json({
        error: "Unauthorized",
        message: "Invalid username or password",
      });
    }

    // 生成token
    const token = generateToken(user.id, user.username);

    await logger.info('用户登录成功', {
      userId: user.id,
      username: user.username,
      ip: req.ip || req.connection.remoteAddress,
    });

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          created_at: user.created_at,
        },
      },
    });
  } catch (error) {
    await logger.error('登录异常', {
      error: error.message,
      stack: error.stack,
    });
    next(error);
  }
};

/**
 * 获取当前用户信息
 */
const getCurrentUser = async (req, res, next) => {
  try {
    const db = database.getDb();
    const user = await db.get(
      "SELECT id, username, created_at, updated_at FROM users WHERE id = ?",
      [req.user.id]
    );

    if (!user) {
      return res.status(404).json({
        error: "Not Found",
        message: "User not found",
      });
    }

    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 修改用户名
 */
const updateUsername = async (req, res, next) => {
  try {
    const { newUsername } = req.body;

    if (!newUsername || newUsername.trim().length === 0) {
      return res.status(400).json({
        error: "Bad Request",
        message: "New username is required",
      });
    }

    // 验证用户名格式（3-20个字符，只允许字母、数字、下划线）
    const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
    if (!usernameRegex.test(newUsername)) {
      return res.status(400).json({
        error: "Bad Request",
        message:
          "Username must be 3-20 characters and contain only letters, numbers, and underscores",
      });
    }

    const db = database.getDb();

    // 检查新用户名是否已存在
    const existingUser = await db.get(
      "SELECT id FROM users WHERE username = ? AND id != ?",
      [newUsername, req.user.id]
    );

    if (existingUser) {
      return res.status(409).json({
        error: "Conflict",
        message: "Username already exists",
      });
    }

    // 更新用户名
    await db.run("UPDATE users SET username = ? WHERE id = ?", [
      newUsername,
      req.user.id,
    ]);

    // 获取更新后的用户信息
    const updatedUser = await db.get(
      "SELECT id, username, created_at, updated_at FROM users WHERE id = ?",
      [req.user.id]
    );

    // 生成新的token（因为用户名变了）
    const newToken = generateToken(updatedUser.id, updatedUser.username);

    res.json({
      success: true,
      data: {
        user: updatedUser,
        token: newToken,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 修改密码
 */
const updatePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        error: "Bad Request",
        message: "Current password and new password are required",
      });
    }

    // 验证新密码长度
    if (newPassword.length < 6) {
      return res.status(400).json({
        error: "Bad Request",
        message: "New password must be at least 6 characters long",
      });
    }

    const db = database.getDb();

    // 获取当前用户
    const user = await db.get("SELECT * FROM users WHERE id = ?", [
      req.user.id,
    ]);

    if (!user) {
      return res.status(404).json({
        error: "Not Found",
        message: "User not found",
      });
    }

    // 验证当前密码
    const isValidPassword = await bcrypt.compare(
      currentPassword,
      user.password
    );

    if (!isValidPassword) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Current password is incorrect",
      });
    }

    // Hash新密码
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // 更新密码
    await db.run("UPDATE users SET password = ? WHERE id = ?", [
      hashedPassword,
      req.user.id,
    ]);

    res.json({
      success: true,
      message: "Password updated successfully",
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  login,
  getCurrentUser,
  updateUsername,
  updatePassword,
};
