import { exportConfiguration, previewCache, clearCache } from '../controllers/maintenance.controller.js';
import { Router } from 'express';
import { getSettings, updateSettings, getDefaultPrompt } from '../controllers/settings.controller.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

// 所有设置接口都需要登录
router.get('/', authenticate, getSettings);
router.post('/', authenticate, requireRole('admin'), updateSettings);
router.get('/default-prompt', authenticate, getDefaultPrompt);

export { router as settingsRouter };

router.get('/export', authenticate, requireRole('admin'), exportConfiguration);
router.get('/cache', authenticate, requireRole('admin'), previewCache);
router.post('/cache/clear', authenticate, requireRole('admin'), clearCache);
