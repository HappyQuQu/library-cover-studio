const database = require("../services/database");
const crypto = require("crypto");

class TemplateController {
  async getAllTemplates(req, res) {
    try {
      const db = database.getDb();
      const { page = 1, limit = 20, search = "" } = req.query;
      const offset = (page - 1) * limit;

      let query = "SELECT * FROM templates WHERE deleted_at IS NULL";
      const params = [];

      if (search) {
        query += " AND (name LIKE ? OR description LIKE ?)";
        params.push(`%${search}%`, `%${search}%`);
      }

      query += " ORDER BY updated_at DESC LIMIT ? OFFSET ?";
      params.push(parseInt(limit), parseInt(offset));

      const templates = await db.all(query, params);

      let countQuery =
        "SELECT COUNT(*) as count FROM templates WHERE deleted_at IS NULL";
      const countParams = [];

      if (search) {
        countQuery += " AND (name LIKE ? OR description LIKE ?)";
        countParams.push(`%${search}%`, `%${search}%`);
      }

      const countResult = await db.get(countQuery, countParams);

      res.json({
        templates,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: countResult.count,
          pages: Math.ceil(countResult.count / limit),
        },
      });
    } catch (error) {
      console.error("获取模板列表失败:", error);
      res.status(500).json({ error: "获取模板列表失败" });
    }
  }

  async getTemplateById(req, res) {
    try {
      const db = database.getDb();
      const template = await db.get(
        "SELECT * FROM templates WHERE id = ? AND deleted_at IS NULL",
        [req.params.id]
      );

      if (!template) {
        return res.status(404).json({ error: "模板不存在" });
      }

      res.json(template);
    } catch (error) {
      console.error("获取模板失败:", error);
      res.status(500).json({ error: "获取模板失败" });
    }
  }

  async createTemplate(req, res) {
    try {
      const db = database.getDb();
      const { name, description } = req.body;

      // 解析 JSON 字段（FormData 会将它们作为字符串传递）
      let canvasData = req.body.canvasData;
      if (typeof canvasData === "string") {
        try {
          canvasData = JSON.parse(canvasData);
        } catch (e) {
          console.error("解析 canvasData 失败:", e);
        }
      }

      let tags = req.body.tags;
      if (typeof tags === "string") {
        try {
          tags = JSON.parse(tags);
        } catch (e) {
          console.error("解析 tags 失败:", e);
          tags = [];
        }
      }

      let matchTags = req.body.matchTags || req.body.match_tags;
      if (typeof matchTags === "string") {
        try {
          matchTags = JSON.parse(matchTags);
        } catch (e) {
          console.error("解析 matchTags 失败:", e);
          matchTags = [];
        }
      }
      if (!matchTags) {
        matchTags = [];
      }

      const id = crypto.randomBytes(16).toString("hex");
      const previewUrl = req.file
        ? `/uploads/previews/${req.file.filename}`
        : null;

      await db.run(
        "INSERT INTO templates (id, name, description, preview_url, canvas_data, match_tags) VALUES (?, ?, ?, ?, ?, ?)",
        [
          id,
          name,
          description || null,
          previewUrl,
          JSON.stringify(canvasData),
          JSON.stringify(matchTags),
        ]
      );

      const newTemplate = await db.get("SELECT * FROM templates WHERE id = ?", [
        id,
      ]);
      res.status(201).json(newTemplate);
    } catch (error) {
      console.error("创建模板失败:", error);
      res.status(500).json({ error: "创建模板失败" });
    }
  }

  async updateTemplate(req, res) {
    try {
      const db = database.getDb();
      const { id } = req.params;
      const { name, description } = req.body;

      // 解析 JSON 字段（FormData 会将它们作为字符串传递）
      let canvasData = req.body.canvasData;
      if (typeof canvasData === "string") {
        try {
          canvasData = JSON.parse(canvasData);
        } catch (e) {
          console.error("解析 canvasData 失败:", e);
        }
      }

      let tags = req.body.tags;
      if (typeof tags === "string") {
        try {
          tags = JSON.parse(tags);
        } catch (e) {
          console.error("解析 tags 失败:", e);
          tags = [];
        }
      }

      let matchTags = req.body.matchTags || req.body.match_tags;
      if (typeof matchTags === "string") {
        try {
          matchTags = JSON.parse(matchTags);
        } catch (e) {
          console.error("解析 matchTags 失败:", e);
          matchTags = [];
        }
      }
      if (!matchTags) {
        matchTags = [];
      }

      const existing = await db.get(
        "SELECT * FROM templates WHERE id = ? AND deleted_at IS NULL",
        [id]
      );

      if (!existing) {
        return res.status(404).json({ error: "模板不存在" });
      }

      const previewUrl = req.file
        ? `/uploads/previews/${req.file.filename}`
        : existing.preview_url;

      await db.run(
        "UPDATE templates SET name = ?, description = ?, preview_url = ?, canvas_data = ?, tags = ?, match_tags = ? WHERE id = ?",
        [
          name,
          description || null,
          previewUrl,
          JSON.stringify(canvasData),
          JSON.stringify(tags),
          JSON.stringify(matchTags),
          id,
        ]
      );

      const updatedTemplate = await db.get(
        "SELECT * FROM templates WHERE id = ?",
        [id]
      );
      res.json(updatedTemplate);
    } catch (error) {
      console.error("更新模板失败:", error);
      res.status(500).json({ error: "更新模板失败" });
    }
  }

  async deleteTemplate(req, res) {
    try {
      const db = database.getDb();
      const { id } = req.params;

      const existing = await db.get(
        "SELECT * FROM templates WHERE id = ? AND deleted_at IS NULL",
        [id]
      );

      if (!existing) {
        return res.status(404).json({ error: "模板不存在" });
      }

      await db.run(
        "UPDATE templates SET deleted_at = datetime('now') WHERE id = ?",
        [id]
      );
      res.json({ message: "模板已删除" });
    } catch (error) {
      console.error("删除模板失败:", error);
      res.status(500).json({ error: "删除模板失败" });
    }
  }

  async duplicateTemplate(req, res) {
    try {
      const db = database.getDb();
      const { id } = req.params;

      const original = await db.get(
        "SELECT * FROM templates WHERE id = ? AND deleted_at IS NULL",
        [id]
      );

      if (!original) {
        return res.status(404).json({ error: "模板不存在" });
      }

      const newId = crypto.randomBytes(16).toString("hex");
      await db.run(
        "INSERT INTO templates (id, name, description, preview_url, canvas_data) VALUES (?, ?, ?, ?, ?)",
        [
          newId,
          `${original.name} (副本)`,
          original.description,
          original.preview_url,
          original.canvas_data,
        ]
      );

      const duplicated = await db.get("SELECT * FROM templates WHERE id = ?", [
        newId,
      ]);
      res.status(201).json(duplicated);
    } catch (error) {
      console.error("复制模板失败:", error);
      res.status(500).json({ error: "复制模板失败" });
    }
  }

  async exportTemplate(req, res) {
    try {
      const db = database.getDb();
      const { id } = req.params;

      const template = await db.get(
        "SELECT * FROM templates WHERE id = ? AND deleted_at IS NULL",
        [id]
      );

      if (!template) {
        return res.status(404).json({ error: "模板不存在" });
      }

      res.setHeader("Content-Type", "application/json");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="template-${template.name}.json"`
      );

      res.json({
        name: template.name,
        description: template.description,
        canvas_data: JSON.parse(template.canvas_data),
        exported_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error("导出模板失败:", error);
      res.status(500).json({ error: "导出模板失败" });
    }
  }
}

module.exports = new TemplateController();
