import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { listStore, installStoreTemplate } from '../controllers/templateStore.controller.js';

const router = Router();
router.use(authenticate);
router.get('/', listStore);
router.post('/:id/install', installStoreTemplate);
export { router as templateStoreRouter };
