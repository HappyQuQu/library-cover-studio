const cron = require("node-cron");
const WorkflowService = require("./workflowService");
const taskLogger = require("./logger").tasks;

/**
 * 调度服务
 * 管理定时任务
 */
class SchedulerService {
  constructor() {
    this.tasks = new Map();
    this.workflowService = new WorkflowService();
  }

  /**
   * 添加定时任务
   * @param {string} taskId - 任务ID
   * @param {string} cronExpression - cron表达式
   * @param {Array} serverConfigs - 服务器配置列表
   * @param {Object} options - 选项
   * @returns {Object} 任务对象
   */
  addTask(taskId, cronExpression, serverConfigs, options = {}) {
    if (this.tasks.has(taskId)) {
      console.log(`⚠️  任务 ${taskId} 已存在，将先停止旧任务`);
      taskLogger.warn(`任务 ${taskId} 已存在，将先停止旧任务`);
      this.stopTask(taskId);
    }

    const { runImmediately = false } = options;

  console.log(`\n📅 添加定时任务: ${taskId}`);
  taskLogger.info(`添加定时任务: ${taskId}`);
  console.log(`   Cron表达式: ${cronExpression}`);
  taskLogger.info(`Cron表达式: ${cronExpression}`);
  console.log(`   服务器数量: ${serverConfigs.length}`);
  taskLogger.info(`服务器数量: ${serverConfigs.length}`);
  console.log(`   立即执行: ${runImmediately ? "是" : "否"}\n`);
  taskLogger.info(`立即执行: ${runImmediately ? "是" : "否"}`);

    // 验证cron表达式
    if (!cron.validate(cronExpression)) {
      throw new Error(`无效的cron表达式: ${cronExpression}`);
    }

    // 创建任务
    const task = cron.schedule(
      cronExpression,
      async () => {
        await this.executeTask(taskId, serverConfigs, options);
      },
      {
        scheduled: false, // 先不启动
      }
    );

    this.tasks.set(taskId, {
      task,
      cronExpression,
      serverConfigs,
      options,
      status: "stopped",
      lastRun: null,
      nextRun: null,
    });

    // 启动任务
    this.startTask(taskId);

    // 立即执行一次
    if (runImmediately) {
      console.log(`🚀 立即执行任务: ${taskId}\n`);
      taskLogger.info(`立即执行任务: ${taskId}`);
      this.executeTask(taskId, serverConfigs, options);
    }

    return this.getTaskInfo(taskId);
  }

  /**
   * 执行任务
   * @param {string} taskId - 任务ID
   * @param {Array} serverConfigs - 服务器配置列表
   * @param {Object} options - 选项
   */
  async executeTask(taskId, serverConfigs, options) {
    const taskInfo = this.tasks.get(taskId);
    if (!taskInfo) {
      console.error(`❌ 任务不存在: ${taskId}`);
      taskLogger.error(`任务不存在: ${taskId}`);
      return;
    }

    const startTime = new Date();
  console.log(`\n${"=".repeat(80)}`);
  console.log(`⏰ 执行定时任务: ${taskId}`);
  console.log(`   开始时间: ${startTime.toLocaleString("zh-CN")}`);
  console.log(`${"=".repeat(80)}\n`);
  taskLogger.info(`执行定时任务: ${taskId} 开始时间: ${startTime.toLocaleString("zh-CN")}`);

    try {
      taskInfo.status = "running";
      taskInfo.lastRun = startTime;

      const results = await this.workflowService.processAllServers(
        serverConfigs,
        options
      );

      const endTime = new Date();
      const duration = ((endTime - startTime) / 1000).toFixed(2);

  console.log(`\n${"=".repeat(80)}`);
  console.log(`✅ 任务执行完成: ${taskId}`);
  console.log(`   结束时间: ${endTime.toLocaleString("zh-CN")}`);
  console.log(`   执行时长: ${duration}秒`);
  console.log(`${"=".repeat(80)}\n`);
  taskLogger.info(`任务执行完成: ${taskId} 结束时间: ${endTime.toLocaleString("zh-CN")} 耗时: ${duration}s`);

      taskInfo.status = "success";
      taskInfo.lastResults = results;

      return results;
    } catch (error) {
      console.error(`\n❌ 任务执行失败: ${taskId}`, error);
      taskLogger.error(`任务执行失败: ${taskId} ${error.message || error}`);
      taskInfo.status = "failed";
      taskInfo.lastError = error.message;
    }
  }

  /**
   * 启动任务
   * @param {string} taskId - 任务ID
   */
  startTask(taskId) {
    const taskInfo = this.tasks.get(taskId);
    if (!taskInfo) {
      throw new Error(`任务不存在: ${taskId}`);
    }

    if (taskInfo.status === "running") {
      console.log(`⚠️  任务 ${taskId} 正在运行中`);
      taskLogger.warn(`任务 ${taskId} 正在运行中`);
      return;
    }

    taskInfo.task.start();
    taskInfo.status = "running";
  console.log(`▶️  任务已启动: ${taskId}`);
  taskLogger.info(`任务已启动: ${taskId}`);
  }

  /**
   * 停止任务
   * @param {string} taskId - 任务ID
   */
  stopTask(taskId) {
    const taskInfo = this.tasks.get(taskId);
    if (!taskInfo) {
      throw new Error(`任务不存在: ${taskId}`);
    }

    taskInfo.task.stop();
    taskInfo.status = "stopped";
  console.log(`⏸️  任务已停止: ${taskId}`);
  taskLogger.info(`任务已停止: ${taskId}`);
  }

  /**
   * 删除任务
   * @param {string} taskId - 任务ID
   */
  removeTask(taskId) {
    const taskInfo = this.tasks.get(taskId);
    if (!taskInfo) {
      throw new Error(`任务不存在: ${taskId}`);
    }

    taskInfo.task.stop();
    this.tasks.delete(taskId);
  console.log(`🗑️  任务已删除: ${taskId}`);
  taskLogger.info(`任务已删除: ${taskId}`);
  }

  /**
   * 获取任务信息
   * @param {string} taskId - 任务ID
   * @returns {Object} 任务信息
   */
  getTaskInfo(taskId) {
    const taskInfo = this.tasks.get(taskId);
    if (!taskInfo) {
      return null;
    }

    return {
      taskId,
      cronExpression: taskInfo.cronExpression,
      status: taskInfo.status,
      lastRun: taskInfo.lastRun,
      serverCount: taskInfo.serverConfigs.length,
      hasLastResults: !!taskInfo.lastResults,
      lastError: taskInfo.lastError || null,
    };
  }

  /**
   * 获取所有任务列表
   * @returns {Array} 任务列表
   */
  getAllTasks() {
    const tasks = [];
    for (const [taskId] of this.tasks) {
      tasks.push(this.getTaskInfo(taskId));
    }
    return tasks;
  }

  /**
   * 手动触发任务
   * @param {string} taskId - 任务ID
   */
  async triggerTask(taskId) {
    const taskInfo = this.tasks.get(taskId);
    if (!taskInfo) {
      throw new Error(`任务不存在: ${taskId}`);
    }

  console.log(`🔧 手动触发任务: ${taskId}`);
  taskLogger.info(`手动触发任务: ${taskId}`);
    return await this.executeTask(
      taskId,
      taskInfo.serverConfigs,
      taskInfo.options
    );
  }

  /**
   * 停止所有任务
   */
  stopAll() {
  console.log(`\n⏸️  停止所有定时任务...`);
  taskLogger.warn(`停止所有定时任务...`);
    for (const [taskId] of this.tasks) {
      this.stopTask(taskId);
    }
  console.log(`✅ 所有任务已停止\n`);
  taskLogger.info(`所有任务已停止`);
  }

  /**
   * 启动所有任务
   */
  startAll() {
  console.log(`\n▶️  启动所有定时任务...`);
  taskLogger.info(`启动所有定时任务...`);
    for (const [taskId] of this.tasks) {
      try {
        this.startTask(taskId);
      } catch (error) {
  console.error(`❌ 启动任务失败 ${taskId}:`, error.message);
  taskLogger.error(`启动任务失败 ${taskId}: ${error.message}`);
      }
    }
  console.log(`✅ 所有任务已启动\n`);
  taskLogger.info(`所有任务已启动`);
  }
}

// 单例模式
let instance = null;

module.exports = {
  getInstance: () => {
    if (!instance) {
      instance = new SchedulerService();
    }
    return instance;
  },
  SchedulerService,
};
