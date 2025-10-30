const express = require("express");
const router = express.Router();
const templateController = require("../controllers/templateController");
const { validateTemplate } = require("../middleware/validation");
const upload = require("../middleware/upload");

// 获取所有模板
router.get("/", templateController.getAllTemplates);

// 根据ID获取模板
router.get("/:id", templateController.getTemplateById);

// 创建新模板
router.post(
  "/",
  upload.single("preview"),
  validateTemplate,
  templateController.createTemplate
);

// 更新模板
router.put(
  "/:id",
  upload.single("preview"),
  validateTemplate,
  templateController.updateTemplate
);

// 删除模板
router.delete("/:id", templateController.deleteTemplate);

// 复制模板
router.post("/:id/duplicate", templateController.duplicateTemplate);

// 导出模板
router.get("/:id/export", templateController.exportTemplate);

module.exports = router;
