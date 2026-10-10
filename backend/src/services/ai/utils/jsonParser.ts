import { jsonrepair } from 'jsonrepair';
import { SaxesParser } from 'saxes';

export class AIResponseError extends Error {
  constructor(message: string, readonly code: string) { super(message); this.name = 'AIResponseError'; }
}

/** Find complete objects without treating braces inside text, SVG or variables as delimiters. */
function candidates(text: string): string[] {
  const found: string[] = [];
  let start = -1, quote = '', escaped = false, comment = '';
  const stack: string[] = [];
  for (let index = 0; index < text.length; index++) {
    const char = text[index], next = text[index + 1];
    if (start === -1) { if (char !== '{') continue; start = index; stack.push('}'); continue; }
    if (comment === '//') { if (char === '\n') comment = ''; continue; }
    if (comment === '/*') { if (char === '*' && next === '/') { comment = ''; index++; } continue; }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === '/' && (next === '/' || next === '*')) { comment = next === '/' ? '//' : '/*'; index++; continue; }
    if (char === '{' || char === '[') stack.push(char === '{' ? '}' : ']');
    else if (char === '}' || char === ']') {
      if (stack.pop() !== char) { start = -1; stack.length = 0; continue; }
      if (!stack.length) { found.push(text.slice(start, index + 1)); start = -1; }
    }
  }
  return found;
}

export function validateCanvasJSON(value: any): any {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Array.isArray(value.objects) || !value.objects.length) {
    throw new AIResponseError('AI 返回的内容不是完整画布设计，请重试', 'AI_INVALID_CANVAS');
  }
  const ids = new Set<string>();
  for (const object of value.objects) {
    if (!object || typeof object !== 'object' || Array.isArray(object) || typeof object.type !== 'string' || typeof object.id !== 'string' || !object.id || ids.has(object.id)) {
      throw new AIResponseError('AI 返回的图层缺少类型或唯一标识，请重试', 'AI_INVALID_CANVAS');
    }
    ids.add(object.id);
    for (const field of ['left', 'top', 'width', 'height', 'scaleX', 'scaleY', 'angle', 'opacity', 'radius', 'fontSize']) {
      if (object[field] !== undefined && (typeof object[field] !== 'number' || !Number.isFinite(object[field]))) {
        throw new AIResponseError('AI 返回的图层位置或尺寸无效，请重试', 'AI_INVALID_CANVAS');
      }
    }
  }
  validateEmbeddedSVGs(value);
  return value;
}

/** A valid JSON string can still contain a broken image that prevents Fabric from loading the entire design. */
function validateEmbeddedSVGs(value: any): void {
  if (!value || typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value)) {
    if (key === 'src' && typeof entry === 'string' && /^data:image\/svg\+xml[;,]/i.test(entry)) {
      try {
        const comma = entry.indexOf(',');
        if (comma < 0) throw new Error('Missing image data');
        const xml = /;base64$/i.test(entry.slice(0, comma))
          ? Buffer.from(entry.slice(comma + 1), 'base64').toString('utf8') : decodeURIComponent(entry.slice(comma + 1));
        const parser = new SaxesParser({ xmlns: true });
        let root = false;
        parser.on('opentag', tag => {
          if (!root && (tag.local !== 'svg' || tag.uri !== 'http://www.w3.org/2000/svg')) throw new Error('Invalid SVG root');
          root = true;
        });
        parser.write(xml).close();
        if (!root) throw new Error('Empty SVG');
      } catch {
        throw new AIResponseError('AI 生成的 SVG 图片格式无效，无法预览，请重新生成并使用纯色或渐变背景', 'AI_INVALID_CANVAS');
      }
    } else if (entry && typeof entry === 'object') validateEmbeddedSVGs(entry);
  }
}

/** Repair syntax only in complete objects; never fill in a truncated design or execute model code. */
export function extractJSON(text: string): any {
  text = text.replace(/^\s*<think>[\s\S]*?<\/think>\s*/i, '');
  const blocks = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map(match => match[1]);
  const options = [...blocks.flatMap(candidates), ...candidates(text)];
  let shapeError: AIResponseError | undefined;
  for (const candidate of [...new Set(options)]) {
    let value: any;
    try { value = JSON.parse(candidate); }
    catch {
      try { value = JSON.parse(jsonrepair(candidate)); } catch { continue; }
    }
    try { return validateCanvasJSON(value); }
    catch (error) { if (error instanceof AIResponseError) shapeError = error; }
  }
  if (shapeError) throw shapeError;
  throw new AIResponseError(text.includes('{') ? 'AI 未返回完整有效的 JSON 设计，请重试' : 'AI 响应中未找到画布 JSON，请重试', 'AI_INVALID_JSON');
}

export function parseTemplateResponse(text: string, finishReason?: string | null): any {
  if (finishReason === 'length' || finishReason === 'max_tokens') {
    throw new AIResponseError('设计输出达到长度限制，未生成完整方案，请重试', 'AI_RESPONSE_TRUNCATED');
  }
  if (finishReason === 'content_filter' || finishReason === 'refusal') {
    throw new AIResponseError('AI 服务未返回设计，请调整需求后重试', 'AI_RESPONSE_REFUSED');
  }
  // A broken stream can contain a valid prefix; require its explicit completion signal.
  if (!finishReason) throw new AIResponseError('AI 连接提前结束，未收到完整设计，请重试', 'AI_STREAM_INCOMPLETE');
  return extractJSON(text);
}
