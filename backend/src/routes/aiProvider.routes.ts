import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  getAIProviders,
  createAIProvider,
  updateAIProvider,
  deleteAIProvider,
  testAIProvider
} from '../controllers/aiProvider.controller.js';

const router = Router();

router.use(authenticate);

router.get('/', getAIProviders);
router.post('/', createAIProvider);
router.put('/:id', updateAIProvider);
router.delete('/:id', deleteAIProvider);
router.post('/:id/test', testAIProvider);

export default router;
