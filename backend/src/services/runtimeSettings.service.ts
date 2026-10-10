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
