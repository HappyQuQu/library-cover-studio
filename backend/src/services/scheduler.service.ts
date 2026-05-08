import cron from 'node-cron';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database.js';
import { tasks, taskLogs, systemSettings } from '../config/schema.js';
import { eq } from 'drizzle-orm';
import { runTask } from './taskRunner.service.js';
import { getLocalISOString } from '../utils/time.js';

// 存储活跃的 cron 任务
const scheduledJobs = new Map<string, cron.ScheduledTask>();

const DEFAULT_TIMEZONE = 'Asia/Shanghai';

function getSchedulerTimezone(): string {
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
    const enabledTasks = db.select()
      .from(tasks)
      .where(eq(tasks.isEnabled, 1))
      .all();

    for (const task of enabledTasks) {
      if (task.type === 'scheduled' && task.cronExpression) {
        scheduleTask(task.id, task.cronExpression);
      }
    }

    console.log(`📅 Loaded ${enabledTasks.length} scheduled tasks`);
  } catch (error) {
    console.error('Failed to initialize scheduler:', error);
  }
}

// 注册定时任务
export function scheduleTask(taskId: string, cronExpression: string): boolean {
  // 验证 cron 表达式
  if (!cron.validate(cronExpression)) {
    console.error(`Invalid cron expression: ${cronExpression}`);
    return false;
  }

  // 移除已存在的任务
  removeScheduledTask(taskId);

  // 创建新的定时任务
  const job = cron.schedule(cronExpression, async () => {
    console.log(`⏰ Running scheduled task: ${taskId}`);
    await executeScheduledTask(taskId);
  }, {
    timezone: getSchedulerTimezone()
  });

  scheduledJobs.set(taskId, job);
  console.log(`✅ Scheduled task ${taskId} with cron: ${cronExpression}`);

  return true;
}

// 移除定时任务
export function removeScheduledTask(taskId: string): boolean {
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

    if (!task.isEnabled) {
      console.log(`Task ${taskId} is disabled, skipping`);
      return;
    }

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
    console.log(`Task ${taskId} executed successfully`);

  } catch (error) {
    console.error(`Failed to execute task ${taskId}:`, error);
  }
}

// 获取所有活跃任务
export function getActiveJobs(): string[] {
  return Array.from(scheduledJobs.keys());
}
