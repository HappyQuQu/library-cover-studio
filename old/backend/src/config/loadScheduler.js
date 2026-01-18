const fs = require("fs").promises;
const path = require("path");
const db = require("../services/database");
const { getInstance: getScheduler } = require("../services/schedulerService");
const WorkflowService = require("../services/workflowService");

/**
 * 从数据库加载激活的定时任务
 */
async function loadSchedulerConfig() {
  try {
    console.log("\n🔧 加载数据库中的定时任务...");

    // 获取数据库实例
    const dbInstance = db.getDb();

    // 从数据库获取所有激活的任务
    const tasks = await dbInstance.all(
      `SELECT 
        st.*,
        ml.name as source_name,
        ml.base_url,
        ml.api_key,
        ml.user_id
       FROM scheduled_tasks st
       JOIN media_libraries ml ON st.media_source_id = ml.id
       WHERE st.is_active = 1 AND ml.is_active = 1`
    );

    if (tasks.length === 0) {
      console.log("📝 没有找到激活的定时任务");
      return;
    }

    const scheduler = getScheduler();
    const workflowService = new WorkflowService();

    for (const task of tasks) {
      try {
        scheduler.addTask(
          `task-${task.id}`,
          task.cron_expression,
          [
            {
              name: task.source_name,
              baseURL: task.base_url,
              apiKey: task.api_key,
              userId: task.user_id,
            },
          ],
          {
            taskId: task.id,
            excludeLibraries: JSON.parse(task.exclude_libraries || "[]"),
            templateMapping: JSON.parse(task.library_template_mapping || "{}"),
            posterCount: task.poster_count,
            uploadEnabled: task.upload_enabled,
            sortBy: task.sort_by || "DateCreated",
            runImmediately: false,
          }
        );

        console.log(
          `✅ 定时任务已加载: ${task.name} (${task.cron_expression})`
        );
      } catch (error) {
        console.error(`❌ 加载任务失败 (${task.name}):`, error.message);
      }
    }

    console.log(`\n✨ 成功加载 ${tasks.length} 个定时任务\n`);
  } catch (error) {
    console.error("❌ 加载定时任务配置失败:", error.message);
  }
}

module.exports = { loadSchedulerConfig };
