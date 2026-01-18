import { Router } from 'express';
import { authenticate, validate } from '../middleware/index.js';
import * as template from '../controllers/template.controller.js';

const router = Router();

// 所有路由需要认证
router.use(authenticate);

// 获取模板列表
router.get('/', template.list);

// 获取单个模板
router.get('/:id', template.getById);

// 创建模板
router.post('/', validate(template.createTemplateSchema), template.create);

// 更新模板
router.put('/:id', validate(template.updateTemplateSchema), template.update);

// 删除模板
router.delete('/:id', template.remove);

// 复制模板
router.post('/:id/duplicate', template.duplicate);

export { router as templateRouter };
