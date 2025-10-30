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
      const { name, templateId, mediaLibraryId, cronExpression, filters } = req.body;
      const id = crypto.randomBytes(16).toString("hex");

      await db.run(
        "INSERT INTO scheduled_tasks (id, name, template_id, media_library_id, cron_expression, filters) VALUES (?, ?, ?, ?, ?, ?)",
        [id, name, templateId, mediaLibraryId, cronExpression, JSON.stringify(filters || {})]
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
      const { name, templateId, mediaLibraryId, cronExpression, filters } = req.body;

      const existing = await db.get("SELECT * FROM scheduled_tasks WHERE id = ?", [id]);

      if (!existing) {
        return res.status(404).json({ error: "任务不存在" });
      }

      await db.run(
        "UPDATE scheduled_tasks SET name = ?, template_id = ?, media_library_id = ?, cron_expression = ?, filters = ? WHERE id = ?",
        [name, templateId, mediaLibraryId, cronExpression, JSON.stringify(filters || {}), id]
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
      res.json({ message: "手动触发功能待实现" });
    } catch (error) {
      console.error("触发任务失败:", error);
      res.status(500).json({ error: "触发任务失败" });
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
