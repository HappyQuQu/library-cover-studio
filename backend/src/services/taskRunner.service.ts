import { db } from '../config/database.js';
import { tasks, mediaServers, templates, taskLogs, taskLogCovers, systemSettings } from '../config/schema.js';
import { eq, inArray } from 'drizzle-orm';
import * as mediaClient from './mediaClient.service.js';
import * as renderer from './renderer.service.js';
import { fetchLibraryPosters, requiredPosterCount, usesBackdropBackground } from './libraryCover.service.js';
import { decrypt } from '../utils/crypto.js';
import { logger } from '../utils/logger.js';
import { getLocalISOString, getLocalTimestampForFile } from '../utils/time.js';
import { v4 as uuidv4 } from 'uuid';
import { saveHistoryCover } from './taskHistory.service.js';
import { pruneTaskHistory } from './historyRetention.service.js';
import { getRenderSettings } from './runtimeSettings.service.js';
import fs from 'fs';
import path from 'path';
import { POSTERS_DIR, COVERS_DIR } from '../config/paths.js';

interface TaskProgress {
  total: number;
  current: number;
  success: number;
  failed: number;
  status: 'idle' | 'running' | 'completed' | 'error';
}

const activeTaskProgress = new Map<string, TaskProgress>();
const runningTasks = new Set<string>();

export function getTaskProgress(taskId: string): TaskProgress | undefined {
  return activeTaskProgress.get(taskId);
}

export function isTaskRunning(taskId: string): boolean {
  return runningTasks.has(taskId);
}

// Helper to save file to data directory
async function saveFile(type: 'posters' | 'covers', filename: string, buffer: Buffer) {
  try {
    const dir = type === 'posters' ? POSTERS_DIR : COVERS_DIR;
    // ensureDataDirs already runs on startup, but extra safety doesn't hurt
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const safeName = filename.replace(/[<>:"/\\|?*]/g, '_');
    const filePath = path.join(dir, safeName);
    fs.writeFileSync(filePath, buffer);
    logger.debug(`Saved ${type} to ${filePath}`);
    return filePath;
  } catch (err) {
    logger.error(`Failed to save ${type}:`, err);
    return null;
  }
}

export async function runTask(taskId: string, logId?: string) {
  // 互斥：同一任务不能并行运行（cron 重叠触发或手动+定时撞车）
  if (runningTasks.has(taskId)) {
    logger.warn(`⏭️  Task ${taskId} is already running, skipping this trigger`);
    if (logId) {
      db.update(taskLogs).set({
        status: 'failed',
        completedAt: getLocalISOString(),
        errorMessage: 'Skipped: previous run still in progress'
      }).where(eq(taskLogs.id, logId)).run();
    }
    return;
  }
  runningTasks.add(taskId);

  const progress: TaskProgress = {
    total: 0,
    current: 0,
    success: 0,
    failed: 0,
    status: 'running'
  };

  activeTaskProgress.set(taskId, progress);

  try {
    // 1. 获取任务详情
    const task = db.select().from(tasks).where(eq(tasks.id, taskId)).get() as any;
    if (!task) throw new Error('Task not found');

    const serverDetail = db.select().from(mediaServers).where(eq(mediaServers.id, task.serverId!)).get();
    if (!serverDetail) throw new Error('Server not found');

    // Get storage settings
    const settings = db.select().from(systemSettings).where(inArray(systemSettings.key, ['storage.savePosters', 'storage.saveCovers'])).all();
    const savePosters = settings.find(s => s.key === 'storage.savePosters')?.value === 'true';
    const saveCovers = settings.find(s => s.key === 'storage.saveCovers')?.value === 'true';

    const apiKey = decrypt(serverDetail.apiKeyEncrypted);

    logger.info(`🚀 Starting Task: ${task.name}`);
    if (savePosters) logger.info('💾 Poster saving enabled');
    if (saveCovers) logger.info('💾 Cover saving enabled');

    // Parse library configs
    let configs: any[] = [];
    try {
      if (task.libraryConfigs) {
        configs = JSON.parse(task.libraryConfigs).filter((c: any) => c.enabled);
      }
    } catch (e) {
      logger.error('Failed to parse libraryConfigs', e);
    }

    if (configs.length === 0) {
      logger.warn('⚠️ No libraries configured to process');
      progress.status = 'completed';
      if (logId) {
        db.update(taskLogs).set({
          status: 'completed',
          completedAt: getLocalISOString()
        }).where(eq(taskLogs.id, logId)).run();
      }
      return;
    }

    // Cache templates to avoid repeated DB lookups
    const templateCache = new Map<string, any>();
    const getTemplate = (id: string) => {
      if (templateCache.has(id)) return templateCache.get(id);
      const t = db.select().from(templates).where(eq(templates.id, id)).get();
      templateCache.set(id, t);
      return t;
    };

    progress.total = configs.length;

    // 2. 每个媒体库生成一张封面
    for (const config of configs) {
      const coverId = logId ? uuidv4() : undefined;
      const templateDetail = getTemplate(config.templateId);
      if (coverId && logId) {
        db.insert(taskLogCovers).values({
          id: coverId, logId, libraryId: config.libraryId,
          libraryName: config.libraryName || config.libraryId,
          templateName: templateDetail?.name || null,
          status: 'generated', createdAt: getLocalISOString()
        }).run();
      }
      try {
        progress.current++;
        const libraryName = config.libraryName || config.libraryId;
        logger.info(`📂 Processing Library [${progress.current}/${progress.total}]: ${libraryName}`);

        if (!templateDetail) throw new Error('模板不存在，无法生成封面');

        const requiredCount = requiredPosterCount(templateDetail.canvasJson);
        const { posters: posterBuffers, backdrop } = requiredCount ? await fetchLibraryPosters(
          serverDetail, apiKey, config.libraryId, config.sortBy || 'DateCreated',
          Number.POSITIVE_INFINITY, savePosters ? async (poster, name, imageType) => {
            await saveFile('posters', `${libraryName}_${name}_${imageType}_${getLocalTimestampForFile()}.jpg`, poster);
          } : undefined, config.libraryType, requiredCount, usesBackdropBackground(templateDetail.canvasJson)
        ) : { posters: [], backdrop: undefined };
        if (requiredCount && !posterBuffers.length) {
          throw new Error('媒体库没有可用海报，无法生成封面');
        }

        // c. Render cover
        logger.info(`  🎨 Rendering library cover for ${libraryName}...`);
        const metadata = {
          title: libraryName,
          primaryTitle: config.primaryTitle || libraryName,
          secondaryTitle: config.secondaryTitle || ''
        };

        let canvasJson = templateDetail.canvasJson || '{}';
        let taskOptions: any = {};
        try {
          if (task.options) {
            taskOptions = typeof task.options === 'string' ? JSON.parse(task.options) : task.options;
          }
        } catch (e) {
          logger.warn('Failed to parse task options', e);
        }

        try {
          const tmpl = JSON.parse(canvasJson);
          if (taskOptions.randomBackground) {
            tmpl.randomOnGeneration = true;
            canvasJson = JSON.stringify(tmpl);
          }
        } catch (err) {
          logger.error('    ❌ Failed to apply random background:', err);
        }

        const renderSettings = getRenderSettings();
        const renderedBuffer = await renderer.renderLibraryCover(
          canvasJson,
          metadata,
          posterBuffers.filter((p): p is Buffer => p !== null),
          { width: templateDetail.width || 1920, height: templateDetail.height || 1080, ...renderSettings, backdropBuffer: backdrop }
        );

        if (coverId) {
          try {
            const snapshot = await saveHistoryCover(coverId, renderedBuffer);
            db.update(taskLogCovers).set(snapshot).where(eq(taskLogCovers.id, coverId)).run();
          } catch (error) {
            logger.error('Failed to save history snapshot:', error);
            db.update(taskLogCovers).set({ errorMessage: '历史图片保存失败，无法预览本次封面' }).where(eq(taskLogCovers.id, coverId)).run();
          }
        }

        // Save generated cover if enabled
        if (saveCovers) {
          const timestamp = getLocalTimestampForFile();
          const extension = renderSettings.format === 'jpeg' ? 'jpg' : renderSettings.format;
          await saveFile('covers', `${libraryName}_${timestamp}.${extension}`, renderedBuffer);
        }

        // d. Upload cover
        logger.info(`  📤 Uploading library cover for ${libraryName}...`);
        const success = await mediaClient.uploadCover(
          serverDetail.type,
          serverDetail.url,
          apiKey,
          config.libraryId,
          renderedBuffer
        );

        if (success) {
          logger.info(`  ✅ Successfully updated cover for ${libraryName}`);
          progress.success++;
          if (coverId) db.update(taskLogCovers).set({ status: 'uploaded' }).where(eq(taskLogCovers.id, coverId)).run();
        } else {
          throw new Error('封面已生成，但上传到媒体服务器失败');
        }

      } catch (err) {
        logger.error(`❌ Error processing library ${config.libraryName}: `, err);
        progress.failed++;
        if (coverId) db.update(taskLogCovers).set({ status: 'failed', errorMessage: (err as Error).message || String(err) }).where(eq(taskLogCovers.id, coverId)).run();
      }
    }

    progress.status = 'completed';
    logger.info(`✅ Task ${task.name} finished. Success: ${progress.success}, Failed: ${progress.failed}`);

    const now = getLocalISOString();
    db.update(tasks).set({ lastRunAt: now }).where(eq(tasks.id, taskId)).run();

    if (logId) {
      db.update(taskLogs).set({
        status: progress.failed && !progress.success ? 'failed' : 'completed',
        completedAt: now,
        itemsProcessed: progress.success,
        itemsFailed: progress.failed
      }).where(eq(taskLogs.id, logId)).run();
    }

  } catch (error) {
    logger.error(`🔴 Task ${taskId} failed: `, error);
    progress.status = 'error';
    if (logId) {
      db.update(taskLogs).set({
        status: 'failed',
        completedAt: getLocalISOString(),
        errorMessage: (error as any).message || String(error)
      }).where(eq(taskLogs.id, logId)).run();
    }
  } finally {
    runningTasks.delete(taskId);
    try { await pruneTaskHistory(); } catch (error) { logger.error('历史清理失败:', error); }
  }
}
