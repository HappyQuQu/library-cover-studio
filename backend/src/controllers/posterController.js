const { Pool } = require("pg");
const sharp = require("sharp");
const { v4: uuidv4 } = require("uuid");
const path = require("path");
const fs = require("fs").promises;

// 数据库连接池
const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || "library_cover_studio",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "password",
});

class PosterController {
  // 根据模板生成海报
  async generatePoster(req, res) {
    try {
      const { templateId, mediaItems } = req.validatedData;

      // 获取模板数据
      const templateQuery = `
        SELECT * FROM templates 
        WHERE id = $1 AND deleted_at IS NULL
      `;

      const templateResult = await pool.query(templateQuery, [templateId]);

      if (templateResult.rows.length === 0) {
        return res.status(404).json({ error: "模板不存在" });
      }

      const template = templateResult.rows[0];
      const results = [];

      // 为每个媒体项目生成海报
      for (const mediaItem of mediaItems) {
        try {
          const posterPath = await this.generateSinglePoster(
            template,
            mediaItem
          );

          // 记录生成历史
          await this.recordGeneration({
            template_id: templateId,
            media_item_id: mediaItem.id,
            media_title: mediaItem.title,
            media_type: mediaItem.type,
            poster_url: posterPath,
            status: "completed",
          });

          results.push({
            mediaId: mediaItem.id,
            title: mediaItem.title,
            posterUrl: posterPath,
            status: "success",
          });
        } catch (error) {
          console.error(`生成海报失败: ${mediaItem.title}`, error);

          // 记录失败历史
          await this.recordGeneration({
            template_id: templateId,
            media_item_id: mediaItem.id,
            media_title: mediaItem.title,
            media_type: mediaItem.type,
            status: "failed",
            error_message: error.message,
          });

          results.push({
            mediaId: mediaItem.id,
            title: mediaItem.title,
            status: "failed",
            error: error.message,
          });
        }
      }

      res.json({
        message: "海报生成完成",
        results: results,
        summary: {
          total: results.length,
          success: results.filter((r) => r.status === "success").length,
          failed: results.filter((r) => r.status === "failed").length,
        },
      });
    } catch (error) {
      console.error("批量生成海报失败:", error);
      res.status(500).json({ error: "生成海报失败" });
    }
  }

  // 生成单个海报
  async generateSinglePoster(template, mediaItem) {
    const canvasData = template.canvas_data;
    const outputDir = path.join(__dirname, "../../uploads/posters");

    // 确保输出目录存在
    await fs.mkdir(outputDir, { recursive: true });

    const filename = `${mediaItem.id}_${Date.now()}.png`;
    const outputPath = path.join(outputDir, filename);

    // 创建画布
    const canvasWidth = 400;
    const canvasHeight = 600;

    const canvas = sharp({
      create: {
        width: canvasWidth,
        height: canvasHeight,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    });

    // 处理canvas数据中的模板变量
    const processedData = this.replaceTemplateVariables(canvasData, mediaItem);

    // 渲染canvas到图片
    // 这里简化实现，实际需要根据Fabric.js数据结构渲染
    await canvas.png().toFile(outputPath);

    return `/uploads/posters/${filename}`;
  }

  // 替换模板变量
  replaceTemplateVariables(canvasData, mediaItem) {
    const variables = {
      "{{title}}": mediaItem.title,
      "{{year}}": mediaItem.year || "",
      "{{rating}}": mediaItem.rating || "",
      "{{type}}": mediaItem.type || "",
    };

    let dataStr = JSON.stringify(canvasData);

    Object.entries(variables).forEach(([key, value]) => {
      dataStr = dataStr.replace(new RegExp(key, "g"), value);
    });

    return JSON.parse(dataStr);
  }

  // 记录生成历史
  async recordGeneration(data) {
    const query = `
      INSERT INTO poster_generations (
        template_id, media_item_id, media_title, media_type,
        poster_url, status, error_message
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `;

    await pool.query(query, [
      data.template_id,
      data.media_item_id,
      data.media_title,
      data.media_type,
      data.poster_url || null,
      data.status,
      data.error_message || null,
    ]);
  }

  // 批量生成海报
  async batchGeneratePoster(req, res) {
    // 实际上调用相同的逻辑，只是处理更大批量
    return this.generatePoster(req, res);
  }

  // 获取生成历史
  async getGenerationHistory(req, res) {
    try {
      const { page = 1, limit = 20, templateId, status } = req.query;
      const offset = (page - 1) * limit;

      let query = `
        SELECT pg.*, t.name as template_name
        FROM poster_generations pg
        JOIN templates t ON pg.template_id = t.id
        WHERE 1=1
      `;

      const params = [];

      if (templateId) {
        query += ` AND pg.template_id = $${params.length + 1}`;
        params.push(templateId);
      }

      if (status) {
        query += ` AND pg.status = $${params.length + 1}`;
        params.push(status);
      }

      query += ` ORDER BY pg.created_at DESC LIMIT $${
        params.length + 1
      } OFFSET $${params.length + 2}`;
      params.push(limit, offset);

      const result = await pool.query(query, params);

      // 获取总数
      const countQuery = `
        SELECT COUNT(*) FROM poster_generations pg
        JOIN templates t ON pg.template_id = t.id
        WHERE 1=1
        ${templateId ? ` AND pg.template_id = '${templateId}'` : ""}
        ${status ? ` AND pg.status = '${status}'` : ""}
      `;
      const countResult = await pool.query(countQuery);

      res.json({
        generations: result.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: parseInt(countResult.rows[0].count),
          pages: Math.ceil(countResult.rows[0].count / limit),
        },
      });
    } catch (error) {
      console.error("获取生成历史失败:", error);
      res.status(500).json({ error: "获取生成历史失败" });
    }
  }

  // 预览海报
  async previewPoster(req, res) {
    try {
      const { templateId, mediaItem } = req.body;

      // 获取模板
      const templateQuery = `
        SELECT * FROM templates 
        WHERE id = $1 AND deleted_at IS NULL
      `;

      const templateResult = await pool.query(templateQuery, [templateId]);

      if (templateResult.rows.length === 0) {
        return res.status(404).json({ error: "模板不存在" });
      }

      const template = templateResult.rows[0];

      // 生成预览
      const previewPath = await this.generatePreview(template, mediaItem);

      res.json({
        previewUrl: previewPath,
        message: "预览生成成功",
      });
    } catch (error) {
      console.error("预览生成失败:", error);
      res.status(500).json({ error: "预览生成失败" });
    }
  }

  // 生成预览
  async generatePreview(template, mediaItem) {
    // 类似generateSinglePoster，但保存到预览目录
    const outputDir = path.join(__dirname, "../../uploads/previews");
    await fs.mkdir(outputDir, { recursive: true });

    const filename = `preview_${Date.now()}.png`;
    const outputPath = path.join(outputDir, filename);

    // 简化的预览生成
    const canvas = sharp({
      create: {
        width: 400,
        height: 600,
        channels: 4,
        background: { r: 240, g: 240, b: 240, alpha: 1 },
      },
    });

    await canvas.png().toFile(outputPath);

    return `/uploads/previews/${filename}`;
  }
}

module.exports = new PosterController();
