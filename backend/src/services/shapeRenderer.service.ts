import { createCanvas, Path2D } from '@napi-rs/canvas';
import type { OverlayOptions } from 'sharp';

/** Fabric primitives use a centered local coordinate system, transformed around their origin. */
export async function renderShape(obj: any): Promise<OverlayOptions | null> {
  const w = obj.width ?? (obj.radius ? obj.radius * 2 : 0);
  const h = obj.height ?? (obj.radius ? obj.radius * 2 : 0);
  const sx = obj.scaleX ?? 1, sy = obj.scaleY ?? 1;
  if (sx === 0 || sy === 0) return null;
  const strokeWidth = obj.strokeWidth ?? 0;
  const angle = (obj.angle || 0) * Math.PI / 180;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const origins: Record<string, number> = { left: 0, top: 0, center: 0.5, right: 1, bottom: 1 };
  const ox = typeof obj.originX === 'number' ? obj.originX : origins[obj.originX || 'left'];
  const oy = typeof obj.originY === 'number' ? obj.originY : origins[obj.originY || 'top'];
  const dx = (0.5 - ox) * (w * sx + strokeWidth * (obj.strokeUniform ? 1 : sx));
  const dy = (0.5 - oy) * (h * sy + strokeWidth * (obj.strokeUniform ? 1 : sy));
  const cx = (obj.left || 0) + dx * cos - dy * sin;
  const cy = (obj.top || 0) + dx * sin + dy * cos;
  const shadow = obj.shadow;
  // Miter joins can extend beyond half the stroke; reserve enough space to avoid clipping.
  const padding = (obj.stroke ? strokeWidth * Math.max(Math.abs(sx), Math.abs(sy), 1) * (obj.strokeLineJoin === 'miter' ? (obj.strokeMiterLimit || 4) : 1) : 0)
    + (shadow ? (shadow.blur || 0) * 2 + Math.abs(shadow.offsetX || 0) + Math.abs(shadow.offsetY || 0) : 0) + 2;
  const bw = Math.abs(w * sx * cos) + Math.abs(h * sy * sin);
  const bh = Math.abs(w * sx * sin) + Math.abs(h * sy * cos);
  const left = Math.floor(cx - bw / 2 - padding), top = Math.floor(cy - bh / 2 - padding);
  const width = Math.ceil(cx + bw / 2 + padding) - left, height = Math.ceil(cy + bh / 2 + padding) - top;
  if (![w, h, sx, sy, cx, cy, width, height].every(Number.isFinite) || w < 0 || h < 0 || width < 1 || height < 1 || width > 16384 || height > 16384) {
    throw new Error('形状尺寸无效或超出渲染限制');
  }
  const canvas = createCanvas(width, height), ctx = canvas.getContext('2d');
  ctx.translate(cx - left, cy - top);
  ctx.rotate(angle);
  ctx.scale(sx * (obj.flipX ? -1 : 1), sy * (obj.flipY ? -1 : 1));
  ctx.globalAlpha = obj.opacity ?? 1;
  const shape = new Path2D();
  switch (obj.type.toLowerCase()) {
    case 'rect': {
      const rx = Math.min(Math.abs(obj.rx || 0), w / 2), ry = Math.min(Math.abs(obj.ry || 0), h / 2);
      const x = -w / 2, y = -h / 2, k = 0.5522847498307936;
      shape.moveTo(x + rx, y); shape.lineTo(x + w - rx, y);
      shape.bezierCurveTo(x + w - rx + rx * k, y, x + w, y + ry - ry * k, x + w, y + ry);
      shape.lineTo(x + w, y + h - ry);
      shape.bezierCurveTo(x + w, y + h - ry + ry * k, x + w - rx + rx * k, y + h, x + w - rx, y + h);
      shape.lineTo(x + rx, y + h);
      shape.bezierCurveTo(x + rx - rx * k, y + h, x, y + h - ry + ry * k, x, y + h - ry);
      shape.lineTo(x, y + ry);
      shape.bezierCurveTo(x, y + ry - ry * k, x + rx - rx * k, y, x + rx, y); shape.closePath();
      break;
    }
    case 'circle':
    case 'ellipse':
      shape.ellipse(0, 0, w / 2, h / 2, 0, (obj.startAngle || 0) * Math.PI / 180, (obj.endAngle ?? 360) * Math.PI / 180, obj.counterClockwise || false);
      break;
    case 'triangle':
      shape.moveTo(0, -h / 2); shape.lineTo(w / 2, h / 2); shape.lineTo(-w / 2, h / 2); shape.closePath(); break;
    case 'line': {
      const x = (obj.x1 <= obj.x2 ? -1 : 1) * w / 2, y = (obj.y1 <= obj.y2 ? -1 : 1) * h / 2;
      shape.moveTo(x, y); shape.lineTo(-x, -y); break;
    }
    case 'polygon': {
      const points = obj.points;
      if (!Array.isArray(points) || !points.length) throw new Error('多边形缺少顶点');
      const px = (Math.min(...points.map((p: any) => p.x)) + Math.max(...points.map((p: any) => p.x))) / 2;
      const py = (Math.min(...points.map((p: any) => p.y)) + Math.max(...points.map((p: any) => p.y))) / 2;
      points.forEach((p: any, i: number) => i ? shape.lineTo(p.x - px, p.y - py) : shape.moveTo(p.x - px, p.y - py)); shape.closePath(); break;
    }
    case 'path': {
      if (!Array.isArray(obj.path)) throw new Error('路径缺少绘制指令');
      const commands = obj.path.map((command: any[]) => {
        if (!Array.isArray(command) || !/^[MLCQSTAHVZ]$/i.test(command[0]) || !command.slice(1).every(Number.isFinite)) throw new Error('路径指令无效');
        return command.join(' ');
      }).join(' ');
      const svgPath = new Path2D(commands);
      const [x1, y1, x2, y2] = svgPath.getBounds();
      const offset = obj.pathOffset || { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
      shape.addPath(svgPath, { a: 1, b: 0, c: 0, d: 1, e: -offset.x, f: -offset.y }); break;
    }
  }
  const paint = (value: any) => {
    if (typeof value === 'string') return value;
    if (!value?.colorStops) return '#000000';
    const c = value.coords || {}, percentage = value.gradientUnits === 'percentage';
    const x = (v: number) => (percentage ? v * w : v) - w / 2 + (value.offsetX || 0);
    const y = (v: number) => (percentage ? v * h : v) - h / 2 + (value.offsetY || 0);
    const gradient = value.type === 'radial'
      ? ctx.createRadialGradient(x(c.x1 || 0), y(c.y1 || 0), c.r1 || 0, x(c.x2 || 0), y(c.y2 || 0), c.r2 || w / 2)
      : ctx.createLinearGradient(x(c.x1 || 0), y(c.y1 || 0), x(c.x2 || 0), y(c.y2 || 0));
    for (const stop of value.colorStops) gradient.addColorStop(stop.offset, stop.color);
    return gradient;
  };
  if (shadow) { ctx.shadowColor = shadow.color || '#000000'; ctx.shadowBlur = shadow.blur || 0; ctx.shadowOffsetX = shadow.offsetX || 0; ctx.shadowOffsetY = shadow.offsetY || 0; }
  if (obj.fill && obj.type.toLowerCase() !== 'line') { ctx.fillStyle = paint(obj.fill); ctx.fill(shape, obj.fillRule || 'nonzero'); }
  if (obj.stroke && strokeWidth > 0) {
    ctx.strokeStyle = paint(obj.stroke); ctx.lineWidth = strokeWidth;
    ctx.lineCap = obj.strokeLineCap || 'butt'; ctx.lineJoin = obj.strokeLineJoin || 'miter'; ctx.miterLimit = obj.strokeMiterLimit || 4;
    ctx.setLineDash(obj.strokeDashArray || []); ctx.lineDashOffset = obj.strokeDashOffset || 0;
    // Fabric applies uniform strokes after scaling the geometry.
    if (obj.strokeUniform) { const scaled = new Path2D(); scaled.addPath(shape, { a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 }); ctx.scale(1 / sx, 1 / sy); ctx.stroke(scaled); }
    else ctx.stroke(shape);
  }
  return { input: canvas.toBuffer('image/png'), left, top };
}
