import { Router } from 'express';
import { getDashboardStats } from '../controllers/stats.controller.js';
import { authenticate } from '../middleware/index.js';

const router = Router();

// 获取仪表盘统计
router.get('/', authenticate, getDashboardStats);

export { router as statsRouter };
