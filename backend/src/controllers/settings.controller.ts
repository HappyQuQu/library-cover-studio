import { Request, Response, NextFunction } from 'express';
import { db } from '../config/database.js';
import { systemSettings } from '../config/schema.js';
import { z } from 'zod';
import { SYSTEM_PROMPT } from '../services/ai/prompts/templateGenerator.js';
import { readRuntimeSettings, getRenderSettings } from '../services/runtimeSettings.service.js';
import { initScheduler } from '../services/scheduler.service.js';
import { getDefaultTemplateStatus, restoreDefaultTemplates } from '../services/defaultTemplateReset.service.js';
import { createError } from '../middleware/errorHandler.js';

const integer = (min: number, max: number) => z.string().regex(/^\d+$/).refine(value => Number(value) >= min && Number(value) <= max);
const settingSchemas: Record<string, z.ZodTypeAny> = {
  'storage.savePosters': z.enum(['true', 'false']), 'storage.saveCovers': z.enum(['true', 'false']),
  'rendering.outputFormat': z.enum(['PNG', 'JPEG', 'WebP']),
  'rendering.outputQuality': integer(1, 100), 'rendering.concurrency': integer(1, 10),
  'history.maxRuns': integer(1, 500), 'history.maxDays': integer(1, 365),
  'scheduler.timezone': z.string().refine(value => { try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; } }),
  'ai.systemPrompt': z.string().max(50000)
};

export function getSettings(_req: Request, res: Response, next: NextFunction) {
  try { res.json(readRuntimeSettings()); } catch (error) { next(error); }
}

export function updateSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const settings = req.body?.settings ?? req.body;
    if (!settings || typeof settings !== 'object' || Array.isArray(settings) || !Object.keys(settings).length) {
      throw createError('设置格式无效', 400, 'INVALID_SETTINGS');
    }
    const values = Object.entries(settings).map(([key, value]) => {
      const schema = Object.hasOwn(settingSchemas, key) ? settingSchemas[key] : undefined;
      if (!schema) throw createError(`不支持的设置：${key}`, 400, 'INVALID_SETTING');
      if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') throw createError(`设置值无效：${key}`, 400, 'INVALID_SETTING');
      if ((key === 'ai.systemPrompt' || key === 'scheduler.timezone' || key === 'rendering.outputFormat') && typeof value !== 'string') throw createError(`设置值必须是文本：${key}`, 400, 'INVALID_SETTING');
      const parsed = schema.safeParse(String(value));
      if (!parsed.success) throw createError(`设置值无效：${key}`, 400, 'INVALID_SETTING');
      return { key, value: parsed.data as string };
    });
    db.transaction(tx => {
      for (const setting of values) {
        tx.insert(systemSettings).values({ ...setting, updatedAt: new Date().toISOString() })
          .onConflictDoUpdate({ target: systemSettings.key, set: { value: setting.value, updatedAt: new Date().toISOString() } }).run();
      }
    });
    getRenderSettings();
    if (values.some(setting => setting.key === 'scheduler.timezone')) initScheduler();
    res.json({ message: 'Settings updated successfully' });
  } catch (error) { next(error); }
}

export function getDefaultPrompt(_req: Request, res: Response) {
  res.json({ defaultPrompt: SYSTEM_PROMPT });
}


export async function defaultTemplateStatus(_req: Request, res: Response, next: NextFunction) {
  try { res.json(await getDefaultTemplateStatus()); } catch (error) { next(error); }
}

export async function resetDefaultTemplates(req: Request, res: Response, next: NextFunction) {
  try {
    if (req.body?.confirm !== true) throw createError('请确认还原默认模板', 400, 'RESET_CONFIRMATION_REQUIRED');
    res.json(await restoreDefaultTemplates(req.user!.userId));
  } catch (error) { next(error); }
}
