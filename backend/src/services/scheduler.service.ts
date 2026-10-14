import cron from 'node-cron';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database.js';
import { tasks, taskLogs, systemSettings } from '../config/schema.js';
import { eq, or } from 'drizzle-orm';
import { runTask, isTaskRunning } from './taskRunner.service.js';
import { getLocalISOString } from '../utils/time.js';
import { getUpcomingExecutions } from '../utils/schedulePreview.js';

// 存储活跃的 cron 任务
const scheduledJobs = new Map<string, cron.ScheduledTask>();

const DEFAULT_TIMEZONE = 'Asia/Shanghai';

export function getSchedulerTimezone(): string {
  // 优先环境变量，其次 systemSettings.scheduler.timezone，最后默认值
  if (process.env.SCHEDULER_TIMEZONE) return process.env.SCHEDULER_TIMEZONE;
  try {
    const row = db.select().from(systemSettings)
      .where(eq(systemSettings.key, 'scheduler.timezone'))
      .get();
    if (row?.value) return row.value;
  } catch {
    // ignore — DB not ready
  }
  return DEFAULT_TIMEZONE;
}

// 初始化调度器 - 从数据库加载所有启用的定时任务
export function initScheduler() {
  try {
    for (const id of scheduledJobs.keys()) removeScheduledTask(id);
    db.update(tasks).set({ nextRunAt: null })
      .where(or(eq(tasks.isEnabled, 0), eq(tasks.type, 'manual'))).run();
    const enabledTasks = db.select()
      .from(tasks)
      .where(eq(tasks.isEnabled, 1))
      .all();

    for (const task of enabledTasks) {
      if (task.type === 'scheduled' && task.cronExpression) {
        scheduleTask(task.id, task.cronExpression);
      }
    }

    console.log(`📅 Loaded ${scheduledJobs.size} scheduled tasks`);
  } catch (error) {
    console.error('Failed to initialize scheduler:', error);
  }
}

// 注册定时任务
export function scheduleTask(taskId: string, cronExpression: string): boolean {
  const expression = cronExpression.trim();
  // 验证 cron 表达式
  if (!cron.validate(expression)) {
    console.error(`Invalid cron expression: ${cronExpression}`);
    return false;
  }

  try {
    const timezone = getSchedulerTimezone();
    const nextRunAt = getUpcomingExecutions(expression, timezone, 1)[0];
    const firstExecutionAt = Date.parse(nextRunAt);
    removeScheduledTask(taskId);
    const job = cron.schedule(expression, async () => {
      // node-cron 3 can emit during start() within the current matching second.
      // Registration must wait for the next execution shown in the preview.
      if (Date.now() < firstExecutionAt) return;
      await executeScheduledTask(taskId);
    }, { timezone, scheduled: false });
    scheduledJobs.set(taskId, job);
    db.update(tasks).set({ nextRunAt }).where(eq(tasks.id, taskId)).run();
    job.start();
    console.log(`✅ Scheduled task ${taskId} with cron: ${expression}`);
    return true;
  } catch (error) {
    removeScheduledTask(taskId);
    console.error(`Failed to schedule task ${taskId}:`, error);
    return false;
  }
}

// 移除定时任务
export function removeScheduledTask(taskId: string): boolean {
  db.update(tasks).set({ nextRunAt: null }).where(eq(tasks.id, taskId)).run();
  const job = scheduledJobs.get(taskId);
  if (job) {
    job.stop();
    scheduledJobs.delete(taskId);
    console.log(`🗑️ Removed scheduled task: ${taskId}`);
    return true;
  }
  return false;
}

// 执行定时任务
async function executeScheduledTask(taskId: string) {
  try {
    const task = db.select().from(tasks).where(eq(tasks.id, taskId)).get();

    if (!task) {
      console.error(`Task not found: ${taskId}`);
      removeScheduledTask(taskId);
      return;
    }

    if (!task.isEnabled || task.type !== 'scheduled' || !task.cronExpression) {
      removeScheduledTask(taskId);
      return;
    }

    const nextRunAt = getUpcomingExecutions(task.cronExpression, getSchedulerTimezone(), 1)[0];
    db.update(tasks).set({ nextRunAt }).where(eq(tasks.id, taskId)).run();
    // A skipped tick is not another failed execution; retain the current run's record.
    if (isTaskRunning(taskId)) {
      console.log(`⏭️ Task ${taskId} is still running, skipping scheduled trigger`);
      return;
    }
    console.log(`⏰ Running scheduled task: ${taskId}`);
    // 更新最后运行时间
    const now = getLocalISOString();
    db.update(tasks)
      .set({ lastRunAt: now, updatedAt: now })
      .where(eq(tasks.id, taskId))
      .run();

    // 创建任务日志（与手动执行保持一致）
    const logId = uuidv4();
    db.insert(taskLogs).values({
      id: logId,
      taskId: taskId,
      status: 'running',
      startedAt: now
    }).run();

    // 执行任务逻辑，传入 logId 以便记录结果
    await runTask(taskId, logId);
    console.log(`Task ${taskId} execution finished`);

  } catch (error) {
    console.error(`Failed to execute task ${taskId}:`, error);
  }
}

// 获取所有活跃任务
export function getActiveJobs(): string[] {
  return Array.from(scheduledJobs.keys());
}

/** Call only at process startup, before any task is dispatched. */
export function recoverInterruptedRuns() {
  const interrupted = db.select().from(taskLogs).where(eq(taskLogs.status, 'running')).all();
  for (const log of interrupted) {
    if (isTaskRunning(log.taskId)) continue;
    db.update(taskLogs).set({ status: 'failed', completedAt: getLocalISOString(), errorMessage: '服务重启，本次执行已中断；请检查已上传封面后手动重试' }).where(eq(taskLogs.id, log.id)).run();
  }
}
