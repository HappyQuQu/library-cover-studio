const Bull = require("bull");
const cron = require("node-cron");
const database = require("./database");
const PosterGenerator = require("./posterGenerator");
const MediaLibraryService = require("./mediaLibraryService");

class ScheduleService {
  constructor() {
    this.posterQueue = new Bull("poster generation", {
      redis: {
        port: process.env.REDIS_PORT || 6379,
        host: process.env.REDIS_HOST || "localhost",
      },
    });

    this.init();
  }

  async init() {
    this.posterQueue.process("generatePoster", this.processPosterGeneration.bind(this));
    await this.loadScheduledTasks();
    console.log("🕒 调度服务已启动");
  }

  async loadScheduledTasks() {
    try {
      const db = database.getDb();
      const tasks = await db.all("SELECT * FROM scheduled_tasks WHERE is_active = 1");

      for (const task of tasks) {
        this.scheduleTask(task);
      }
      console.log(`📅 加载了 ${tasks.length} 个活跃定时任务`);
    } catch (error) {
      console.error("加载定时任务失败:", error);
    }
  }

  scheduleTask(task) {
    const { id, name, cron_expression } = task;

    if (!cron.validate(cron_expression)) {
      console.error(`无效的 cron 表达式: ${cron_expression} (任务: ${name})`);
      return;
    }

    try {
      cron.schedule(cron_expression, async () => {
        console.log(`🚀 执行定时任务: ${name}`);
        const freshTask = await database.getDb().get("SELECT * FROM scheduled_tasks WHERE id = ?", [id]);
        if (freshTask && freshTask.is_active) {
          await this.executeTask(freshTask);
        }
      }, {
        scheduled: true,
        timezone: process.env.TIMEZONE || "Asia/Shanghai",
      });
      console.log(`⏰ 任务已调度: ${name} (${cron_expression})`);
    } catch (e) {
      console.error(`调度任务失败: ${name}`, e);
    }
  }

  async executeTask(task) {
    const executionId = await this.createTaskExecution(task.id);
    const db = database.getDb();

    try {
      await db.run("UPDATE scheduled_tasks SET last_run = datetime('now'), run_count = run_count + 1 WHERE id = ?", [task.id]);

      const mapping = typeof task.library_template_mapping === 'string'
        ? JSON.parse(task.library_template_mapping)
        : task.library_template_mapping;

      const textReplacements = typeof task.text_replacements === 'string'
        ? JSON.parse(task.text_replacements)
        : task.text_replacements;

      let totalItems = 0;

      for (const [libraryId, templateId] of Object.entries(mapping)) {
        if (!templateId) continue;

        const mediaItems = await MediaLibraryService.getMediaItems(libraryId, {
          limit: task.poster_count || 9,
          sortBy: task.sort_by
        });

        if (mediaItems.length === 0) {
          console.log(`⚠️ 媒体库 ${libraryId} 没有找到媒体项目，跳过`);
          continue;
        }

        console.log(`📚 媒体库 ${libraryId}: 找到 ${mediaItems.length} 个媒体项目，准备生成组合海报`);
        totalItems += mediaItems.length;

        const placeholders = { ...textReplacements[libraryId] };
        mediaItems.forEach((item, index) => {
          placeholders[`poster${index + 1}`] = item.posterUrl;
        });

        // Ensure primary/secondary keys exist even if empty
        placeholders.primary_title = placeholders.primary || "";
        placeholders.secondary_title = placeholders.secondary || "";

        await this.posterQueue.add("generatePoster", {
          templateId,
          libraryId,
          placeholders,
          uploadEnabled: !!task.upload_enabled,
          executionId
        });
      }

      await this.updateTaskExecution(executionId, {
        status: "completed",
        processed_items: totalItems,
        completed_at: new Date().toISOString()
      });

      await db.run("UPDATE scheduled_tasks SET success_count = success_count + 1 WHERE id = ?", [task.id]);
    } catch (error) {
      console.error(`任务执行失败: ${task.name}`, error);
      await this.updateTaskExecution(executionId, {
        status: "failed",
        error_message: error.message,
        completed_at: new Date().toISOString()
      });
      await db.run("UPDATE scheduled_tasks SET error_count = error_count + 1, last_error = ? WHERE id = ?", [error.message, task.id]);
    }
  }

  async processPosterGeneration(job) {
    const { templateId, libraryId, placeholders, uploadEnabled, executionId } = job.data;
    const posterGenerator = new PosterGenerator();

    try {
      console.log(`🎨 正在执行合成海报生成任务 (媒体库: ${libraryId})`);

      const outputPath = `posters/${libraryId}/collage_${Date.now()}.png`;
      await posterGenerator.generateWithPlaceholders({
        templateId,
        placeholders,
        outputPath
      });

      if (uploadEnabled) {
        // 对于合成海报，我们可能需要特殊处理上传，因为它是库封面，不是单个项目的海报。
        // 目前先记录日志，或者如果 MediaLibraryService 支持库封面上传则调用。
        console.log(`📡 上传选项已开启，但合成海报上传到媒体库封面功能待完善。文件路径: ${outputPath}`);
        // await MediaLibraryService.uploadLibraryCover(libraryId, outputPath);
      }

      console.log(`✅ 合成海报生成完成: ${outputPath}`);
    } catch (error) {
      console.error(`❌ 海报生成失败 (媒体库: ${libraryId})`, error);
      throw error;
    }
  }

  async createTaskExecution(taskId) {
    const db = database.getDb();
    const id = require("crypto").randomBytes(16).toString("hex");
    await db.run(
      "INSERT INTO task_executions (id, task_id, status, started_at) VALUES (?, ?, 'running', datetime('now'))",
      [id, taskId]
    );
    return id;
  }

  async updateTaskExecution(executionId, updates) {
    const db = database.getDb();
    const keys = Object.keys(updates);
    const values = Object.values(updates);
    const setClause = keys.map(k => `${k} = ?`).join(", ");
    await db.run(`UPDATE task_executions SET ${setClause} WHERE id = ?`, [...values, executionId]);
  }

  async triggerTask(taskId) {
    const task = await database.getDb().get("SELECT * FROM scheduled_tasks WHERE id = ?", [taskId]);
    if (!task) throw new Error("任务不存在");
    this.executeTask(task); // 异步执行
    return { success: true, message: "任务已通过后台队列开始执行" };
  }
}

module.exports = new ScheduleService();
