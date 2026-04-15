import sharp from 'sharp';
import pLimit from 'p-limit';
import fs from 'fs';
import path from 'path';
import { GlobalFonts, createCanvas } from '@napi-rs/canvas';
import { FONTS_DIR } from '../config/paths.js';

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
  originX?: string;  // 'left' | 'center' | 'right'
  originY?: string;  // 'top' | 'center' | 'bottom'
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
  primaryTitle?: string;
  secondaryTitle?: string;
}

// 并发限制
const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT_RENDERS || '3');
const limit = pLimit(MAX_CONCURRENT);

// 确保临时目录存在
const TEMP_DIR = './temp';
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// 已注册的字体
const registeredFonts = new Set<string>();

/**
 * 确保自定义字体已注册到 GlobalFonts
 */
function ensureFontRegistered(fontFamily: string): boolean {
  if (registeredFonts.has(fontFamily)) return true;

  if (!fs.existsSync(FONTS_DIR)) return false;

  const files = fs.readdirSync(FONTS_DIR);
  const fontFile = files.find(file => {
    const ext = path.extname(file).toLowerCase();
    if (!['.ttf', '.otf', '.woff', '.woff2'].includes(ext)) return false;

    const nameParts = file.split('-');
    const originalNameWithExt = nameParts.length > 1 ? nameParts.slice(1).join('-') : file;
    const fontName = path.basename(originalNameWithExt, ext);

    return fontName.toLowerCase() === fontFamily.toLowerCase() || file.toLowerCase() === fontFamily.toLowerCase();
  });

  if (!fontFile) return false;

  try {
    const filePath = path.join(FONTS_DIR, fontFile);
    console.log(`    🔤 Registering font: ${fontFamily} from ${fontFile}`);
    const success = GlobalFonts.registerFromPath(filePath, fontFamily);
    if (success) {
      registeredFonts.add(fontFamily);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`Failed to register font ${fontFamily}:`, error);
    return false;
  }
}

// 渲染模板
export async function renderTemplate(
  templateJson: string,
  metadata: MediaMetadata,
  posterBuffer?: Buffer,
  options: RenderOptions = { width: 900, height: 600 }
): Promise<Buffer> {
  return limit(async () => {
    try {
      const template: TemplateData = JSON.parse(templateJson);
      console.log(`  📐 Canvas size from template: ${template.width}x${template.height}`);

      // 替换变量
      const processedTemplate = replaceVariables(template, metadata);

      // 基础画布
      let canvas: sharp.Sharp;
      const width = template.width || options.width;
      const height = template.height || options.height;
      const background = template.background || (template as any).backgroundColor;

      if (isGradientObject(background)) {
        console.log('  🌈 Gradient background detected, generating SVG...');
        const svg = generateGradientSvg(width, height, background);
        canvas = sharp(Buffer.from(svg));
      } else {
        canvas = sharp({
          create: {
            width,
            height,
            channels: 4,
            background: resolveColor(background) as any
          }
        });
      }

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

// 渲染媒体库封面（支持多个海报占位符 poster1-poster9）
export async function renderLibraryCover(
  templateJson: string,
  metadata: MediaMetadata,
  posterBuffers: Buffer[],
  options: RenderOptions = { width: 900, height: 600 }
): Promise<Buffer> {
  return limit(async () => {
    try {
      const template: TemplateData = JSON.parse(templateJson);
      console.log(`  📐 Canvas size from template: ${template.width}x${template.height}`);

      // 替换变量
      const processedTemplate = replaceVariables(template, metadata);

      // 基础画布
      let canvas: sharp.Sharp;
      const width = template.width || options.width;
      const height = template.height || options.height;
      const background = template.background || (template as any).backgroundColor;

      if (isGradientObject(background)) {
        console.log('  🌈 Gradient background detected, generating SVG...');
        const svg = generateGradientSvg(width, height, background);
        canvas = sharp(Buffer.from(svg));
      } else {
        canvas = sharp({
          create: {
            width,
            height,
            channels: 4,
            background: resolveColor(background) as any
          }
        });
      }

      // Debug: 打印模板信息
      console.log(`  📋 Template has ${processedTemplate.objects?.length || 0} objects`);
      console.log(`  🖼️ Received ${posterBuffers.length} poster buffers`);
      if (processedTemplate.objects?.length > 0) {
        for (const obj of processedTemplate.objects) {
          console.log(`    - Object type: ${obj.type}, src: ${obj.src || 'N/A'}`);
        }
      }

      // 收集所有图层
      const layers: sharp.OverlayOptions[] = [];

      for (const obj of processedTemplate.objects) {
        const layer = await renderObjectWithPosters(obj, posterBuffers);
        if (layer) {
          layers.push(layer);
        }
      }

      console.log(`  ✨ Generated ${layers.length} layers`);

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
      console.error('Library cover render failed:', error);
      throw error;
    }
  });
}

// 计算实际的左上角位置（根据 Fabric.js 的 origin 设置）
function calculateTopLeft(obj: CanvasObject): { left: number; top: number } {
  const width = (obj.width || 0) * (obj.scaleX || 1);
  const height = (obj.height || 0) * (obj.scaleY || 1);
  let left = obj.left || 0;
  let top = obj.top || 0;

  // 根据 originX 调整
  if (obj.originX === 'center') {
    left = left - width / 2;
  } else if (obj.originX === 'right') {
    left = left - width;
  }

  // 根据 originY 调整
  if (obj.originY === 'center') {
    top = top - height / 2;
  } else if (obj.originY === 'bottom') {
    top = top - height;
  }

  return { left: Math.round(left), top: Math.round(top) };
}

// 渲染对象（支持多个海报占位符）
async function renderObjectWithPosters(
  obj: CanvasObject,
  posterBuffers: Buffer[]
): Promise<sharp.OverlayOptions | null> {
  const { left, top } = calculateTopLeft(obj);
  const objType = obj.type?.toLowerCase();

  switch (objType) {
    case 'rect':
      return renderRect(obj, left, top);

    case 'image':
      // First check posterVar property (e.g., "post1", "post2", etc.)
      if ((obj as any).posterVar) {
        const posterVarMatch = (obj as any).posterVar.match(/post(\d+)/);
        if (posterVarMatch) {
          const posterIndex = parseInt(posterVarMatch[1]) - 1;
          console.log(`    🎭 Using posterVar "${(obj as any).posterVar}" -> index ${posterIndex}`);
          if (posterIndex >= 0 && posterIndex < posterBuffers.length && posterBuffers[posterIndex]) {
            return renderPoster(obj, posterBuffers[posterIndex], left, top);
          }
          console.log(`    ⚠️ No poster buffer at index ${posterIndex}`);
          return null;
        }
      }

      if (obj.src) {
        // 检查是否是海报占位符 {{poster1}} - {{poster9}}
        const placeholderMatch = obj.src.match(/\{\{poster(\d+)\}\}/);
        if (placeholderMatch) {
          const posterIndex = parseInt(placeholderMatch[1]) - 1;
          if (posterIndex >= 0 && posterIndex < posterBuffers.length && posterBuffers[posterIndex]) {
            return renderPoster(obj, posterBuffers[posterIndex], left, top);
          }
          return null;
        }

        // 检查 URL 模式 /posters/X.jpg 或 /api/templates/posters/X.jpg
        const urlMatch = obj.src.match(/\/posters\/(\d+)\.(jpg|png|jpeg)/i);
        if (urlMatch) {
          const posterIndex = parseInt(urlMatch[1]) - 1;
          if (posterIndex >= 0 && posterIndex < posterBuffers.length && posterBuffers[posterIndex]) {
            console.log(`    🔄 Replacing ${obj.src} with poster buffer [${posterIndex + 1}]`);
            return renderPoster(obj, posterBuffers[posterIndex], left, top);
          }
          return null;
        }

        // 兼容旧的 {{poster}} 占位符
        if (obj.src === '{{poster}}' && posterBuffers.length > 0) {
          return renderPoster(obj, posterBuffers[0], left, top);
        }

        // 普通图片（从 URL 加载）
        return renderImage(obj, left, top);
      }
      return null;

    case 'text':
    case 'i-text':
    case 'itext':
    case 'textbox':
      return renderText(obj, left, top);

    case 'polygon':
      return renderPolygon(obj, left, top);

    default:
      return null;
  }
}

// 替换模板变量
function replaceVariables(template: TemplateData, metadata: MediaMetadata): TemplateData {
  const replaceText = (text: string): string => {
    return text
      .replace(/\{\{title\}\}/g, metadata.title || '')
      .replace(/\{\{year\}\}/g, String(metadata.year || ''))
      .replace(/\{\{rating\}\}/g, metadata.rating?.toFixed(1) || '')
      .replace(/\{\{genres\}\}/g, metadata.genres?.join(' / ') || '')
      .replace(/\{\{primary_title\}\}/g, metadata.primaryTitle || '')
      .replace(/\{\{secondary_title\}\}/g, metadata.secondaryTitle || '')
      // 清理剩余的未替换变量
      .replace(/\{\{.*?\}\}/g, '');
  };

  const processedObjects = template.objects.map((obj: any) => {
    if (['text', 'i-text', 'itext', 'textbox'].includes(obj.type?.toLowerCase())) {
      // textVar 优先：直接用变量值替换整个文字，不影响画布中显示的原文
      if (obj.textVar) {
        const resolved = replaceText(obj.textVar);
        return { ...obj, text: resolved };
      }
      // 回退：替换文字内容中的 {{}} 占位符
      return { ...obj, text: obj.text ? replaceText(obj.text) : obj.text };
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

    case 'polygon':
      return renderPolygon(obj, left, top);

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
  try {
    const width = Math.round((obj.width || 600) * (obj.scaleX || 1));
    const height = Math.round((obj.height || 900) * (obj.scaleY || 1));
    const angle = obj.angle || 0;
    const clipPath = (obj as any).clipPath;
    const borderRadius = clipPath?.rx || 0;
    const shadow = (obj as any).shadow;

    console.log(`    📐 Poster: ${width}x${height} at (${left}, ${top}), angle: ${angle}°, shadow: ${shadow ? 'yes' : 'no'}, radius: ${borderRadius}`);

    if (width <= 0 || height <= 0) {
      console.log(`    ⚠️ Invalid dimensions, skipping`);
      return null;
    }

    // Step 1: Resize the poster
    let processed = sharp(posterBuffer)
      .resize(width, height, { fit: 'cover' });

    // Step 2: Apply border radius using SVG mask if needed
    if (borderRadius > 0) {
      const scaledRadius = Math.round(borderRadius * (obj.scaleX || 1));
      const mask = Buffer.from(`
        <svg width="${width}" height="${height}">
          <rect x="0" y="0" width="${width}" height="${height}" rx="${scaledRadius}" ry="${scaledRadius}" fill="white"/>
        </svg>
      `);
      processed = processed.composite([{ input: mask, blend: 'dest-in' }]);
    }

    let resized = await processed.png().toBuffer();
    let currentWidth = width;
    let currentHeight = height;
    let positionOffsetX = 0;
    let positionOffsetY = 0;

    // Step 3: Apply rotation if needed (before shadow so shadow rotates too)
    if (angle !== 0) {
      resized = await sharp(resized)
        .rotate(angle, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();

      // Get new dimensions after rotation
      const metadata = await sharp(resized).metadata();
      const newWidth = metadata.width || width;
      const newHeight = metadata.height || height;

      // Calculate offset to keep center point consistent
      positionOffsetX = Math.round((newWidth - width) / 2);
      positionOffsetY = Math.round((newHeight - height) / 2);
      currentWidth = newWidth;
      currentHeight = newHeight;
    }

    // Step 4: Apply shadow if present
    if (shadow && shadow.blur > 0) {
      const shadowBlur = shadow.blur || 10;
      const shadowOffsetX = shadow.offsetX || 5;
      const shadowOffsetY = shadow.offsetY || 5;
      const shadowColor = shadow.color || 'rgba(0,0,0,0.5)';

      // Create a larger canvas to accommodate shadow
      const padding = Math.max(shadowBlur * 2, Math.abs(shadowOffsetX), Math.abs(shadowOffsetY)) + 20;
      const canvasWidth = currentWidth + padding * 2;
      const canvasHeight = currentHeight + padding * 2;

      // Convert image to base64 for embedding in SVG
      const base64Image = resized.toString('base64');

      // Create SVG with shadow filter
      const shadowSvg = `
        <svg width="${canvasWidth}" height="${canvasHeight}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
          <defs>
            <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="${shadowOffsetX}" dy="${shadowOffsetY}" stdDeviation="${shadowBlur / 2}" flood-color="${shadowColor}"/>
            </filter>
          </defs>
          <image x="${padding}" y="${padding}" width="${currentWidth}" height="${currentHeight}" 
                 xlink:href="data:image/png;base64,${base64Image}" 
                 filter="url(#shadow)"/>
        </svg>
      `;

      resized = await sharp(Buffer.from(shadowSvg)).png().toBuffer();
      positionOffsetX += padding;
      positionOffsetY += padding;
    }

    // Calculate final position
    const finalLeft = left - positionOffsetX;
    const finalTop = top - positionOffsetY;

    console.log(`    ✓ Final position: (${finalLeft}, ${finalTop})`);
    return { input: resized, left: finalLeft, top: finalTop };
  } catch (err) {
    console.error(`    ❌ Error in renderPoster:`, err);
    return null;
  }
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

// 渲染多边形 (使用 SVG)
async function renderPolygon(
  obj: CanvasObject,
  left: number,
  top: number
): Promise<sharp.OverlayOptions | null> {
  try {
    const width = Math.round((obj.width || 100) * (obj.scaleX || 1));
    const height = Math.round((obj.height || 100) * (obj.scaleY || 1));
    const points = (obj as any).points; // Fabric.js points array

    if (!points || !Array.isArray(points)) return null;

    const fill = resolveColor(obj.fill || '#000000');
    // 如果是对象颜色的 SVG 渐变，这里暂时简化处理，只支持纯色填充
    // 如果需要支持多边形渐变，需要更复杂的 SVG 用于 defs
    const fillStr = (typeof fill === 'string') ? fill : '#000000';

    // 构造 points 字符串 "x,y x,y ..."
    const pointsStr = points.map((p: any) => `${p.x},${p.y}`).join(' ');

    // Fabric 的 polygon points 通常是相对于中心的
    // 我们创建一个 SVG， viewBox 居中
    const svg = `
      <svg width="${width}" height="${height}" viewBox="${-width / 2} ${-height / 2} ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
        <polygon points="${pointsStr}" fill="${fillStr}" />
      </svg>
    `;

    const buffer = await sharp(Buffer.from(svg))
      .png()
      .toBuffer();

    return { input: buffer, left, top };
  } catch (error) {
    console.error('Failed to render polygon:', error);
    return null;
  }
}

// 渲染文本 (使用 @napi-rs/canvas)
async function renderText(
  obj: CanvasObject,
  left: number,
  top: number
): Promise<sharp.OverlayOptions | null> {
  if (!obj.text) return null;

  // Apply scale to fontSize
  const baseFontSize = obj.fontSize || 24;
  const scaleX = obj.scaleX || 1;
  const scaleY = obj.scaleY || 1;
  const fontSize = Math.round(baseFontSize * Math.max(scaleX, scaleY));

  const fontFamily = obj.fontFamily || 'sans-serif';
  const fontWeight = (obj as any).fontWeight || 'normal';
  const fill = obj.fill || '#ffffff';
  const textAlign = (obj as any).textAlign || 'left';
  const angle = obj.angle || 0;

  // 确保字体已注册
  const isRegistered = ensureFontRegistered(fontFamily);
  if (!isRegistered) {
    console.log(`    ⚠️ Font "${fontFamily}" not found, using fallback`);
  }

  // 计算大致所需的画布大小
  // 注意：Canvas 渲染文本需要一定的 Padding 避免被切掉
  const baseWidth = obj.width || 200;
  const width = Math.round(baseWidth * scaleX * 1.5) + 100;
  const height = Math.round(fontSize * 2) + 100;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // 设置字体
  ctx.font = `${fontWeight} ${fontSize}px "${fontFamily}"`;
  ctx.fillStyle = fill;
  ctx.textBaseline = 'top';

  // 测量文字
  const metrics = ctx.measureText(obj.text);
  const textWidth = metrics.width;

  // 根据对齐方式调整绘制位置 (在画布内部居中或偏移)
  let drawX = 50;
  if (textAlign === 'center') {
    drawX = (width - textWidth) / 2;
  } else if (textAlign === 'right') {
    drawX = width - textWidth - 50;
  }

  // 绘制文字
  ctx.fillText(obj.text, drawX, 50);

  let textBuffer = await canvas.encode('png');

  // 如果有旋转或需要裁剪透明像素，可以使用 sharp 处理
  let sharpInstance = sharp(textBuffer);

  // 裁剪周围多余的透明像素 (Trim)
  sharpInstance = sharpInstance.trim();

  // 旋转
  if (angle !== 0) {
    sharpInstance = sharpInstance.rotate(angle, { background: { r: 0, g: 0, b: 0, alpha: 0 } });
  }

  const finalBuffer = await sharpInstance.png().toBuffer();

  // 获取处理后的尺寸以便重新校准位置
  await sharp(finalBuffer).metadata();

  // 调整 left/top 使得渲染后的文字中心与原始位置对齐
  // 因为 Canvas 渲染时带了 Padding，且经过了 Trim
  // 这里简化处理：直接使用原始 left/top，因为 Fabric 的坐标已经由 calculateTopLeft 处理过
  // 如果需要极其精确的对齐，这里可能需要根据 Trim 后的偏移量进行修正

  return { input: finalBuffer, left, top };
}

// 判断是否为渐变对象
function isGradientObject(bg: any): boolean {
  return bg && typeof bg === 'object' && bg.type && bg.colorStops && Array.isArray(bg.colorStops);
}

// 生成渐变 SVG
function generateGradientSvg(width: number, height: number, gradient: any): string {
  const coords = gradient.coords || { x1: 0, y1: 0, x2: 0, y2: 1 };
  const type = gradient.type === 'radial' ? 'radialGradient' : 'linearGradient';

  // 计算百分比坐标 (Fabric.js 坐标通常是绝对的，需要转换为百分比)
  // 或者直接使用 userSpaceOnUse，但 svg 默认 ObjectBoundingBox 可能更简单如果坐标规范的话。
  // Fabric.js 的 gradientUnits 其实通常是 'pixels' (userSpaceOnUse) 或 'percentage' (objectBoundingBox).
  // 这里的 log 显示 gradientUnits: "pixels", coords 是绝对值.
  const gradientUnits = gradient.gradientUnits === 'percentage' ? 'objectBoundingBox' : 'userSpaceOnUse';

  let stops = '';
  if (gradient.colorStops && Array.isArray(gradient.colorStops)) {
    stops = gradient.colorStops.map((stop: any) => {
      const offset = (stop.offset * 100) + '%';
      return `<stop offset="${offset}" stop-color="${stop.color}" />`;
    }).join('');
  }

  return `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <${type} id="grad" 
          gradientUnits="${gradientUnits}"
          x1="${coords.x1}" y1="${coords.y1}"
          x2="${coords.x2}" y2="${coords.y2}"
        >
          ${stops}
        </${type}>
      </defs>
      <rect x="0" y="0" width="${width}" height="${height}" fill="url(#grad)" />
    </svg>
  `;
}

// 解析颜色，支持渐变对象（回退到纯色）
function resolveColor(color: any): string | object {
  if (!color) return '#000000';

  // 1. 如果是字符串，直接返回
  if (typeof color === 'string') return color;

  // 2. 如果是渐变对象 (Fabric.js 风格)
  if (color.colorStops && Array.isArray(color.colorStops) && color.colorStops.length > 0) {
    // 简单起见，取第一个颜色 stops[0].color
    // 更好的做法是生成 svg 渐变，但这里为了修复 crash 先回退到纯色
    console.warn('Gradient background detected, falling back to solid color:', color.colorStops[0].color);
    return color.colorStops[0].color;
  }

  // 3. 如果是 RGB/RGBA 对象
  if (typeof color === 'object') {
    if ('r' in color && 'g' in color && 'b' in color) {
      return color;
    }
  }

  console.warn('Unknown color format, defaulting to black:', color);
  return '#000000';
}

// 生成随机渐变背景
export function generateRandomGradient(): any {
  const getRandomColor = () => {
    const h = Math.floor(Math.random() * 360);
    const s = Math.floor(Math.random() * 40) + 40; // 40-80%
    const l = Math.floor(Math.random() * 40) + 30; // 30-70%
    return `hsl(${h},${s}%,${l}%)`;
  };

  const color1 = getRandomColor();
  const color2 = getRandomColor();

  // 随机角度 (0, 45, 90, 135...) -> coords
  const directions = [
    { x1: 0, y1: 0, x2: 1, y2: 1 }, // TL -> BR
    { x1: 0, y1: 0, x2: 0, y2: 1 }, // Top -> Bottom
    { x1: 0, y1: 0, x2: 1, y2: 0 }, // Left -> Right
    { x1: 1, y1: 0, x2: 0, y2: 1 }, // TR -> BL
  ];
  const dir = directions[Math.floor(Math.random() * directions.length)];

  return {
    type: 'linear',
    gradientUnits: 'percentage',
    coords: {
      x1: dir.x1,
      y1: dir.y1,
      x2: dir.x2,
      y2: dir.y2
    },
    colorStops: [
      { offset: 0, color: color1 },
      { offset: 1, color: color2 }
    ],
    offsetX: 0,
    offsetY: 0
  };
}

// 解析颜色为 Sharp 对像
function parseColor(colorInput: any): { r: number; g: number; b: number; alpha: number } {
  const color = resolveColor(colorInput);

  if (typeof color === 'string') {
    if (color.startsWith('#')) {
      const hex = color.slice(1);
      return {
        r: parseInt(hex.slice(0, 2), 16) || 0,
        g: parseInt(hex.slice(2, 4), 16) || 0,
        b: parseInt(hex.slice(4, 6), 16) || 0,
        alpha: 1
      };
    } else if (color.startsWith('rgba')) {
      // 简单的 rgba 解析
      const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
      if (match) {
        return {
          r: parseInt(match[1]),
          g: parseInt(match[2]),
          b: parseInt(match[3]),
          alpha: match[4] ? parseFloat(match[4]) : 1
        };
      }
    } else if (color.startsWith('hsl')) {
      // 需要引入 color 库或者简单的 hsl 转 rgb，或者直接交给 sharp 处理（sharp 支持 string color）
      // 这里为了保持 safe，我们暂时只返回黑色，或者引入 color 库
      // 但由于 sharp create.background 支持 string，我们其实不需要自己 parse hex。
      // 我们可以修改 renderRect 让它直接传 string 给 sharp。
      // 但 renderRect 目前用的 { ...color, alpha }，所以还是需要 parse。

      // 简单修复：如果不以 # 开头，就暂不支持，或者仅仅修复渐变 crash
    }
  }

  if (typeof color === 'object') {
    return color as any;
  }

  // 默认黑色
  return { r: 0, g: 0, b: 0, alpha: 1 };
}


