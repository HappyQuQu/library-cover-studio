import { Request, Response, NextFunction } from 'express';
import { db } from '../config/database.js';
import { systemSettings } from '../config/schema.js';
import { SYSTEM_PROMPT } from '../services/ai/prompts/templateGenerator.js';
import { readRuntimeSettings, getRenderSettings, validateRuntimeSettings } from '../services/runtimeSettings.service.js';
import { initScheduler } from '../services/scheduler.service.js';
import { getDefaultTemplateStatus, restoreDefaultTemplates } from '../services/defaultTemplateReset.service.js';
import { createError } from '../middleware/errorHandler.js';

export function getSettings(_req: Request, res: Response, next: NextFunction) {
  try { res.json(readRuntimeSettings()); } catch (error) { next(error); }
}

export function updateSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const settings = req.body?.settings ?? req.body;
    if (!settings || typeof settings !== 'object' || Array.isArray(settings) || !Object.keys(settings).length) {
      throw createError('设置格式无效', 400, 'INVALID_SETTINGS');
    }
    const values = validateRuntimeSettings(settings);
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
