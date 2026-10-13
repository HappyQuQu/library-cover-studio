import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../config/database.js';
import { templateStoreInstalls } from '../config/schema.js';
import { createError } from '../middleware/errorHandler.js';
import { getStoreCatalog, downloadStorePackage, STORE_URL, type StoreEntry } from '../services/templateStore.service.js';
import { saveTemplateVersion } from '../services/templateHistory.service.js';

export async function listStore(req: Request, res: Response, next: NextFunction) {
  try {
    const catalog = await getStoreCatalog();
    const query = typeof req.query.q === 'string' ? req.query.q.slice(0, 200).trim().toLocaleLowerCase() : '';
    const sort = req.query.sort === 'popular' ? 'popular' : 'name';
    const matches = catalog.data.templates.filter(entry => `${entry.name} ${entry.description} ${entry.folder}`.toLocaleLowerCase().includes(query))
      .sort((a, b) => sort === 'popular' ? b.downloadCount - a.downloadCount || a.name.localeCompare(b.name, 'zh-CN') : a.name.localeCompare(b.name, 'zh-CN'));
    const totalPages = Math.max(1, Math.ceil(matches.length / 24));
    const requestedPage = Number(req.query.page);
    const page = Math.min(totalPages, Math.max(1, Number.isSafeInteger(requestedPage) ? requestedPage : 1));
    const installs = db.select().from(templateStoreInstalls).where(eq(templateStoreInstalls.userId, req.user!.userId)).all();
    const installed = new Map(installs.map(item => [`${item.storeId}:${item.revision}`, item.templateId]));
    res.json({ repositoryUrl: STORE_URL, generatedAt: catalog.setupRequired ? null : catalog.data.generatedAt,
      stale: catalog.stale, setupRequired: catalog.setupRequired, pendingCount: catalog.data.pendingCount,
      total: matches.length, page, totalPages,
      templates: matches.slice((page - 1) * 24, page * 24).map(({ packageUrl: _url, packageSha256: _hash, ...entry }) => ({
        ...entry, installedTemplateId: installed.get(`${entry.id}:${entry.revision}`) || null
      })) });
  } catch (error) { next(error); }
}

const installing = new Map<string, Promise<{ id: string; name: string; alreadyInstalled: boolean }>>();
async function install(entry: StoreEntry, userId: string) {
  const existing = db.select().from(templateStoreInstalls).where(and(eq(templateStoreInstalls.userId, userId),
    eq(templateStoreInstalls.storeId, entry.id), eq(templateStoreInstalls.revision, entry.revision))).get();
  if (existing) return { id: existing.templateId, name: entry.name, alreadyInstalled: true };
  const { data, thumbnail } = await downloadStorePackage(entry);
  const id = randomUUID();
  const now = new Date().toISOString();
  await saveTemplateVersion(undefined, { id, name: data.name, description: data.description ?? null,
    canvasJson: data.canvasJson, width: data.width, height: data.height, userId,
    isPublic: 0, isLocked: 0, isDefault: 0, thumbnailPath: null, createdAt: now, updatedAt: now
  }, userId, 'save', thumbnail);
  db.insert(templateStoreInstalls).values({ userId, storeId: entry.id, revision: entry.revision, templateId: id }).run();
  return { id, name: data.name, alreadyInstalled: false };
}

export async function installStoreTemplate(req: Request, res: Response, next: NextFunction) {
  try {
    const catalog = await getStoreCatalog();
    const entry = catalog.data.templates.find(item => item.id === req.params.id);
    if (!entry) throw createError('商店中没有此模板，请刷新目录', 404, 'STORE_TEMPLATE_NOT_FOUND');
    const userId = req.user!.userId;
    const key = `${userId}:${entry.id}:${entry.revision}`;
    let pending = installing.get(key);
    if (!pending) {
      pending = install(entry, userId).finally(() => { installing.delete(key); });
      installing.set(key, pending);
    }
    const result = await pending;
    res.status(result.alreadyInstalled ? 200 : 201).json(result);
  } catch (error) { next(error); }
}
