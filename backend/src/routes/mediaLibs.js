const express = require("express");
const router = express.Router();
const mediaLibController = require("../controllers/mediaLibController");
const { validateMediaLibrary } = require("../middleware/validation");
const { authenticate } = require("../middleware/auth");

// 获取所有媒体库配置
router.get("/", mediaLibController.getAllMediaLibraries);

// 根据ID获取媒体库配置
router.get("/:id", mediaLibController.getMediaLibraryById);

// 创建新媒体库配置（需要认证）
router.post(
  "/",
  authenticate,
  validateMediaLibrary,
  mediaLibController.createMediaLibrary
);

// 更新媒体库配置（需要认证）
router.put(
  "/:id",
  authenticate,
  validateMediaLibrary,
  mediaLibController.updateMediaLibrary
);

// 删除媒体库配置（需要认证）
router.delete("/:id", authenticate, mediaLibController.deleteMediaLibrary);

// 测试媒体库连接（需要认证）
router.post("/:id/test", authenticate, mediaLibController.testConnection);

// 同步媒体库数据（需要认证）
router.post("/:id/sync", authenticate, mediaLibController.syncMediaLibrary);

// 获取媒体库中的媒体项目
router.get("/:id/items", mediaLibController.getMediaItems);

module.exports = router;
