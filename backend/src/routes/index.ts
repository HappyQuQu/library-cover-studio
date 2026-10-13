import { Router } from 'express';
import { authRouter } from './auth.routes.js';
import { serverRouter } from './server.routes.js';
import { templateRouter } from './template.routes.js';
import { templateStoreRouter } from './templateStore.routes.js';
import { taskRouter } from './task.routes.js';
import { settingsRouter } from './settings.routes.js';
import { fontRouter } from './font.routes.js';
import { logRouter } from './log.routes.js';
import { userRouter } from './user.routes.js';
import { statsRouter } from './stats.routes.js';
import aiProviderRouter from './aiProvider.routes.js';
import aiChatRouter from './aiChat.routes.js';

const router = Router();

// API 路由
router.use('/auth', authRouter);
router.use('/servers', serverRouter);
router.use('/templates', templateRouter);
router.use('/template-store', templateStoreRouter);
router.use('/tasks', taskRouter);
router.use('/settings', settingsRouter);
router.use('/fonts', fontRouter);
router.use('/logs', logRouter);
router.use('/users', userRouter);
router.use('/stats', statsRouter);
router.use('/ai-providers', aiProviderRouter);
router.use('/ai-chat', aiChatRouter);

export { router };
