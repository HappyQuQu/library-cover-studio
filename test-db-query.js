const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = path.join(__dirname, "backend", "database", "templates.db");
const db = new sqlite3.Database(dbPath);

const templateId = "0496d9379e7648231798c680c1f1cf12";

db.get(
  "SELECT * FROM templates WHERE id = ? AND deleted_at IS NULL",
  [templateId],
  (err, row) => {
    if (err) {
      console.error("查询错误:", err);
      db.close();
      return;
    }

    if (!row) {
      console.log("模板不存在");
      db.close();
      return;
    }

    console.log("模板信息:");
    console.log("  ID:", row.id);
    console.log("  名称:", row.name);
    console.log("  canvas_data 类型:", typeof row.canvas_data);
    console.log("  canvas_data 内容:", row.canvas_data);

    try {
      const parsed = JSON.parse(row.canvas_data);
      console.log("\n解析成功!");
      console.log("  解析后的数据:", parsed);
    } catch (e) {
      console.error("\n解析失败:", e.message);
    }

    db.close();
  }
);
