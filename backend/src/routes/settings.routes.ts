import { exportConfiguration, previewCache, clearCache } from '../controllers/maintenance.controller.js';
import { Router } from 'express';
import { getSettings, updateSettings, getDefaultPrompt, defaultTemplateStatus, resetDefaultTemplates } from '../controllers/settings.controller.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { getGithubNetwork, updateGithubNetwork, testGithubNetwork } from '../controllers/githubNetwork.controller.js';

const router = Router();

// 所有设置接口都需要登录
router.get('/', authenticate, getSettings);
router.post('/', authenticate, requireRole('admin'), updateSettings);
router.get('/default-prompt', authenticate, getDefaultPrompt);
router.get('/network', authenticate, requireRole('admin'), getGithubNetwork);
router.post('/network', authenticate, requireRole('admin'), updateGithubNetwork);
router.post('/network/test', authenticate, requireRole('admin'), testGithubNetwork);

export { router as settingsRouter };

router.get('/export', authenticate, requireRole('admin'), exportConfiguration);
router.get('/cache', authenticate, requireRole('admin'), previewCache);
router.post('/cache/clear', authenticate, requireRole('admin'), clearCache);

router.get('/default-templates', authenticate, requireRole('admin'), defaultTemplateStatus);
router.post('/default-templates/restore', authenticate, requireRole('admin'), resetDefaultTemplates);
