import { db } from '../config/database.js';
import { tasks, mediaServers, templates } from '../config/schema.js';
import { eq } from 'drizzle-orm';
import * as mediaClient from './mediaClient.service.js';
import * as renderer from './renderer.service.js';
import { decrypt } from '../utils/crypto.js';

interface TaskProgress {
  total: number;
  current: number;
  success: number;
  failed: number;
  status: 'idle' | 'running' | 'completed' | 'error';
}

const activeTaskProgress = new Map<string, TaskProgress>();

export function getTaskProgress(taskId: string): TaskProgress | undefined {
  return activeTaskProgress.get(taskId);
}

export async function runTask(taskId: string) {
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

    const apiKey = decrypt(serverDetail.apiKeyEncrypted);

    console.log(`🚀 Starting Task: ${task.name}`);

    // Parse library configs
    let configs: any[] = [];
    try {
      if (task.libraryConfigs) {
        configs = JSON.parse(task.libraryConfigs).filter((c: any) => c.enabled);
      }
    } catch (e) {
      console.error('Failed to parse libraryConfigs', e);
    }

    // Fallback to old behavior if no configs
    if (configs.length === 0) {
      const templateId = task.templateId;
      const libraryIds = task.libraryIds ? JSON.parse(task.libraryIds) : [];

      // If no libraries specified, we don't know what to do in the new system
      // But for backward compatibility, maybe we stick to what was there
      // Actually, let's just use the specified libraries with the task's template
      if (templateId) {
        configs = libraryIds.map((id: string) => ({
          libraryId: id,
          templateId: templateId,
          primaryTitle: '',
          secondaryTitle: ''
        }));
      }
    }

    if (configs.length === 0) {
      console.log('⚠️ No libraries configured to process');
      progress.status = 'completed';
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

    // 2. Iterate through each library configuration
    for (const config of configs) {
      console.log(`📂 Processing Library: ${config.libraryName || config.libraryId}`);

      const templateDetail = getTemplate(config.templateId);
      if (!templateDetail) {
        console.warn(`⚠️ Template ${config.templateId} not found for library ${config.libraryId}, skipping...`);
        continue;
      }

      // Fetch items for this library
      const { items } = await mediaClient.getLibraryItems(
        serverDetail.type,
        serverDetail.url,
        apiKey,
        config.libraryId,
        { limit: 2000 }
      );

      progress.total += items.length;
      console.log(`📦 Found ${items.length} items in ${config.libraryName}`);

      // 3. Process items in this library
      for (const item of items) {
        try {
          progress.current++;
          console.log(`🎨 Processing [${progress.current}/${progress.total}]: ${item.name}`);

          // a. 下载原始封面
          const originalPoster = await mediaClient.downloadCover(
            serverDetail.type,
            serverDetail.url,
            apiKey,
            item.id
          );

          if (!originalPoster) {
            console.warn(`⚠️ Skipped ${item.name}: No original poster found`);
            progress.failed++;
            continue;
          }

          // b. 渲染新封面
          const metadata = {
            title: item.name,
            year: item.year,
            rating: item.rating,
            genres: item.genres,
            primaryTitle: config.primaryTitle || item.name,
            secondaryTitle: config.secondaryTitle || ''
          };

          const renderedBuffer = await renderer.renderTemplate(
            templateDetail.canvasJson || '{}',
            metadata,
            originalPoster,
            { width: templateDetail.width || 900, height: templateDetail.height || 600 }
          );

          // c. 上传新封面
          const success = await mediaClient.uploadCover(
            serverDetail.type,
            serverDetail.url,
            apiKey,
            item.id,
            renderedBuffer
          );

          if (success) {
            progress.success++;
          } else {
            progress.failed++;
          }

        } catch (err) {
          console.error(`❌ Error processing item ${item.name}:`, err);
          progress.failed++;
        }
      }
    }

    progress.status = 'completed';
    console.log(`✅ Task ${task.name} finished. Success: ${progress.success}, Failed: ${progress.failed}`);

    // 更新最后运行时间
    const now = new Date().toISOString();
    db.update(tasks)
      .set({ lastRunAt: now })
      .where(eq(tasks.id, taskId))
      .run();

  } catch (error) {
    console.error(`🔴 Task ${taskId} failed:`, error);
    progress.status = 'error';
  }
}
