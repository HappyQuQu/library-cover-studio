import { Router } from 'express';
import { authRouter } from './auth.routes.js';
import { serverRouter } from './server.routes.js';
import { templateRouter } from './template.routes.js';
import { taskRouter } from './task.routes.js';
import { settingsRouter } from './settings.routes.js';

const router = Router();

// API 路由
router.use('/auth', authRouter);
router.use('/servers', serverRouter);
router.use('/templates', templateRouter);
router.use('/tasks', taskRouter);
router.use('/settings', settingsRouter);

export { router };
