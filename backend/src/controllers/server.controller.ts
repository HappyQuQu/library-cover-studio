import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { db } from '../config/database.js';
import { mediaServers } from '../config/schema.js';
import { eq } from 'drizzle-orm';
import { createError } from '../middleware/index.js';
import { encrypt, decrypt } from '../utils/crypto.js';
import { getServerInfo, getLibraries, getCoverTargets, downloadCover, imageMimeType, normalizeServerUrl } from '../services/mediaClient.service.js';

function accessibleServer(req: Request) {
  const server = db.select().from(mediaServers).where(eq(mediaServers.id, req.params.id as string)).get();
  if (!server) throw createError('Server not found', 404, 'SERVER_NOT_FOUND');
  if (req.user?.role !== 'admin' && server.userId !== req.user?.userId) throw createError('无权访问此媒体服务器', 403, 'FORBIDDEN');
  return server;
}

// 验证 Schema
export const createServerSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['jellyfin', 'emby']),
  url: z.string().url(),
  apiKey: z.string().trim().min(1)
});

export const updateServerSchema = createServerSchema.partial();

// 获取服务器列表
export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.userId;
    const role = req.user?.role;
    console.log(`[Server] Listing servers for user: ${userId} (Role: ${role})`);

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

    const servers = role === 'admin'
      ? query.all()
      : query.where(eq(mediaServers.userId, userId as string)).all();

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

    const server = accessibleServer(req);
    res.json({ id, name: server.name, type: server.type, url: server.url, isActive: !!server.isActive,
      lastSyncAt: server.lastSyncAt, createdAt: server.createdAt });
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
    const cleanUrl = normalizeServerUrl(url);
    await getServerInfo(type, cleanUrl, apiKey, true);

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

    // Permission check
    if (req.user?.role !== 'admin' && existing.userId !== req.user?.userId) {
      return next(createError('Forbidden: Access denied to this server', 403, 'FORBIDDEN'));
    }

    const updateData: Record<string, unknown> = { updatedAt: now };

    if (updates.name) updateData.name = updates.name;
    if (updates.type) updateData.type = updates.type;
    if (updates.url) updateData.url = normalizeServerUrl(updates.url);
    if (updates.apiKey) updateData.apiKeyEncrypted = encrypt(updates.apiKey);
    if (updates.url || updates.apiKey || updates.type) {
      await getServerInfo(updates.type || existing.type, String(updateData.url || existing.url), updates.apiKey || decrypt(existing.apiKeyEncrypted), true);
    }

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

    const existing = db.select().from(mediaServers).where(eq(mediaServers.id, id as string)).get();
    if (!existing) {
      return next(createError('Server not found', 404, 'SERVER_NOT_FOUND'));
    }

    // Permission check
    if (req.user?.role !== 'admin' && existing.userId !== req.user?.userId) {
      return next(createError('Forbidden: Access denied to this server', 403, 'FORBIDDEN'));
    }

    db.delete(mediaServers).where(eq(mediaServers.id, id as string)).run();

    res.json({ message: 'Server deleted successfully' });
  } catch (error) {
    next(error);
  }
}

// 测试服务器连接
export async function testServerConnection(req: Request, res: Response, next: NextFunction) {
  try {
    const server = accessibleServer(req);
    const apiKey = decrypt(server.apiKeyEncrypted);
    try {
      const info = await getServerInfo(server.type, server.url, apiKey, true);
      res.json({ connected: true, version: info.version, serverName: info.name, product: info.product });
    } catch (error: any) {
      res.json({ connected: false, error: error.message, code: error.code });
    }
  } catch (error) {
    next(error);
  }
}

// 获取服务器的媒体库列表
export async function listLibraries(req: Request, res: Response, next: NextFunction) {
  return listTargets(req, res, next, false);
}

export async function listCoverTargets(req: Request, res: Response, next: NextFunction) {
  return listTargets(req, res, next, true);
}

async function listTargets(req: Request, res: Response, next: NextFunction, includeCollections: boolean) {
  try {
    const { id } = req.params;
    console.log(`[Server] Fetching libraries for server ID: ${id}`);

    const server = accessibleServer(req);

    const apiKey = decrypt(server.apiKeyEncrypted);
    console.log(`[Server] Connecting to ${server.url} (${server.type})`);
    const libraries = await (includeCollections ? getCoverTargets : getLibraries)(server.type, server.url, apiKey);
    // Same-origin image URLs work through Docker/reverse proxies; clients authenticate in headers.
    const librariesWithProxy = libraries.map(({ imageItemId, ...lib }) => ({
      ...lib,
      imageUrl: `/api/servers/${server.id}/items/${encodeURIComponent(imageItemId || lib.id)}/image`
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
    const { itemId } = req.params;
    const server = accessibleServer(req);
    const apiKey = decrypt(server.apiKeyEncrypted);
    const controller = new AbortController();
    const cancel = () => controller.abort();
    res.on('close', cancel);
    try {
      const image = await downloadCover(server.type, server.url, apiKey, itemId as string, 'Primary', { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (!image) return res.status(404).send('Image not found');
      res.type(imageMimeType(image)!).set('Cache-Control', 'private, no-store').send(image);
    } catch (error) { if (!controller.signal.aborted) throw error; }
    finally { res.off('close', cancel); }
  } catch (error) {
    next(error);
  }
}
