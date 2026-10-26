import type { Request, Response, NextFunction } from 'express';
import { db } from '../config/database.js';
import { templates, tasks, mediaServers, aiProviders } from '../config/schema.js';
import { readRuntimeSettings } from '../services/runtimeSettings.service.js';
import { cacheCandidates, cleanCache } from '../services/maintenance.service.js';
import { previewConfiguration, restoreConfiguration } from '../services/configurationRestore.service.js';
import { createError } from '../middleware/errorHandler.js';

function publicUrl(value: string) {
  try { const url = new URL(value); url.username = ''; url.password = ''; url.search = ''; url.hash = ''; return url.toString(); }
  catch { return ''; }
}

export function exportConfiguration(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ version: 1, exportedAt: new Date().toISOString(),
      description: '配置导出；不包含账号密码、API 密钥、历史图片或字体文件，恢复连接需重新填写密钥。',
      settings: readRuntimeSettings(), templates: db.select().from(templates).all(), tasks: db.select().from(tasks).all(),
      servers: db.select().from(mediaServers).all().map(({ apiKeyEncrypted: _key, url, ...server }) => ({ ...server, url: publicUrl(url) })),
      aiProviders: db.select().from(aiProviders).all().map(({ apiKeyEncrypted: _key, apiUrl, ...provider }) => ({ ...provider, apiUrl: publicUrl(apiUrl) }))
    });
  } catch (error) { next(error); }
}
export async function previewCache(_req: Request, res: Response, next: NextFunction) {
  try { const files = await cacheCandidates(); res.json({ files: files.length, bytes: files.reduce((sum, file) => sum + file.bytes, 0) }); }
  catch (error) { next(error); }
}
export async function clearCache(_req: Request, res: Response, next: NextFunction) {
  try { res.json(await cleanCache()); } catch (error) { next(error); }
}

function importInput(req: Request) {
  if (!req.file) throw createError('Select a configuration JSON file', 400, 'CONFIGURATION_INVALID');
  if (req.body.restoreSettings !== 'true' && req.body.restoreSettings !== 'false') throw createError('Invalid restoreSettings option', 400, 'CONFIGURATION_INVALID');
  return { bytes: req.file.buffer, restoreSettings: req.body.restoreSettings === 'true' };
}
export function previewImport(req: Request, res: Response, next: NextFunction) {
  try { const { bytes, restoreSettings } = importInput(req); res.json(previewConfiguration(bytes, req.user!.userId, restoreSettings)); }
  catch (error) { next(error); }
}
export function importConfiguration(req: Request, res: Response, next: NextFunction) {
  try {
    if (req.body.confirm !== 'true') throw createError('Preview and confirm restoration first', 409, 'CONFIGURATION_PREVIEW_REQUIRED');
    const { bytes, restoreSettings } = importInput(req);
    res.status(201).json(restoreConfiguration(bytes, req.user!.userId, restoreSettings, req.body.token));
  } catch (error) { next(error); }
}
