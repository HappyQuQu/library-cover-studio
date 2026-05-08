import { Router } from 'express';
import { authenticate, validate } from '../middleware/index.js';
import * as auth from '../controllers/auth.controller.js';

const router = Router();

// 注册
router.post('/register', validate(auth.registerSchema), auth.register);

// 登录
router.post('/login', validate(auth.loginSchema), auth.login);

// 刷新 Access Token (使用 refresh token 换新 access token)
router.post('/refresh', auth.refresh);

// 获取当前用户信息
router.get('/me', authenticate, auth.me);

// 颁发 SSE 短期 ticket
router.post('/stream-ticket', authenticate, auth.streamTicket);

export { router as authRouter };
