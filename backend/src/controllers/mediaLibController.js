const { Pool } = require("pg");
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");

// 数据库连接池
const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || "library_cover_studio",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "password",
});

class MediaLibraryController {
  // 获取所有媒体库配置
  async getAllMediaLibraries(req, res) {
    try {
      const query = `
        SELECT id, name, type, base_url, username, is_active, 
               last_sync, created_at, updated_at
        FROM media_libraries 
        ORDER BY name ASC
      `;

      const result = await pool.query(query);

      res.json({ mediaLibraries: result.rows });
    } catch (error) {
      console.error("获取媒体库列表失败:", error);
      res.status(500).json({ error: "获取媒体库列表失败" });
    }
  }

  // 根据ID获取媒体库配置
  async getMediaLibraryById(req, res) {
    try {
      const { id } = req.params;

      const query = `
        SELECT * FROM media_libraries WHERE id = $1
      `;

      const result = await pool.query(query, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "媒体库不存在" });
      }

      // 不返回敏感信息
      const mediaLib = result.rows[0];
      delete mediaLib.api_key;
      delete mediaLib.password;

      res.json(mediaLib);
    } catch (error) {
      console.error("获取媒体库失败:", error);
      res.status(500).json({ error: "获取媒体库失败" });
    }
  }

  // 创建新媒体库配置
  async createMediaLibrary(req, res) {
    try {
      const { name, type, baseUrl, apiKey, username, password, config } =
        req.validatedData;
      const id = uuidv4();

      const query = `
        INSERT INTO media_libraries (
          id, name, type, base_url, api_key, username, password, config
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, name, type, base_url, username, is_active, created_at
      `;

      const result = await pool.query(query, [
        id,
        name,
        type,
        baseUrl,
        apiKey,
        username,
        password,
        JSON.stringify(config || {}),
      ]);

      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error("创建媒体库失败:", error);
      res.status(500).json({ error: "创建媒体库失败" });
    }
  }

  // 更新媒体库配置
  async updateMediaLibrary(req, res) {
    try {
      const { id } = req.params;
      const { name, type, baseUrl, apiKey, username, password, config } =
        req.validatedData;

      const query = `
        UPDATE media_libraries 
        SET name = $2, type = $3, base_url = $4, api_key = $5, 
            username = $6, password = $7, config = $8, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING id, name, type, base_url, username, is_active, updated_at
      `;

      const result = await pool.query(query, [
        id,
        name,
        type,
        baseUrl,
        apiKey,
        username,
        password,
        JSON.stringify(config || {}),
      ]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "媒体库不存在" });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error("更新媒体库失败:", error);
      res.status(500).json({ error: "更新媒体库失败" });
    }
  }

  // 删除媒体库配置
  async deleteMediaLibrary(req, res) {
    try {
      const { id } = req.params;

      const query = `DELETE FROM media_libraries WHERE id = $1 RETURNING id`;
      const result = await pool.query(query, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "媒体库不存在" });
      }

      res.json({ message: "媒体库删除成功" });
    } catch (error) {
      console.error("删除媒体库失败:", error);
      res.status(500).json({ error: "删除媒体库失败" });
    }
  }

  // 测试媒体库连接
  async testConnection(req, res) {
    try {
      const { id } = req.params;

      const query = `SELECT * FROM media_libraries WHERE id = $1`;
      const result = await pool.query(query, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "媒体库不存在" });
      }

      const mediaLib = result.rows[0];

      // 根据类型测试连接
      let testResult;
      switch (mediaLib.type) {
        case "jellyfin":
          testResult = await this.testJellyfinConnection(mediaLib);
          break;
        case "emby":
          testResult = await this.testEmbyConnection(mediaLib);
          break;
        case "plex":
          testResult = await this.testPlexConnection(mediaLib);
          break;
        default:
          throw new Error("不支持的媒体库类型");
      }

      res.json({
        success: testResult.success,
        message: testResult.message,
        serverInfo: testResult.serverInfo || null,
      });
    } catch (error) {
      console.error("测试连接失败:", error);
      res.status(500).json({
        success: false,
        error: "连接测试失败",
        message: error.message,
      });
    }
  }

  // 测试Jellyfin连接
  async testJellyfinConnection(mediaLib) {
    try {
      const response = await axios.get(`${mediaLib.base_url}/System/Info`, {
        headers: {
          "X-Emby-Token": mediaLib.api_key,
        },
        timeout: 5000,
      });

      return {
        success: true,
        message: "Jellyfin连接成功",
        serverInfo: {
          name: response.data.ServerName,
          version: response.data.Version,
          id: response.data.Id,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: `Jellyfin连接失败: ${error.message}`,
      };
    }
  }

  // 测试Emby连接
  async testEmbyConnection(mediaLib) {
    try {
      const response = await axios.get(
        `${mediaLib.base_url}/emby/System/Info`,
        {
          headers: {
            "X-Emby-Token": mediaLib.api_key,
          },
          timeout: 5000,
        }
      );

      return {
        success: true,
        message: "Emby连接成功",
        serverInfo: {
          name: response.data.ServerName,
          version: response.data.Version,
          id: response.data.Id,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: `Emby连接失败: ${error.message}`,
      };
    }
  }

  // 测试Plex连接
  async testPlexConnection(mediaLib) {
    try {
      const response = await axios.get(`${mediaLib.base_url}/identity`, {
        headers: {
          "X-Plex-Token": mediaLib.api_key,
        },
        timeout: 5000,
      });

      return {
        success: true,
        message: "Plex连接成功",
        serverInfo: {
          name: response.data.friendlyName,
          version: response.data.version,
          id: response.data.machineIdentifier,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: `Plex连接失败: ${error.message}`,
      };
    }
  }

  // 同步媒体库数据
  async syncMediaLibrary(req, res) {
    try {
      const { id } = req.params;

      const query = `SELECT * FROM media_libraries WHERE id = $1`;
      const result = await pool.query(query, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "媒体库不存在" });
      }

      const mediaLib = result.rows[0];

      // 这里应该实现实际的同步逻辑
      // 为了示例，只是更新最后同步时间
      const updateQuery = `
        UPDATE media_libraries 
        SET last_sync = CURRENT_TIMESTAMP 
        WHERE id = $1
      `;
      await pool.query(updateQuery, [id]);

      res.json({
        message: "媒体库同步已开始",
        syncTime: new Date().toISOString(),
      });
    } catch (error) {
      console.error("同步媒体库失败:", error);
      res.status(500).json({ error: "同步媒体库失败" });
    }
  }

  // 获取媒体库中的媒体项目
  async getMediaItems(req, res) {
    try {
      const { id } = req.params;
      const { type, page = 1, limit = 20 } = req.query;

      const query = `SELECT * FROM media_libraries WHERE id = $1`;
      const result = await pool.query(query, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "媒体库不存在" });
      }

      const mediaLib = result.rows[0];

      // 这里应该根据媒体库类型调用相应的API获取媒体项目
      // 为了示例，返回模拟数据
      const mockItems = [
        {
          id: "1",
          title: "示例电影",
          type: "movie",
          year: 2023,
          rating: 8.5,
        },
        {
          id: "2",
          title: "示例剧集",
          type: "tv",
          year: 2023,
          rating: 9.0,
        },
      ];

      res.json({
        items: mockItems,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: mockItems.length,
          pages: 1,
        },
      });
    } catch (error) {
      console.error("获取媒体项目失败:", error);
      res.status(500).json({ error: "获取媒体项目失败" });
    }
  }
}

module.exports = new MediaLibraryController();
