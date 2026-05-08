import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { db } from '../config/database.js';
import { tasks, taskLogs } from '../config/schema.js';
import { eq, sql } from 'drizzle-orm';
import { createError } from '../middleware/index.js';
import { scheduleTask, removeScheduledTask } from '../services/scheduler.service.js';
import cron from 'node-cron';
import { runTask } from '../services/taskRunner.service.js';
import { getLocalISOString } from '../utils/time.js';

// 验证 Schema
const cronExpressionSchema = z
  .string()
  .refine((s) => cron.validate(s.trim()), {
    message: 'Invalid cron expression (expected 5 fields with valid ranges, e.g. "0 3 * * *")'
  });

export const createTaskSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['scheduled', 'manual']),
  cronExpression: cronExpressionSchema.optional(),
  templateId: z.string().uuid().optional(), // Now optional since template can be per-library
  serverId: z.string().uuid(),
  libraryIds: z.array(z.string()).optional(),
  libraryConfigs: z.string().optional(), // JSON string from frontend
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
  libraryConfigs: z.string().optional(),
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

    res.json(taskList);
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
      isEnabled: 1,
      createdAt: now,
      updatedAt: now
    }).run();

    // 如果是定时任务，注册到调度器
    if (type === 'scheduled' && cronExpression) {
      scheduleTask(id, cronExpression);
    }

    res.status(201).json({
      id,
      name,
      type,
      cronExpression,
      isEnabled: true,
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

    db.update(tasks)
      .set(updateData)
      .where(eq(tasks.id, idStr))
      .run();

    // 更新调度器
    removeScheduledTask(idStr);
    if (updates.type === 'scheduled' && updates.cronExpression && updates.isEnabled !== false) {
      scheduleTask(idStr, updates.cronExpression as string);
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

    db.delete(tasks).where(eq(tasks.id, idStr)).run();

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
      .all();

    res.json(logs);
  } catch (error) {
    next(error);
  }
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

    db.update(tasks)
      .set({ isEnabled: newStatus, updatedAt: now })
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
