const sharp = require("sharp");
const { createCanvas, loadImage, registerFont } = require("canvas");
const path = require("path");
const fs = require("fs").promises;
const { Pool } = require("pg");

class PosterGenerator {
  constructor() {
    this.pool = new Pool({
      host: process.env.DB_HOST || "localhost",
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || "library_cover_studio",
      user: process.env.DB_USER || "postgres",
      password: process.env.DB_PASSWORD || "password",
    });

    // 注册字体
    this.initFonts();
  }

  // 初始化字体
  async initFonts() {
    try {
      // 这里可以注册系统字体或自定义字体
      // registerFont(path.join(__dirname, '../fonts/arial.ttf'), { family: 'Arial' });
    } catch (error) {
      console.warn("字体初始化失败:", error.message);
    }
  }

  // 生成海报
  async generate({ templateId, mediaItem, outputPath }) {
    try {
      // 获取模板数据
      const template = await this.getTemplate(templateId);

      if (!template) {
        throw new Error("模板不存在");
      }

      // 解析模板数据
      const canvasData = template.canvas_data;

      // 处理模板变量
      const processedData = this.replaceVariables(canvasData, mediaItem);

      // 渲染海报
      const posterBuffer = await this.renderCanvas(processedData);

      // 保存文件
      const fullOutputPath = path.join(__dirname, "../../uploads", outputPath);
      await fs.mkdir(path.dirname(fullOutputPath), { recursive: true });
      await fs.writeFile(fullOutputPath, posterBuffer);

      return outputPath;
    } catch (error) {
      console.error("生成海报失败:", error);
      throw error;
    }
  }

  // 获取模板
  async getTemplate(templateId) {
    try {
      const query = `SELECT * FROM templates WHERE id = $1 AND deleted_at IS NULL`;
      const result = await this.pool.query(query, [templateId]);

      return result.rows[0] || null;
    } catch (error) {
      console.error("获取模板失败:", error);
      throw error;
    }
  }

  // 替换模板变量
  replaceVariables(canvasData, mediaItem) {
    const variables = {
      "{{title}}": mediaItem.title || "",
      "{{year}}": mediaItem.year ? mediaItem.year.toString() : "",
      "{{rating}}": mediaItem.rating ? mediaItem.rating.toString() : "",
      "{{type}}": mediaItem.type || "",
      "{{genres}}": (mediaItem.genres || []).join(", "),
      "{{overview}}": mediaItem.overview || "",
    };

    // 深度克隆并替换变量
    let dataStr = JSON.stringify(canvasData);

    Object.entries(variables).forEach(([key, value]) => {
      dataStr = dataStr.replace(new RegExp(key, "g"), value);
    });

    return JSON.parse(dataStr);
  }

  // 渲染Canvas
  async renderCanvas(canvasData) {
    try {
      // 默认尺寸
      const width = canvasData.width || 400;
      const height = canvasData.height || 600;

      // 创建Canvas
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext("2d");

      // 设置背景
      if (canvasData.backgroundColor) {
        ctx.fillStyle = canvasData.backgroundColor;
        ctx.fillRect(0, 0, width, height);
      }

      // 渲染对象
      if (canvasData.objects && Array.isArray(canvasData.objects)) {
        for (const obj of canvasData.objects) {
          await this.renderObject(ctx, obj);
        }
      }

      // 转换为Buffer
      return canvas.toBuffer("image/png");
    } catch (error) {
      console.error("渲染Canvas失败:", error);
      throw error;
    }
  }

  // 渲染单个对象
  async renderObject(ctx, obj) {
    try {
      const { type, left = 0, top = 0, width = 0, height = 0 } = obj;

      switch (type) {
        case "rect":
          await this.renderRect(ctx, obj);
          break;
        case "text":
          await this.renderText(ctx, obj);
          break;
        case "image":
          await this.renderImage(ctx, obj);
          break;
        case "circle":
          await this.renderCircle(ctx, obj);
          break;
        default:
          console.warn(`不支持的对象类型: ${type}`);
      }
    } catch (error) {
      console.error("渲染对象失败:", error);
    }
  }

  // 渲染矩形
  async renderRect(ctx, obj) {
    const {
      left = 0,
      top = 0,
      width = 100,
      height = 100,
      fill = "#000000",
    } = obj;

    ctx.fillStyle = fill;
    ctx.fillRect(left, top, width, height);

    if (obj.stroke) {
      ctx.strokeStyle = obj.stroke;
      ctx.lineWidth = obj.strokeWidth || 1;
      ctx.strokeRect(left, top, width, height);
    }
  }

  // 渲染文字
  async renderText(ctx, obj) {
    const {
      left = 0,
      top = 0,
      text = "",
      fontSize = 16,
      fontFamily = "Arial",
      fill = "#000000",
      fontWeight = "normal",
      fontStyle = "normal",
      textAlign = "left",
      angle = 0,
    } = obj;

    // 设置字体
    ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
    ctx.fillStyle = fill;
    ctx.textAlign = textAlign;

    // 处理旋转
    if (angle !== 0) {
      ctx.save();
      ctx.translate(left, top);
      ctx.rotate((angle * Math.PI) / 180);
      ctx.fillText(text, 0, 0);
      ctx.restore();
    } else {
      ctx.fillText(text, left, top);
    }

    // 描边
    if (obj.stroke) {
      ctx.strokeStyle = obj.stroke;
      ctx.lineWidth = obj.strokeWidth || 1;

      if (angle !== 0) {
        ctx.save();
        ctx.translate(left, top);
        ctx.rotate((angle * Math.PI) / 180);
        ctx.strokeText(text, 0, 0);
        ctx.restore();
      } else {
        ctx.strokeText(text, left, top);
      }
    }
  }

  // 渲染图片
  async renderImage(ctx, obj) {
    try {
      const { left = 0, top = 0, width = 100, height = 100, src } = obj;

      if (!src) return;

      const image = await loadImage(src);
      ctx.drawImage(image, left, top, width, height);
    } catch (error) {
      console.error("渲染图片失败:", error);
      // 绘制占位符
      ctx.fillStyle = "#cccccc";
      ctx.fillRect(
        obj.left || 0,
        obj.top || 0,
        obj.width || 100,
        obj.height || 100
      );

      ctx.fillStyle = "#666666";
      ctx.font = "14px Arial";
      ctx.textAlign = "center";
      ctx.fillText(
        "图片加载失败",
        (obj.left || 0) + (obj.width || 100) / 2,
        (obj.top || 0) + (obj.height || 100) / 2
      );
    }
  }

  // 渲染圆形
  async renderCircle(ctx, obj) {
    const { left = 0, top = 0, radius = 50, fill = "#000000" } = obj;

    ctx.beginPath();
    ctx.arc(left + radius, top + radius, radius, 0, 2 * Math.PI);
    ctx.fillStyle = fill;
    ctx.fill();

    if (obj.stroke) {
      ctx.strokeStyle = obj.stroke;
      ctx.lineWidth = obj.strokeWidth || 1;
      ctx.stroke();
    }
  }

  // 生成预览图
  async generatePreview(templateData, mediaItem, options = {}) {
    try {
      const { width = 200, height = 300 } = options;

      // 缩放模板数据
      const scaledData = this.scaleCanvasData(
        templateData,
        width / 400,
        height / 600
      );

      // 替换变量
      const processedData = this.replaceVariables(scaledData, mediaItem);

      // 渲染小尺寸预览
      const buffer = await this.renderCanvas(processedData);

      return buffer;
    } catch (error) {
      console.error("生成预览失败:", error);
      throw error;
    }
  }

  // 缩放Canvas数据
  scaleCanvasData(canvasData, scaleX, scaleY) {
    const scaled = JSON.parse(JSON.stringify(canvasData));

    if (scaled.objects && Array.isArray(scaled.objects)) {
      scaled.objects.forEach((obj) => {
        if (obj.left !== undefined) obj.left *= scaleX;
        if (obj.top !== undefined) obj.top *= scaleY;
        if (obj.width !== undefined) obj.width *= scaleX;
        if (obj.height !== undefined) obj.height *= scaleY;
        if (obj.fontSize !== undefined)
          obj.fontSize *= Math.min(scaleX, scaleY);
        if (obj.radius !== undefined) obj.radius *= Math.min(scaleX, scaleY);
      });
    }

    if (scaled.width) scaled.width *= scaleX;
    if (scaled.height) scaled.height *= scaleY;

    return scaled;
  }
}

module.exports = new PosterGenerator();
