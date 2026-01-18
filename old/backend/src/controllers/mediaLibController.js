const database = require("../services/database");
const crypto = require("crypto");

class MediaLibController {
  async getAllMediaLibraries(req, res) {
    try {
      const db = database.getDb();
      const libraries = await db.all(
        "SELECT * FROM media_libraries ORDER BY created_at DESC"
      );
      res.json(libraries);
    } catch (error) {
      console.error("获取媒体库列表失败:", error);
      res.status(500).json({ error: "获取媒体库列表失败" });
    }
  }

  async getMediaLibraryById(req, res) {
    try {
      const db = database.getDb();
      const library = await db.get(
        "SELECT * FROM media_libraries WHERE id = ?",
        [req.params.id]
      );

      if (!library) {
        return res.status(404).json({ error: "媒体库不存在" });
      }

      res.json(library);
    } catch (error) {
      console.error("获取媒体库失败:", error);
      res.status(500).json({ error: "获取媒体库失败" });
    }
  }

  async createMediaLibrary(req, res) {
    try {
      const db = database.getDb();
      const { name, type, baseUrl, apiKey, username, password } = req.body;
      const id = crypto.randomBytes(16).toString("hex");

      await db.run(
        "INSERT INTO media_libraries (id, name, type, base_url, api_key, username, password) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [id, name, type, baseUrl, apiKey, username || null, password || null]
      );

      const newLibrary = await db.get("SELECT * FROM media_libraries WHERE id = ?", [id]);
      res.status(201).json(newLibrary);
    } catch (error) {
      console.error("创建媒体库失败:", error);
      res.status(500).json({ error: "创建媒体库失败" });
    }
  }

  async updateMediaLibrary(req, res) {
    try {
      const db = database.getDb();
      const { id } = req.params;
      const { name, type, baseUrl, apiKey, username, password } = req.body;

      const existing = await db.get("SELECT * FROM media_libraries WHERE id = ?", [id]);

      if (!existing) {
        return res.status(404).json({ error: "媒体库不存在" });
      }

      await db.run(
        "UPDATE media_libraries SET name = ?, type = ?, base_url = ?, api_key = ?, username = ?, password = ? WHERE id = ?",
        [name, type, baseUrl, apiKey, username || null, password || null, id]
      );

      const updatedLibrary = await db.get("SELECT * FROM media_libraries WHERE id = ?", [id]);
      res.json(updatedLibrary);
    } catch (error) {
      console.error("更新媒体库失败:", error);
      res.status(500).json({ error: "更新媒体库失败" });
    }
  }

  async deleteMediaLibrary(req, res) {
    try {
      const db = database.getDb();
      const { id } = req.params;

      const existing = await db.get("SELECT * FROM media_libraries WHERE id = ?", [id]);

      if (!existing) {
        return res.status(404).json({ error: "媒体库不存在" });
      }

      await db.run("DELETE FROM media_libraries WHERE id = ?", [id]);
      res.json({ message: "媒体库已删除" });
    } catch (error) {
      console.error("删除媒体库失败:", error);
      res.status(500).json({ error: "删除媒体库失败" });
    }
  }

  async testConnection(req, res) {
    try {
      res.json({ message: "连接测试功能待实现", success: true });
    } catch (error) {
      console.error("测试连接失败:", error);
      res.status(500).json({ error: "测试连接失败" });
    }
  }

  async syncMediaLibrary(req, res) {
    try {
      res.json({ message: "同步功能待实现" });
    } catch (error) {
      console.error("同步失败:", error);
      res.status(500).json({ error: "同步失败" });
    }
  }

  async getMediaItems(req, res) {
    try {
      res.json({ message: "获取媒体项目功能待实现", items: [] });
    } catch (error) {
      console.error("获取媒体项目失败:", error);
      res.status(500).json({ error: "获取媒体项目失败" });
    }
  }
}

module.exports = new MediaLibController();
