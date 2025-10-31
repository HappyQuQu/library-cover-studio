const express = require("express");
const router = express.Router();
const JellyfinService = require("../services/jellyfinService");
const { getInstance: getScheduler } = require("../services/schedulerService");

/**
 * 测试连接
 * POST /api/jellyfin/test-connection
 */
router.post("/test-connection", async (req, res) => {
  try {
    const { baseURL, apiKey, userId } = req.body;

    if (!baseURL || !apiKey) {
      return res.status(400).json({
        success: false,
        message: "缺少必要参数: baseURL 和 apiKey",
      });
    }

    const jellyfinService = new JellyfinService({
      baseURL,
      apiKey,
      userId: userId || "",
    });

    const authInfo = await jellyfinService.getAuthInfo();

    res.json({
      success: true,
      message: "连接成功",
      serverInfo: {
        serverName: authInfo.ServerName,
        version: authInfo.Version,
        operatingSystem: authInfo.OperatingSystem,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "连接失败: " + error.message,
    });
  }
});

/**
 * 获取媒体库列表
 * POST /api/jellyfin/libraries
 */
router.post("/libraries", async (req, res) => {
  try {
    const { baseURL, apiKey, userId, excludeLibraries = [] } = req.body;

    if (!baseURL || !apiKey) {
      return res.status(400).json({
        success: false,
        message: "缺少必要参数: baseURL 和 apiKey",
      });
    }

    const jellyfinService = new JellyfinService({
      baseURL,
      apiKey,
      userId: userId || "",
    });

    const libraries = await jellyfinService.getLibraries(excludeLibraries);

    res.json({
      success: true,
      libraries,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "获取媒体库失败: " + error.message,
    });
  }
});

/**
 * 获取媒体项
 * POST /api/jellyfin/items
 */
router.post("/items", async (req, res) => {
  try {
    const {
      baseURL,
      apiKey,
      userId,
      libraryId,
      sortBy = "DateCreated",
      limit,
    } = req.body;

    if (!baseURL || !apiKey || !libraryId) {
      return res.status(400).json({
        success: false,
        message: "缺少必要参数: baseURL, apiKey, libraryId",
      });
    }

    const jellyfinService = new JellyfinService({
      baseURL,
      apiKey,
      userId: userId || "",
    });

    const items = await jellyfinService.getMediaItems(libraryId, {
      sortBy,
      limit,
    });

    res.json({
      success: true,
      count: items.length,
      items: items.map((item) => ({
        id: item.Id,
        name: item.Name,
        type: item.Type,
        year: item.ProductionYear,
        hasPoster: !!(item.ImageTags && item.ImageTags.Primary),
      })),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "获取媒体项失败: " + error.message,
    });
  }
});

/**
 * 添加定时任务
 * POST /api/jellyfin/schedule/add
 */
router.post("/schedule/add", async (req, res) => {
  try {
    const {
      taskId,
      cronExpression,
      servers,
      excludeLibraries = [],
      templateMapping = {},
      defaultTemplateId,
      posterCount = 9,
      uploadEnabled = true,
      runImmediately = false,
    } = req.body;

    if (!taskId || !cronExpression || !servers || servers.length === 0) {
      return res.status(400).json({
        success: false,
        message: "缺少必要参数: taskId, cronExpression, servers",
      });
    }

    const scheduler = getScheduler();

    const taskInfo = scheduler.addTask(taskId, cronExpression, servers, {
      excludeLibraries,
      templateMapping,
      defaultTemplateId,
      posterCount,
      uploadEnabled,
      runImmediately,
    });

    res.json({
      success: true,
      message: "定时任务已添加",
      task: taskInfo,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "添加任务失败: " + error.message,
    });
  }
});

/**
 * 获取所有定时任务
 * GET /api/jellyfin/schedule/list
 */
router.get("/schedule/list", async (req, res) => {
  try {
    const scheduler = getScheduler();
    const tasks = scheduler.getAllTasks();

    res.json({
      success: true,
      tasks,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "获取任务列表失败: " + error.message,
    });
  }
});

/**
 * 启动任务
 * POST /api/jellyfin/schedule/start/:taskId
 */
router.post("/schedule/start/:taskId", async (req, res) => {
  try {
    const { taskId } = req.params;
    const scheduler = getScheduler();

    scheduler.startTask(taskId);

    res.json({
      success: true,
      message: `任务 ${taskId} 已启动`,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "启动任务失败: " + error.message,
    });
  }
});

/**
 * 停止任务
 * POST /api/jellyfin/schedule/stop/:taskId
 */
router.post("/schedule/stop/:taskId", async (req, res) => {
  try {
    const { taskId } = req.params;
    const scheduler = getScheduler();

    scheduler.stopTask(taskId);

    res.json({
      success: true,
      message: `任务 ${taskId} 已停止`,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "停止任务失败: " + error.message,
    });
  }
});

/**
 * 手动触发任务
 * POST /api/jellyfin/schedule/trigger/:taskId
 */
router.post("/schedule/trigger/:taskId", async (req, res) => {
  try {
    const { taskId } = req.params;
    const scheduler = getScheduler();

    // 异步执行
    scheduler.triggerTask(taskId).catch((error) => {
      console.error(`任务执行失败:`, error);
    });

    res.json({
      success: true,
      message: `任务 ${taskId} 已触发`,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "触发任务失败: " + error.message,
    });
  }
});

/**
 * 删除任务
 * DELETE /api/jellyfin/schedule/:taskId
 */
router.delete("/schedule/:taskId", async (req, res) => {
  try {
    const { taskId } = req.params;
    const scheduler = getScheduler();

    scheduler.removeTask(taskId);

    res.json({
      success: true,
      message: `任务 ${taskId} 已删除`,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "删除任务失败: " + error.message,
    });
  }
});

module.exports = router;
