const database = require("../services/database");const database = require("../services/database");const database = require("../services/database");

const crypto = require("crypto");

const crypto = require("crypto");const { v4: uuidv4 } = require("uuid");

class TemplateController {

  async getAllTemplates(req, res) {const fs = require("fs").promises;

    try {

      const db = database.getDb();class TemplateController {const path = require("path");

      const { page = 1, limit = 20, search = "" } = req.query;

      const offset = (page - 1) * limit;  // 获取所有模板



      let query = "SELECT * FROM templates WHERE deleted_at IS NULL";  async getAllTemplates(req, res) {class TemplateController {

      const params = [];

    try {  // 获取所有模板

      if (search) {

        query += " AND (name LIKE ? OR description LIKE ?)";      const db = database.getDb();  async getAllTemplates(req, res) {

        params.push(`%${search}%`, `%${search}%`);

      }      const { page = 1, limit = 20, search = "" } = req.query;    try {



      query += " ORDER BY updated_at DESC LIMIT ? OFFSET ?";      const offset = (page - 1) * limit;      const { page = 1, limit = 20, search = "" } = req.query;

      params.push(parseInt(limit), parseInt(offset));

      const offset = (page - 1) * limit;

      const templates = await db.all(query, params);

      let query = `

      let countQuery = "SELECT COUNT(*) as count FROM templates WHERE deleted_at IS NULL";

      const countParams = [];        SELECT id, name, description, preview_url, canvas_data,       let query = `



      if (search) {               created_at, updated_at        SELECT id, name, description, preview_url, canvas_data, 

        countQuery += " AND (name LIKE ? OR description LIKE ?)";

        countParams.push(`%${search}%`, `%${search}%`);        FROM templates                created_at, updated_at

      }

        WHERE deleted_at IS NULL        FROM templates 

      const countResult = await db.get(countQuery, countParams);

      `;        WHERE deleted_at IS NULL

      res.json({

        templates,      `;

        pagination: {

          page: parseInt(page),      const params = [];

          limit: parseInt(limit),

          total: countResult.count,      const params = [];

          pages: Math.ceil(countResult.count / limit),

        },      if (search) {

      });

    } catch (error) {        query += ` AND (name LIKE ? OR description LIKE ?)`;      if (search) {

      console.error("获取模板列表失败:", error);

      res.status(500).json({ error: "获取模板列表失败" });        params.push(`%${search}%`, `%${search}%`);        query += ` AND (name ILIKE $${

    }

  }      }          params.length + 1



  async getTemplateById(req, res) {        } OR description ILIKE $${params.length + 1})`;

    try {

      const db = database.getDb();      query += ` ORDER BY updated_at DESC LIMIT ? OFFSET ?`;        params.push(`%${search}%`);

      const template = await db.get(

        "SELECT * FROM templates WHERE id = ? AND deleted_at IS NULL",      params.push(parseInt(limit), parseInt(offset));      }

        [req.params.id]

      );



      if (!template) {      const templates = await db.all(query, params);      query += ` ORDER BY updated_at DESC LIMIT $${params.length + 1} OFFSET $${

        return res.status(404).json({ error: "模板不存在" });

      }        params.length + 2



      res.json(template);      // 获取总数      }`;

    } catch (error) {

      console.error("获取模板失败:", error);      let countQuery = `      params.push(limit, offset);

      res.status(500).json({ error: "获取模板失败" });

    }        SELECT COUNT(*) as count FROM templates 

  }

        WHERE deleted_at IS NULL      const result = await pool.query(query, params);

  async createTemplate(req, res) {

    try {      `;

      const db = database.getDb();

      const { name, description, canvasData } = req.body;      const countParams = [];      // 获取总数

      const id = crypto.randomBytes(16).toString("hex");

      const previewUrl = req.file ? `/uploads/previews/${req.file.filename}` : null;      const countQuery = `



      await db.run(      if (search) {        SELECT COUNT(*) FROM templates 

        "INSERT INTO templates (id, name, description, preview_url, canvas_data) VALUES (?, ?, ?, ?, ?)",

        [id, name, description || null, previewUrl, JSON.stringify(canvasData)]        countQuery += ` AND (name LIKE ? OR description LIKE ?)`;        WHERE deleted_at IS NULL

      );

        countParams.push(`%${search}%`, `%${search}%`);        ${

      const newTemplate = await db.get("SELECT * FROM templates WHERE id = ?", [id]);

      res.status(201).json(newTemplate);      }          search

    } catch (error) {

      console.error("创建模板失败:", error);            ? `AND (name ILIKE '%${search}%' OR description ILIKE '%${search}%')`

      res.status(500).json({ error: "创建模板失败" });

    }      const countResult = await db.get(countQuery, countParams);            : ""

  }

        }

  async updateTemplate(req, res) {

    try {      res.json({      `;

      const db = database.getDb();

      const { id } = req.params;        templates,      const countResult = await pool.query(countQuery);

      const { name, description, canvasData } = req.body;

        pagination: {

      const existing = await db.get(

        "SELECT * FROM templates WHERE id = ? AND deleted_at IS NULL",          page: parseInt(page),      res.json({

        [id]

      );          limit: parseInt(limit),        templates: result.rows,



      if (!existing) {          total: countResult.count,        pagination: {

        return res.status(404).json({ error: "模板不存在" });

      }          pages: Math.ceil(countResult.count / limit),          page: parseInt(page),



      const previewUrl = req.file ? `/uploads/previews/${req.file.filename}` : existing.preview_url;        },          limit: parseInt(limit),



      await db.run(      });          total: parseInt(countResult.rows[0].count),

        "UPDATE templates SET name = ?, description = ?, preview_url = ?, canvas_data = ? WHERE id = ?",

        [name, description || null, previewUrl, JSON.stringify(canvasData), id]    } catch (error) {          pages: Math.ceil(countResult.rows[0].count / limit),

      );

      console.error("获取模板列表失败:", error);        },

      const updatedTemplate = await db.get("SELECT * FROM templates WHERE id = ?", [id]);

      res.json(updatedTemplate);      res.status(500).json({ error: "获取模板列表失败" });      });

    } catch (error) {

      console.error("更新模板失败:", error);    }    } catch (error) {

      res.status(500).json({ error: "更新模板失败" });

    }  }      console.error("获取模板列表失败:", error);

  }

      res.status(500).json({ error: "获取模板列表失败" });

  async deleteTemplate(req, res) {

    try {  // 根据ID获取模板    }

      const db = database.getDb();

      const { id } = req.params;  async getTemplateById(req, res) {  }



      const existing = await db.get(    try {

        "SELECT * FROM templates WHERE id = ? AND deleted_at IS NULL",

        [id]      const db = database.getDb();  // 根据ID获取模板

      );

      const { id } = req.params;  async getTemplateById(req, res) {

      if (!existing) {

        return res.status(404).json({ error: "模板不存在" });    try {

      }

      const template = await db.get(      const { id } = req.params;

      await db.run("UPDATE templates SET deleted_at = datetime('now') WHERE id = ?", [id]);

      res.json({ message: "模板已删除" });        "SELECT * FROM templates WHERE id = ? AND deleted_at IS NULL",

    } catch (error) {

      console.error("删除模板失败:", error);        [id]      const query = `

      res.status(500).json({ error: "删除模板失败" });

    }      );        SELECT * FROM templates 

  }

        WHERE id = $1 AND deleted_at IS NULL

  async duplicateTemplate(req, res) {

    try {      if (!template) {      `;

      const db = database.getDb();

      const { id } = req.params;        return res.status(404).json({ error: "模板不存在" });



      const original = await db.get(      }      const result = await pool.query(query, [id]);

        "SELECT * FROM templates WHERE id = ? AND deleted_at IS NULL",

        [id]

      );

      res.json(template);      if (result.rows.length === 0) {

      if (!original) {

        return res.status(404).json({ error: "模板不存在" });    } catch (error) {        return res.status(404).json({ error: "模板不存在" });

      }

      console.error("获取模板失败:", error);      }

      const newId = crypto.randomBytes(16).toString("hex");

      await db.run(      res.status(500).json({ error: "获取模板失败" });

        "INSERT INTO templates (id, name, description, preview_url, canvas_data) VALUES (?, ?, ?, ?, ?)",

        [newId, `${original.name} (副本)`, original.description, original.preview_url, original.canvas_data]    }      res.json(result.rows[0]);

      );

  }    } catch (error) {

      const duplicated = await db.get("SELECT * FROM templates WHERE id = ?", [newId]);

      res.status(201).json(duplicated);      console.error("获取模板失败:", error);

    } catch (error) {

      console.error("复制模板失败:", error);  // 创建新模板      res.status(500).json({ error: "获取模板失败" });

      res.status(500).json({ error: "复制模板失败" });

    }  async createTemplate(req, res) {    }

  }

    try {  }

  async exportTemplate(req, res) {

    try {      const db = database.getDb();

      const db = database.getDb();

      const { id } = req.params;      const { name, description, canvasData } = req.body;  // 创建新模板



      const template = await db.get(      const id = crypto.randomBytes(16).toString("hex");  async createTemplate(req, res) {

        "SELECT * FROM templates WHERE id = ? AND deleted_at IS NULL",

        [id]      const previewUrl = req.file    try {

      );

        ? `/uploads/previews/${req.file.filename}`      const { name, description, canvasData } = req.body;

      if (!template) {

        return res.status(404).json({ error: "模板不存在" });        : null;      const id = uuidv4();

      }

      const previewUrl = req.file

      res.setHeader("Content-Type", "application/json");

      res.setHeader("Content-Disposition", `attachment; filename="template-${template.name}.json"`);      await db.run(        ? `/uploads/previews/${req.file.filename}`



      res.json({        "INSERT INTO templates (id, name, description, preview_url, canvas_data) VALUES (?, ?, ?, ?, ?)",        : null;

        name: template.name,

        description: template.description,        [id, name, description || null, previewUrl, JSON.stringify(canvasData)]

        canvas_data: JSON.parse(template.canvas_data),

        exported_at: new Date().toISOString(),      );      const query = `

      });

    } catch (error) {        INSERT INTO templates (id, name, description, preview_url, canvas_data)

      console.error("导出模板失败:", error);

      res.status(500).json({ error: "导出模板失败" });      const newTemplate = await db.get("SELECT * FROM templates WHERE id = ?", [id]);        VALUES ($1, $2, $3, $4, $5)

    }

  }      res.status(201).json(newTemplate);        RETURNING *

}

    } catch (error) {      `;

module.exports = new TemplateController();

      console.error("创建模板失败:", error);

      res.status(500).json({ error: "创建模板失败" });      const result = await pool.query(query, [

    }        id,

  }        name,

        description,

  // 更新模板        previewUrl,

  async updateTemplate(req, res) {        JSON.stringify(canvasData),

    try {      ]);

      const db = database.getDb();

      const { id } = req.params;      res.status(201).json(result.rows[0]);

      const { name, description, canvasData } = req.body;    } catch (error) {

      console.error("创建模板失败:", error);

      const existing = await db.get(      res.status(500).json({ error: "创建模板失败" });

        "SELECT * FROM templates WHERE id = ? AND deleted_at IS NULL",    }

        [id]  }

      );

  // 更新模板

      if (!existing) {  async updateTemplate(req, res) {

        return res.status(404).json({ error: "模板不存在" });    try {

      }      const { id } = req.params;

      const { name, description, canvasData } = req.body;

      const previewUrl = req.file      const previewUrl = req.file

        ? `/uploads/previews/${req.file.filename}`        ? `/uploads/previews/${req.file.filename}`

        : existing.preview_url;        : undefined;



      await db.run(      let query = `

        "UPDATE templates SET name = ?, description = ?, preview_url = ?, canvas_data = ? WHERE id = ?",        UPDATE templates 

        [name, description || null, previewUrl, JSON.stringify(canvasData), id]        SET name = $2, description = $3, canvas_data = $4, updated_at = CURRENT_TIMESTAMP

      );      `;

      let params = [id, name, description, JSON.stringify(canvasData)];

      const updatedTemplate = await db.get(

        "SELECT * FROM templates WHERE id = ?",      if (previewUrl) {

        [id]        query += `, preview_url = $5`;

      );        params.push(previewUrl);

      }

      res.json(updatedTemplate);

    } catch (error) {      query += ` WHERE id = $1 AND deleted_at IS NULL RETURNING *`;

      console.error("更新模板失败:", error);

      res.status(500).json({ error: "更新模板失败" });      const result = await pool.query(query, params);

    }

  }      if (result.rows.length === 0) {

        return res.status(404).json({ error: "模板不存在" });

  // 删除模板      }

  async deleteTemplate(req, res) {

    try {      res.json(result.rows[0]);

      const db = database.getDb();    } catch (error) {

      const { id } = req.params;      console.error("更新模板失败:", error);

      res.status(500).json({ error: "更新模板失败" });

      const existing = await db.get(    }

        "SELECT * FROM templates WHERE id = ? AND deleted_at IS NULL",  }

        [id]

      );  // 删除模板（软删除）

  async deleteTemplate(req, res) {

      if (!existing) {    try {

        return res.status(404).json({ error: "模板不存在" });      const { id } = req.params;

      }

      const query = `

      await db.run("UPDATE templates SET deleted_at = datetime('now') WHERE id = ?", [id]);        UPDATE templates 

      res.json({ message: "模板已删除" });        SET deleted_at = CURRENT_TIMESTAMP 

    } catch (error) {        WHERE id = $1 AND deleted_at IS NULL

      console.error("删除模板失败:", error);        RETURNING id

      res.status(500).json({ error: "删除模板失败" });      `;

    }

  }      const result = await pool.query(query, [id]);



  // 复制模板      if (result.rows.length === 0) {

  async duplicateTemplate(req, res) {        return res.status(404).json({ error: "模板不存在" });

    try {      }

      const db = database.getDb();

      const { id } = req.params;      res.json({ message: "模板删除成功" });

    } catch (error) {

      const original = await db.get(      console.error("删除模板失败:", error);

        "SELECT * FROM templates WHERE id = ? AND deleted_at IS NULL",      res.status(500).json({ error: "删除模板失败" });

        [id]    }

      );  }



      if (!original) {  // 复制模板

        return res.status(404).json({ error: "模板不存在" });  async duplicateTemplate(req, res) {

      }    try {

      const { id } = req.params;

      const newId = crypto.randomBytes(16).toString("hex");

      await db.run(      // 获取原模板

        "INSERT INTO templates (id, name, description, preview_url, canvas_data) VALUES (?, ?, ?, ?, ?)",      const originalQuery = `

        [newId, `${original.name} (副本)`, original.description, original.preview_url, original.canvas_data]        SELECT * FROM templates 

      );        WHERE id = $1 AND deleted_at IS NULL

      `;

      const duplicated = await db.get("SELECT * FROM templates WHERE id = ?", [newId]);

      res.status(201).json(duplicated);      const originalResult = await pool.query(originalQuery, [id]);

    } catch (error) {

      console.error("复制模板失败:", error);      if (originalResult.rows.length === 0) {

      res.status(500).json({ error: "复制模板失败" });        return res.status(404).json({ error: "原模板不存在" });

    }      }

  }

      const original = originalResult.rows[0];

  // 导出模板      const newId = uuidv4();

  async exportTemplate(req, res) {

    try {      // 创建副本

      const db = database.getDb();      const duplicateQuery = `

      const { id } = req.params;        INSERT INTO templates (id, name, description, preview_url, canvas_data)

        VALUES ($1, $2, $3, $4, $5)

      const template = await db.get(        RETURNING *

        "SELECT * FROM templates WHERE id = ? AND deleted_at IS NULL",      `;

        [id]

      );      const result = await pool.query(duplicateQuery, [

        newId,

      if (!template) {        `${original.name} (副本)`,

        return res.status(404).json({ error: "模板不存在" });        original.description,

      }        original.preview_url,

        original.canvas_data,

      res.setHeader("Content-Type", "application/json");      ]);

      res.setHeader(

        "Content-Disposition",      res.status(201).json(result.rows[0]);

        `attachment; filename="template-${template.name}.json"`    } catch (error) {

      );      console.error("复制模板失败:", error);

      res.status(500).json({ error: "复制模板失败" });

      res.json({    }

        name: template.name,  }

        description: template.description,

        canvas_data: JSON.parse(template.canvas_data),  // 导出模板

        exported_at: new Date().toISOString(),  async exportTemplate(req, res) {

      });    try {

    } catch (error) {      const { id } = req.params;

      console.error("导出模板失败:", error);

      res.status(500).json({ error: "导出模板失败" });      const query = `

    }        SELECT name, description, canvas_data FROM templates 

  }        WHERE id = $1 AND deleted_at IS NULL

}      `;



module.exports = new TemplateController();      const result = await pool.query(query, [id]);


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
