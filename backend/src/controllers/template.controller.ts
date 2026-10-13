// @ts-nocheck
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { db } from '../config/database.js';
import { templates, templateRevisions, tasks } from '../config/schema.js';
import { saveTemplateVersion, getTemplateRevisions, getTemplateRevision, cleanupTemplateImages, TEMPLATE_HISTORY_LIMIT } from '../services/templateHistory.service.js';
import { eq, sql } from 'drizzle-orm';
import { createError } from '../middleware/index.js';
import fs from 'fs';
import path from 'path';
import { THUMBNAILS_DIR } from '../config/paths.js';
import AdmZip from 'adm-zip';
import { templateMetadataSchema, readTemplateMetadata } from '../services/templateMetadata.service.js';

const d: any = db;

// 验证 Schema
export const createTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  canvasJson: z.string().refine(value => {
    try { const canvas = JSON.parse(value); return !!canvas && !Array.isArray(canvas) && Array.isArray(canvas.objects); }
    catch { return false; }
  }, '画布 JSON 格式无效'),
  thumbnail: z.string().optional(), // Base64 data URL
  width: z.number().int().min(100).max(4000).default(900),
  height: z.number().int().min(100).max(6000).default(600),
  isPublic: z.boolean().default(false),
  isLocked: z.boolean().default(false)
}).merge(templateMetadataSchema);

export const updateTemplateSchema = createTemplateSchema.omit({ isLocked: true }).partial();
export const lockTemplateSchema = z.object({ isLocked: z.boolean() });

function canManage(req: Request, template: any) {
  return req.user?.role === 'admin' || template.userId === req.user?.userId;
}
function assertReadable(req: Request, template: any) {
  if (!canManage(req, template) && !template.isPublic) throw createError('无权查看此模板', 403, 'TEMPLATE_FORBIDDEN');
}
function serializeTemplate(req: Request, template: any) {
  return { ...template, ...readTemplateMetadata(template.metadataJson), isPublic: !!template.isPublic, isLocked: !!template.isLocked, isDefault: !!template.isDefault, canManage: canManage(req, template) };
}

// 获取模板列表
export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.userId;
    const role = req.user?.role;

    let query = d.select({
      id: templates.id,
      name: templates.name,
      metadataJson: templates.metadataJson,
      description: templates.description,
      thumbnailPath: templates.thumbnailPath,
      width: templates.width,
      height: templates.height,
      isPublic: templates.isPublic,
      isLocked: templates.isLocked,
      isDefault: templates.isDefault,
      userId: templates.userId,
      createdAt: templates.createdAt,
      updatedAt: templates.updatedAt
    })
      .from(templates);

    const templateList = role === 'admin'
      ? query.all()
      : query.where(sql`${templates.userId} = ${userId} OR ${templates.isPublic} = 1`).all();

    res.json(templateList.map(template => serializeTemplate(req, template)));
  } catch (error) {
    next(error);
  }
}

// 获取单个模板
export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;

    // Use all().find() to bypass Drizzle type issues in this environment
    const template = (d.select().from(templates).all() as any[]).find(t => t.id === id);

    if (!template) {
      return next(createError('Template not found', 404, 'TEMPLATE_NOT_FOUND'));
    }

    assertReadable(req, template);
    res.json(serializeTemplate(req, template));
  } catch (error) {
    next(error);
  }
}

// Read saved artwork through an authenticated route; generated asset folders
// remain private. Resolve the filename from the owned/public template only.
export async function thumbnail(req: Request, res: Response, next: NextFunction) {
  try {
    const template = d.select().from(templates).where(eq(templates.id, req.params.id)).get();
    if (!template) throw createError('模板不存在', 404, 'TEMPLATE_NOT_FOUND');
    if (req.user?.role !== 'admin' && template.userId !== req.user?.userId && !template.isPublic) {
      throw createError('无权查看此模板', 403, 'TEMPLATE_FORBIDDEN');
    }
    if (!template.thumbnailPath) throw createError('模板尚未保存缩略图', 404, 'THUMBNAIL_NOT_FOUND');
    const filename = path.basename(template.thumbnailPath);
    if (!/^[\w.-]+\.(?:png|jpe?g|webp)$/i.test(filename)) throw createError('模板缩略图路径无效', 404, 'THUMBNAIL_NOT_FOUND');
    const file = path.join(THUMBNAILS_DIR, filename);
    if (!fs.existsSync(file)) throw createError('模板缩略图文件不存在', 404, 'THUMBNAIL_NOT_FOUND');
    res.setHeader('Cache-Control', 'private, no-store');
    res.sendFile(file, error => { if (error) next(error); });
  } catch (error) { next(error); }
}

// 导出模板 (ZIP)
export async function exportTemplate(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const template = (d.select().from(templates).all() as any[]).find(t => t.id === id);

    if (!template) {
      return next(createError('Template not found', 404, 'TEMPLATE_NOT_FOUND'));
    }

    assertReadable(req, template);
    const zip = new AdmZip();

    // Add template JSON
    const templateData = {
      ...readTemplateMetadata(template.metadataJson),
      name: template.name,
      description: template.description,
      width: template.width,
      height: template.height,
      canvasJson: template.canvasJson,
      isPublic: template.isPublic === 1
    };
    zip.addFile('template.json', Buffer.from(JSON.stringify(templateData, null, 2), 'utf8'));

    // Add thumbnail if exists
    if (template.thumbnailPath) {
      const fileName = path.basename(template.thumbnailPath);
      const fullPath = path.join(THUMBNAILS_DIR, fileName);
      if (fs.existsSync(fullPath)) {
        // Use a standardized name inside the zip
        zip.addLocalFile(fullPath, '', 'preview.jpg');
      }
    }

    const zipBuffer = zip.toBuffer();
    // Prettier ZIP name: Only strip characters that are forbidden in filenames
    const safeName = template.name.replace(/[\\/:*?"<>|]/g, '_').trim();
    // Use a timestamp in zip name to avoid conflict? No, browser handles downloads.
    const zipFileName = `${safeName}_${template.width}x${template.height}.zip`;

    res.set('Content-Type', 'application/zip');
    res.set('Content-Disposition', `attachment; filename="${encodeURIComponent(zipFileName)}"`);
    res.send(zipBuffer);
  } catch (error) {
    next(error);
  }
}

// 导入模板 (ZIP)
export async function importTemplate(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) {
      return next(createError('No file uploaded', 400, 'NO_FILE'));
    }

    const zip = new AdmZip(req.file.path);
    const jsonEntry = zip.getEntry('template.json');
    if (!jsonEntry) {
      return next(createError('Invalid template: missing template.json', 400, 'INVALID_TEMPLATE'));
    }

    const templateData = JSON.parse(jsonEntry.getData().toString('utf8'));
    const { name, description, width, height, canvasJson, isPublic } = templateData;
    const userId = req.user?.userId;
    const id = uuidv4();
    const now = new Date().toISOString();

    const previewEntry = zip.getEntry('preview.jpg') || zip.getEntries().find(e => e.entryName.match(/\.(jpg|jpeg|png|webp)$/i));
    const extension = previewEntry?.entryName.split('.').pop()?.toLowerCase();
    const thumbnail = previewEntry ? `data:image/${extension === 'jpg' ? 'jpeg' : extension};base64,${previewEntry.getData().toString('base64')}` : undefined;
    const data = createTemplateSchema.parse({ ...templateMetadataSchema.parse(templateData), name: `${name} (Imported)`, description: description ?? undefined, width, height, canvasJson, isPublic });
    const saved = await saveTemplateVersion(undefined, {
      id, name: data.name, description: data.description ?? null, canvasJson: data.canvasJson,
      metadataJson: JSON.stringify(templateMetadataSchema.parse(data)),
      width: data.width, height: data.height, userId, isPublic: data.isPublic ? 1 : 0,
      isLocked: 0, isDefault: 0, thumbnailPath: null, createdAt: now, updatedAt: now
    }, userId, 'save', thumbnail);
    const thumbnailPath = saved.thumbnailPath;

    // Clean up uploaded file
    try {
      fs.unlinkSync(req.file.path);
    } catch (e) {
      console.error('Failed to cleanup imported zip:', e);
    }

    res.status(201).json({
      id,
      name: `${name} (Imported)`,
      thumbnailPath
    });
  } catch (error) {
    next(error);
  }
}

// 创建模板
export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const { name, description, canvasJson, thumbnail, width, height, isPublic, isLocked } = req.body;
    const userId = req.user?.userId;

    const now = new Date().toISOString();
    const id = uuidv4();

    const saved = await saveTemplateVersion(undefined, {
      id, name, description: description ?? null, canvasJson, thumbnailPath: null,
      metadataJson: JSON.stringify(templateMetadataSchema.parse(req.body)),
      width, height, userId, isPublic: isPublic ? 1 : 0, isLocked: isLocked ? 1 : 0,
      isDefault: 0, createdAt: now, updatedAt: now
    }, userId, 'save', thumbnail);
    const thumbnailPath = saved.thumbnailPath;

    res.status(201).json({
      ...readTemplateMetadata(saved.metadataJson),
      id,
      name,
      description,
      thumbnailPath,
      width,
      height,
      isPublic,
      isLocked: !!isLocked,
      isDefault: false,
      canManage: true,
      createdAt: now
    });
  } catch (error) {
    next(error);
  }
}

// 更新模板
export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const updates = req.body;
    const now = new Date().toISOString();

    const existing = (d.select().from(templates).all() as any[]).find(t => t.id === id);
    if (!existing) {
      return next(createError('Template not found', 404, 'TEMPLATE_NOT_FOUND'));
    }

    // Permission check
    if (req.user?.role !== 'admin' && existing.userId !== req.user?.userId) {
      return next(createError('Forbidden: Access denied to this template', 403, 'FORBIDDEN'));
    }

    if (existing.isLocked) throw createError('模板已锁定，请先解锁再编辑', 409, 'TEMPLATE_LOCKED');
    const updateData = { ...existing, updatedAt: now };
    for (const key of ['name', 'description', 'canvasJson', 'width', 'height']) {
      if (updates[key] !== undefined) updateData[key] = updates[key];
    }
    const metadata = { ...readTemplateMetadata(existing.metadataJson) };
    for (const key of ['version', 'author', 'changelog', 'minAppVersion']) {
      if (Object.prototype.hasOwnProperty.call(updates, key)) metadata[key] = updates[key];
    }
    updateData.metadataJson = JSON.stringify(templateMetadataSchema.parse(metadata));
    if (updates.isPublic !== undefined) updateData.isPublic = updates.isPublic ? 1 : 0;
    await saveTemplateVersion(existing, updateData, req.user!.userId, 'save', updates.thumbnail);

    res.json({ message: 'Template updated successfully' });
  } catch (error) {
    next(error);
  }
}

// 删除模板
export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const existing = (d.select().from(templates).all() as any[]).find(t => t.id === id);
    if (!existing) {
      return next(createError('Template not found', 404, 'TEMPLATE_NOT_FOUND'));
    }

    // Permission check
    if (req.user?.role !== 'admin' && existing.userId !== req.user?.userId) {
      return next(createError('Forbidden: Access denied to this template', 403, 'FORBIDDEN'));
    }

    if (existing.isLocked) throw createError('模板已锁定，请先解锁再删除', 409, 'TEMPLATE_LOCKED');

    const references = d.select().from(tasks).all().filter(task => {
      if (task.templateId === id) return true;
      try { return JSON.parse(task.libraryConfigs || '[]').some(config => config.templateId === id); }
      catch { return false; }
    });
    if (references.length) {
      const readable = references.filter(task => req.user?.role === 'admin' || task.userId === req.user?.userId);
      const details = readable.map(task => task.name);
      const hiddenCount = references.length - readable.length;
      if (hiddenCount) details.push(`另有 ${hiddenCount} 个其他用户的任务`);
      throw createError(`模板正在被任务引用，请先更换任务模板：${details.join('、')}`, 409, 'TEMPLATE_IN_USE');
    }

    const images = d.select().from(templateRevisions).where(eq(templateRevisions.templateId, id)).all().map(revision => revision.thumbnailPath);
    d.delete(templates).where(eq(templates.id, id)).run();
    await cleanupTemplateImages([existing.thumbnailPath, ...images]);

    res.json({ message: 'Template deleted successfully' });
  } catch (error) {
    next(error);
  }
}

// 复制模板
export async function duplicate(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    const original = (d.select().from(templates).all() as any[]).find(t => t.id === id);
    if (!original) {
      return next(createError('Template not found', 404, 'TEMPLATE_NOT_FOUND'));
    }

    assertReadable(req, original);
    const now = new Date().toISOString();
    const newId = uuidv4();

    await saveTemplateVersion(undefined, {
      ...original, id: newId, isLocked: 0, isDefault: 0, name: `${original.name} (Copy)`,
      userId, isPublic: 0, createdAt: now, updatedAt: now
    }, userId);

    res.status(201).json({
      id: newId,
      name: `${original.name} (Copy)`,
      createdAt: now
    });
  } catch (error) {
    next(error);
  }
}

// A locked template is read-only; making an unlocked copy remains available.
export async function setLock(req: Request, res: Response, next: NextFunction) {
  try {
    const existing = d.select().from(templates).where(eq(templates.id, req.params.id)).get();
    if (!existing) throw createError('模板不存在', 404, 'TEMPLATE_NOT_FOUND');
    if (!canManage(req, existing)) throw createError('无权修改此模板的锁定状态', 403, 'TEMPLATE_FORBIDDEN');
    const isLocked = req.body.isLocked;
    d.update(templates).set({ isLocked: isLocked ? 1 : 0, updatedAt: new Date().toISOString() }).where(eq(templates.id, existing.id)).run();
    res.json({ id: existing.id, isLocked });
  } catch (error) { next(error); }
}

function managedTemplate(req: Request) {
  const existing = d.select().from(templates).where(eq(templates.id, req.params.id)).get();
  if (!existing) throw createError('模板不存在', 404, 'TEMPLATE_NOT_FOUND');
  if (!canManage(req, existing)) throw createError('无权查看或回退此模板的历史记录', 403, 'TEMPLATE_FORBIDDEN');
  return existing;
}

export async function history(req: Request, res: Response, next: NextFunction) {
  try {
    const existing = managedTemplate(req);
    const rows = getTemplateRevisions(existing.id);
    res.json({ limit: TEMPLATE_HISTORY_LIMIT, revisions: rows.map(({ canvasJson, thumbnailPath, savedBy, ...revision }) => ({
      ...revision, ...readTemplateMetadata(revision.metadataJson), previewUrl: `/templates/${existing.id}/history/${revision.id}/thumbnail`
    })) });
  } catch (error) { next(error); }
}

export async function historyThumbnail(req: Request, res: Response, next: NextFunction) {
  try {
    const existing = managedTemplate(req);
    const revision = getTemplateRevision(existing.id, req.params.revisionId);
    if (!revision) throw createError('历史版本不存在或已超过最近 50 条', 404, 'REVISION_NOT_FOUND');
    const file = path.join(THUMBNAILS_DIR, path.basename(revision.thumbnailPath));
    if (!fs.existsSync(file)) throw createError('历史预览图不存在', 404, 'THUMBNAIL_NOT_FOUND');
    res.setHeader('Cache-Control', 'private, no-store');
    res.sendFile(file, error => { if (error) next(error); });
  } catch (error) { next(error); }
}

export async function restoreRevision(req: Request, res: Response, next: NextFunction) {
  try {
    const existing = managedTemplate(req);
    if (existing.isLocked) throw createError('模板已锁定，请先解锁再回退', 409, 'TEMPLATE_LOCKED');
    const revision = getTemplateRevision(existing.id, req.params.revisionId);
    if (!revision) throw createError('历史版本不存在或已超过最近 50 条', 404, 'REVISION_NOT_FOUND');
    const saved = await saveTemplateVersion(existing, { ...existing, name: revision.name, description: revision.description,
      canvasJson: revision.canvasJson, metadataJson: revision.metadataJson, width: revision.width, height: revision.height, isPublic: revision.isPublic,
      thumbnailPath: revision.thumbnailPath }, req.user!.userId, 'restore', undefined, revision.id);
    res.json(serializeTemplate(req, saved));
  } catch (error) { next(error); }
}
