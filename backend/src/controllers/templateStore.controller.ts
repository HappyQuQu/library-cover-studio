import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { and, eq, desc } from 'drizzle-orm';
import { db } from '../config/database.js';
import { templates, templateStoreInstalls } from '../config/schema.js';
import { APP_VERSION } from '../config/version.js';
import { createError } from '../middleware/errorHandler.js';
import { getStoreCatalog, downloadStorePackage, STORE_URL, type StoreEntry } from '../services/templateStore.service.js';
import { readTemplateMetadata, templateMetadataSchema, templateContentHash, supportsTemplateVersion } from '../services/templateMetadata.service.js';
import { saveTemplateVersion } from '../services/templateHistory.service.js';

export const storeUpdateSchema = z.object({ templateId: z.string().uuid(), revision: z.string().regex(/^[a-f0-9]{64}$/) });
function getInstalls(userId: string) {
  return db.select({ install: templateStoreInstalls, template: templates }).from(templateStoreInstalls)
    .innerJoin(templates, eq(templates.id, templateStoreInstalls.templateId))
    .where(and(eq(templateStoreInstalls.userId, userId), eq(templates.userId, userId)))
    .orderBy(desc(templateStoreInstalls.installedAt), desc(templates.createdAt)).all();
}
type Installed = ReturnType<typeof getInstalls>[number];
function updateMode(item: Installed) {
  if (item.template.isLocked) return { mode: 'copy', reason: '模板已锁定，将添加新版副本' };
  if (!item.install.contentHash) return { mode: 'copy', reason: '无法确认是否有本地修改，将保留旧模板并添加新版副本' };
  try {
    if (templateContentHash(item.template) !== item.install.contentHash) return { mode: 'copy', reason: '本地设计或说明已修改，将保留修改并添加新版副本' };
  } catch { return { mode: 'copy', reason: '旧模板内容无法确认，将保留旧版并添加新版副本' }; }
  return { mode: 'replace', reason: '更新当前模板，自动化继续使用，原版本可从历史回退' };
}

export async function listStore(req: Request, res: Response, next: NextFunction) {
  try {
    const catalog = await getStoreCatalog();
    const query = typeof req.query.q === 'string' ? req.query.q.slice(0, 200).trim().toLocaleLowerCase() : '';
    const sort = req.query.sort === 'popular' ? 'popular' : 'name';
    const matches = catalog.data.templates.filter(entry => `${entry.name} ${entry.description} ${entry.folder} ${entry.author?.name || ''}`.toLocaleLowerCase().includes(query))
      .sort((a, b) => sort === 'popular' ? b.downloadCount - a.downloadCount || a.name.localeCompare(b.name, 'zh-CN') : a.name.localeCompare(b.name, 'zh-CN'));
    const totalPages = Math.max(1, Math.ceil(matches.length / 24));
    const requestedPage = Number(req.query.page);
    const page = Math.min(totalPages, Math.max(1, Number.isSafeInteger(requestedPage) ? requestedPage : 1));
    const installs = getInstalls(req.user!.userId);
    res.json({ repositoryUrl: STORE_URL, generatedAt: catalog.setupRequired ? null : catalog.data.generatedAt,
      appVersion: APP_VERSION, stale: catalog.stale, setupRequired: catalog.setupRequired, pendingCount: catalog.data.pendingCount,
      total: matches.length, page, totalPages,
      templates: matches.slice((page - 1) * 24, page * 24).map(({ packageUrl: _url, packageSha256: _hash, ...entry }) => {
        const records = installs.filter(item => item.install.storeId === entry.id);
        const exact = records.find(item => item.install.revision === entry.revision);
        const previous = exact || records[0];
        const state = previous ? updateMode(previous) : null;
        return { ...entry, installedTemplateId: exact?.template.id || null,
          previousTemplateId: previous?.template.id || null,
          installedVersion: previous?.install.version ? readTemplateMetadata(previous.template.metadataJson).version : null,
          updateAvailable: !exact && !!previous, updateMode: state?.mode || null, updateReason: state?.reason || '',
          compatible: supportsTemplateVersion(APP_VERSION, entry.minAppVersion) };
      }) });
  } catch (error) { next(error); }
}

type InstallResult = { id: string; name: string; version: string; alreadyInstalled: boolean; action: 'installed' | 'updated' | 'copied' | 'existing' };
// Serialize operations for the same user/template, then re-read saved content.
const operations = new Map<string, Promise<InstallResult>>();
async function synchronize(entry: StoreEntry, userId: string, targetId?: string): Promise<InstallResult> {
  const records = getInstalls(userId).filter(item => item.install.storeId === entry.id);
  const target = targetId ? records.find(item => item.template.id === targetId) : undefined;
  if (targetId && !target) throw createError('此模板不属于你的商店安装记录', 404, 'STORE_INSTALL_NOT_FOUND');
  const exact = records.find(item => item.install.revision === entry.revision);
  if (exact) return { id: exact.template.id, name: exact.template.name, version: readTemplateMetadata(exact.template.metadataJson).version, alreadyInstalled: true, action: 'existing' };
  if (!supportsTemplateVersion(APP_VERSION, entry.minAppVersion)) throw createError(`此模板需要应用 ${entry.minAppVersion} 或更高版本，请先升级应用`, 409, 'STORE_APP_UPGRADE_REQUIRED');
  const replace = target && updateMode(target).mode === 'replace' ? target : undefined;
  const { data, thumbnail } = await downloadStorePackage(entry);
  const metadata = templateMetadataSchema.parse(data);
  const now = new Date().toISOString();
  const id = replace?.template.id || randomUUID();
  const next = { ...(replace?.template || {}), id, name: data.name, description: data.description ?? null,
    canvasJson: data.canvasJson, metadataJson: JSON.stringify(metadata), width: data.width, height: data.height, userId,
    isPublic: replace?.template.isPublic || 0, isLocked: 0, isDefault: 0,
    thumbnailPath: replace?.template.thumbnailPath || null, createdAt: replace?.template.createdAt || now, updatedAt: now };
  await saveTemplateVersion(replace?.template, next, userId, 'save', thumbnail, undefined, (tx, saved) => {
    if (replace) tx.delete(templateStoreInstalls).where(and(eq(templateStoreInstalls.userId, userId), eq(templateStoreInstalls.storeId, entry.id), eq(templateStoreInstalls.templateId, id))).run();
    tx.insert(templateStoreInstalls).values({ userId, storeId: entry.id, revision: entry.revision, templateId: id,
      version: metadata.version, contentHash: templateContentHash(saved), installedAt: now }).run();
  });
  return { id, name: data.name, version: metadata.version, alreadyInstalled: false, action: replace ? 'updated' : target ? 'copied' : 'installed' };
}

async function handleInstall(req: Request, res: Response, next: NextFunction, update: boolean) {
  try {
    const catalog = await getStoreCatalog();
    const entry = catalog.data.templates.find(item => item.id === req.params.id);
    if (!entry) throw createError('商店中没有此模板，请刷新目录', 404, 'STORE_TEMPLATE_NOT_FOUND');
    if (req.body?.revision && req.body.revision !== entry.revision) throw createError('商店版本已更新，请刷新后重试', 409, 'STORE_VERSION_CHANGED');
    const userId = req.user!.userId, key = `${userId}:${entry.id}`;
    const pending = (operations.get(key) || Promise.resolve()).catch(() => undefined)
      .then(() => synchronize(entry, userId, update ? req.body.templateId : undefined));
    operations.set(key, pending);
    try {
      const result = await pending;
      res.status(result.action === 'installed' || result.action === 'copied' ? 201 : 200).json(result);
    } finally { if (operations.get(key) === pending) operations.delete(key); }
  } catch (error) { next(error); }
}
export async function installStoreTemplate(req: Request, res: Response, next: NextFunction) { return handleInstall(req, res, next, false); }
export async function updateStoreTemplate(req: Request, res: Response, next: NextFunction) { return handleInstall(req, res, next, true); }
