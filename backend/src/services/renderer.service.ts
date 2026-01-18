import sharp from 'sharp';
import pLimit from 'p-limit';
import fs from 'fs';

interface RenderOptions {
  width: number;
  height: number;
  quality?: number;
  format?: 'png' | 'jpeg' | 'webp';
}

interface CanvasObject {
  type: string;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  fill?: string;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  src?: string;
  scaleX?: number;
  scaleY?: number;
  angle?: number;
  opacity?: number;
}

interface TemplateData {
  version: string;
  objects: CanvasObject[];
  background?: string;
  width: number;
  height: number;
}

interface MediaMetadata {
  title: string;
  year?: number;
  rating?: number;
  genres?: string[];
  posterUrl?: string;
}

// 并发限制
const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT_RENDERS || '3');
const limit = pLimit(MAX_CONCURRENT);

// 确保临时目录存在
const TEMP_DIR = './temp';
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// 渲染模板
export async function renderTemplate(
  templateJson: string,
  metadata: MediaMetadata,
  posterBuffer?: Buffer,
  options: RenderOptions = { width: 600, height: 900 }
): Promise<Buffer> {
  return limit(async () => {
    try {
      const template: TemplateData = JSON.parse(templateJson);
      
      // 替换变量
      const processedTemplate = replaceVariables(template, metadata);
      
      // 基础画布
      let canvas = sharp({
        create: {
          width: options.width,
          height: options.height,
          channels: 4,
          background: template.background 
            ? parseColor(template.background) 
            : { r: 0, g: 0, b: 0, alpha: 1 }
        }
      });

      // 收集所有图层
      const layers: sharp.OverlayOptions[] = [];

      for (const obj of processedTemplate.objects) {
        const layer = await renderObject(obj, posterBuffer);
        if (layer) {
          layers.push(layer);
        }
      }

      // 合成所有图层
      if (layers.length > 0) {
        canvas = canvas.composite(layers);
      }

      // 输出格式
      const format = options.format || 'png';
      const quality = options.quality || 90;

      switch (format) {
        case 'jpeg':
          return canvas.jpeg({ quality }).toBuffer();
        case 'webp':
          return canvas.webp({ quality }).toBuffer();
        default:
          return canvas.png().toBuffer();
      }
    } catch (error) {
      console.error('Render failed:', error);
      throw error;
    }
  });
}

// 替换模板变量
function replaceVariables(template: TemplateData, metadata: MediaMetadata): TemplateData {
  const replaceText = (text: string): string => {
    return text
      .replace(/\{\{title\}\}/g, metadata.title || '')
      .replace(/\{\{year\}\}/g, String(metadata.year || ''))
      .replace(/\{\{rating\}\}/g, metadata.rating?.toFixed(1) || '')
      .replace(/\{\{genres\}\}/g, metadata.genres?.join(' / ') || '');
  };

  const processedObjects = template.objects.map(obj => {
    if (obj.type === 'text' || obj.type === 'i-text' || obj.type === 'textbox') {
      return {
        ...obj,
        text: obj.text ? replaceText(obj.text) : obj.text
      };
    }
    return obj;
  });

  return {
    ...template,
    objects: processedObjects
  };
}

// 渲染单个对象
async function renderObject(
  obj: CanvasObject,
  posterBuffer?: Buffer
): Promise<sharp.OverlayOptions | null> {
  const left = Math.round(obj.left || 0);
  const top = Math.round(obj.top || 0);

  switch (obj.type) {
    case 'rect':
      return renderRect(obj, left, top);
    
    case 'image':
      // 如果是海报容器，使用传入的海报图片
      if (obj.src === '{{poster}}' && posterBuffer) {
        return renderPoster(obj, posterBuffer, left, top);
      }
      // 普通图片
      if (obj.src) {
        return renderImage(obj, left, top);
      }
      return null;
    
    case 'text':
    case 'i-text':
    case 'textbox':
      return renderText(obj, left, top);
    
    default:
      return null;
  }
}

// 渲染矩形
async function renderRect(
  obj: CanvasObject,
  left: number,
  top: number
): Promise<sharp.OverlayOptions | null> {
  const width = Math.round((obj.width || 100) * (obj.scaleX || 1));
  const height = Math.round((obj.height || 100) * (obj.scaleY || 1));
  const color = parseColor(obj.fill || '#000000');
  
  const rect = await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { ...color, alpha: obj.opacity || 1 }
    }
  }).png().toBuffer();

  return { input: rect, left, top };
}

// 渲染海报
async function renderPoster(
  obj: CanvasObject,
  posterBuffer: Buffer,
  left: number,
  top: number
): Promise<sharp.OverlayOptions | null> {
  const width = Math.round((obj.width || 600) * (obj.scaleX || 1));
  const height = Math.round((obj.height || 900) * (obj.scaleY || 1));

  const resized = await sharp(posterBuffer)
    .resize(width, height, { fit: 'cover' })
    .png()
    .toBuffer();

  return { input: resized, left, top };
}

// 渲染图片
async function renderImage(
  obj: CanvasObject,
  left: number,
  top: number
): Promise<sharp.OverlayOptions | null> {
  try {
    const width = Math.round((obj.width || 100) * (obj.scaleX || 1));
    const height = Math.round((obj.height || 100) * (obj.scaleY || 1));

    // 这里需要处理图片 URL 或本地路径
    // 简化起见，暂时只支持本地路径
    if (obj.src && fs.existsSync(obj.src)) {
      const resized = await sharp(obj.src)
        .resize(width, height, { fit: 'contain' })
        .png()
        .toBuffer();

      return { input: resized, left, top };
    }
  } catch (error) {
    console.error('Failed to render image:', error);
  }
  return null;
}

// 渲染文本 (简化版 - 使用 SVG)
async function renderText(
  obj: CanvasObject,
  left: number,
  top: number
): Promise<sharp.OverlayOptions | null> {
  if (!obj.text) return null;

  const fontSize = obj.fontSize || 24;
  const fontFamily = obj.fontFamily || 'sans-serif';
  const fill = obj.fill || '#ffffff';
  const width = Math.round((obj.width || 200) * (obj.scaleX || 1));
  const height = fontSize * 1.5;

  // 使用 SVG 渲染文本
  const svg = `
    <svg width="${width}" height="${height}">
      <text 
        x="0" 
        y="${fontSize}" 
        font-size="${fontSize}" 
        font-family="${fontFamily}"
        fill="${fill}"
      >${escapeXml(obj.text)}</text>
    </svg>
  `;

  const textBuffer = await sharp(Buffer.from(svg))
    .png()
    .toBuffer();

  return { input: textBuffer, left, top };
}

// 解析颜色
function parseColor(color: string): { r: number; g: number; b: number; alpha: number } {
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
      alpha: 1
    };
  }
  // 默认黑色
  return { r: 0, g: 0, b: 0, alpha: 1 };
}

// 转义 XML 字符
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
