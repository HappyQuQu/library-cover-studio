const express = require("express");
const router = express.Router();
const posterController = require("../controllers/posterController");
const { validatePosterGeneration } = require("../middleware/validation");

// 根据模板生成海报
router.post(
  "/generate",
  validatePosterGeneration,
  posterController.generatePoster
);

// 批量生成海报
router.post("/generate/batch", posterController.batchGeneratePoster);

// 获取生成历史
router.get("/history", posterController.getGenerationHistory);

// 预览海报
router.post("/preview", posterController.previewPoster);

module.exports = router;
