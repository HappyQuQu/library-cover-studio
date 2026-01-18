const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = path.join(__dirname, "data/library-cover-studio.db");

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("无法打开数据库:", err.message);
    process.exit(1);
  }
  console.log("已连接到数据库");
});

// 添加 match_tags 字段
db.run(
  "ALTER TABLE templates ADD COLUMN match_tags TEXT DEFAULT '[]'",
  (err) => {
    if (err) {
      if (err.message.includes("duplicate column name")) {
        console.log("✅ match_tags 字段已存在，无需添加");
      } else {
        console.error("❌ 添加字段失败:", err.message);
        process.exit(1);
      }
    } else {
      console.log("✅ 成功添加 match_tags 字段");
    }

    db.close((err) => {
      if (err) {
        console.error("关闭数据库失败:", err.message);
      } else {
        console.log("✅ 数据库迁移完成");
      }
    });
  }
);
