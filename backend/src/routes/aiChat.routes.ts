import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  generateTemplate,
  getConversations,
  getConversation,
  deleteConversation
} from '../controllers/aiChat.controller.js';

const router = Router();

router.use(authenticate);

router.post('/generate', generateTemplate);
router.get('/conversations', getConversations);
router.get('/conversations/:id', getConversation);
router.delete('/conversations/:id', deleteConversation);

export default router;
