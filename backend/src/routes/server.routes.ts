import { Router } from 'express';
import { authenticate, validate } from '../middleware/index.js';
import * as server from '../controllers/server.controller.js';

const router: Router = Router();

// 所有路由需要认证
router.use(authenticate);

// 获取服务器列表
router.get('/', server.list);

// 获取单个服务器
router.get('/:id', server.getById);

// 创建服务器
router.post('/', validate(server.createServerSchema), server.create);

// 更新服务器
router.put('/:id', validate(server.updateServerSchema), server.update);

// 删除服务器
router.delete('/:id', server.remove);

// 测试服务器连接
router.post('/:id/test', server.testServerConnection);

// 获取服务器的媒体库列表
router.get('/:id/libraries', server.listLibraries);

// 代理获取媒体项目图片
router.get('/:id/items/:itemId/image', server.proxyItemImage);

export { router as serverRouter };
