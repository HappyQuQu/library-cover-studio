const express = require("express");
const router = express.Router();
const posterController = require("../controllers/posterController");
const { validatePosterGeneration } = require("../middleware/validation");
const { authenticate } = require("../middleware/auth");

// 根据模板生成海报（需要认证）
router.post(
  "/generate",
  authenticate,
  validatePosterGeneration,
  posterController.generatePoster
);

// 批量生成海报（需要认证）
router.post(
  "/generate/batch",
  authenticate,
  posterController.batchGeneratePoster
);

// 获取生成历史
router.get("/history", authenticate, posterController.getGenerationHistory);

// 预览海报（需要认证）
router.post("/preview", authenticate, posterController.previewPoster);

module.exports = router;
