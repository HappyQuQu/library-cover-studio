import { z } from 'zod';
import { createError } from '../middleware/errorHandler.js';
import { db } from '../config/database.js';
import { systemSettings } from '../config/schema.js';
import { setRenderConcurrency } from './renderer.service.js';

export const SETTING_DEFAULTS: Record<string, string> = {
  'storage.savePosters': 'false', 'storage.saveCovers': 'false',
  'rendering.outputFormat': 'PNG', 'rendering.outputQuality': '90',
  'rendering.concurrency': '3', 'scheduler.timezone': 'Asia/Shanghai',
  'history.maxRuns': '50', 'history.maxDays': '30', 'ai.systemPrompt': ''
};

export function readRuntimeSettings(): Record<string, string> {
  return { ...SETTING_DEFAULTS, ...Object.fromEntries(db.select().from(systemSettings).all().filter(row => Object.hasOwn(SETTING_DEFAULTS, row.key)).map(row => [row.key, row.value])) };
}

export function getRenderSettings() {
  const settings = readRuntimeSettings();
  const concurrency = Number(settings['rendering.concurrency']);
  setRenderConcurrency(Number.isInteger(concurrency) && concurrency >= 1 && concurrency <= 10 ? concurrency : 3);
  const format = settings['rendering.outputFormat'].toLowerCase();
  const quality = Number(settings['rendering.outputQuality']);
  return {
    format: (format === 'jpeg' || format === 'webp' ? format : 'png') as 'png' | 'jpeg' | 'webp',
    quality: Number.isInteger(quality) && quality >= 1 && quality <= 100 ? quality : 90
  };
}

const integer = (min: number, max: number) => z.string().regex(/^\d+$/).refine(value => Number(value) >= min && Number(value) <= max);
const settingSchemas: Record<string, z.ZodTypeAny> = {
  'storage.savePosters': z.enum(['true', 'false']), 'storage.saveCovers': z.enum(['true', 'false']),
  'rendering.outputFormat': z.enum(['PNG', 'JPEG', 'WebP']),
  'rendering.outputQuality': integer(1, 100), 'rendering.concurrency': integer(1, 10),
  'history.maxRuns': integer(1, 500), 'history.maxDays': integer(1, 365),
  'scheduler.timezone': z.string().refine(value => { try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; } }),
  'ai.systemPrompt': z.string().max(50000)
};

export function validateRuntimeSettings(settings: Record<string, unknown>) {
  return Object.entries(settings).map(([key, value]) => {
    const schema = Object.hasOwn(settingSchemas, key) ? settingSchemas[key] : undefined;
    if (!schema) throw createError(`不支持的设置：${key}`, 400, 'INVALID_SETTING');
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') throw createError(`设置值无效：${key}`, 400, 'INVALID_SETTING');
    if ((key === 'ai.systemPrompt' || key === 'scheduler.timezone' || key === 'rendering.outputFormat') && typeof value !== 'string') throw createError(`设置值必须是文本：${key}`, 400, 'INVALID_SETTING');
    const parsed = schema.safeParse(String(value));
    if (!parsed.success) throw createError(`设置值无效：${key}`, 400, 'INVALID_SETTING');
    return { key, value: parsed.data as string };
  });
}
