import { Router } from 'express';
import { authenticate, validate } from '../middleware/index.js';
import * as task from '../controllers/task.controller.js';

const router = Router();

// 所有路由需要认证
router.use(authenticate);

// 获取任务列表
router.get('/', task.list);

// 获取单个任务
router.get('/:id', task.getById);

// 创建任务
router.post('/', validate(task.createTaskSchema), task.create);

// 更新任务
router.put('/:id', validate(task.updateTaskSchema), task.update);

// 删除任务
router.delete('/:id', task.remove);

// 立即执行任务
router.post('/:id/run', task.runNow);

// 切换状态
router.post('/:id/toggle', task.toggleStatus);

// 获取任务日志
router.get('/:id/logs', task.getLogs);

export { router as taskRouter };
