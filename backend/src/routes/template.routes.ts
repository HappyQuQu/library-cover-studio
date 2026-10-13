import { Router } from 'express';
import { authenticate, validate, createError } from '../middleware/index.js';
import * as template from '../controllers/template.controller.js';
import multer from 'multer';
import fs from 'fs';

import { TEMP_DIR } from '../config/paths.js';
import path from 'path';

const router = Router();

// Ensure temp directory for imports
const tempDir = path.join(TEMP_DIR, 'imports');
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
router.get('/:id/thumbnail', template.thumbnail);
router.get('/:id/history', template.history);
router.get('/:id/history/:revisionId/thumbnail', template.historyThumbnail);
router.post('/:id/history/:revisionId/restore', template.restoreRevision);

// 导入模板 (ZIP) - 放在 :id 路由之前以防火墙冲突
router.post('/import', (req, res, next) => upload.single('file')(req, res, error => {
    if (!error) return next();
    if (error instanceof multer.MulterError) return next(createError(error.code === 'LIMIT_FILE_SIZE'
        ? '模板包超过 5 MB，请压缩预览图后重新打包。' : '请一次选择一个 ZIP 模板包上传。', 400, 'INVALID_TEMPLATE'));
    return next(error);
}), template.importTemplate);

// 创建模板
router.post('/', validate(template.createTemplateSchema), template.create);

// 更新模板
router.put('/:id', validate(template.updateTemplateSchema), template.update);

// 删除模板
router.delete('/:id', template.remove);

// 复制模板
router.post('/:id/duplicate', template.duplicate);
router.post('/:id/lock', validate(template.lockTemplateSchema), template.setLock);

// 导出模板 (ZIP)
router.get('/:id/export', template.exportTemplate);

export { router as templateRouter };
