import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  getAIProviders,
  createAIProvider,
  updateAIProvider,
  deleteAIProvider,
  testAIProvider,
  testAIProviderConfig
} from '../controllers/aiProvider.controller.js';

const router = Router();

router.use(authenticate);

router.get('/', getAIProviders);
router.post('/', createAIProvider);
router.post('/test-config', testAIProviderConfig); // 测试未保存的配置，必须在 /:id 路由之前
router.put('/:id', updateAIProvider);
router.delete('/:id', deleteAIProvider);
router.post('/:id/test', testAIProvider);

export default router;
