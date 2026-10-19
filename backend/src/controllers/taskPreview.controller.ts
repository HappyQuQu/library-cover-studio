import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../config/database.js';
import { mediaServers, templates } from '../config/schema.js';
import { getSchedulerTimezone } from '../services/scheduler.service.js';
import { getUpcomingExecutions } from '../utils/schedulePreview.js';
import { getLibraries, getCollections } from '../services/mediaClient.service.js';
import { fetchLibraryPosters, requiredPosterCount, usesBackdropBackground } from '../services/libraryCover.service.js';
import { renderLibraryCover } from '../services/renderer.service.js';
import { decrypt } from '../utils/crypto.js';
import { createError } from '../middleware/index.js';
import { getRenderSettings } from '../services/runtimeSettings.service.js';

export function previewSchedule(req: Request, res: Response) {
  const timezone = getSchedulerTimezone();
  const expression = typeof req.body.cronExpression === 'string' ? req.body.cronExpression.trim() : '';
  if (!expression) return res.json({ timezone, executions: [] });
  try {
    return res.json({ timezone, executions: getUpcomingExecutions(expression, timezone) });
  } catch (error: any) {
    return res.status(400).json({ error: error.message, code: 'INVALID_SCHEDULE', timezone });
  }
}

export const previewCoverSchema = z.object({
  serverId: z.string().uuid(), libraryId: z.string().min(1), templateId: z.string().min(1),
  primaryTitle: z.string().max(200).default(''), secondaryTitle: z.string().max(200).default(''),
  sortBy: z.enum(['Name', 'SortName', 'Random', 'CommunityRating', 'CriticRating', 'DateCreated', 'DateLastPlayed', 'DatePlayed', 'OfficialRating', 'PlayCount', 'PremiereDate', 'Runtime']).default('DateCreated')
});

/** Render from real library assets without storing a cover or uploading to the server. */
export async function previewCover(req: Request, res: Response, next: NextFunction) {
  try {
    const input = req.body as z.infer<typeof previewCoverSchema>;
    const server = db.select().from(mediaServers).where(eq(mediaServers.id, input.serverId)).get();
    const template = db.select().from(templates).where(eq(templates.id, input.templateId)).get();
    if (!server || !template) throw createError('服务器或模板不存在', 404, 'PREVIEW_NOT_FOUND');
    if (req.user?.role !== 'admin' && (server.userId !== req.user?.userId || (!template.isPublic && template.userId !== req.user?.userId))) {
      throw createError('无权使用此服务器或模板', 403, 'PREVIEW_FORBIDDEN');
    }
    const apiKey = decrypt(server.apiKeyEncrypted);
    const libraries = await getLibraries(server.type, server.url, apiKey);
    const library = libraries.find(item => item.id === input.libraryId)
      || (await getCollections(server.type, server.url, apiKey)).find(item => item.id === input.libraryId);
    if (!library) throw createError('无法读取所选媒体库或合集，请检查服务器连接', 400, 'LIBRARY_UNAVAILABLE');
    const requiredCount = requiredPosterCount(template.canvasJson);
    const { posters, uniqueCount, backdrop } = requiredCount ? await fetchLibraryPosters(server, apiKey, input.libraryId, input.sortBy, 10, undefined, library.type, requiredCount, usesBackdropBackground(template.canvasJson))
      : { posters: [], uniqueCount: 0, backdrop: undefined };
    if (requiredCount && !posters.length) throw createError('所选媒体库或合集中没有可用海报，无法生成样张', 400, 'NO_POSTERS');
    const json = JSON.parse(template.canvasJson);
    const settings = getRenderSettings();
    const buffer = await renderLibraryCover(JSON.stringify(json), {
      title: library.name, primaryTitle: input.primaryTitle || library.name, secondaryTitle: input.secondaryTitle
    }, posters, { width: template.width || 1920, height: template.height || 1080, ...settings, backdropBuffer: backdrop });
    res.setHeader('Cache-Control', 'no-store');
    res.json({ image: `data:image/${settings.format};base64,${buffer.toString('base64')}`, posterCount: uniqueCount,
      noteCode: !requiredCount ? 'NO_POSTERS_REQUIRED' : uniqueCount < requiredCount ? 'POSTERS_REUSED' : 'LIBRARY_POSTERS',
      noteParams: { count: uniqueCount },
      note: !requiredCount ? '纯文字模板，无需海报素材' : uniqueCount < requiredCount ? `使用 ${uniqueCount} 张可用海报，重复填充其余位置` : '使用媒体库中的真实海报' });
  } catch (error) { next(error); }
}
