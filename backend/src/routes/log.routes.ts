import { Router } from 'express';
import { authenticate } from '../middleware/index.js';
import * as log from '../controllers/log.controller.js';

const router: Router = Router();

// 所有路由需要认证
router.use(authenticate);

// 获取历史日志
router.get('/', log.getLogs);

export { router as logRouter };
