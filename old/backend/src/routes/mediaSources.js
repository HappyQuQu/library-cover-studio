const express = require("express");
const router = express.Router();
const db = require("../services/database");
const MediaServerService = require("../services/mediaServerService");
const { authenticate } = require("../middleware/auth");

/**
 * 获取所有媒体源
 * GET /api/media-sources
 */
router.get("/", async (req, res) => {
  try {
    const database = db.getDb();
    const mediaSources = await database.all(
      `SELECT id, name, type, base_url, user_id, is_active, last_sync, created_at, updated_at
       FROM media_libraries 
       ORDER BY created_at DESC`
    );

    res.json({
      success: true,
      data: mediaSources,
    });
  } catch (error) {
    console.error("Error fetching media sources:", error);
    res.status(500).json({
      success: false,
      message: "获取媒体源列表失败: " + error.message,
    });
  }
});

/**
 * 获取单个媒体源
 * GET /api/media-sources/:id
 */
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const mediaSource = await db.getDb().get(
      `SELECT id, name, type, base_url, api_key, user_id, is_active, last_sync, config, created_at, updated_at
       FROM media_libraries 
       WHERE id = ?`,
      [id]
    );

    if (!mediaSource) {
      return res.status(404).json({
        success: false,
        message: "媒体源不存在",
      });
    }

    res.json({
      success: true,
      data: mediaSource,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "获取媒体源失败: " + error.message,
    });
  }
});

/**
 * 创建媒体源
 * POST /api/media-sources
 */
router.post("/", async (req, res) => {
  try {
    const { name, type, baseURL, apiKey, userId } = req.body;

    if (!name || !type || !baseURL || !apiKey) {
      return res.status(400).json({
        success: false,
        message: "缺少必要参数: name, type, baseURL, apiKey",
      });
    }

    // 验证连接
    try {
      const mediaServer = new MediaServerService({
        baseURL,
        apiKey,
        userId: userId || "",
      });
      await mediaServer.getAuthInfo();
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: "无法连接到媒体服务器: " + error.message,
      });
    }

    const result = await db.getDb().run(
      `INSERT INTO media_libraries (name, type, base_url, api_key, user_id)
       VALUES (?, ?, ?, ?, ?)`,
      [name, type, baseURL, apiKey, userId || null]
    );

    res.json({
      success: true,
      message: "媒体源创建成功",
      data: {
        id: result.lastID,
        name,
        type,
        baseURL,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "创建媒体源失败: " + error.message,
    });
  }
});

/**
 * 更新媒体源
 * PUT /api/media-sources/:id
 */
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, type, baseURL, apiKey, userId, isActive } = req.body;

    // 验证媒体源是否存在
    const existing = await db
      .getDb()
      .get("SELECT id FROM media_libraries WHERE id = ?", [id]);

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "媒体源不存在",
      });
    }

    // 如果提供了连接信息,验证连接
    if (baseURL && apiKey) {
      try {
        const mediaServer = new MediaServerService({
          baseURL,
          apiKey,
          userId: userId || "",
        });
        await mediaServer.getAuthInfo();
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: "无法连接到媒体服务器: " + error.message,
        });
      }
    }

    const updates = [];
    const values = [];

    if (name !== undefined) {
      updates.push("name = ?");
      values.push(name);
    }
    if (type !== undefined) {
      updates.push("type = ?");
      values.push(type);
    }
    if (baseURL !== undefined) {
      updates.push("base_url = ?");
      values.push(baseURL);
    }
    if (apiKey !== undefined) {
      updates.push("api_key = ?");
      values.push(apiKey);
    }
    if (userId !== undefined) {
      updates.push("user_id = ?");
      values.push(userId);
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

    await db
      .getDb()
      .run(
        `UPDATE media_libraries SET ${updates.join(", ")} WHERE id = ?`,
        values
      );

    res.json({
      success: true,
      message: "媒体源更新成功",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "更新媒体源失败: " + error.message,
    });
  }
});

/**
 * 删除媒体源
 * DELETE /api/media-sources/:id
 */
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db
      .getDb()
      .run("DELETE FROM media_libraries WHERE id = ?", [id]);

    if (result.changes === 0) {
      return res.status(404).json({
        success: false,
        message: "媒体源不存在",
      });
    }

    res.json({
      success: true,
      message: "媒体源删除成功",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "删除媒体源失败: " + error.message,
    });
  }
});

/**
 * 测试媒体源连接
 * POST /api/media-sources/:id/test
 */
router.post("/:id/test", async (req, res) => {
  try {
    const { id } = req.params;

    const mediaSource = await db
      .getDb()
      .get(
        `SELECT base_url, api_key, user_id FROM media_libraries WHERE id = ?`,
        [id]
      );

    if (!mediaSource) {
      return res.status(404).json({
        success: false,
        message: "媒体源不存在",
      });
    }

    const mediaServer = new MediaServerService({
      baseURL: mediaSource.base_url,
      apiKey: mediaSource.api_key,
      userId: mediaSource.user_id || "",
    });

    const authInfo = await mediaServer.getAuthInfo();

    // 兼容不同服务或版本字段差异，尽量补全系统信息
    const operatingSystem =
      authInfo.OperatingSystem ||
      authInfo.OperatingSystemName ||
      authInfo.OS ||
      authInfo.OsName ||
      authInfo.System ||
      "";

    res.json({
      success: true,
      message: "连接成功",
      serverInfo: {
        serverName: authInfo.ServerName || authInfo.ServerNameValue || "",
        version: authInfo.Version || authInfo.ServerVersion || "",
        operatingSystem,
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
 * 获取媒体源的媒体库列表
 * GET /api/media-sources/:id/libraries
 */
router.get("/:id/libraries", async (req, res) => {
  try {
    const { id } = req.params;

    const mediaSource = await db
      .getDb()
      .get(
        `SELECT base_url, api_key, user_id FROM media_libraries WHERE id = ?`,
        [id]
      );

    if (!mediaSource) {
      return res.status(404).json({
        success: false,
        message: "媒体源不存在",
      });
    }

    const mediaServer = new MediaServerService({
      baseURL: mediaSource.base_url,
      apiKey: mediaSource.api_key,
      userId: mediaSource.user_id || "",
    });

    const libraries = await mediaServer.getLibraries();

    // 更新最后同步时间
    await db
      .getDb()
      .run(
        "UPDATE media_libraries SET last_sync = CURRENT_TIMESTAMP WHERE id = ?",
        [id]
      );

    res.json({
      success: true,
      data: libraries,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "获取媒体库列表失败: " + error.message,
    });
  }
});

module.exports = router;
