const express = require("express");
const router = express.Router();
const templateController = require("../controllers/templateController");
const { validateTemplate } = require("../middleware/validation");
const upload = require("../middleware/upload");
const { authenticate } = require("../middleware/auth");

// 获取所有模板
router.get("/", authenticate, templateController.getAllTemplates);

// 根据ID获取模板
router.get("/:id", authenticate, templateController.getTemplateById);

// 创建新模板（需要认证）
router.post(
  "/",
  authenticate,
  upload.single("preview"),
  validateTemplate,
  templateController.createTemplate
);

// 更新模板（需要认证）
router.put(
  "/:id",
  authenticate,
  upload.single("preview"),
  validateTemplate,
  templateController.updateTemplate
);

// 删除模板（需要认证）
router.delete("/:id", authenticate, templateController.deleteTemplate);

// 复制模板
router.post("/:id/duplicate", authenticate, templateController.duplicateTemplate);

// 导出模板
router.get("/:id/export", authenticate, templateController.exportTemplate);

module.exports = router;
