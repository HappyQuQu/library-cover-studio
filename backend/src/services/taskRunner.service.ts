import { db } from '../config/database.js';
import { tasks, mediaServers, templates, taskLogs, systemSettings } from '../config/schema.js';
import { eq, inArray } from 'drizzle-orm';
import * as mediaClient from './mediaClient.service.js';
import * as renderer from './renderer.service.js';
import { decrypt } from '../utils/crypto.js';
import { logger } from '../utils/logger.js';
import { getLocalISOString, getLocalTimestampForFile } from '../utils/time.js';
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
      try {
        progress.current++;
        const libraryName = config.libraryName || config.libraryId;
        logger.info(`📂 Processing Library [${progress.current}/${progress.total}]: ${libraryName}`);

        const templateDetail = getTemplate(config.templateId);
        if (!templateDetail) {
          logger.warn(`⚠️ Template ${config.templateId} not found for library ${libraryName}, skipping...`);
          progress.failed++;
          continue;
        }

        // b. 下载每个媒体项的封面（直到凑齐9个有效海报）
        const posterBuffers: Buffer[] = [];
        let startIndex = 0;
        let hasMoreItems = true;
        const BATCH_SIZE = 10;
        const sortBy = config.sortBy || 'DateCreated';

        while (posterBuffers.length < 9 && hasMoreItems) {
          logger.info(`  🔄 Fetching batch of items (Start: ${startIndex}, Limit: ${BATCH_SIZE})...`);

          const itemsResult = await mediaClient.getLibraryItems(
            serverDetail.type,
            serverDetail.url,
            apiKey,
            config.libraryId,
            {
              limit: BATCH_SIZE,
              startIndex: startIndex,
              sortBy,
              sortOrder: sortBy === 'Name' ? 'Ascending' : 'Descending'
            }
          );

          const batchItems = itemsResult.items.filter(item =>
            item.imageTags && Object.keys(item.imageTags).length > 0
          );

          if (itemsResult.items.length < BATCH_SIZE) {
            hasMoreItems = false;
          }
          if (batchItems.length === 0 && hasMoreItems) {
            startIndex += BATCH_SIZE;
            continue;
          }
          if (batchItems.length === 0 && !hasMoreItems) {
            break;
          }

          logger.info(`  📦 Processing batch: Found ${batchItems.length} items with potential cover`);

          for (const item of batchItems) {
            if (posterBuffers.length >= 9) break;

            // 单项失败不应影响整个库，包一层 try/catch
            try {
            // logger.debug(`  🖼️ Processing item: ${item.name}`);

            const imageTypes = ['Primary', 'Art', 'Backdrop', 'Banner', 'Logo', 'Thumb', 'Disc', 'Box', 'Screenshot', 'Menu', 'Chapter', 'BoxRear', 'Profile'];
            let validPoster: Buffer | null = null;
            let usedType = '';

            for (const type of imageTypes) {
              const tag = item.imageTags?.[type];
              if (!tag) continue;

              const poster = await mediaClient.downloadCover(
                serverDetail.type,
                serverDetail.url,
                apiKey,
                item.id,
                type
              );

              if (!poster || poster.length === 0) continue;

              // 1. Check black image size
              if (poster.length === 11488) {
                // logger.warn(`    ⚠️ Skipping invalid black image for type: ${type} (size: 11488 bytes)`);
                continue;
              }

              // 2. Pixel analysis
              const { isBlackImage } = await import('../utils/imageUtils.js');
              const isBlack = await isBlackImage(poster);
              if (isBlack) {
                // logger.warn(`    ⚠️ Skipping invalid black image for type: ${type} (pixel analysis detected > 98 % black)`);
                continue;
              }

              validPoster = poster;
              usedType = type;
              // logger.info(`    ✅ Found valid cover using type: ${type} (${poster.length} bytes)`);
              break;
            }

            if (!validPoster) {
              // logger.warn(`  ⚠️ No valid cover found for item: ${item.name}`);
              continue;
            }

            posterBuffers.push(validPoster);

            // Save poster if enabled
            if (savePosters) {
              const timestamp = getLocalTimestampForFile();
              await saveFile('posters', `${libraryName}_${item.name}_${usedType}_${timestamp}.jpg`, validPoster);
            }
            } catch (itemErr) {
              logger.warn(`  ⚠️ Item ${item.name} failed, skipping: ${(itemErr as any)?.message || itemErr}`);
              // 不递增 progress.failed — 单项跳过不算整个库失败
            }
          }

          startIndex += BATCH_SIZE;
        }

        if (posterBuffers.length === 0) {
          logger.warn(`⚠️ No valid posters found for library ${libraryName}, skipping...`);
          progress.failed++;
          continue;
        }

        // Fill if less than 9
        while (posterBuffers.length < 9) {
          const index = posterBuffers.length % Math.max(posterBuffers.filter(p => p !== null).length, 1);
          posterBuffers.push(posterBuffers[index]);
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
          if (taskOptions.randomBackground || tmpl.randomOnGeneration) {
            tmpl.background = renderer.generateRandomGradient();
            if (tmpl.backgroundColor) {
              tmpl.backgroundColor = tmpl.background;
            }
            canvasJson = JSON.stringify(tmpl);
            logger.info('    🎲 Applied random background gradient');
          }
        } catch (err) {
          logger.error('    ❌ Failed to apply random background:', err);
        }

        const renderedBuffer = await renderer.renderLibraryCover(
          canvasJson,
          metadata,
          posterBuffers.filter((p): p is Buffer => p !== null),
          { width: templateDetail.width || 1920, height: templateDetail.height || 1080 }
        );

        // Save generated cover if enabled
        if (saveCovers) {
          const timestamp = getLocalTimestampForFile();
          await saveFile('covers', `${libraryName}_${timestamp}.png`, renderedBuffer);
        }

        // Always save to output/library-covers for legacy/display purposes?
        // Or just map to data/covers? Let's use saveFile logic above, plus keep the legacy output one if needed
        // but user asked for data folder structure. Let's stick to the requested structure.
        // Actually, let's keep the legacy basic save too but maybe redirect it? 
        // For now, I'll remove the legacy ./output folder logic to be cleaner and use data/covers as the source of truth.

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
        } else {
          logger.error(`  ❌ Failed to upload cover for ${libraryName}`);
          progress.failed++;
        }

      } catch (err) {
        logger.error(`❌ Error processing library ${config.libraryName}: `, err);
        progress.failed++;
      }
    }

    progress.status = 'completed';
    logger.info(`✅ Task ${task.name} finished. Success: ${progress.success}, Failed: ${progress.failed}`);

    const now = getLocalISOString();
    db.update(tasks).set({ lastRunAt: now }).where(eq(tasks.id, taskId)).run();

    if (logId) {
      db.update(taskLogs).set({
        status: 'completed',
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
  }
}
