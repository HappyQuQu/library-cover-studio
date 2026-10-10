import { FabricImage, type StaticCanvas } from 'fabric';
import { getSamplePosterUrl } from '@/lib/posters';

export interface PosterBackground { blur: number; dim: number; source?: 'poster' | 'backdrop' }
export const DEFAULT_POSTER_BACKGROUND: PosterBackground = { blur: 60, dim: .35 };
const pending = new WeakMap<StaticCanvas, object>();

/** Rebuild from post1 after loading, changing artwork, or restoring a design. */
export async function applyPosterBackground(canvas: StaticCanvas, width: number, height: number) {
  const settings = (canvas as any).posterBackground as PosterBackground | undefined;
  if (!settings) return;
  const request = {};
  pending.set(canvas, request);
  const first = canvas.getObjects().find((object: any) => object.posterVar === 'post1') as FabricImage | undefined;
  const posterSource = first?.getSrc?.() || getSamplePosterUrl(1);
  // The editor uses a portable sample; real generation receives the matching media backdrop.
  const source = settings.source === 'backdrop' ? getSamplePosterUrl('backdrop') : posterSource;
  const poster = await FabricImage.fromURL(source, { crossOrigin: 'anonymous' }).catch(error => {
    if (settings.source !== 'backdrop') throw error;
    return FabricImage.fromURL(posterSource, { crossOrigin: 'anonymous' });
  });
  const ratio = Math.min(1, 960 / width);
  const w = Math.round(width * ratio), h = Math.round(height * ratio);
  const blur = Math.max(0, Math.min(150, Number.isFinite(settings.blur) ? settings.blur : 60)) * w / 1920;
  const dim = Math.max(0, Math.min(.8, Number.isFinite(settings.dim) ? settings.dim : .35));
  const padding = Math.ceil(blur * 3);
  const surface = document.createElement('canvas');
  surface.width = w; surface.height = h;
  const context = surface.getContext('2d')!;
  context.fillStyle = '#202020'; context.fillRect(0, 0, w, h);
  const scale = Math.max((w + padding * 2) / poster.width, (h + padding * 2) / poster.height);
  context.filter = `blur(${blur}px)`;
  context.drawImage(poster.getElement(), (w - poster.width * scale) / 2, (h - poster.height * scale) / 2,
    poster.width * scale, poster.height * scale);
  context.filter = 'none';
  context.fillStyle = `rgba(0,0,0,${dim})`; context.fillRect(0, 0, w, h);
  const background = await FabricImage.fromURL(surface.toDataURL('image/jpeg', .92));
  if (pending.get(canvas) !== request || (canvas as any).posterBackground !== settings || canvas.disposed) return;
  background.set({ left: 0, top: 0, originX: 'left', originY: 'top', scaleX: width / w, scaleY: height / h,
    selectable: false, evented: false });
  canvas.backgroundImage = background;
  canvas.requestRenderAll();
}
