import { Router } from 'express';
import { authenticate, validate } from '../middleware/index.js';
import * as template from '../controllers/template.controller.js';
import multer from 'multer';
import fs from 'fs';

const router = Router();

// Ensure temp directory for imports
const tempDir = 'backend/data/temp/imports';
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, tempDir);
    },
    filename: (_req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB max ZIP
});

// 所有路由需要认证
router.use(authenticate);

// 获取模板列表
router.get('/', template.list);

// 获取单个模板
router.get('/:id', template.getById);

// 导入模板 (ZIP) - 放在 :id 路由之前以防火墙冲突
router.post('/import', upload.single('file'), template.importTemplate);

// 创建模板
router.post('/', validate(template.createTemplateSchema), template.create);

// 更新模板
router.put('/:id', validate(template.updateTemplateSchema), template.update);

// 删除模板
router.delete('/:id', template.remove);

// 复制模板
router.post('/:id/duplicate', template.duplicate);

// 导出模板 (ZIP)
router.get('/:id/export', template.exportTemplate);

export { router as templateRouter };
