const Joi = require("joi");

// 模板验证规则
const templateSchema = Joi.object({
  name: Joi.string().min(1).max(255).required(),
  description: Joi.string().max(1000).allow(""),
  // canvasData 可以是对象（JSON格式）或字符串（FormData格式）
  canvasData: Joi.alternatives().try(Joi.object(), Joi.string()).required(),
  // tags 可以是数组（JSON格式）或字符串（FormData格式）
  tags: Joi.alternatives()
    .try(Joi.array().items(Joi.string()), Joi.string())
    .optional(),
  // matchTags 可以是数组（JSON格式）或字符串（FormData格式）
  matchTags: Joi.alternatives()
    .try(Joi.array().items(Joi.string()), Joi.string())
    .optional(),
  match_tags: Joi.alternatives()
    .try(Joi.array().items(Joi.string()), Joi.string())
    .optional(),
});

// 海报生成验证规则
const posterGenerationSchema = Joi.object({
  templateId: Joi.string().uuid().required(),
  mediaLibraryId: Joi.string().uuid().required(),
  mediaItems: Joi.array()
    .items(
      Joi.object({
        id: Joi.string().required(),
        title: Joi.string().required(),
        type: Joi.string().valid("movie", "tv", "episode", "season").required(),
        year: Joi.number().optional(),
        rating: Joi.number().optional(),
      })
    )
    .min(1)
    .required(),
});

// 媒体库配置验证规则
const mediaLibrarySchema = Joi.object({
  name: Joi.string().min(1).max(255).required(),
  type: Joi.string().valid("jellyfin", "emby", "plex").required(),
  baseUrl: Joi.string().uri().required(),
  apiKey: Joi.string().required(),
  username: Joi.string().optional(),
  password: Joi.string().optional(),
  config: Joi.object().optional(),
});

// 定时任务验证规则
const scheduleTaskSchema = Joi.object({
  name: Joi.string().min(1).max(255).required(),
  templateId: Joi.string().uuid().required(),
  mediaLibraryId: Joi.string().uuid().required(),
  cronExpression: Joi.string().required(),
  filters: Joi.object().optional(),
  isActive: Joi.boolean().default(false),
});

// 验证中间件工厂函数
const validate = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body);

    if (error) {
      return res.status(400).json({
        error: "数据验证失败",
        details: error.details.map((detail) => ({
          field: detail.path.join("."),
          message: detail.message,
        })),
      });
    }

    req.validatedData = value;
    next();
  };
};

module.exports = {
  validateTemplate: validate(templateSchema),
  validatePosterGeneration: validate(posterGenerationSchema),
  validateMediaLibrary: validate(mediaLibrarySchema),
  validateScheduleTask: validate(scheduleTaskSchema),
};
