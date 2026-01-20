// @ts-nocheck
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { db } from '../config/database.js';
import { templates } from '../config/schema.js';
import { eq, sql } from 'drizzle-orm';
import { createError } from '../middleware/index.js';
import fs from 'fs';
import path from 'path';
import { THUMBNAILS_DIR } from '../config/paths.js';
import AdmZip from 'adm-zip';

const d: any = db;

// 验证 Schema
export const createTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  canvasJson: z.string(),
  thumbnail: z.string().optional(), // Base64 data URL
  width: z.number().int().min(100).max(4000).default(900),
  height: z.number().int().min(100).max(6000).default(600),
  isPublic: z.boolean().default(false)
});

export const updateTemplateSchema = createTemplateSchema.partial();

// 获取模板列表
export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.userId;
    const role = req.user?.role;

    let query = d.select({
      id: templates.id,
      name: templates.name,
      description: templates.description,
      thumbnailPath: templates.thumbnailPath,
      width: templates.width,
      height: templates.height,
      isPublic: templates.isPublic,
      createdAt: templates.createdAt,
      updatedAt: templates.updatedAt
    })
      .from(templates);

    const templateList = role === 'admin'
      ? query.all()
      : query.where(sql`${templates.userId} = ${userId} OR ${templates.isPublic} = 1`).all();

    res.json(templateList);
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

    res.json(template);
  } catch (error) {
    next(error);
  }
}

// 导出模板 (ZIP)
export async function exportTemplate(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const template = (d.select().from(templates).all() as any[]).find(t => t.id === id);

    if (!template) {
      return next(createError('Template not found', 404, 'TEMPLATE_NOT_FOUND'));
    }

    const zip = new AdmZip();

    // Add template JSON
    const templateData = {
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

    // Look for preview.jpg or other images
    let thumbnailPath = null;
    const previewEntry = zip.getEntry('preview.jpg') || zip.getEntries().find(e => e.entryName.match(/\.(jpg|jpeg|png)$/i));

    if (previewEntry) {
      const buffer = previewEntry.getData();
      const filename = `${id}.jpg`;
      fs.writeFileSync(path.join(THUMBNAILS_DIR, filename), buffer);
      thumbnailPath = `/thumbnails/${filename}`;
    }

    d.insert(templates).values({
      id,
      name: `${name} (Imported)`,
      description,
      canvasJson,
      thumbnailPath,
      width,
      height,
      userId,
      isPublic: isPublic ? 1 : 0,
      createdAt: now,
      updatedAt: now
    }).run();

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
    const { name, description, canvasJson, thumbnail, width, height, isPublic } = req.body;
    const userId = req.user?.userId;

    const now = new Date().toISOString();
    const id = uuidv4();

    // Save thumbnail if provided
    let thumbnailPath = null;
    if (thumbnail && thumbnail.startsWith('data:image')) {
      const uploadsDir = THUMBNAILS_DIR;
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      const base64Data = thumbnail.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      const filename = `${id}.jpg`;
      fs.writeFileSync(path.join(uploadsDir, filename), buffer);
      thumbnailPath = `/thumbnails/${filename}`;
    }

    d.insert(templates).values({
      id,
      name,
      description,
      canvasJson,
      thumbnailPath,
      width,
      height,
      userId,
      isPublic: isPublic ? 1 : 0,
      createdAt: now,
      updatedAt: now
    }).run();

    res.status(201).json({
      id,
      name,
      description,
      thumbnailPath,
      width,
      height,
      isPublic,
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

    const updateData: Record<string, unknown> = { updatedAt: now };

    // Handle thumbnail update
    if (updates.thumbnail && updates.thumbnail.startsWith('data:image')) {
      const uploadsDir = THUMBNAILS_DIR;
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      const base64Data = updates.thumbnail.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      const filename = `${id}.jpg`;
      fs.writeFileSync(path.join(uploadsDir, filename), buffer);
      updateData.thumbnailPath = `/thumbnails/${filename}`;
    }

    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.canvasJson !== undefined) updateData.canvasJson = updates.canvasJson;
    if (updates.width !== undefined) updateData.width = updates.width;
    if (updates.height !== undefined) updateData.height = updates.height;
    if (updates.isPublic !== undefined) updateData.isPublic = updates.isPublic ? 1 : 0;

    (d.update(templates)
      .set(updateData)
      .where(eq(templates.id, id)) as any)
      .run();

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

    d.delete(templates).where(eq(templates.id, id)).run();

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

    const now = new Date().toISOString();
    const newId = uuidv4();

    d.insert(templates).values({
      id: newId,
      name: `${original.name} (Copy)`,
      description: original.description,
      canvasJson: original.canvasJson,
      width: original.width,
      height: original.height,
      userId,
      isPublic: 0,
      createdAt: now,
      updatedAt: now
    }).run();

    res.status(201).json({
      id: newId,
      name: `${original.name} (Copy)`,
      createdAt: now
    });
  } catch (error) {
    next(error);
  }
}
