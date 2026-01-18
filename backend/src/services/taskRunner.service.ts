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
    const task = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
    if (!task) throw new Error('Task not found');

    const serverDetail = db.select().from(mediaServers).where(eq(mediaServers.id, task.serverId!)).get();
    if (!serverDetail) throw new Error('Server not found');

    const templateDetail = db.select().from(templates).where(eq(templates.id, task.templateId!)).get();
    if (!templateDetail) throw new Error('Template not found');

    const apiKey = decrypt(serverDetail.apiKeyEncrypted);

    console.log(`🚀 Starting Task: ${task.name}`);

    // 2. 获取媒体项目
    const { items } = await mediaClient.getLibraryItems(
      serverDetail.type,
      serverDetail.url,
      apiKey,
      task.libraryIds || '',
      { limit: 1000 } // 暂时设置一个大的上限
    );

    progress.total = items.length;
    console.log(`📦 Found ${items.length} items to process`);

    // 3. 循环处理
    for (const item of items) {
      try {
        progress.current++;
        console.log(`🎨 Processing [${progress.current}/${progress.total}]: ${item.name}`);

        // a. 下载原始封面 (如果模板需要)
        // 注意：目前 renderer 默认需要 posterBuffer 来替换 {{poster}}
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
        };

        const renderedBuffer = await renderer.renderTemplate(
          templateDetail.canvasJson || '{}',
          metadata,
          originalPoster,
          { width: 600, height: 900 }
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
