/**
 * 数据库迁移脚本 - 添加媒体源和定时任务功能
 * 安全地添加新字段,自动检测字段是否已存在
 */

const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = path.join(__dirname, "../library_cover_studio.db");
const db = new sqlite3.Database(dbPath);

console.log("开始数据库迁移...\n");

// 辅助函数: 检查列是否存在
function columnExists(tableName, columnName) {
  return new Promise((resolve, reject) => {
    db.all(`PRAGMA table_info(${tableName})`, (err, columns) => {
      if (err) reject(err);
      const exists = columns.some((col) => col.name === columnName);
      resolve(exists);
    });
  });
}

// 辅助函数: 执行SQL语句
function runSQL(sql, description) {
  return new Promise((resolve, reject) => {
    db.run(sql, (err) => {
      if (err) {
        console.error(`❌ ${description} 失败:`, err.message);
        reject(err);
      } else {
        console.log(`✅ ${description}`);
        resolve();
      }
    });
  });
}

// 主迁移函数
async function migrate() {
  try {
    // 1. 检查并添加 media_libraries.user_id
    if (!(await columnExists("media_libraries", "user_id"))) {
      await runSQL(
        "ALTER TABLE media_libraries ADD COLUMN user_id TEXT",
        "添加 media_libraries.user_id 字段"
      );
    } else {
      console.log("⏭️  media_libraries.user_id 字段已存在,跳过");
    }

    // 2. 检查并添加 scheduled_tasks 的新字段
    const newColumns = [
      {
        name: "media_source_id",
        sql: "ALTER TABLE scheduled_tasks ADD COLUMN media_source_id TEXT REFERENCES media_libraries(id) ON DELETE CASCADE",
        desc: "添加 scheduled_tasks.media_source_id 字段",
      },
      {
        name: "library_template_mapping",
        sql: "ALTER TABLE scheduled_tasks ADD COLUMN library_template_mapping TEXT DEFAULT '{}'",
        desc: "添加 scheduled_tasks.library_template_mapping 字段",
      },
      {
        name: "exclude_libraries",
        sql: "ALTER TABLE scheduled_tasks ADD COLUMN exclude_libraries TEXT DEFAULT '[]'",
        desc: "添加 scheduled_tasks.exclude_libraries 字段",
      },
      {
        name: "poster_count",
        sql: "ALTER TABLE scheduled_tasks ADD COLUMN poster_count INTEGER DEFAULT 9",
        desc: "添加 scheduled_tasks.poster_count 字段",
      },
      {
        name: "upload_enabled",
        sql: "ALTER TABLE scheduled_tasks ADD COLUMN upload_enabled INTEGER DEFAULT 1",
        desc: "添加 scheduled_tasks.upload_enabled 字段",
      },
      {
        name: "sort_by",
        sql: "ALTER TABLE scheduled_tasks ADD COLUMN sort_by TEXT DEFAULT 'DateCreated'",
        desc: "添加 scheduled_tasks.sort_by 字段",
      },
    ];

    for (const col of newColumns) {
      if (!(await columnExists("scheduled_tasks", col.name))) {
        await runSQL(col.sql, col.desc);
      } else {
        console.log(`⏭️  scheduled_tasks.${col.name} 字段已存在,跳过`);
      }
    }

    // 3. 创建索引
    await runSQL(
      "CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_media_source ON scheduled_tasks(media_source_id)",
      "创建 scheduled_tasks.media_source_id 索引"
    );

    await runSQL(
      "CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_active ON scheduled_tasks(is_active)",
      "创建 scheduled_tasks.is_active 索引"
    );

    await runSQL(
      "CREATE INDEX IF NOT EXISTS idx_media_libraries_active ON media_libraries(is_active)",
      "创建 media_libraries.is_active 索引"
    );

    // 4. 显示最终表结构
    console.log("\n=== 迁移后的表结构 ===\n");

    db.all("PRAGMA table_info(media_libraries)", (err, rows) => {
      if (err) {
        console.error("读取 media_libraries 结构失败:", err);
      } else {
        console.log("📋 media_libraries 表字段:");
        rows.forEach((row) => {
          console.log(
            `  - ${row.name} (${row.type})${row.dflt_value ? ` DEFAULT ${row.dflt_value}` : ""}`
          );
        });
      }

      db.all("PRAGMA table_info(scheduled_tasks)", (err, rows) => {
        if (err) {
          console.error("读取 scheduled_tasks 结构失败:", err);
        } else {
          console.log("\n📋 scheduled_tasks 表字段:");
          rows.forEach((row) => {
            console.log(
              `  - ${row.name} (${row.type})${row.dflt_value ? ` DEFAULT ${row.dflt_value}` : ""}`
            );
          });
        }

        console.log("\n✨ 数据库迁移完成!");
        db.close();
      });
    });
  } catch (error) {
    console.error("\n❌ 迁移过程中发生错误:", error);
    db.close();
    process.exit(1);
  }
}

// 执行迁移
migrate();
