import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../config/database.js';
import { templates, taskTemplateState } from '../config/schema.js';
import { createError } from '../middleware/errorHandler.js';

export const templateSelectionFields = {
  templateId: z.string().default(''),
  templateMode: z.enum(['fixed', 'random']).optional(),
  templateIds: z.array(z.string().min(1)).max(50).optional(),
  avoidRepeat: z.boolean().optional()
};
export interface TemplateSelection { templateId?: string; templateMode?: 'fixed' | 'random'; templateIds?: string[]; avoidRepeat?: boolean; }
export function templateCandidates(config: TemplateSelection): string[] {
  return config.templateMode === 'random' ? [...new Set(config.templateIds || [])] : config.templateId ? [config.templateId] : [];
}
export function validTemplateSelection(config: TemplateSelection) {
  const ids = templateCandidates(config);
  return ids.length > 0 && ids.length <= 50 && (config.templateMode !== 'random' || ids.length === config.templateIds?.length);
}
export function chooseTemplateId(ids: string[], previous?: string | null, avoidRepeat = true, choose = randomInt): string {
  const candidates = avoidRepeat && ids.length > 1 ? ids.filter(id => id !== previous) : ids;
  if (!candidates.length) throw createError('没有可用的候选模板', 400, 'TEMPLATE_UNAVAILABLE');
  return candidates[choose(candidates.length)];
}
export function resolveTaskTemplate(config: TemplateSelection, userId: string | null | undefined, role: string,
  options: { taskId?: string; libraryId?: string; strict?: boolean; previewTemplateId?: string } = {}) {
  const ids = templateCandidates(config);
  if (!validTemplateSelection(config)) throw createError('请选择有效的模板或候选模板池', 400, 'TEMPLATE_POOL_INVALID');
  const available = db.select().from(templates).where(inArray(templates.id, ids)).all()
    .filter(template => role === 'admin' || template.isPublic || template.userId === userId);
  let pool = ids.flatMap(id => { const item = available.find(template => template.id === id); return item ? [item] : []; });
  const anchor = pool[0];
  if (anchor && config.templateMode === 'random') pool = pool.filter(template => (template.width || 1920) * (anchor.height || 1080) === (anchor.width || 1920) * (template.height || 1080));
  if (!pool.length) throw createError('候选模板全部不存在或无权使用，原封面未修改', 400, 'TEMPLATE_UNAVAILABLE');
  if (options.strict && pool.length !== ids.length) throw createError('候选模板必须可使用且宽高比例相同', 400, 'TEMPLATE_POOL_INVALID');
  const warnings: string[] = [];
  if (pool.length !== ids.length) warnings.push(`已跳过 ${ids.length - pool.length} 个不存在、无权使用或比例不匹配的候选模板`);
  if (config.templateMode === 'random' && ids.length > 1 && pool.length === 1) warnings.push('仅剩一个可用模板，本次允许重复使用');
  const previous = options.taskId && options.libraryId ? db.select().from(taskTemplateState)
    .where(and(eq(taskTemplateState.taskId, options.taskId), eq(taskTemplateState.libraryId, options.libraryId))).get()?.templateId : undefined;
  if (options.previewTemplateId && !pool.some(template => template.id === options.previewTemplateId)) throw createError('预览模板不属于可用候选池', 400, 'TEMPLATE_UNAVAILABLE');
  const id = options.previewTemplateId || (options.strict ? pool[0].id : chooseTemplateId(pool.map(template => template.id), previous, config.avoidRepeat !== false));
  return { template: pool.find(template => template.id === id)!, warningMessage: warnings.join('；') || null };
}
export function rememberTaskTemplate(taskId: string, libraryId: string, templateId: string) {
  db.insert(taskTemplateState).values({ taskId, libraryId, templateId })
    .onConflictDoUpdate({ target: [taskTemplateState.taskId, taskTemplateState.libraryId], set: { templateId } }).run();
}
