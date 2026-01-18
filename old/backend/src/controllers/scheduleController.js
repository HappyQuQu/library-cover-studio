const database = require("../services/database");
const crypto = require("crypto");

class ScheduleController {
  async getAllTasks(req, res) {
    try {
      const db = database.getDb();
      const tasks = await db.all(
        "SELECT * FROM scheduled_tasks ORDER BY created_at DESC"
      );
      res.json(tasks);
    } catch (error) {
      console.error("获取任务列表失败:", error);
      res.status(500).json({ error: "获取任务列表失败" });
    }
  }

  async getTaskById(req, res) {
    try {
      const db = database.getDb();
      const task = await db.get(
        "SELECT * FROM scheduled_tasks WHERE id = ?",
        [req.params.id]
      );

      if (!task) {
        return res.status(404).json({ error: "任务不存在" });
      }

      res.json(task);
    } catch (error) {
      console.error("获取任务失败:", error);
      res.status(500).json({ error: "获取任务失败" });
    }
  }

  async createTask(req, res) {
    try {
      const db = database.getDb();
      const { name, mediaSourceId, libraryTemplateMapping, textReplacements, cronExpression, posterCount, uploadEnabled, sortBy } = req.body;
      const id = crypto.randomBytes(16).toString("hex");

      await db.run(
        "INSERT INTO scheduled_tasks (id, name, media_source_id, library_template_mapping, text_replacements, cron_expression, poster_count, upload_enabled, sort_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          id,
          name,
          mediaSourceId,
          JSON.stringify(libraryTemplateMapping || {}),
          JSON.stringify(textReplacements || {}),
          cronExpression,
          posterCount || 9,
          uploadEnabled ? 1 : 0,
          sortBy || 'DateCreated'
        ]
      );

      const newTask = await db.get("SELECT * FROM scheduled_tasks WHERE id = ?", [id]);
      res.status(201).json(newTask);
    } catch (error) {
      console.error("创建任务失败:", error);
      res.status(500).json({ error: "创建任务失败" });
    }
  }

  async updateTask(req, res) {
    try {
      const db = database.getDb();
      const { id } = req.params;
      const { name, mediaSourceId, libraryTemplateMapping, textReplacements, cronExpression, posterCount, uploadEnabled, sortBy } = req.body;

      const existing = await db.get("SELECT * FROM scheduled_tasks WHERE id = ?", [id]);

      if (!existing) {
        return res.status(404).json({ error: "任务不存在" });
      }

      await db.run(
        "UPDATE scheduled_tasks SET name = ?, media_source_id = ?, library_template_mapping = ?, text_replacements = ?, cron_expression = ?, poster_count = ?, upload_enabled = ?, sort_by = ? WHERE id = ?",
        [
          name,
          mediaSourceId,
          JSON.stringify(libraryTemplateMapping || {}),
          JSON.stringify(textReplacements || {}),
          cronExpression,
          posterCount,
          uploadEnabled ? 1 : 0,
          sortBy,
          id
        ]
      );

      const updatedTask = await db.get("SELECT * FROM scheduled_tasks WHERE id = ?", [id]);
      res.json(updatedTask);
    } catch (error) {
      console.error("更新任务失败:", error);
      res.status(500).json({ error: "更新任务失败" });
    }
  }

  async deleteTask(req, res) {
    try {
      const db = database.getDb();
      const { id } = req.params;

      const existing = await db.get("SELECT * FROM scheduled_tasks WHERE id = ?", [id]);

      if (!existing) {
        return res.status(404).json({ error: "任务不存在" });
      }

      await db.run("DELETE FROM scheduled_tasks WHERE id = ?", [id]);
      res.json({ message: "任务已删除" });
    } catch (error) {
      console.error("删除任务失败:", error);
      res.status(500).json({ error: "删除任务失败" });
    }
  }

  async triggerTask(req, res) {
    try {
      const { id } = req.params;
      const scheduleService = require("../services/scheduleService");
      const result = await scheduleService.triggerTask(id);
      res.json(result);
    } catch (error) {
      console.error("触发任务失败:", error);
      res.status(500).json({ error: "触发任务失败: " + error.message });
    }
  }

  async toggleTask(req, res) {
    try {
      const db = database.getDb();
      const { id } = req.params;

      const task = await db.get("SELECT * FROM scheduled_tasks WHERE id = ?", [id]);

      if (!task) {
        return res.status(404).json({ error: "任务不存在" });
      }

      const newStatus = task.is_active ? 0 : 1;
      await db.run("UPDATE scheduled_tasks SET is_active = ? WHERE id = ?", [newStatus, id]);

      const updatedTask = await db.get("SELECT * FROM scheduled_tasks WHERE id = ?", [id]);
      res.json(updatedTask);
    } catch (error) {
      console.error("切换任务状态失败:", error);
      res.status(500).json({ error: "切换任务状态失败" });
    }
  }

  async getTaskExecutions(req, res) {
    try {
      const db = database.getDb();
      const { id } = req.params;

      const executions = await db.all(
        "SELECT * FROM task_executions WHERE task_id = ? ORDER BY started_at DESC",
        [id]
      );

      res.json(executions);
    } catch (error) {
      console.error("获取执行历史失败:", error);
      res.status(500).json({ error: "获取执行历史失败" });
    }
  }

  async getQueueStats(req, res) {
    try {
      res.json({ message: "队列统计功能待实现", stats: {} });
    } catch (error) {
      console.error("获取队列统计失败:", error);
      res.status(500).json({ error: "获取队列统计失败" });
    }
  }
}

module.exports = new ScheduleController();
