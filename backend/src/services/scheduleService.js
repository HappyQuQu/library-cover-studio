const Bull = require("bull");
const cron = require("node-cron");
const redis = require("redis");
// const { Pool } = require("pg"); // 不需要PostgreSQL，使用SQLite
const database = require("./database");
const PosterGenerator = require("./posterGenerator");
const MediaLibraryService = require("./mediaLibraryService");

class ScheduleService {
  constructor() {
    // Redis 连接
    this.redisClient = redis.createClient({
      host: process.env.REDIS_HOST || "localhost",
      port: process.env.REDIS_PORT || 6379,
    });

    // Bull 队列
    this.posterQueue = new Bull("poster generation", {
      redis: {
        port: process.env.REDIS_PORT || 6379,
        host: process.env.REDIS_HOST || "localhost",
      },
    });

    // 使用SQLite database服务
    this.getDb = () => database.getDb();

    this.init();
  }

  async init() {
    // 处理队列任务
    this.posterQueue.process(
      "generatePoster",
      this.processPosterGeneration.bind(this)
    );

    // 启动时加载所有活跃的定时任务
    await this.loadScheduledTasks();

    console.log("🕒 调度服务已启动");
  }

  // 加载所有活跃的定时任务
  async loadScheduledTasks() {
    try {
      const query = `
        SELECT st.*, t.name as template_name, ml.name as media_lib_name
        FROM scheduled_tasks st
        JOIN templates t ON st.template_id = t.id
        JOIN media_libraries ml ON st.media_library_id = ml.id
        WHERE st.is_active = true AND t.deleted_at IS NULL AND ml.is_active = true
      `;

      const result = await this.pool.query(query);

      for (const task of result.rows) {
        this.scheduleTask(task);
      }

      console.log(`📅 加载了 ${result.rows.length} 个活跃定时任务`);
    } catch (error) {
      console.error("加载定时任务失败:", error);
    }
  }

  // 调度单个任务
  scheduleTask(task) {
    const { id, name, cron_expression } = task;

    // 验证 cron 表达式
    if (!cron.validate(cron_expression)) {
      console.error(`无效的 cron 表达式: ${cron_expression} (任务: ${name})`);
      return;
    }

    // 创建定时任务
    cron.schedule(
      cron_expression,
      async () => {
        console.log(`🚀 执行定时任务: ${name}`);
        await this.executeTask(task);
      },
      {
        scheduled: true,
        timezone: process.env.TIMEZONE || "Asia/Shanghai",
      }
    );

    console.log(`⏰ 任务已调度: ${name} (${cron_expression})`);
  }

  // 执行任务
  async executeTask(task) {
    const executionId = await this.createTaskExecution(task.id);

    try {
      // 更新任务的最后运行时间
      await this.updateTaskLastRun(task.id);

      // 获取媒体库数据
      const mediaItems = await MediaLibraryService.getMediaItems(
        task.media_library_id,
        task.filters
      );

      console.log(`📚 找到 ${mediaItems.length} 个媒体项目`);

      // 将海报生成任务添加到队列
      for (const mediaItem of mediaItems) {
        await this.posterQueue.add(
          "generatePoster",
          {
            templateId: task.template_id,
            mediaLibraryId: task.media_library_id,
            mediaItem: mediaItem,
            executionId: executionId,
          },
          {
            attempts: 3,
            backoff: {
              type: "exponential",
              delay: 2000,
            },
          }
        );
      }

      // 更新执行记录
      await this.updateTaskExecution(executionId, {
        status: "completed",
        processed_items: mediaItems.length,
        completed_at: new Date(),
      });

      // 增加成功计数
      await this.incrementTaskCount(task.id, "success");
    } catch (error) {
      console.error(`任务执行失败: ${task.name}`, error);

      // 更新执行记录
      await this.updateTaskExecution(executionId, {
        status: "failed",
        error_message: error.message,
        completed_at: new Date(),
      });

      // 增加错误计数
      await this.incrementTaskCount(task.id, "error");
      await this.updateTaskError(task.id, error.message);
    }
  }

  // 处理海报生成队列任务
  async processPosterGeneration(job) {
    const { templateId, mediaLibraryId, mediaItem, executionId } = job.data;

    try {
      console.log(`🎨 生成海报: ${mediaItem.title}`);

      // 生成海报
      const posterUrl = await PosterGenerator.generate({
        templateId,
        mediaItem,
        outputPath: `posters/${mediaItem.id}_${Date.now()}.png`,
      });

      // 上传到媒体库
      await MediaLibraryService.uploadPoster(
        mediaLibraryId,
        mediaItem.id,
        posterUrl
      );

      // 记录生成历史
      await this.recordPosterGeneration({
        template_id: templateId,
        media_library_id: mediaLibraryId,
        media_item_id: mediaItem.id,
        media_title: mediaItem.title,
        media_type: mediaItem.type,
        poster_url: posterUrl,
        status: "completed",
      });

      console.log(`✅ 海报生成完成: ${mediaItem.title}`);
    } catch (error) {
      console.error(`❌ 海报生成失败: ${mediaItem.title}`, error);

      // 记录失败的生成历史
      await this.recordPosterGeneration({
        template_id: templateId,
        media_library_id: mediaLibraryId,
        media_item_id: mediaItem.id,
        media_title: mediaItem.title,
        media_type: mediaItem.type,
        status: "failed",
        error_message: error.message,
      });

      throw error;
    }
  }

  // 创建任务执行记录
  async createTaskExecution(taskId) {
    const query = `
      INSERT INTO task_executions (task_id, status, started_at)
      VALUES ($1, 'running', CURRENT_TIMESTAMP)
      RETURNING id
    `;

    const result = await this.pool.query(query, [taskId]);
    return result.rows[0].id;
  }

  // 更新任务执行记录
  async updateTaskExecution(executionId, updates) {
    const setClause = Object.keys(updates)
      .map((key, index) => `${key} = $${index + 2}`)
      .join(", ");

    const query = `
      UPDATE task_executions 
      SET ${setClause}
      WHERE id = $1
    `;

    await this.pool.query(query, [executionId, ...Object.values(updates)]);
  }

  // 记录海报生成历史
  async recordPosterGeneration(data) {
    const query = `
      INSERT INTO poster_generations (
        template_id, media_library_id, media_item_id, 
        media_title, media_type, poster_url, status, error_message
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `;

    await this.pool.query(query, [
      data.template_id,
      data.media_library_id,
      data.media_item_id,
      data.media_title,
      data.media_type,
      data.poster_url || null,
      data.status,
      data.error_message || null,
    ]);
  }

  // 更新任务最后运行时间
  async updateTaskLastRun(taskId) {
    const query = `
      UPDATE scheduled_tasks 
      SET last_run = CURRENT_TIMESTAMP, run_count = run_count + 1
      WHERE id = $1
    `;

    await this.pool.query(query, [taskId]);
  }

  // 增加任务计数
  async incrementTaskCount(taskId, type) {
    const column = type === "success" ? "success_count" : "error_count";
    const query = `
      UPDATE scheduled_tasks 
      SET ${column} = ${column} + 1
      WHERE id = $1
    `;

    await this.pool.query(query, [taskId]);
  }

  // 更新任务错误信息
  async updateTaskError(taskId, errorMessage) {
    const query = `
      UPDATE scheduled_tasks 
      SET last_error = $2
      WHERE id = $1
    `;

    await this.pool.query(query, [taskId, errorMessage]);
  }

  // 手动触发任务
  async triggerTask(taskId) {
    try {
      const query = `
        SELECT st.*, t.name as template_name, ml.name as media_lib_name
        FROM scheduled_tasks st
        JOIN templates t ON st.template_id = t.id
        JOIN media_libraries ml ON st.media_library_id = ml.id
        WHERE st.id = $1 AND t.deleted_at IS NULL
      `;

      const result = await this.pool.query(query, [taskId]);

      if (result.rows.length === 0) {
        throw new Error("任务不存在或已被删除");
      }

      const task = result.rows[0];
      await this.executeTask(task);

      return { success: true, message: "任务触发成功" };
    } catch (error) {
      console.error("手动触发任务失败:", error);
      throw error;
    }
  }

  // 获取队列状态
  async getQueueStats() {
    const waiting = await this.posterQueue.getWaiting();
    const active = await this.posterQueue.getActive();
    const completed = await this.posterQueue.getCompleted();
    const failed = await this.posterQueue.getFailed();

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
    };
  }
}

module.exports = new ScheduleService();
