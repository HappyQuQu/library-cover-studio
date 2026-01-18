import { Router } from 'express';
import { getSettings, updateSettings } from '../controllers/settings.controller.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

// 所有设置接口都需要登录，更新接口需要管理员权限
router.get('/', authenticate, getSettings);
router.post('/', authenticate, requireRole('admin'), updateSettings);

export { router as settingsRouter };
