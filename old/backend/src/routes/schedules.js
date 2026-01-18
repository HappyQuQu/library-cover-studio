const express = require("express");
const router = express.Router();
const scheduleController = require("../controllers/scheduleController");
const { validateScheduleTask } = require("../middleware/validation");
const { authenticate } = require("../middleware/auth");

// 获取所有定时任务
router.get("/", authenticate, scheduleController.getAllTasks);

// 根据ID获取定时任务
router.get("/:id", authenticate, scheduleController.getTaskById);

// 创建新定时任务（需要认证）
router.post(
  "/",
  authenticate,
  validateScheduleTask,
  scheduleController.createTask
);

// 更新定时任务（需要认证）
router.put(
  "/:id",
  authenticate,
  validateScheduleTask,
  scheduleController.updateTask
);

// 删除定时任务（需要认证）
router.delete("/:id", authenticate, scheduleController.deleteTask);

// 手动触发任务（需要认证）
router.post("/:id/trigger", authenticate, scheduleController.triggerTask);

// 启用/禁用任务（需要认证）
router.patch("/:id/toggle", authenticate, scheduleController.toggleTask);

// 获取任务执行历史
router.get("/:id/executions", authenticate, scheduleController.getTaskExecutions);

// 获取队列状态
router.get("/queue/stats", authenticate, scheduleController.getQueueStats);

module.exports = router;
