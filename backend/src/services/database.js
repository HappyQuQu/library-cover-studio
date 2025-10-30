const sqlite3 = require("sqlite3").verbose();
const { open } = require("sqlite");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");

class Database {
  constructor() {
    this.db = null;
  }

  async initialize() {
    const dbPath =
      process.env.DB_PATH ||
      path.join(__dirname, "../../data/library-cover-studio.db");
    const dbDir = path.dirname(dbPath);

    // 确保数据目录存在
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    // 打开数据库连接
    this.db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });

    // 启用外键约束
    await this.db.exec("PRAGMA foreign_keys = ON;");

    // 初始化数据库结构
    await this.initializeSchema();

    // 创建默认管理员用户
    await this.createDefaultAdmin();

    console.log("✅ SQLite database initialized at:", dbPath);
    return this.db;
  }

  async initializeSchema() {
    const schemaPath = path.join(__dirname, "../../database/schema.sqlite.sql");

    if (fs.existsSync(schemaPath)) {
      const schema = fs.readFileSync(schemaPath, "utf8");
      await this.db.exec(schema);
      console.log("✅ Database schema initialized");
    } else {
      console.warn("⚠️  Schema file not found at:", schemaPath);
    }
  }

  async createDefaultAdmin() {
    try {
      const existingUser = await this.db.get(
        "SELECT * FROM users WHERE username = ?",
        ["admin"]
      );

      if (!existingUser) {
        const hashedPassword = await bcrypt.hash("admin123", 10);
        await this.db.run(
          "INSERT INTO users (id, username, password) VALUES (?, ?, ?)",
          [this.generateId(), "admin", hashedPassword]
        );
        console.log(
          "✅ Default admin user created (username: admin, password: admin123)"
        );
        console.log(
          "⚠️  Please change the default password after first login!"
        );
      }
    } catch (error) {
      console.error("Error creating default admin:", error.message);
    }
  }

  generateId() {
    return require("crypto").randomBytes(16).toString("hex");
  }

  getDb() {
    if (!this.db) {
      throw new Error("Database not initialized. Call initialize() first.");
    }
    return this.db;
  }

  async close() {
    if (this.db) {
      await this.db.close();
      console.log("Database connection closed");
    }
  }
}

// 导出单例实例
const database = new Database();

module.exports = database;
