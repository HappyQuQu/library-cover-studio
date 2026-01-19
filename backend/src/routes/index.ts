import { Router } from 'express';
import { authRouter } from './auth.routes.js';
import { serverRouter } from './server.routes.js';
import { templateRouter } from './template.routes.js';
import { taskRouter } from './task.routes.js';
import { settingsRouter } from './settings.routes.js';
import { fontRouter } from './font.routes.js';
import { logRouter } from './log.routes.js';
import { userRouter } from './user.routes.js';

const router = Router();

// API 路由
router.use('/auth', authRouter);
router.use('/servers', serverRouter);
router.use('/templates', templateRouter);
router.use('/tasks', taskRouter);
router.use('/settings', settingsRouter);
router.use('/fonts', fontRouter);
router.use('/logs', logRouter);
router.use('/users', userRouter);

export { router };
