import { Router } from 'express';
import { getSettings, updateSettings, getDefaultPrompt } from '../controllers/settings.controller.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// 所有设置接口都需要登录
router.get('/', authenticate, getSettings);
router.post('/', authenticate, updateSettings);
router.get('/default-prompt', authenticate, getDefaultPrompt);

export { router as settingsRouter };
