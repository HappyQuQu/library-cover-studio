import { Router } from 'express';
import { authenticate, requireRole, validate } from '../middleware/index.js';
import * as user from '../controllers/user.controller.js';

const router: Router = Router();

// 所有路由需要管理员权限
router.use(authenticate);
router.use(requireRole('admin'));

// 用户列表 (仅管理员)
router.get('/', requireRole('admin'), user.list);

// 创建用户 (仅管理员)
router.post('/', requireRole('admin'), validate(user.createUserSchema), user.create);

// 更新用户 (用户可更新自己，或管理员更新他人)
router.put('/:id', user.update);

// 删除用户 (仅管理员)
router.delete('/:id', requireRole('admin'), user.remove);

export { router as userRouter };
