const database = require("../services/database");
const crypto = require("crypto");

class PosterController {
  async generatePoster(req, res) {
    try {
      const db = database.getDb();
      // 简化版本 - 返回示例数据
      res.json({ message: "海报生成功能待实现" });
    } catch (error) {
      console.error("生成海报失败:", error);
      res.status(500).json({ error: "生成海报失败" });
    }
  }

  async batchGeneratePoster(req, res) {
    try {
      res.json({ message: "批量生成功能待实现" });
    } catch (error) {
      console.error("批量生成失败:", error);
      res.status(500).json({ error: "批量生成失败" });
    }
  }

  async getGenerationHistory(req, res) {
    try {
      const db = database.getDb();
      const { page = 1, limit = 20 } = req.query;
      const offset = (page - 1) * limit;

      const history = await db.all(
        "SELECT * FROM poster_generations ORDER BY created_at DESC LIMIT ? OFFSET ?",
        [parseInt(limit), parseInt(offset)]
      );

      const countResult = await db.get(
        "SELECT COUNT(*) as count FROM poster_generations"
      );

      res.json({
        history,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: countResult.count,
          pages: Math.ceil(countResult.count / limit),
        },
      });
    } catch (error) {
      console.error("获取生成历史失败:", error);
      res.status(500).json({ error: "获取生成历史失败" });
    }
  }

  async previewPoster(req, res) {
    try {
      res.json({ message: "预览功能待实现" });
    } catch (error) {
      console.error("预览失败:", error);
      res.status(500).json({ error: "预览失败" });
    }
  }
}

module.exports = new PosterController();
