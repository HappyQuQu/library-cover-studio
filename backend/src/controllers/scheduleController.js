const { Pool } = require("pg");
const scheduleService = require("../services/scheduleService");
const { v4: uuidv4 } = require("uuid");

// 数据库连接池
const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || "library_cover_studio",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "password",
});

class ScheduleController {
  // 获取所有定时任务
  async getAllTasks(req, res) {
    try {
      const { page = 1, limit = 20, isActive } = req.query;
      const offset = (page - 1) * limit;

      let query = `
        SELECT st.*, t.name as template_name, ml.name as media_lib_name
        FROM scheduled_tasks st
        JOIN templates t ON st.template_id = t.id
        JOIN media_libraries ml ON st.media_library_id = ml.id
        WHERE t.deleted_at IS NULL
      `;

      const params = [];

      if (isActive !== undefined) {
        query += ` AND st.is_active = $${params.length + 1}`;
        params.push(isActive === "true");
      }

      query += ` ORDER BY st.created_at DESC LIMIT $${
        params.length + 1
      } OFFSET $${params.length + 2}`;
      params.push(limit, offset);

      const result = await pool.query(query, params);

      // 获取总数
      const countQuery = `
        SELECT COUNT(*) FROM scheduled_tasks st
        JOIN templates t ON st.template_id = t.id
        JOIN media_libraries ml ON st.media_library_id = ml.id
        WHERE t.deleted_at IS NULL
        ${
          isActive !== undefined
            ? ` AND st.is_active = ${isActive === "true"}`
            : ""
        }
      `;
      const countResult = await pool.query(countQuery);

      res.json({
        tasks: result.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: parseInt(countResult.rows[0].count),
          pages: Math.ceil(countResult.rows[0].count / limit),
        },
      });
    } catch (error) {
      console.error("获取任务列表失败:", error);
      res.status(500).json({ error: "获取任务列表失败" });
    }
  }

  // 根据ID获取定时任务
  async getTaskById(req, res) {
    try {
      const { id } = req.params;

      const query = `
        SELECT st.*, t.name as template_name, ml.name as media_lib_name
        FROM scheduled_tasks st
        JOIN templates t ON st.template_id = t.id
        JOIN media_libraries ml ON st.media_library_id = ml.id
        WHERE st.id = $1 AND t.deleted_at IS NULL
      `;

      const result = await pool.query(query, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "任务不存在" });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error("获取任务失败:", error);
      res.status(500).json({ error: "获取任务失败" });
    }
  }

  // 创建新定时任务
  async createTask(req, res) {
    try {
      const {
        name,
        templateId,
        mediaLibraryId,
        cronExpression,
        filters,
        isActive,
      } = req.validatedData;
      const id = uuidv4();

      // 验证模板和媒体库是否存在
      const templateQuery = `SELECT id FROM templates WHERE id = $1 AND deleted_at IS NULL`;
      const templateResult = await pool.query(templateQuery, [templateId]);

      if (templateResult.rows.length === 0) {
        return res.status(400).json({ error: "模板不存在" });
      }

      const mediaLibQuery = `SELECT id FROM media_libraries WHERE id = $1`;
      const mediaLibResult = await pool.query(mediaLibQuery, [mediaLibraryId]);

      if (mediaLibResult.rows.length === 0) {
        return res.status(400).json({ error: "媒体库不存在" });
      }

      const query = `
        INSERT INTO scheduled_tasks (
          id, name, template_id, media_library_id, cron_expression, filters, is_active
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;

      const result = await pool.query(query, [
        id,
        name,
        templateId,
        mediaLibraryId,
        cronExpression,
        JSON.stringify(filters || {}),
        isActive || false,
      ]);

      // 如果任务激活，添加到调度器
      if (isActive) {
        await scheduleService.loadScheduledTasks();
      }

      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error("创建任务失败:", error);
      res.status(500).json({ error: "创建任务失败" });
    }
  }

  // 更新定时任务
  async updateTask(req, res) {
    try {
      const { id } = req.params;
      const {
        name,
        templateId,
        mediaLibraryId,
        cronExpression,
        filters,
        isActive,
      } = req.validatedData;

      const query = `
        UPDATE scheduled_tasks 
        SET name = $2, template_id = $3, media_library_id = $4, 
            cron_expression = $5, filters = $6, is_active = $7, 
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *
      `;

      const result = await pool.query(query, [
        id,
        name,
        templateId,
        mediaLibraryId,
        cronExpression,
        JSON.stringify(filters || {}),
        isActive,
      ]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "任务不存在" });
      }

      // 重新加载调度任务
      await scheduleService.loadScheduledTasks();

      res.json(result.rows[0]);
    } catch (error) {
      console.error("更新任务失败:", error);
      res.status(500).json({ error: "更新任务失败" });
    }
  }

  // 删除定时任务
  async deleteTask(req, res) {
    try {
      const { id } = req.params;

      const query = `DELETE FROM scheduled_tasks WHERE id = $1 RETURNING id`;
      const result = await pool.query(query, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "任务不存在" });
      }

      // 重新加载调度任务
      await scheduleService.loadScheduledTasks();

      res.json({ message: "任务删除成功" });
    } catch (error) {
      console.error("删除任务失败:", error);
      res.status(500).json({ error: "删除任务失败" });
    }
  }

  // 手动触发任务
  async triggerTask(req, res) {
    try {
      const { id } = req.params;

      const result = await scheduleService.triggerTask(id);

      res.json(result);
    } catch (error) {
      console.error("触发任务失败:", error);
      res.status(500).json({ error: error.message || "触发任务失败" });
    }
  }

  // 启用/禁用任务
  async toggleTask(req, res) {
    try {
      const { id } = req.params;
      const { isActive } = req.body;

      const query = `
        UPDATE scheduled_tasks 
        SET is_active = $2, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *
      `;

      const result = await pool.query(query, [id, isActive]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "任务不存在" });
      }

      // 重新加载调度任务
      await scheduleService.loadScheduledTasks();

      res.json({
        message: `任务已${isActive ? "启用" : "禁用"}`,
        task: result.rows[0],
      });
    } catch (error) {
      console.error("切换任务状态失败:", error);
      res.status(500).json({ error: "切换任务状态失败" });
    }
  }

  // 获取任务执行历史
  async getTaskExecutions(req, res) {
    try {
      const { id } = req.params;
      const { page = 1, limit = 20 } = req.query;
      const offset = (page - 1) * limit;

      const query = `
        SELECT * FROM task_executions 
        WHERE task_id = $1 
        ORDER BY started_at DESC 
        LIMIT $2 OFFSET $3
      `;

      const result = await pool.query(query, [id, limit, offset]);

      // 获取总数
      const countQuery = `SELECT COUNT(*) FROM task_executions WHERE task_id = $1`;
      const countResult = await pool.query(countQuery, [id]);

      res.json({
        executions: result.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: parseInt(countResult.rows[0].count),
          pages: Math.ceil(countResult.rows[0].count / limit),
        },
      });
    } catch (error) {
      console.error("获取执行历史失败:", error);
      res.status(500).json({ error: "获取执行历史失败" });
    }
  }

  // 获取队列状态
  async getQueueStats(req, res) {
    try {
      const stats = await scheduleService.getQueueStats();
      res.json(stats);
    } catch (error) {
      console.error("获取队列状态失败:", error);
      res.status(500).json({ error: "获取队列状态失败" });
    }
  }
}

module.exports = new ScheduleController();
