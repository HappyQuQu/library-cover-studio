const fs = require("fs");
const fsp = require("fs").promises;
const path = require("path");

const LOG_DIR = path.join(__dirname, "../../data/logs");
const SYSTEM_LOG = path.join(LOG_DIR, "system.log");
const TASKS_LOG = path.join(LOG_DIR, "tasks.log");
const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_LOG_FILES = 5; // 保留最多5个归档文件

async function ensureLogDir() {
  await fsp.mkdir(LOG_DIR, { recursive: true });
  for (const file of [SYSTEM_LOG, TASKS_LOG]) {
    try {
      await fsp.access(file);
    } catch {
      await fsp.writeFile(file, "", "utf8");
    }
  }
}

function formatLine(level, message, meta = {}) {
  // 获取本地时间字符串，格式：2025-10-31 23:50:34
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const ts = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  
  const metaStr = Object.keys(meta).length > 0 ? ` | ${JSON.stringify(meta)}` : '';
  return `[${ts}] [${level.padEnd(5)}] ${message}${metaStr}\n`;
}

async function rotateLogIfNeeded(file) {
  try {
    const stats = await fsp.stat(file);
    if (stats.size > MAX_LOG_SIZE) {
      // 日志文件过大，进行轮转
      const basename = path.basename(file, '.log');
      const dir = path.dirname(file);
      
      // 删除最老的归档
      const oldestArchive = path.join(dir, `${basename}.${MAX_LOG_FILES}.log`);
      try {
        await fsp.unlink(oldestArchive);
      } catch (e) {
        // 文件可能不存在
      }
      
      // 重命名现有归档
      for (let i = MAX_LOG_FILES - 1; i >= 1; i--) {
        const oldPath = path.join(dir, `${basename}.${i}.log`);
        const newPath = path.join(dir, `${basename}.${i + 1}.log`);
        try {
          await fsp.rename(oldPath, newPath);
        } catch (e) {
          // 文件可能不存在
        }
      }
      
      // 归档当前日志
      await fsp.rename(file, path.join(dir, `${basename}.1.log`));
      await fsp.writeFile(file, '', 'utf8');
      
      await append(file, 'INFO', '日志文件已轮转', { rotated: true });
    }
  } catch (e) {
    // 文件可能不存在或其他错误，忽略
  }
}

async function append(file, level, message, meta = {}) {
  await ensureLogDir();
  await rotateLogIfNeeded(file);
  const line = formatLine(level, typeof message === "string" ? message : JSON.stringify(message), meta);
  await fsp.appendFile(file, line, "utf8");
}

async function tailFile(file, maxLines = 200) {
  await ensureLogDir();
  try {
    const data = await fsp.readFile(file, "utf8");
    const lines = data.split(/\r?\n/);
    const sliced = lines.slice(Math.max(0, lines.length - maxLines));
    return sliced.join("\n");
  } catch (e) {
    return "";
  }
}

module.exports = {
  files: { SYSTEM_LOG, TASKS_LOG, LOG_DIR },
  system: {
    info: (msg, meta) => append(SYSTEM_LOG, "INFO", msg, meta),
    warn: (msg, meta) => append(SYSTEM_LOG, "WARN", msg, meta),
    error: (msg, meta) => append(SYSTEM_LOG, "ERROR", msg, meta),
    debug: (msg, meta) => append(SYSTEM_LOG, "DEBUG", msg, meta),
  },
  tasks: {
    info: (msg, meta) => append(TASKS_LOG, "INFO", msg, meta),
    warn: (msg, meta) => append(TASKS_LOG, "WARN", msg, meta),
    error: (msg, meta) => append(TASKS_LOG, "ERROR", msg, meta),
    debug: (msg, meta) => append(TASKS_LOG, "DEBUG", msg, meta),
  },
  tail: {
    system: (lines) => tailFile(SYSTEM_LOG, lines),
    tasks: (lines) => tailFile(TASKS_LOG, lines),
  },
};
