import sharp from 'sharp';
import { renderShape } from './shapeRenderer.service.js';
import { applyRandomBackground } from './templateBackground.service.js';
import { renderPosterBackground, type PosterBackground } from './posterBackground.service.js';
export { generateRandomGradient } from './templateBackground.service.js';
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
  fitText?: boolean;
  wrapText?: boolean;
  src?: string;
  scaleX?: number;
  scaleY?: number;
  angle?: number;
  opacity?: number;
  originX?: string;  // 'left' | 'center' | 'right'
  visible?: boolean;
  flipX?: boolean;
  flipY?: boolean;
  originY?: string;  // 'top' | 'center' | 'bottom'
}

interface TemplateData {
  version: string;
  objects: CanvasObject[];
  background?: string | Record<string, any>;
  backgroundColor?: string | Record<string, any>;
  backgroundImage?: CanvasObject;
  posterBackground?: PosterBackground;
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
const configuredConcurrency = Number(process.env.MAX_CONCURRENT_RENDERS || '3');
const limit = pLimit(Number.isInteger(configuredConcurrency) && configuredConcurrency > 0 ? configuredConcurrency : 3);
export function setRenderConcurrency(concurrency: number) { limit.concurrency = concurrency; }

// 已注册的字体
const registeredFonts = new Set<string>();

/**
 * 确保自定义字体已注册到 GlobalFonts
 */
function ensureFontRegistered(fontFamily: string): boolean {
  if (registeredFonts.has(fontFamily) || GlobalFonts.has(fontFamily)) return true;

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
      const saved: TemplateData = JSON.parse(templateJson);
      const template = applyRandomBackground({ ...saved, width: saved.width || options.width, height: saved.height || options.height });
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
      const backgroundLayer = processedTemplate.posterBackground && posterBuffer
        ? await renderPosterBackground(posterBuffer, width, height, processedTemplate.posterBackground)
        : await renderBackgroundImage(processedTemplate.backgroundImage, width, height);
      if (backgroundLayer) layers.push(backgroundLayer);

      for (const obj of processedTemplate.objects) {
        const layer = await renderObject(obj, posterBuffer);
        if (layer) {
          const clipped = await clipLayerToCanvas(layer, width, height, (obj as any).clipPath);
          if (clipped) layers.push(clipped);
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
      const saved: TemplateData = JSON.parse(templateJson);
      const template = applyRandomBackground({ ...saved, width: saved.width || options.width, height: saved.height || options.height });
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
      const backgroundLayer = processedTemplate.posterBackground && posterBuffers[0]
        ? await renderPosterBackground(posterBuffers[0], width, height, processedTemplate.posterBackground)
        : await renderBackgroundImage(processedTemplate.backgroundImage, width, height);
      if (backgroundLayer) layers.push(backgroundLayer);

      for (const obj of processedTemplate.objects) {
        const layer = await renderObjectWithPosters(obj, posterBuffers);
        if (layer) {
          const clipped = await clipLayerToCanvas(layer, width, height, (obj as any).clipPath);
          if (clipped) layers.push(clipped);
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
  if (obj.visible === false || obj.opacity === 0) return null;
  const { left, top } = calculateTopLeft(obj);
  const objType = obj.type?.toLowerCase();

  switch (objType) {
    case 'rect':
    case 'circle':
    case 'ellipse':
    case 'triangle':
    case 'line':
    case 'path':
    case 'polygon':
      return renderShape(obj);

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
  if (obj.visible === false || obj.opacity === 0) return null;
  const { left, top } = calculateTopLeft(obj);

  switch (obj.type?.toLowerCase()) {
    case 'rect':
    case 'circle':
    case 'ellipse':
    case 'triangle':
    case 'line':
    case 'path':
    case 'polygon':
      return renderShape(obj);

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

    if (obj.opacity !== undefined && obj.opacity < 1) {
      const { data, info } = await sharp(resized).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      for (let index = 3; index < data.length; index += 4) data[index] = Math.round(data[index] * Math.max(0, obj.opacity));
      resized = await sharp(data, { raw: info }).png().toBuffer();
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

function imageSource(src: string): Buffer | string {
  if (src.startsWith('data:')) {
    const match = /^data:(image\/[\w.+-]+)((?:;[^,]*)*),([\s\S]*)$/i.exec(src);
    if (!match) throw new Error('图片数据格式无效');
    return /;base64(?:;|$)/i.test(match[2]) ? Buffer.from(match[3], 'base64') : Buffer.from(decodeURIComponent(match[3]), 'utf8');
  }
  if (fs.existsSync(src)) return src;
  throw new Error('图片素材不可读取');
}

// Saved Fabric backgrounds use an image outside the ordinary objects array.
// Composite it first, clipped to the canvas, before posters and titles.
async function renderBackgroundImage(obj: CanvasObject | undefined, width: number, height: number): Promise<sharp.OverlayOptions | null> {
  if (!obj || obj.visible === false || obj.opacity === 0) return null;
  const { left, top } = calculateTopLeft(obj);
  const layer = await renderImage(obj, left, top, true);
  if (!layer) return null;
  return clipLayerToCanvas(layer, width, height);
}

// Fabric permits cards to extend beyond the canvas; Sharp composite requires cropped inputs.
async function clipLayerToCanvas(layer: sharp.OverlayOptions, width: number, height: number, clipPath?: any): Promise<sharp.OverlayOptions | null> {
  const input = layer.input as Buffer;
  const dimensions = await sharp(input).metadata();
  const x = Math.round(layer.left || 0), y = Math.round(layer.top || 0);
  let minimumX = 0, minimumY = 0, maximumX = width, maximumY = height;
  // Fabric absolute clip rectangles constrain the wall to its right-hand region in world coordinates.
  if (clipPath?.absolutePositioned && clipPath.type?.toLowerCase() === 'rect' && !clipPath.angle) {
    const origin = calculateTopLeft(clipPath);
    minimumX = Math.max(0, Math.round(origin.left)); minimumY = Math.max(0, Math.round(origin.top));
    maximumX = Math.min(width, Math.round(origin.left + clipPath.width * (clipPath.scaleX ?? 1)));
    maximumY = Math.min(height, Math.round(origin.top + clipPath.height * (clipPath.scaleY ?? 1)));
  }
  const cropX = Math.max(0, minimumX - x), cropY = Math.max(0, minimumY - y);
  const left = Math.max(minimumX, x), top = Math.max(minimumY, y);
  const cropWidth = Math.min(dimensions.width! - cropX, maximumX - left);
  const cropHeight = Math.min(dimensions.height! - cropY, maximumY - top);
  if (cropWidth <= 0 || cropHeight <= 0) return null;
  let clipped = !cropX && !cropY && cropWidth === dimensions.width && cropHeight === dimensions.height
    ? input : await sharp(input).extract({ left: cropX, top: cropY, width: cropWidth, height: cropHeight }).png().toBuffer();
  if (clipPath?.absolutePositioned && clipPath.type?.toLowerCase() === 'polygon' && !clipPath.angle && Array.isArray(clipPath.points)) {
    const points = clipPath.points as { x: number; y: number }[];
    const minX = Math.min(...points.map(point => point.x)), minY = Math.min(...points.map(point => point.y));
    const origin = calculateTopLeft(clipPath);
    const polygon = points.map(point => `${origin.left + (point.x - minX) * (clipPath.scaleX ?? 1) - left},${origin.top + (point.y - minY) * (clipPath.scaleY ?? 1) - top}`).join(' ');
    const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${cropWidth}" height="${cropHeight}"><polygon points="${polygon}" fill="white"/></svg>`);
    clipped = await sharp(clipped).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  }
  return { ...layer, input: clipped, left, top };
}

// Decode both URI-encoded SVG gradients and base64 raster uploads from Fabric.
async function renderImage(
  obj: CanvasObject, left: number, top: number, required = false
): Promise<sharp.OverlayOptions | null> {
  if (obj.visible === false || obj.opacity === 0) return null;
  try {
    if (!obj.src) throw new Error('图片素材未保存');
    const width = Math.round((obj.width || 100) * (obj.scaleX ?? 1));
    const height = Math.round((obj.height || 100) * (obj.scaleY ?? 1));
    if (width <= 0 || height <= 0) return null;
    let pipeline = sharp(imageSource(obj.src)).resize(width, height, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } });
    if (obj.flipX) pipeline = pipeline.flop();
    if (obj.flipY) pipeline = pipeline.flip();
    if (obj.angle) pipeline = pipeline.rotate(obj.angle, { background: { r: 0, g: 0, b: 0, alpha: 0 } });
    let input = await pipeline.ensureAlpha().png().toBuffer();
    const dimensions = await sharp(input).metadata();
    if (obj.angle) { left -= Math.round((dimensions.width! - width) / 2); top -= Math.round((dimensions.height! - height) / 2); }
    if (obj.opacity !== undefined && obj.opacity < 1) {
      const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      for (let index = 3; index < data.length; index += 4) data[index] = Math.round(data[index] * Math.max(0, obj.opacity));
      input = await sharp(data, { raw: info }).png().toBuffer();
    }
    return { input, left, top };
  } catch (error) {
    if (required) throw new Error('背景图片无法渲染，请检查模板背景素材后重新保存', { cause: error });
    console.error('Failed to render image:', error);
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
  let fontSize = Math.round(baseFontSize * Math.max(scaleX, scaleY));

  const fontFamily = obj.fontFamily || 'sans-serif';
  const fontWeight = (obj as any).fontWeight || 'normal';
  const fontStyle = (obj as any).fontStyle || 'normal';
  const lineHeight = (obj as any).lineHeight || 1.16;
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
  const maximumLines = obj.wrapText ? Math.max(2, obj.text.split(/\s+/).length) : obj.text.split('\n').length;
  const height = Math.round(fontSize * Math.max(2, maximumLines * lineHeight + 1)) + 100;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // 设置字体
  // Resolve an installed family explicitly: Canvas font-list fallbacks can select a serif face.
  const candidates = /[\u3400-\u9fff]/.test(obj.text)
    ? ['Noto Sans CJK SC', 'Noto Sans CJK JP', 'PingFang SC', 'Heiti SC', 'Heiti TC', 'Arial Unicode MS']
    : ['Arial', 'Noto Sans CJK SC', 'Noto Sans CJK JP', 'DejaVu Sans'];
  const families = /serif/.test(fontFamily) && !/sans/.test(fontFamily)
    ? ['Georgia', 'Times New Roman', 'DejaVu Serif', 'Noto Serif CJK SC', 'Noto Serif CJK JP'] : candidates;
  const renderFont = isRegistered ? fontFamily : families.find(family => GlobalFonts.has(family)) || fontFamily;
  ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px "${renderFont}"`;
  ctx.fillStyle = fill;
  ctx.textBaseline = 'top';

  let letterSpacing = ((obj as any).charSpacing || 0) * fontSize / 1000;
  const measureWidth = (value: string) => letterSpacing
    ? Array.from(value).reduce((sum, char) => sum + ctx.measureText(char).width, 0) + Math.max(0, Array.from(value).length - 1) * letterSpacing
    : ctx.measureText(value).width;
  let lines = obj.text.split('\n');
  if (obj.wrapText) {
    lines = lines.flatMap(line => {
      const result: string[] = []; let current = '';
      for (const word of line.split(/\s+/)) {
        const candidate = current ? `${current} ${word}` : word;
        if (current && measureWidth(candidate) > baseWidth * scaleX) { result.push(current); current = word; }
        else current = candidate;
      }
      result.push(current); return result;
    });
  }
  const textWidth = Math.max(...lines.map(measureWidth));
  // Large variable titles stay inside their allotted column, even for longer library names.
  if (obj.fitText && textWidth > baseWidth * scaleX) {
    fontSize = Math.max(1, Math.floor(fontSize * Math.max(1, baseWidth * scaleX - 2) / textWidth));
    ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px "${renderFont}"`;
    letterSpacing = ((obj as any).charSpacing || 0) * fontSize / 1000;
  }
  lines.forEach((line, index) => {
    const lineWidth = measureWidth(line);
    let drawX = textAlign === 'center' ? (width - lineWidth) / 2 : textAlign === 'right' ? width - lineWidth - 50 : 50;
    const drawY = 50 + index * fontSize * lineHeight;
    if (letterSpacing) {
      for (const char of Array.from(line)) { ctx.fillText(char, drawX, drawY); drawX += ctx.measureText(char).width + letterSpacing; }
    } else ctx.fillText(line, drawX, drawY);
  });

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
  const rendered = await sharp(finalBuffer).metadata();
  // Trimming removes internal padding; retain the text box alignment on the destination canvas.
  if (textAlign === 'center') left += Math.round((baseWidth * scaleX - rendered.width!) / 2);
  else if (textAlign === 'right') left += Math.round(baseWidth * scaleX - rendered.width!);

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

  const escape = (value: unknown) => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const stops = gradient.colorStops.map((stop: any) => `<stop offset="${stop.offset * 100}%" stop-color="${escape(stop.color)}" stop-opacity="${stop.opacity ?? 1}" />`).join('');
  const coordinates = gradient.type === 'radial'
    ? `cx="${coords.x2}" cy="${coords.y2}" r="${coords.r2}" fx="${coords.x1}" fy="${coords.y1}" fr="${coords.r1 || 0}"`
    : `x1="${coords.x1}" y1="${coords.y1}" x2="${coords.x2}" y2="${coords.y2}"`;
  const transform = Array.isArray(gradient.gradientTransform) && gradient.gradientTransform.length === 6 && gradient.gradientTransform.every(Number.isFinite)
    ? ` gradientTransform="matrix(${gradient.gradientTransform.join(' ')})"` : '';
  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs><${type} id="grad" gradientUnits="${gradientUnits}" ${coordinates}${transform}>${stops}</${type}></defs>
    <rect width="${width}" height="${height}" fill="url(#grad)" />
  </svg>`;
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

