const database = require("../services/database");
const crypto = require("crypto");

class TemplateController {
  async getAllTemplates(req, res) {
    try {
      const db = database.getDb();
      const { search = "", tag = "", sortBy = "" } = req.query;

      let query = "SELECT * FROM templates WHERE deleted_at IS NULL";
      const params = [];

      if (search) {
        query += " AND (name LIKE ? OR description LIKE ?)";
        params.push(`%${search}%`, `%${search}%`);
      }

      if (tag) {
        // 兼容 JSON 数组字符串与逗号分隔字符串的模糊匹配
        // 例: ["动作","科幻"] 或 "动作,科幻"
        query += " AND (tags LIKE ?)";
        params.push(`%${tag}%`);
      }

      // 排序: 默认按 updated_at DESC
      const sortMap = {
        created_at: "created_at DESC",
        updated_at: "updated_at DESC",
        name: "name COLLATE NOCASE ASC",
      };
      const orderBy = sortMap[String(sortBy)] || sortMap.updated_at;

      query += ` ORDER BY ${orderBy}`;

      const templatesRaw = await db.all(query, params);

      // 规范化 tags 与 match_tags，确保前端拿到的是数组，避免显示不一致
      const templates = (templatesRaw || []).map((tpl) => {
        const out = { ...tpl };
        // normalize tags -> array
        try {
          if (!out.tags) {
            out.tags = [];
          } else if (Array.isArray(out.tags)) {
            // keep as is
          } else if (typeof out.tags === "string") {
            try {
              const parsed = JSON.parse(out.tags);
              out.tags = Array.isArray(parsed)
                ? parsed
                : String(out.tags)
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean);
            } catch {
              out.tags = String(out.tags)
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
            }
          } else {
            out.tags = [];
          }
        } catch {
          out.tags = [];
        }

        // normalize match_tags -> array
        try {
          if (!out.match_tags) {
            out.match_tags = [];
          } else if (Array.isArray(out.match_tags)) {
            // keep as is
          } else if (typeof out.match_tags === "string") {
            try {
              const parsed = JSON.parse(out.match_tags);
              out.match_tags = Array.isArray(parsed) ? parsed : [];
            } catch {
              out.match_tags = [];
            }
          } else {
            out.match_tags = [];
          }
        } catch {
          out.match_tags = [];
        }

        return out;
      });

      res.json({ templates });
    } catch (error) {
      console.error("获取模板列表失败:", error);
      res.status(500).json({ error: "获取模板列表失败" });
    }
  }

  async getTemplateById(req, res) {
    try {
      const db = database.getDb();
      const raw = await db.get(
        "SELECT * FROM templates WHERE id = ? AND deleted_at IS NULL",
        [req.params.id]
      );

      if (!raw) {
        return res.status(404).json({ error: "模板不存在" });
      }

      // 规范化返回的数据，确保 tags/match_tags 为数组
      const template = { ...raw };
      try {
        if (!template.tags) {
          template.tags = [];
        } else if (Array.isArray(template.tags)) {
          // keep
        } else if (typeof template.tags === "string") {
          try {
            const parsed = JSON.parse(template.tags);
            template.tags = Array.isArray(parsed)
              ? parsed
              : String(template.tags)
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean);
          } catch {
            template.tags = String(template.tags)
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
          }
        } else {
          template.tags = [];
        }
      } catch {
        template.tags = [];
      }

      try {
        if (!template.match_tags) {
          template.match_tags = [];
        } else if (Array.isArray(template.match_tags)) {
          // keep
        } else if (typeof template.match_tags === "string") {
          try {
            const parsed = JSON.parse(template.match_tags);
            template.match_tags = Array.isArray(parsed) ? parsed : [];
          } catch {
            template.match_tags = [];
          }
        } else {
          template.match_tags = [];
        }
      } catch {
        template.match_tags = [];
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
        "INSERT INTO templates (id, name, description, preview_url, canvas_data, tags, match_tags) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [
          id,
          name,
          description || null,
          previewUrl,
          JSON.stringify(canvasData),
          JSON.stringify(tags || []),
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
        "UPDATE templates SET name = ?, description = ?, preview_url = ?, canvas_data = ?, tags = ?, match_tags = ?, updated_at = datetime('now') WHERE id = ?",
        [
          name,
          description || null,
          previewUrl,
          JSON.stringify(canvasData),
          JSON.stringify(tags || []),
          JSON.stringify(matchTags || []),
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
        "INSERT INTO templates (id, name, description, preview_url, canvas_data, tags, match_tags) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [
          newId,
          `${original.name} (副本)`,
          original.description,
          original.preview_url,
          original.canvas_data,
          // 尽量保持原有格式，如果是字符串就直接复制
          original.tags ?? JSON.stringify([]),
          original.match_tags ?? JSON.stringify([]),
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
