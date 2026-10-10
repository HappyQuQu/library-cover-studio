import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { db } from '../config/database.js';
import { tasks, taskLogs, taskLogCovers, mediaServers, templates } from '../config/schema.js';
import { eq, sql, inArray, desc } from 'drizzle-orm';
import fs from 'node:fs';
import { historyImagePath, removeHistoryImages } from '../services/taskHistory.service.js';
import { createError } from '../middleware/index.js';
import { scheduleTask, removeScheduledTask, getSchedulerTimezone } from '../services/scheduler.service.js';
import { getUpcomingExecutions } from '../utils/schedulePreview.js';
import cron from 'node-cron';
import { runTask } from '../services/taskRunner.service.js';
import { getLocalISOString } from '../utils/time.js';

// 验证 Schema
const cronExpressionSchema = z
  .string()
  .trim()
  .refine((s) => cron.validate(s), {
    message: '无效的 Cron 表达式，请使用 5 或 6 个字段及有效数值范围，例如 "0 3 * * *"'
  });

const libraryConfigSchema = z.object({
  libraryId: z.string().min(1), libraryName: z.string().min(1), libraryType: z.string().optional(),
  templateId: z.string(), primaryTitle: z.string().max(200), secondaryTitle: z.string().max(200),
  sortBy: z.enum(['Name', 'SortName', 'Random', 'CommunityRating', 'CriticRating', 'DateCreated', 'DateLastPlayed', 'DatePlayed', 'OfficialRating', 'PlayCount', 'PremiereDate', 'Runtime']),
  enabled: z.boolean()
});
const libraryConfigsSchema = z.string().superRefine((value, context) => {
  try {
    const configs = z.array(libraryConfigSchema).parse(JSON.parse(value));
    const selected = configs.filter(config => config.enabled);
    if (!selected.length || selected.some(config => !config.templateId)) throw new Error();
    if (new Set(configs.map(config => config.libraryId)).size !== configs.length) throw new Error();
  } catch { context.addIssue({ code: z.ZodIssueCode.custom, message: '请选择至少一个媒体库，并为已选媒体库配置有效模板' }); }
});

function checkTaskResources(req: Request, serverId: string, libraryConfigs?: string | null) {
  const server = db.select().from(mediaServers).where(eq(mediaServers.id, serverId)).get();
  if (!server || (req.user?.role !== 'admin' && server.userId !== req.user?.userId)) throw createError('无法使用所选媒体服务器', 403, 'SERVER_FORBIDDEN');
  if (libraryConfigs) {
    for (const config of JSON.parse(libraryConfigs).filter((item: any) => item.enabled)) {
      if (server.type === 'emby' && config.sortBy === 'OfficialRating') throw createError('Emby 不支持按家长分级排序，请选择其他排序方式', 400, 'MEDIA_UNSUPPORTED_SORT');
      const template = db.select().from(templates).where(eq(templates.id, config.templateId)).get();
      if (!template || (req.user?.role !== 'admin' && !template.isPublic && template.userId !== req.user?.userId)) throw createError('所选模板不存在或无权使用', 400, 'TEMPLATE_UNAVAILABLE');
    }
  }
}

export const createTaskSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['scheduled', 'manual']),
  cronExpression: cronExpressionSchema.optional(),
  templateId: z.string().uuid().optional(), // Now optional since template can be per-library
  serverId: z.string().uuid(),
  libraryIds: z.array(z.string()).optional(),
  libraryConfigs: libraryConfigsSchema.optional(),
  isEnabled: z.boolean().optional(),
  options: z.object({
    skipLocked: z.boolean().default(true),
    overwriteExisting: z.boolean().default(false),
    randomBackground: z.boolean().default(false)
  }).optional()
}).refine(
  (data) => data.type !== 'scheduled' || !!data.cronExpression,
  { message: 'cronExpression is required for scheduled tasks', path: ['cronExpression'] }
);

export const updateTaskSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  type: z.enum(['scheduled', 'manual']).optional(),
  cronExpression: cronExpressionSchema.optional(),
  templateId: z.string().uuid().optional(),
  serverId: z.string().uuid().optional(),
  libraryIds: z.array(z.string()).optional(),
  libraryConfigs: libraryConfigsSchema.optional(),
  options: z.object({
    skipLocked: z.boolean().default(true),
    overwriteExisting: z.boolean().default(false),
    randomBackground: z.boolean().default(false)
  }).optional(),
  isEnabled: z.boolean().optional()
});

// 获取任务列表
export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.userId;
    const role = req.user?.role;

    console.log(`[Task] Listing tasks for user: ${userId} (Role: ${role})`);

    let query = db.select({
      id: tasks.id,
      name: tasks.name,
      type: tasks.type,
      cronExpression: tasks.cronExpression,
      templateId: tasks.templateId,
      serverId: tasks.serverId,
      libraryConfigs: tasks.libraryConfigs,
      isEnabled: tasks.isEnabled,
      lastRunAt: tasks.lastRunAt,
      nextRunAt: tasks.nextRunAt,
      createdAt: tasks.createdAt
    })
      .from(tasks);

    const taskList = role === 'admin'
      ? query.all()
      : query.where(sql`${tasks.userId} = ${userId} OR ${tasks.userId} IS NULL`).all();

    const timezone = getSchedulerTimezone();
    res.json(taskList.map(task => {
      let nextRunAt: string | null = null;
      if (task.type === 'scheduled' && task.isEnabled && task.cronExpression) {
        try { nextRunAt = getUpcomingExecutions(task.cronExpression, timezone, 1)[0]; } catch { /* Invalid legacy schedule. */ }
      }
      return { ...task, isEnabled: !!task.isEnabled, nextRunAt, timezone };
    }));
  } catch (error) {
    next(error);
  }
}

// 获取单个任务
export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;

    const task = db.select()
      .from(tasks)
      .where(eq(tasks.id, id as string))
      .get();

    if (!task) {
      return next(createError('Task not found', 404, 'TASK_NOT_FOUND'));
    }

    res.json(task);
  } catch (error) {
    next(error);
  }
}

// 创建任务
export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const { name, type, cronExpression, templateId, serverId, libraryIds, libraryConfigs, options } = req.body;
    const now = getLocalISOString();
    const id = uuidv4();
    const userId = req.user?.userId;
    const isEnabled = type === 'scheduled' && req.body.isEnabled !== false;
    checkTaskResources(req, serverId, libraryConfigs);
    let nextRunAt: string | null = null;
    try { if (type === 'scheduled') nextRunAt = getUpcomingExecutions(cronExpression, getSchedulerTimezone(), 1)[0]; }
    catch (error: any) { throw createError(error.message, 400, 'INVALID_SCHEDULE'); }
    if (!isEnabled) nextRunAt = null;

    db.insert(tasks).values({
      id,
      name,
      type,
      cronExpression,
      templateId,
      serverId,
      userId,
      libraryIds: libraryIds ? JSON.stringify(libraryIds) : (libraryConfigs ? '[]' : null),
      libraryConfigs: libraryConfigs || null,
      options: options ? JSON.stringify(options) : null,
      isEnabled: isEnabled ? 1 : 0,
      nextRunAt,
      createdAt: now,
      updatedAt: now
    }).run();

    // 如果是定时任务，注册到调度器
    if (isEnabled && cronExpression) {
      scheduleTask(id, cronExpression);
    }

    res.status(201).json({
      id,
      name,
      type,
      cronExpression,
      isEnabled,
      createdAt: now
    });
  } catch (error) {
    next(error);
  }
}

// 更新任务
export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const updates = req.body;
    console.log(`📝 Updating task ${id} with body:`, JSON.stringify(updates, null, 2));
    const now = getLocalISOString();

    const idStr = id as string;
    const existing = db.select().from(tasks).where(eq(tasks.id, idStr)).get();
    if (!existing) {
      return next(createError('Task not found', 404, 'TASK_NOT_FOUND'));
    }

    console.log(`[Permission Check] Task Owner: ${existing.userId}, Request User: ${req.user?.userId}, Request Role: ${req.user?.role}`);

    // Permission check: Admin or Owner
    if (req.user?.role !== 'admin' && existing.userId !== req.user?.userId) {
      console.warn(`[Permission Denied] User ${req.user?.userId} (${req.user?.role}) tried to update task ${id} owned by ${existing.userId}`);
      return next(createError('Forbidden: Access denied to this task', 403, 'FORBIDDEN'));
    }

    const updateData: Record<string, any> = { updatedAt: now };

    // 如果任务之前没有归属 (旧数据)，在更新时关联到当前用户
    if (!existing.userId) {
      updateData.userId = req.user?.userId;
      console.log(`🔗 Associating legacy task ${id} with user ${req.user?.userId}`);
    }

    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.type !== undefined) updateData.type = updates.type;
    if (updates.cronExpression !== undefined) updateData.cronExpression = updates.cronExpression;
    if (updates.templateId !== undefined) updateData.templateId = updates.templateId;
    if (updates.serverId !== undefined) updateData.serverId = updates.serverId;
    if (updates.libraryIds !== undefined) updateData.libraryIds = JSON.stringify(updates.libraryIds);
    if (updates.libraryConfigs !== undefined) updateData.libraryConfigs = updates.libraryConfigs;
    if (updates.options !== undefined) updateData.options = JSON.stringify(updates.options);
    if (updates.isEnabled !== undefined) updateData.isEnabled = updates.isEnabled ? 1 : 0;
    const merged = { ...existing, ...updateData };
    if (merged.type === 'scheduled' && !merged.cronExpression) throw createError('定时任务需要有效的执行计划', 400, 'SCHEDULE_REQUIRED');
    checkTaskResources(req, merged.serverId!, merged.libraryConfigs);
    try {
      updateData.nextRunAt = merged.type === 'scheduled' && merged.isEnabled
        ? getUpcomingExecutions(merged.cronExpression!, getSchedulerTimezone(), 1)[0] : null;
    } catch (error: any) { throw createError(error.message, 400, 'INVALID_SCHEDULE'); }

    db.update(tasks)
      .set(updateData)
      .where(eq(tasks.id, idStr))
      .run();

    // 更新调度器
    removeScheduledTask(idStr);
    if (merged.type === 'scheduled' && merged.cronExpression && merged.isEnabled) {
      scheduleTask(idStr, merged.cronExpression);
    }

    res.json({ message: 'Task updated successfully' });
  } catch (error) {
    next(error);
  }
}

// 删除任务
export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const idStr = id as string;
    const existing = db.select().from(tasks).where(eq(tasks.id, idStr)).get();
    if (!existing) {
      return next(createError('Task not found', 404, 'TASK_NOT_FOUND'));
    }

    // Permission check: Admin or Owner
    if (req.user?.role !== 'admin' && existing.userId !== req.user?.userId) {
      console.warn(`[Permission Denied] User ${req.user?.userId} (${req.user?.role}) tried to delete task ${id} owned by ${existing.userId}`);
      return next(createError('Forbidden: Access denied to this task', 403, 'FORBIDDEN'));
    }

    removeScheduledTask(idStr);

    const logIds = db.select({ id: taskLogs.id }).from(taskLogs).where(eq(taskLogs.taskId, idStr)).all().map(log => log.id);
    const covers = logIds.length ? db.select().from(taskLogCovers).where(inArray(taskLogCovers.logId, logIds)).all() : [];
    db.delete(tasks).where(eq(tasks.id, idStr)).run();
    await removeHistoryImages(covers.flatMap(cover => [cover.imageName, cover.thumbnailName]));

    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    next(error);
  }
}

// 手动执行任务
export async function runNow(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const idStr = id as string;
    const task = db.select().from(tasks).where(eq(tasks.id, idStr)).get();
    if (!task) {
      return next(createError('Task not found', 404, 'TASK_NOT_FOUND'));
    }

    // Permission check: Admin or Owner
    if (req.user?.role !== 'admin' && task.userId !== req.user?.userId) {
      console.warn(`[Permission Denied] User ${req.user?.userId} (${req.user?.role}) tried to run task ${id} owned by ${task.userId}`);
      return next(createError('Forbidden: Access denied to this task', 403, 'FORBIDDEN'));
    }

    // 创建任务日志
    const logId = uuidv4();
    const now = getLocalISOString();

    db.insert(taskLogs).values({
      id: logId,
      taskId: idStr,
      status: 'running',
      startedAt: now
    }).run();

    // 异步执行任务
    runTask(idStr, logId).catch(err => {
      console.error(`Task ${idStr} execution failed:`, err);
      // Try to mark as failed if runTask completely blew up
      try {
        db.update(taskLogs).set({
          status: 'failed',
          errorMessage: (err as any).message || String(err),
          completedAt: getLocalISOString()
        }).where(eq(taskLogs.id, logId)).run();
      } catch (e) {
        console.error('Failed to update log status on catastrophic failure', e);
      }
    });

    res.json({
      message: 'Task execution started',
      logId
    });
  } catch (error) {
    next(error);
  }
}

// 获取任务日志
export async function getLogs(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const idStr = id as string;

    const task = db.select().from(tasks).where(eq(tasks.id, idStr)).get();
    if (!task) {
      return next(createError('Task not found', 404, 'TASK_NOT_FOUND'));
    }

    // Permission check
    if (req.user?.role !== 'admin' && task.userId !== req.user?.userId) {
      return next(createError('Forbidden: Access denied to this task', 403, 'FORBIDDEN'));
    }

    const logs = db.select()
      .from(taskLogs)
      .where(eq(taskLogs.taskId, idStr))
      .orderBy(desc(taskLogs.startedAt))
      .all();

    const covers = logs.length ? db.select().from(taskLogCovers).where(inArray(taskLogCovers.logId, logs.map(log => log.id))).all() : [];
    res.json(logs.map(log => ({ ...log, covers: covers.filter(cover => cover.logId === log.id).map(cover => {
      const image = historyImagePath(cover.imageName), thumbnail = historyImagePath(cover.thumbnailName);
      const base = `/tasks/${idStr}/logs/${log.id}/covers/${cover.id}/image`;
      return {
        id: cover.id, libraryId: cover.libraryId, libraryName: cover.libraryName, templateName: cover.templateName,
        status: cover.status, width: cover.width, height: cover.height, errorMessage: cover.errorMessage,
        imageUrl: image && fs.existsSync(image) ? base : null,
        thumbnailUrl: thumbnail && fs.existsSync(thumbnail) ? `${base}?size=thumbnail` : null
      };
    }) })));
  } catch (error) {
    next(error);
  }
}

export async function getLogCover(req: Request, res: Response, next: NextFunction) {
  try {
    const task = db.select().from(tasks).where(eq(tasks.id, req.params.id as string)).get();
    if (!task) throw createError('任务不存在', 404, 'TASK_NOT_FOUND');
    if (req.user?.role !== 'admin' && task.userId !== req.user?.userId) throw createError('无权查看此任务的封面', 403, 'FORBIDDEN');
    const log = db.select().from(taskLogs).where(eq(taskLogs.id, req.params.logId as string)).get();
    const cover = db.select().from(taskLogCovers).where(eq(taskLogCovers.id, req.params.coverId as string)).get();
    if (!log || log.taskId !== task.id || !cover || cover.logId !== log.id) throw createError('历史封面不存在', 404, 'HISTORY_COVER_NOT_FOUND');
    const file = historyImagePath(req.query.size === 'thumbnail' ? cover.thumbnailName : cover.imageName);
    if (!file || !fs.existsSync(file)) throw createError('本次图片未保存或已被清理', 404, 'HISTORY_IMAGE_NOT_FOUND');
    res.setHeader('Cache-Control', 'private, no-store');
    if (req.query.download === '1') {
      res.download(file, `${cover.libraryName.replace(/[<>:"/\\|?*\r\n]/g, '_') || 'cover'}-${cover.id.slice(0, 8)}.png`);
    } else {
      res.sendFile(file);
    }
  } catch (error) { next(error); }
}

// 切换任务状态 (启用/禁用)
export async function toggleStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const idStr = id as string;

    const existing = db.select().from(tasks).where(eq(tasks.id, idStr)).get();
    if (!existing) {
      return next(createError('Task not found', 404, 'TASK_NOT_FOUND'));
    }

    // Permission check
    if (req.user?.role !== 'admin' && existing.userId !== req.user?.userId) {
      return next(createError('Forbidden: Access denied to this task', 403, 'FORBIDDEN'));
    }

    const newStatus = existing.isEnabled ? 0 : 1;
    const now = getLocalISOString();
    let nextRunAt: string | null = null;
    try {
      if (newStatus && existing.type === 'scheduled') {
        if (!existing.cronExpression) throw new Error('定时任务需要有效的执行计划');
        nextRunAt = getUpcomingExecutions(existing.cronExpression, getSchedulerTimezone(), 1)[0];
      }
    } catch (error: any) { throw createError(error.message, 400, 'INVALID_SCHEDULE'); }

    db.update(tasks)
      .set({ isEnabled: newStatus, nextRunAt, updatedAt: now })
      .where(eq(tasks.id, idStr))
      .run();

    // 更新调度器
    if (newStatus === 1 && existing.type === 'scheduled' && existing.cronExpression) {
      scheduleTask(idStr, existing.cronExpression);
    } else {
      removeScheduledTask(idStr);
    }

    res.json({
      message: `Task ${newStatus ? 'enabled' : 'disabled'} successfully`,
      isEnabled: !!newStatus
    });
  } catch (error) {
    next(error);
  }
}
