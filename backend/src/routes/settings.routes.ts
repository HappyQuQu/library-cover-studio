import { exportConfiguration, previewCache, clearCache, previewImport, importConfiguration } from '../controllers/maintenance.controller.js';
import multer from 'multer';
import { MAX_CONFIGURATION_BYTES } from '../services/configurationRestore.service.js';
import { createError } from '../middleware/errorHandler.js';
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
const importUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_CONFIGURATION_BYTES, files: 1, fields: 3, fieldSize: 4096 } }).single('backup');
router.post(['/import/preview', '/import'], authenticate, requireRole('admin'), (req, res, next) => {
  importUpload(req, res, error => next(error ? createError('Invalid configuration upload', error.code === 'LIMIT_FILE_SIZE' ? 413 : 400,
    error.code === 'LIMIT_FILE_SIZE' ? 'CONFIGURATION_TOO_LARGE' : 'CONFIGURATION_INVALID') : undefined));
});
router.post('/import/preview', previewImport);
router.post('/import', importConfiguration);
router.get('/cache', authenticate, requireRole('admin'), previewCache);
router.post('/cache/clear', authenticate, requireRole('admin'), clearCache);

router.get('/default-templates', authenticate, requireRole('admin'), defaultTemplateStatus);
router.post('/default-templates/restore', authenticate, requireRole('admin'), resetDefaultTemplates);
