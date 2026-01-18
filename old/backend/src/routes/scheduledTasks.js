const express = require("express");
const router = express.Router();
const db = require("../services/database");
const { getInstance: getScheduler } = require("../services/schedulerService");
const cron = require("node-cron");
const { authenticate } = require("../middleware/auth");

/**
 * 获取所有定时任务
 * GET /api/scheduled-tasks
 */
router.get("/", authenticate, async (req, res) => {
  try {
    const tasks = await db.getDb().all(
      `SELECT 
        st.*,
        ml.name as media_source_name,
        ml.type as media_source_type
       FROM scheduled_tasks st
       LEFT JOIN media_libraries ml ON st.media_source_id = ml.id
       ORDER BY st.created_at DESC`
    );

    res.json({
      success: true,
      data: tasks,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "获取定时任务列表失败: " + error.message,
    });
  }
});

/**
 * 获取单个定时任务
 * GET /api/scheduled-tasks/:id
 */
router.get("/:id", authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const task = await db.getDb().get(
      `SELECT 
        st.*,
        ml.name as media_source_name,
        ml.type as media_source_type,
        ml.base_url as media_source_url
       FROM scheduled_tasks st
       LEFT JOIN media_libraries ml ON st.media_source_id = ml.id
       WHERE st.id = ?`,
      [id]
    );

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "定时任务不存在",
      });
    }

    res.json({
      success: true,
      data: task,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "获取定时任务失败: " + error.message,
    });
  }
});

/**
 * 创建定时任务
 * POST /api/scheduled-tasks
 */
router.post("/", authenticate, async (req, res) => {
  try {
    const {
      name,
      mediaSourceId,
      libraryTemplateMapping, // { "libraryId1": "templateId1", "libraryId2": "templateId2" }
      excludeLibraries = [],
      cronExpression,
      posterCount = 9,
      uploadEnabled = true,
      sortBy = "DateCreated",
      isActive = true,
    } = req.body;

    // 验证必要参数
    if (!name || !mediaSourceId || !cronExpression) {
      return res.status(400).json({
        success: false,
        message: "缺少必要参数: name, mediaSourceId, cronExpression",
      });
    }

    // 验证 cron 表达式
    if (!cron.validate(cronExpression)) {
      return res.status(400).json({
        success: false,
        message: "无效的 cron 表达式",
      });
    }

    // 验证媒体源是否存在
    const mediaSource = await db.getDb().get(
      "SELECT id FROM media_libraries WHERE id = ?",
      [mediaSourceId]
    );

    if (!mediaSource) {
      return res.status(404).json({
        success: false,
        message: "媒体源不存在",
      });
    }

    // 验证模板是否存在
    if (libraryTemplateMapping) {
      const templateIds = Object.values(libraryTemplateMapping);
      for (const templateId of templateIds) {
        const template = await db.getDb().get("SELECT id FROM templates WHERE id = ?", [
          templateId,
        ]);
        if (!template) {
          return res.status(404).json({
            success: false,
            message: `模板不存在: ${templateId}`,
          });
        }
      }
    }

    // 创建任务
    const result = await db.getDb().run(
      `INSERT INTO scheduled_tasks (
        name, media_source_id, library_template_mapping, exclude_libraries,
        cron_expression, poster_count, upload_enabled, sort_by, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        mediaSourceId,
        JSON.stringify(libraryTemplateMapping || {}),
        JSON.stringify(excludeLibraries),
        cronExpression,
        posterCount,
        uploadEnabled ? 1 : 0,
        sortBy,
        isActive ? 1 : 0,
      ]
    );

    const taskId = result.lastID;

    // 如果任务是激活状态,添加到调度器
    if (isActive) {
      await startScheduledTask(taskId);
    }

    res.json({
      success: true,
      message: "定时任务创建成功",
      data: {
        id: taskId,
        name,
      },
    });
  } catch (error) {
    console.error("创建定时任务失败:", error);
    res.status(500).json({
      success: false,
      message: "创建定时任务失败: " + error.message,
    });
  }
});

/**
 * 更新定时任务
 * PUT /api/scheduled-tasks/:id
 */
router.put("/:id", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      mediaSourceId,
      libraryTemplateMapping,
      excludeLibraries,
      cronExpression,
      posterCount,
      uploadEnabled,
      sortBy,
      isActive,
    } = req.body;

    // 验证任务是否存在
    const existing = await db.getDb().get(
      "SELECT id, is_active FROM scheduled_tasks WHERE id = ?",
      [id]
    );

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "定时任务不存在",
      });
    }

    // 验证 cron 表达式
    if (cronExpression && !cron.validate(cronExpression)) {
      return res.status(400).json({
        success: false,
        message: "无效的 cron 表达式",
      });
    }

    const updates = [];
    const values = [];

    if (name !== undefined) {
      updates.push("name = ?");
      values.push(name);
    }
    if (mediaSourceId !== undefined) {
      updates.push("media_source_id = ?");
      values.push(mediaSourceId);
    }
    if (libraryTemplateMapping !== undefined) {
      updates.push("library_template_mapping = ?");
      values.push(JSON.stringify(libraryTemplateMapping));
    }
    if (excludeLibraries !== undefined) {
      updates.push("exclude_libraries = ?");
      values.push(JSON.stringify(excludeLibraries));
    }
    if (cronExpression !== undefined) {
      updates.push("cron_expression = ?");
      values.push(cronExpression);
    }
    if (posterCount !== undefined) {
      updates.push("poster_count = ?");
      values.push(posterCount);
    }
    if (uploadEnabled !== undefined) {
      updates.push("upload_enabled = ?");
      values.push(uploadEnabled ? 1 : 0);
    }
    if (sortBy !== undefined) {
      updates.push("sort_by = ?");
      values.push(sortBy);
    }
    if (isActive !== undefined) {
      updates.push("is_active = ?");
      values.push(isActive ? 1 : 0);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: "没有要更新的字段",
      });
    }

    values.push(id);

    await db.getDb().run(
      `UPDATE scheduled_tasks SET ${updates.join(", ")} WHERE id = ?`,
      values
    );

    // 重新加载调度器
    const scheduler = getScheduler();
    try {
      scheduler.stopTask(`task-${id}`);
      scheduler.removeTask(`task-${id}`);
    } catch (error) {
      // 任务可能不存在,忽略错误
    }

    if (isActive !== false) {
      await startScheduledTask(id);
    }

    res.json({
      success: true,
      message: "定时任务更新成功",
    });
  } catch (error) {
    console.error("更新定时任务失败:", error);
    res.status(500).json({
      success: false,
      message: "更新定时任务失败: " + error.message,
    });
  }
});

/**
 * 删除定时任务
 * DELETE /api/scheduled-tasks/:id
 */
router.delete("/:id", authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    // 从调度器中移除
    const scheduler = getScheduler();
    try {
      scheduler.stopTask(`task-${id}`);
      scheduler.removeTask(`task-${id}`);
    } catch (error) {
      // 任务可能不存在,忽略错误
    }

    const result = await db.getDb().run("DELETE FROM scheduled_tasks WHERE id = ?", [
      id,
    ]);

    if (result.changes === 0) {
      return res.status(404).json({
        success: false,
        message: "定时任务不存在",
      });
    }

    res.json({
      success: true,
      message: "定时任务删除成功",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "删除定时任务失败: " + error.message,
    });
  }
});

/**
 * 启用/禁用定时任务
 * POST /api/scheduled-tasks/:id/toggle
 */
router.post("/:id/toggle", authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const task = await db.getDb().get(
      "SELECT id, is_active FROM scheduled_tasks WHERE id = ?",
      [id]
    );

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "定时任务不存在",
      });
    }

    const newStatus = !task.is_active;

    await db.getDb().run("UPDATE scheduled_tasks SET is_active = ? WHERE id = ?", [
      newStatus ? 1 : 0,
      id,
    ]);

    const scheduler = getScheduler();

    if (newStatus) {
      await startScheduledTask(id);
    } else {
      try {
        scheduler.stopTask(`task-${id}`);
        scheduler.removeTask(`task-${id}`);
      } catch (error) {
        // 忽略错误
      }
    }

    res.json({
      success: true,
      message: newStatus ? "任务已启用" : "任务已禁用",
      isActive: newStatus,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "切换任务状态失败: " + error.message,
    });
  }
});

/**
 * 手动触发任务
 * POST /api/scheduled-tasks/:id/trigger
 */
router.post("/:id/trigger", authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const task = await db.getDb().get("SELECT id FROM scheduled_tasks WHERE id = ?", [
      id,
    ]);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "定时任务不存在",
      });
    }

    // 异步执行任务
    executeTask(id).catch((error) => {
      console.error(`任务执行失败 (${id}):`, error);
    });

    res.json({
      success: true,
      message: "任务已触发",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "触发任务失败: " + error.message,
    });
  }
});

/**
 * 获取任务执行历史
 * GET /api/scheduled-tasks/:id/executions
 */
router.get("/:id/executions", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 10 } = req.query;

    const executions = await db.getDb().all(
      `SELECT * FROM task_executions 
       WHERE task_id = ? 
       ORDER BY started_at DESC 
       LIMIT ?`,
      [id, parseInt(limit)]
    );

    res.json({
      success: true,
      data: executions,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "获取执行历史失败: " + error.message,
    });
  }
});

/**
 * 启动调度任务
 */
async function startScheduledTask(taskId) {
  const task = await db.getDb().get(
    `SELECT 
      st.*,
      ml.base_url,
      ml.api_key,
      ml.user_id,
      ml.name as source_name
     FROM scheduled_tasks st
     JOIN media_libraries ml ON st.media_source_id = ml.id
     WHERE st.id = ?`,
    [taskId]
  );

  if (!task) {
    throw new Error("任务不存在");
  }

  const scheduler = getScheduler();
  const WorkflowService = require("../services/workflowService");
  const workflowService = new WorkflowService();

  scheduler.addTask(
    `task-${taskId}`,
    task.cron_expression,
    [
      {
        name: task.source_name,
        baseURL: task.base_url,
        apiKey: task.api_key,
        userId: task.user_id,
      },
    ],
    {
      taskId,
      excludeLibraries: JSON.parse(task.exclude_libraries || "[]"),
      templateMapping: JSON.parse(task.library_template_mapping || "{}"),
      posterCount: task.poster_count,
      uploadEnabled: task.upload_enabled,
      sortBy: task.sort_by,
      runImmediately: false,
    }
  );
}

/**
 * 执行任务
 */
async function executeTask(taskId) {
  const task = await db.getDb().get(
    `SELECT 
      st.*,
      ml.base_url,
      ml.api_key,
      ml.user_id,
      ml.name as source_name
     FROM scheduled_tasks st
     JOIN media_libraries ml ON st.media_source_id = ml.id
     WHERE st.id = ?`,
    [taskId]
  );

  if (!task) {
    throw new Error("任务不存在");
  }

  // 创建执行记录
  const execution = await db.getDb().run(
    `INSERT INTO task_executions (task_id, status, started_at)
     VALUES (?, 'running', CURRENT_TIMESTAMP)`,
    [taskId]
  );

  const executionId = execution.lastID;

  try {
    const WorkflowService = require("../services/workflowService");
    const workflowService = new WorkflowService();

    const results = await workflowService.processLibraries(
      {
        name: task.source_name,
        baseURL: task.base_url,
        apiKey: task.api_key,
        userId: task.user_id,
      },
      {
        excludeLibraries: JSON.parse(task.exclude_libraries || "[]"),
        templateMapping: JSON.parse(task.library_template_mapping || "{}"),
        posterCount: task.poster_count,
        uploadEnabled: task.upload_enabled,
        sortBy: task.sort_by,
      }
    );

    const successCount = results.filter((r) => r.success).length;
    const failedCount = results.length - successCount;

    // 更新执行记录
    await db.getDb().run(
      `UPDATE task_executions 
       SET status = 'completed', 
           completed_at = CURRENT_TIMESTAMP,
           processed_items = ?,
           failed_items = ?,
           execution_log = ?
       WHERE id = ?`,
      [successCount, failedCount, JSON.stringify(results), executionId]
    );

    // 更新任务统计
    await db.getDb().run(
      `UPDATE scheduled_tasks 
       SET last_run = CURRENT_TIMESTAMP,
           run_count = run_count + 1,
           success_count = success_count + ?
       WHERE id = ?`,
      [successCount, taskId]
    );
  } catch (error) {
    // 更新执行记录为失败
    await db.getDb().run(
      `UPDATE task_executions 
       SET status = 'failed',
           completed_at = CURRENT_TIMESTAMP,
           error_message = ?
       WHERE id = ?`,
      [error.message, executionId]
    );

    // 更新任务统计
    await db.getDb().run(
      `UPDATE scheduled_tasks 
       SET last_run = CURRENT_TIMESTAMP,
           run_count = run_count + 1,
           error_count = error_count + 1,
           last_error = ?
       WHERE id = ?`,
      [error.message, taskId]
    );

    throw error;
  }
}

module.exports = router;
