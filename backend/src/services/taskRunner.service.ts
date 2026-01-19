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

    progress.total = configs.length;

    // 2. 每个媒体库生成一张封面
    for (const config of configs) {
      try {
        progress.current++;
        const libraryName = config.libraryName || config.libraryId;
        console.log(`📂 Processing Library [${progress.current}/${progress.total}]: ${libraryName}`);

        const templateDetail = getTemplate(config.templateId);
        if (!templateDetail) {
          console.warn(`⚠️ Template ${config.templateId} not found for library ${libraryName}, skipping...`);
          progress.failed++;
          continue;
        }

        // b. 下载每个媒体项的封面（直到凑齐9个有效海报）
        const posterBuffers: Buffer[] = [];
        let startIndex = 0;
        let hasMoreItems = true;
        const BATCH_SIZE = 10; // 每次获取少量数据，按需加载
        const sortBy = config.sortBy || 'DateCreated'; // Define sortBy here for the loop

        while (posterBuffers.length < 9 && hasMoreItems) {
          console.log(`  🔄 Fetching batch of items (Start: ${startIndex}, Limit: ${BATCH_SIZE})...`);

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
            hasMoreItems = false; // 没有更多数据了
          }
          // 即便这次 fetch 的 items 少于 batch size，依然要处理这批数据
          if (batchItems.length === 0 && hasMoreItems) {
            startIndex += BATCH_SIZE;
            continue; // 这批没有带封面的，继续下一批
          }
          if (batchItems.length === 0 && !hasMoreItems) {
            break; // 这批没有且没更多了，退出
          }


          console.log(`  📦 Processing batch: Found ${batchItems.length} items with potential cover`);

          for (const item of batchItems) {
            if (posterBuffers.length >= 9) break;

            console.log(`  🖼️ Processing item: ${item.name}`);

            const imageTypes = ['Primary', 'Art', 'Backdrop', 'Banner', 'Logo', 'Thumb', 'Disc', 'Box', 'Screenshot', 'Menu', 'Chapter', 'BoxRear', 'Profile'];
            let validPoster: Buffer | null = null;

            for (const type of imageTypes) {
              const tag = item.imageTags?.[type];
              if (!tag) continue;

              // console.log(`    Trying image type: ${type} (tag: ${tag})`);
              const poster = await mediaClient.downloadCover(
                serverDetail.type,
                serverDetail.url,
                apiKey,
                item.id,
                type
              );

              // 验证海报有效性
              if (!poster || poster.length === 0) continue;

              // 1. 快速检查：已知黑图大小
              if (poster.length === 11488) {
                console.warn(`    ⚠️ Skipping invalid black image for type: ${type} (size: 11488 bytes)`);
                continue;
              }

              // 2. 深度检查：像素分析
              const { isBlackImage } = await import('../utils/imageUtils.js');
              const isBlack = await isBlackImage(poster);
              if (isBlack) {
                console.warn(`    ⚠️ Skipping invalid black image for type: ${type} (pixel analysis detected >98% black)`);
                continue;
              }

              validPoster = poster;
              console.log(`    ✅ Found valid cover using type: ${type} (${poster.length} bytes)`);
              break;
            }

            if (!validPoster) {
              console.warn(`  ⚠️ No valid cover found for item: ${item.name} (checked all types)`);
              continue;
            }

            posterBuffers.push(validPoster);

            // 保存海报到本地
            try {
              const fs = await import('fs');
              const path = await import('path');
              const postersDir = path.join(process.cwd(), 'output', 'posters', libraryName);

              if (!fs.existsSync(postersDir)) {
                fs.mkdirSync(postersDir, { recursive: true });
              }

              const cleanName = item.name.replace(/[<>:"/\\|?*]/g, '_');
              const posterPath = path.join(postersDir, `${posterBuffers.length}_${cleanName}.jpg`);
              fs.writeFileSync(posterPath, validPoster);
            } catch (err) {
              console.error('  Failed to save poster locally:', err);
            }
          }

          startIndex += BATCH_SIZE;
        }

        if (posterBuffers.length === 0) {
          console.warn(`⚠️ No valid posters found for library ${libraryName}, skipping...`);
          progress.failed++;
          continue;
        }

        // 如果不足9个，用已有的填充
        while (posterBuffers.length < 9) {
          const index = posterBuffers.length % Math.max(posterBuffers.filter(p => p !== null).length, 1);
          posterBuffers.push(posterBuffers[index]);
        }

        // c. 使用模板渲染媒体库封面
        console.log(`  🎨 Rendering library cover for ${libraryName}...`);
        const metadata = {
          title: libraryName,
          primaryTitle: config.primaryTitle || libraryName,
          secondaryTitle: config.secondaryTitle || ''
        };

        const renderedBuffer = await renderer.renderLibraryCover(
          templateDetail.canvasJson || '{}',
          metadata,
          posterBuffers.filter((p): p is Buffer => p !== null),
          { width: templateDetail.width || 1920, height: templateDetail.height || 1080 }
        );

        // 保存到本地目录留存
        const outputDir = './output/library-covers';
        const fs = await import('fs');
        const path = await import('path');
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const safeLibraryName = libraryName.replace(/[<>:"/\\|?*]/g, '_');
        const outputPath = path.join(outputDir, `${safeLibraryName}_${timestamp}.png`);
        fs.writeFileSync(outputPath, renderedBuffer);
        console.log(`  💾 Saved cover to: ${outputPath}`);

        // d. 上传封面到媒体库（注意：是上传到媒体库，不是媒体项）
        console.log(`  📤 Uploading library cover for ${libraryName}...`);
        const success = await mediaClient.uploadCover(
          serverDetail.type,
          serverDetail.url,
          apiKey,
          config.libraryId,  // 这里使用的是媒体库ID，不是媒体项ID
          renderedBuffer
        );

        if (success) {
          console.log(`  ✅ Successfully updated cover for ${libraryName}`);
          progress.success++;
        } else {
          console.log(`  ❌ Failed to upload cover for ${libraryName}`);
          progress.failed++;
        }

      } catch (err) {
        console.error(`❌ Error processing library ${config.libraryName}:`, err);
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
