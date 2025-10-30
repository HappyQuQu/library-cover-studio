const express = require("express");
const router = express.Router();
const scheduleController = require("../controllers/scheduleController");
const { validateScheduleTask } = require("../middleware/validation");

// 获取所有定时任务
router.get("/", scheduleController.getAllTasks);

// 根据ID获取定时任务
router.get("/:id", scheduleController.getTaskById);

// 创建新定时任务
router.post("/", validateScheduleTask, scheduleController.createTask);

// 更新定时任务
router.put("/:id", validateScheduleTask, scheduleController.updateTask);

// 删除定时任务
router.delete("/:id", scheduleController.deleteTask);

// 手动触发任务
router.post("/:id/trigger", scheduleController.triggerTask);

// 启用/禁用任务
router.patch("/:id/toggle", scheduleController.toggleTask);

// 获取任务执行历史
router.get("/:id/executions", scheduleController.getTaskExecutions);

// 获取队列状态
router.get("/queue/stats", scheduleController.getQueueStats);

module.exports = router;
