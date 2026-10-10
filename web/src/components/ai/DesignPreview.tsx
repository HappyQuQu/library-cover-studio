import { useEffect, useState } from 'react';
import { StaticCanvas, Gradient } from 'fabric';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { apiClient } from '@/api/client';
import type { CanvasJSON } from '@/lib/aiDesign';
import { applyPosterBackground } from '@/lib/posterBackground';

export function normalizeDesignAssets(json: CanvasJSON): CanvasJSON {
  return JSON.parse(JSON.stringify(json, (key, value) => {
    if (key === 'src' && typeof value === 'string') {
      const poster = value.match(/(?:https?:\/\/[^/]+)?\/api\/templates\/posters\/(\d+\.jpg)$/);
      if (poster) return `${apiClient.defaults.baseURL}/templates/posters/${poster[1]}`;
    }
    return value;
  }));
}

function validateSVGImages(json: CanvasJSON) {
  JSON.stringify(json, (key, value) => {
    if (key === 'src' && typeof value === 'string' && /^data:image\/svg\+xml[;,]/i.test(value)) {
      try {
        const comma = value.indexOf(',');
        if (comma < 0) throw new Error();
        const xml = /;base64$/i.test(value.slice(0, comma)) ? atob(value.slice(comma + 1)) : decodeURIComponent(value.slice(comma + 1));
        const document = new DOMParser().parseFromString(xml, 'image/svg+xml');
        if (document.querySelector('parsererror') || document.documentElement.localName !== 'svg') throw new Error();
      } catch { throw new Error('背景或图层中的 SVG 格式无效，请重新生成方案；建议使用纯色或渐变背景'); }
    }
    return value;
  });
}

export function DesignPreview({ json, width, height, onReady }: {
  json: CanvasJSON; width: number; height: number; onReady?: (ready: boolean) => void;
}) {
  const [image, setImage] = useState('');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();
    const preview = new StaticCanvas(document.createElement('canvas'), { width, height, enableRetinaScaling: false });
    setImage(''); setError(''); onReady?.(false);
    (async () => {
      try {
        validateSVGImages(json);
        await document.fonts.ready;
        await preview.loadFromJSON(normalizeDesignAssets(json), undefined, { signal: controller.signal });
        if (disposed) return;
        (preview as any).posterBackground = json.posterBackground;
        await applyPosterBackground(preview, width, height);
        if (disposed) return;
        if (json.background && typeof json.background === 'object') preview.backgroundColor = json.background.type === 'radial'
          ? new Gradient<'radial'>({ ...json.background, type: 'radial' }) : new Gradient<'linear'>({ ...json.background, type: 'linear' });
        preview.renderAll();
        const url = preview.toDataURL({ format: 'png', multiplier: Math.min(1, 600 / width) });
        setImage(url); onReady?.(true);
      } catch (cause) {
        if (!disposed) {
          const detail = cause instanceof Error ? cause.message : '';
          setError(detail.includes('SVG 格式无效') ? detail : /cross.origin|taint|insecure/i.test(detail)
            ? '图片跨域限制导致预览无法导出，请使用本地上传的图片'
            : /loading|image/i.test(detail) ? '图片加载失败，可重试预览；仍失败时请检查素材地址'
            : '设计图层无法渲染，请重新生成方案');
          onReady?.(false);
        }
      } finally {
        void preview.dispose();
      }
    })();
    return () => { disposed = true; controller.abort(); };
  }, [json, width, height, onReady, attempt]);
  return <div className="design-preview" style={{ aspectRatio: `${width} / ${height}` }}>
    {image ? <img src={image} alt="封面设计预览" /> : error
      ? <div className="preview-placeholder" role="alert"><AlertCircle size={18} /><span>{error}</span>
        <button type="button" className="studio-secondary" onClick={() => setAttempt(value => value + 1)}><RefreshCw size={12} />重试预览</button></div>
      : <div className="preview-placeholder" role="status"><Loader2 size={18} className="animate-spin" /><span>正在渲染预览</span></div>}
  </div>;
}
