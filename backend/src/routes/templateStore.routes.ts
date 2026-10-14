import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { listStore, previewStoreTemplate, installStoreTemplate, updateStoreTemplate, storeUpdateSchema } from '../controllers/templateStore.controller.js';
import { validate } from '../middleware/validation.js';

const router = Router();
router.use(authenticate);
router.get('/', listStore);
router.get('/:id/preview', previewStoreTemplate);
router.post('/:id/install', installStoreTemplate);
router.post('/:id/update', validate(storeUpdateSchema), updateStoreTemplate);
export { router as templateStoreRouter };
