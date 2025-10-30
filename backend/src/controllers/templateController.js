const { Pool } = require("pg");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs").promises;
const path = require("path");

// 数据库连接池
const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || "library_cover_studio",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "password",
});

class TemplateController {
  // 获取所有模板
  async getAllTemplates(req, res) {
    try {
      const { page = 1, limit = 20, search = "" } = req.query;
      const offset = (page - 1) * limit;

      let query = `
        SELECT id, name, description, preview_url, canvas_data, 
               created_at, updated_at
        FROM templates 
        WHERE deleted_at IS NULL
      `;

      const params = [];

      if (search) {
        query += ` AND (name ILIKE $${
          params.length + 1
        } OR description ILIKE $${params.length + 1})`;
        params.push(`%${search}%`);
      }

      query += ` ORDER BY updated_at DESC LIMIT $${params.length + 1} OFFSET $${
        params.length + 2
      }`;
      params.push(limit, offset);

      const result = await pool.query(query, params);

      // 获取总数
      const countQuery = `
        SELECT COUNT(*) FROM templates 
        WHERE deleted_at IS NULL
        ${
          search
            ? `AND (name ILIKE '%${search}%' OR description ILIKE '%${search}%')`
            : ""
        }
      `;
      const countResult = await pool.query(countQuery);

      res.json({
        templates: result.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: parseInt(countResult.rows[0].count),
          pages: Math.ceil(countResult.rows[0].count / limit),
        },
      });
    } catch (error) {
      console.error("获取模板列表失败:", error);
      res.status(500).json({ error: "获取模板列表失败" });
    }
  }

  // 根据ID获取模板
  async getTemplateById(req, res) {
    try {
      const { id } = req.params;

      const query = `
        SELECT * FROM templates 
        WHERE id = $1 AND deleted_at IS NULL
      `;

      const result = await pool.query(query, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "模板不存在" });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error("获取模板失败:", error);
      res.status(500).json({ error: "获取模板失败" });
    }
  }

  // 创建新模板
  async createTemplate(req, res) {
    try {
      const { name, description, canvasData } = req.body;
      const id = uuidv4();
      const previewUrl = req.file
        ? `/uploads/previews/${req.file.filename}`
        : null;

      const query = `
        INSERT INTO templates (id, name, description, preview_url, canvas_data)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `;

      const result = await pool.query(query, [
        id,
        name,
        description,
        previewUrl,
        JSON.stringify(canvasData),
      ]);

      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error("创建模板失败:", error);
      res.status(500).json({ error: "创建模板失败" });
    }
  }

  // 更新模板
  async updateTemplate(req, res) {
    try {
      const { id } = req.params;
      const { name, description, canvasData } = req.body;
      const previewUrl = req.file
        ? `/uploads/previews/${req.file.filename}`
        : undefined;

      let query = `
        UPDATE templates 
        SET name = $2, description = $3, canvas_data = $4, updated_at = CURRENT_TIMESTAMP
      `;
      let params = [id, name, description, JSON.stringify(canvasData)];

      if (previewUrl) {
        query += `, preview_url = $5`;
        params.push(previewUrl);
      }

      query += ` WHERE id = $1 AND deleted_at IS NULL RETURNING *`;

      const result = await pool.query(query, params);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "模板不存在" });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error("更新模板失败:", error);
      res.status(500).json({ error: "更新模板失败" });
    }
  }

  // 删除模板（软删除）
  async deleteTemplate(req, res) {
    try {
      const { id } = req.params;

      const query = `
        UPDATE templates 
        SET deleted_at = CURRENT_TIMESTAMP 
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING id
      `;

      const result = await pool.query(query, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "模板不存在" });
      }

      res.json({ message: "模板删除成功" });
    } catch (error) {
      console.error("删除模板失败:", error);
      res.status(500).json({ error: "删除模板失败" });
    }
  }

  // 复制模板
  async duplicateTemplate(req, res) {
    try {
      const { id } = req.params;

      // 获取原模板
      const originalQuery = `
        SELECT * FROM templates 
        WHERE id = $1 AND deleted_at IS NULL
      `;

      const originalResult = await pool.query(originalQuery, [id]);

      if (originalResult.rows.length === 0) {
        return res.status(404).json({ error: "原模板不存在" });
      }

      const original = originalResult.rows[0];
      const newId = uuidv4();

      // 创建副本
      const duplicateQuery = `
        INSERT INTO templates (id, name, description, preview_url, canvas_data)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `;

      const result = await pool.query(duplicateQuery, [
        newId,
        `${original.name} (副本)`,
        original.description,
        original.preview_url,
        original.canvas_data,
      ]);

      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error("复制模板失败:", error);
      res.status(500).json({ error: "复制模板失败" });
    }
  }

  // 导出模板
  async exportTemplate(req, res) {
    try {
      const { id } = req.params;

      const query = `
        SELECT name, description, canvas_data FROM templates 
        WHERE id = $1 AND deleted_at IS NULL
      `;

      const result = await pool.query(query, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "模板不存在" });
      }

      const template = result.rows[0];

      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${template.name}.json"`
      );
      res.setHeader("Content-Type", "application/json");
      res.json({
        name: template.name,
        description: template.description,
        canvasData: template.canvas_data,
        exportedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error("导出模板失败:", error);
      res.status(500).json({ error: "导出模板失败" });
    }
  }
}

module.exports = new TemplateController();
