import { Request, Response, NextFunction } from 'express';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { db } from '../config/database.js';
import { mediaServers } from '../config/schema.js';
import { eq } from 'drizzle-orm';
import { createError } from '../middleware/index.js';
import { encrypt, decrypt } from '../utils/crypto.js';
import { testConnection, getLibraries, getAuthHeaders } from '../services/mediaClient.service.js';

// 验证 Schema
export const createServerSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['jellyfin', 'emby']),
  url: z.string().url(),
  apiKey: z.string().min(1)
});

export const updateServerSchema = createServerSchema.partial();

// 获取服务器列表
export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.userId;
    console.log(`[Server] Listing servers for user: ${userId}`);
    
    let query = db.select({
      id: mediaServers.id,
      name: mediaServers.name,
      type: mediaServers.type,
      url: mediaServers.url,
      isActive: mediaServers.isActive,
      lastSyncAt: mediaServers.lastSyncAt,
      createdAt: mediaServers.createdAt
    })
    .from(mediaServers);

    const servers = userId 
      ? query.where(eq(mediaServers.userId, userId)).all()
      : query.all();

    console.log(`[Server] Found ${servers.length} servers`);
    res.json(servers);
  } catch (error) {
    console.error('[Server] List error:', error);
    next(error);
  }
}

// 获取单个服务器
export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    
    const server = db.select({
      id: mediaServers.id,
      name: mediaServers.name,
      type: mediaServers.type,
      url: mediaServers.url,
      isActive: mediaServers.isActive,
      lastSyncAt: mediaServers.lastSyncAt,
      createdAt: mediaServers.createdAt
    })
    .from(mediaServers)
    .where(eq(mediaServers.id, id as string))
    .get();

    if (!server) {
      return next(createError('Server not found', 404, 'SERVER_NOT_FOUND'));
    }

    res.json(server);
  } catch (error) {
    next(error);
  }
}

// 创建服务器
export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const { name, type, url, apiKey } = req.body;
    const userId = req.user?.userId;
    console.log(`[Server] Creating new server: ${name} (${type}) for user ${userId}`);

    // 测试连接
    const cleanUrl = url.replace(/\/$/, '');
    const isConnected = await testConnection(type, cleanUrl, apiKey);
    
    if (!isConnected) {
      console.warn(`[Server] Connection test failed for ${cleanUrl}`);
      return next(createError('Failed to connect to media server', 400, 'CONNECTION_FAILED'));
    }

    const now = new Date().toISOString();
    const id = uuidv4();
    const apiKeyEncrypted = encrypt(apiKey);

    const result = db.insert(mediaServers).values({
      id,
      name,
      type,
      url: cleanUrl,
      apiKeyEncrypted,
      userId,
      isActive: 1,
      createdAt: now,
      updatedAt: now
    }).run();

    console.log(`[Server] Server created successfully. ID: ${id}, Rows affected: ${result.changes}`);

    res.status(201).json({
      id,
      name,
      type,
      url: cleanUrl,
      isActive: true,
      createdAt: now
    });
  } catch (error) {
    console.error('[Server] Create error:', error);
    next(error);
  }
}

// 更新服务器
export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const updates = req.body;
    const now = new Date().toISOString();

    const existing = db.select().from(mediaServers).where(eq(mediaServers.id, id as string)).get();
    if (!existing) {
      return next(createError('Server not found', 404, 'SERVER_NOT_FOUND'));
    }

    const updateData: Record<string, unknown> = { updatedAt: now };
    
    if (updates.name) updateData.name = updates.name;
    if (updates.type) updateData.type = updates.type;
    if (updates.url) updateData.url = updates.url.replace(/\/$/, '');
    if (updates.apiKey) updateData.apiKeyEncrypted = encrypt(updates.apiKey);

    db.update(mediaServers)
      .set(updateData)
      .where(eq(mediaServers.id, id as string))
      .run();

    res.json({ message: 'Server updated successfully' });
  } catch (error) {
    next(error);
  }
}

// 删除服务器
export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;

    const result = db.delete(mediaServers).where(eq(mediaServers.id, id as string)).run();
    
    if (result.changes === 0) {
      return next(createError('Server not found', 404, 'SERVER_NOT_FOUND'));
    }

    res.json({ message: 'Server deleted successfully' });
  } catch (error) {
    next(error);
  }
}

// 测试服务器连接
export async function testServerConnection(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;

    const server = db.select().from(mediaServers).where(eq(mediaServers.id, id as string)).get();
    if (!server) {
      return next(createError('Server not found', 404, 'SERVER_NOT_FOUND'));
    }

    const apiKey = decrypt(server.apiKeyEncrypted);
    const isConnected = await testConnection(server.type, server.url, apiKey);

    res.json({ connected: isConnected });
  } catch (error) {
    next(error);
  }
}

// 获取服务器的媒体库列表
export async function listLibraries(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    console.log(`[Server] Fetching libraries for server ID: ${id}`);

    const server = db.select().from(mediaServers).where(eq(mediaServers.id, id as string)).get();
    if (!server) {
      console.warn(`[Server] Server not found for library listing: ${id}`);
      return next(createError('Server not found', 404, 'SERVER_NOT_FOUND'));
    }

    const apiKey = decrypt(server.apiKeyEncrypted);
    console.log(`[Server] Connecting to ${server.url} (${server.type})`);
    const baseUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3000}`;
    const libraries = await getLibraries(server.type, server.url, apiKey);

    // 获取当前请求的 Token 以便在图片 URL 中使用
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : '';

    // 将图片 URL 替换为代理 URL，并附加 Token
    const librariesWithProxy = libraries.map(lib => ({
      ...lib,
      imageUrl: `${baseUrl}/api/servers/${server.id}/items/${lib.id}/image?token=${token}`
    }));

    console.log(`[Server] Found ${libraries.length} libraries for ${server.name}`);
    res.json(librariesWithProxy);
  } catch (error) {
    console.error('[Server] List libraries error:', error);
    next(error);
  }
}

// 代理获取媒体项目图片
export async function proxyItemImage(req: Request, res: Response, next: NextFunction) {
  try {
    const { id, itemId } = req.params;

    const server = db.select().from(mediaServers).where(eq(mediaServers.id, id as string)).get();
    if (!server) {
      return next(createError('Server not found', 404, 'SERVER_NOT_FOUND'));
    }

    const apiKey = decrypt(server.apiKeyEncrypted);
    const endpoint = server.type === 'jellyfin'
      ? `${server.url}/Items/${itemId}/Images/Primary`
      : `${server.url}/emby/Items/${itemId}/Images/Primary`;

    const response = await axios.get(endpoint, {
      headers: getAuthHeaders(server.type, apiKey),
      responseType: 'stream',
      timeout: 10000
    });

    res.set('Content-Type', response.headers['content-type']);
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    response.data.pipe(res);
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return res.status(404).send('Image not found');
    }
    next(error);
  }
}
