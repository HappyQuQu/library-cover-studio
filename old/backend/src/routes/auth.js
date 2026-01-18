const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const { authenticate } = require("../middleware/auth");

/**
 * @route   POST /api/auth/login
 * @desc    用户登录
 * @access  Public
 */
router.post("/login", authController.login);

/**
 * @route   GET /api/auth/me
 * @desc    获取当前用户信息
 * @access  Private
 */
router.get("/me", authenticate, authController.getCurrentUser);

/**
 * @route   PUT /api/auth/username
 * @desc    修改用户名
 * @access  Private
 */
router.put("/username", authenticate, authController.updateUsername);

/**
 * @route   PUT /api/auth/password
 * @desc    修改密码
 * @access  Private
 */
router.put("/password", authenticate, authController.updatePassword);

module.exports = router;
