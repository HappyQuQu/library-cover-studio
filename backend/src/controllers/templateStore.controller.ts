import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { and, or, eq, desc, asc } from 'drizzle-orm';
import { db } from '../config/database.js';
import { templates, templateStoreInstalls } from '../config/schema.js';
import { APP_VERSION } from '../config/version.js';
import { createError } from '../middleware/errorHandler.js';
import { getStoreCatalog, downloadStorePackage, STORE_URL, type StoreEntry } from '../services/templateStore.service.js';
import { readTemplateMetadata, templateMetadataSchema, templateContentHash, supportsTemplateVersion } from '../services/templateMetadata.service.js';
import { saveTemplateVersion } from '../services/templateHistory.service.js';
import { recordStoreDownload, storeDownloadBaseline, storeDownloadCounts } from '../services/templateStoreCounts.service.js';
import { withTemplateFonts, type ImportedFont } from '../services/templateFonts.service.js';

export const storeUpdateSchema = z.object({ templateId: z.string().uuid(), revision: z.string().regex(/^[a-f0-9]{64}$/), strategy: z.enum(['replace', 'backup', 'copy']).optional() });
type Strategy = 'replace' | 'backup' | 'copy';
function localTemplates(userId: string) {
  return db.select().from(templates).where(or(eq(templates.userId, userId), and(eq(templates.isDefault, 1), eq(templates.isPublic, 1))))
    .orderBy(asc(templates.createdAt)).all();
}
function getInstalls(userId: string) {
  return db.select({ install: templateStoreInstalls, template: templates }).from(templateStoreInstalls)
    .innerJoin(templates, eq(templates.id, templateStoreInstalls.templateId))
    .where(and(eq(templateStoreInstalls.userId, userId), or(eq(templates.userId, userId), and(eq(templates.isDefault, 1), eq(templates.isPublic, 1)))))
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
    const requestedSize = Number(req.query.pageSize);
    const pageSize = [12, 24, 48, 96].includes(requestedSize) ? requestedSize : 24;
    const totalPages = Math.max(1, Math.ceil(matches.length / pageSize));
    const requestedPage = Number(req.query.page);
    const page = Math.min(totalPages, Math.max(1, Number.isSafeInteger(requestedPage) ? requestedPage : 1));
    const installs = getInstalls(req.user!.userId);
    const locals = localTemplates(req.user!.userId);
    const visible = matches.slice((page - 1) * pageSize, page * pageSize);
    const counts = await storeDownloadCounts(visible);
    res.json({ repositoryUrl: STORE_URL, generatedAt: catalog.setupRequired ? null : catalog.data.generatedAt,
      appVersion: APP_VERSION, stale: catalog.stale, setupRequired: catalog.setupRequired, pendingCount: catalog.data.pendingCount,
      total: matches.length, page, pageSize, totalPages,
      templates: visible.map(({ packageUrl: _url, packageSha256: _hash, downloadSources: _sources, ...entry }) => {
        const records = installs.filter(item => item.install.storeId === entry.id);
        const exact = records.find(item => item.install.revision === entry.revision);
        const previous = exact || records[0];
        const local = previous?.template || locals.find(item => item.name === entry.name && item.userId === req.user!.userId) || locals.find(item => item.name === entry.name);
        const state = previous ? updateMode(previous) : local ? { mode: local.isLocked ? 'copy' : 'replace', reason: '模板库已有同名模板，下载前请确认更新方式' } : null;
        return { ...entry, ...counts.get(entry.id), installedTemplateId: exact?.template.id || null,
          previousTemplateId: local?.id || null,
          installedVersion: local ? readTemplateMetadata(local.metadataJson).version : null,
          localMatch: !previous && !!local, localLocked: !!local && (!!local.isLocked || local.userId !== req.user!.userId),
          localModified: !!previous && state?.mode === 'copy' && !local?.isLocked,
          updateAvailable: !exact && !!local, updateMode: state?.mode || null, updateReason: state?.reason || '',
          compatible: supportsTemplateVersion(APP_VERSION, entry.minAppVersion) };
      }) });
  } catch (error) { next(error); }
}

type InstallResult = { id: string; name: string; version: string; alreadyInstalled: boolean; action: 'installed' | 'updated' | 'copied' | 'existing'; backupId?: string; fonts?: ImportedFont[] };
// Serialize operations for the same user/template, then re-read saved content.
const operations = new Map<string, Promise<InstallResult>>();
async function synchronize(entry: StoreEntry, userId: string, targetId?: string, strategy?: Strategy): Promise<InstallResult> {
  const records = getInstalls(userId).filter(item => item.install.storeId === entry.id);
  const local = localTemplates(userId).find(item => targetId ? item.id === targetId : item.name === entry.name);
  const target = targetId ? records.find(item => item.template.id === targetId) : records[0];
  const existing = target?.template || (local?.name === entry.name ? local : undefined);
  if (targetId && !existing) throw createError('此模板不属于你的模板库', 404, 'STORE_INSTALL_NOT_FOUND');
  const exact = records.find(item => item.install.revision === entry.revision);
  if (exact && (!strategy || (exact.install.contentHash && templateContentHash(exact.template) === exact.install.contentHash)))
    return { id: exact.template.id, name: exact.template.name, version: readTemplateMetadata(exact.template.metadataJson).version, alreadyInstalled: true, action: 'existing' };
  if (!supportsTemplateVersion(APP_VERSION, entry.minAppVersion)) throw createError(`此模板需要应用 ${entry.minAppVersion} 或更高版本，请先升级应用`, 409, 'STORE_APP_UPGRADE_REQUIRED');
  const countBaseline = storeDownloadBaseline(entry);
  const { data: packageData, thumbnail, fonts } = await downloadStorePackage(entry);
  recordStoreDownload(entry, countBaseline);
  return withTemplateFonts(fonts, packageData.canvasJson, async (canvasJson, importedFonts): Promise<InstallResult> => {
  const data = { ...packageData, canvasJson };
  const metadata = templateMetadataSchema.parse(data);
  const sameDesign = existing && templateContentHash({ ...existing, description: '', metadataJson: null }) === templateContentHash({ ...data, description: '', metadataJson: null });
  const sameContent = existing && templateContentHash(existing) === templateContentHash({ ...data, description: data.description || '', metadataJson: JSON.stringify(metadata) });
  if (existing && !target && !sameDesign && !strategy) throw createError('已有同名模板，请确认覆盖或先复制备份后更新', 409, 'STORE_CONFIRM_REQUIRED');
  if (existing && sameContent && (existing.isLocked || existing.userId !== userId)) {
    db.insert(templateStoreInstalls).values({ userId, storeId: entry.id, revision: entry.revision, templateId: existing.id,
      version: metadata.version, contentHash: templateContentHash(existing), installedAt: new Date().toISOString() })
      .onConflictDoNothing().run();
    return { id: existing.id, name: existing.name, version: metadata.version, alreadyInstalled: true, action: 'existing', fonts: importedFonts };
  }
  if (existing && (existing.isLocked || existing.userId !== userId) && (strategy === 'replace' || strategy === 'backup')) throw createError('模板已锁定或为共享默认模板，请添加新版副本', 409, 'TEMPLATE_LOCKED');
  const replace = existing && existing.userId === userId && !existing.isLocked && strategy !== 'copy' && (strategy || (!target && sameDesign) || (target && updateMode(target).mode === 'replace')) ? existing : undefined;
  let backupId: string | undefined;
  if (replace && strategy === 'backup') {
    backupId = randomUUID();
    await saveTemplateVersion(undefined, { ...replace, id: backupId, name: `${replace.name.slice(0, 85)} · 更新前备份`,
      userId, isPublic: 0, isDefault: 0, isLocked: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, userId);
  }
  const now = new Date().toISOString();
  const id = replace?.id || randomUUID();
  const next = { ...(replace || {}), id, name: data.name, description: data.description ?? null,
    canvasJson: data.canvasJson, metadataJson: JSON.stringify(metadata), width: data.width, height: data.height, userId,
    isPublic: replace?.isPublic || 0, isLocked: 0, isDefault: replace?.isDefault || 0,
    thumbnailPath: replace?.thumbnailPath || null, createdAt: replace?.createdAt || now, updatedAt: now };
  await saveTemplateVersion(replace, next, userId, 'save', thumbnail, undefined, (tx, saved) => {
    if (replace) tx.delete(templateStoreInstalls).where(and(eq(templateStoreInstalls.userId, userId), eq(templateStoreInstalls.storeId, entry.id), eq(templateStoreInstalls.templateId, id))).run();
    tx.insert(templateStoreInstalls).values({ userId, storeId: entry.id, revision: entry.revision, templateId: id,
      version: metadata.version, contentHash: templateContentHash(saved), installedAt: now }).onConflictDoUpdate({
        target: [templateStoreInstalls.userId, templateStoreInstalls.storeId, templateStoreInstalls.revision],
        set: { templateId: id, version: metadata.version, contentHash: templateContentHash(saved), installedAt: now }
      }).run();
  });
  return { id, name: data.name, version: metadata.version, alreadyInstalled: false, action: replace ? 'updated' : existing ? 'copied' : 'installed', backupId, fonts: importedFonts };
  });
}

async function handleInstall(req: Request, res: Response, next: NextFunction, update: boolean) {
  try {
    const catalog = await getStoreCatalog();
    const entry = catalog.data.templates.find(item => item.id === req.params.id);
    if (!entry) throw createError('商店中没有此模板，请刷新目录', 404, 'STORE_TEMPLATE_NOT_FOUND');
    if (req.body?.revision && req.body.revision !== entry.revision) throw createError('商店版本已更新，请刷新后重试', 409, 'STORE_VERSION_CHANGED');
    const userId = req.user!.userId, key = `${userId}:${entry.id}`;
    const pending = (operations.get(key) || Promise.resolve()).catch(() => undefined)
      .then(() => synchronize(entry, userId, update ? req.body.templateId : undefined, update ? req.body.strategy : undefined));
    operations.set(key, pending);
    try {
      const result = await pending;
      res.status(result.action === 'installed' || result.action === 'copied' ? 201 : 200).json(result);
    } finally { if (operations.get(key) === pending) operations.delete(key); }
  } catch (error) { next(error); }
}
export async function installStoreTemplate(req: Request, res: Response, next: NextFunction) { return handleInstall(req, res, next, false); }
export async function updateStoreTemplate(req: Request, res: Response, next: NextFunction) { return handleInstall(req, res, next, true); }
