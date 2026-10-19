import { getLocalizedApiError } from '@/lib/apiError';
import { formatDisplayDate } from '@/lib/displayFormat';
import { EDITOR_EFFECT_NAMES } from '@/lib/editorEffects';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Undo, Redo, Save, ArrowLeft, ZoomIn, ZoomOut, Eye, Edit, MousePointer2, Type, Image as ImageIcon, Square, Circle, Triangle, X, Sparkles, PanelLeft, PanelRight, Maximize2, Lock, Unlock, History, Copy, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useCanvasStore } from '@/stores/canvasStore';
import { useTemplate, useCreateTemplate, useUpdateTemplate, useSetTemplateLock } from '@/api';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import * as fabric from 'fabric';

// Modular Components
import { PropertyPanel } from '@/components/editor/PropertyPanel';
import { LayerPanel } from '@/components/editor/LayerPanel';
import { ToolboxPanel } from '@/components/editor/ToolboxPanel';
import { AIChatPanel } from '@/components/ai/AIChatPanel';
import { apiClient } from '@/api/client';
import { CANVAS_PROPERTIES } from '@/lib/aiDesign';
import { TemplateMetadata, type TemplateDetails } from '@/components/editor/TemplateMetadata';
import { TemplateHistory } from '@/components/editor/TemplateHistory';
import { calculateFitZoom } from '@/lib/editorLayout';
import { useEditorDraft } from '@/hooks/useEditorDraft';
import { resolveApiUrl } from '@/lib/apiUrl';
import { getSamplePosterUrl } from '@/lib/posters';
import { applyPosterBackground, type PosterBackground } from '@/lib/posterBackground';

// ── Background generation helpers ──────────────────────────────────────────

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : null;
}

/** Generate a mesh-gradient image as a data URL (small canvas, canvas scales it up). */
function generateMeshGradientDataUrl(colors: string[], width: number, height: number): string {
  // Render at 1/4 size — smooth gradients don't need full resolution
  const w = Math.round(width / 4);
  const h = Math.round(height / 4);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;

  // Base fill
  ctx.fillStyle = colors[0] || '#1a1a2e';
  ctx.fillRect(0, 0, w, h);

  // Blob positions (normalized): top-right, bottom-left, bottom-right, center
  const positions = [[0.8, 0.15], [0.2, 0.85], [0.78, 0.8], [0.5, 0.5]];
  colors.slice(1).forEach((color, i) => {
    if (i >= positions.length) return;
    const rgb = hexToRgb(color);
    if (!rgb) return;
    const [px, py] = positions[i];
    const cx = px * w, cy = py * h;
    const r = Math.max(w, h) * 0.72;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(${rgb.r},${rgb.g},${rgb.b},0.88)`);
    g.addColorStop(1, `rgba(${rgb.r},${rgb.g},${rgb.b},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
  return c.toDataURL('image/jpeg', 0.9);
}

/** Generate a striped background as an SVG data URL. */
function generateStripesSvgDataUrl(
  color1: string, color2: string,
  angle: number, stripeWidth: number,
  width: number, height: number
): string {
  const tw = stripeWidth * 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs>
      <pattern id="s" x="0" y="0" width="${tw}" height="${tw}"
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(${angle},${width / 2},${height / 2})">
        <rect width="${tw}" height="${tw}" fill="${color1}"/>
        <rect width="${stripeWidth}" height="${tw}" fill="${color2}"/>
      </pattern>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#s)"/>
  </svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}



/** Generate a vignette image (transparent center → dark edges) as a data URL. */
function generateVignetteDataUrl(width: number, height: number, intensity: number, spread: number, colorHex: string = '#000000'): string {
  const c = document.createElement('canvas');
  c.width = width; c.height = height;
  const ctx = c.getContext('2d')!;
  const cx = width / 2, cy = height / 2;
  const r = Math.sqrt(cx * cx + cy * cy);
  const innerR = r * (1 - spread);
  const rgb = hexToRgb(colorHex) || { r: 0, g: 0, b: 0 };
  const g = ctx.createRadialGradient(cx, cy, innerR, cx, cy, r);
  g.addColorStop(0, `rgba(${rgb.r},${rgb.g},${rgb.b},0)`);
  g.addColorStop(1, `rgba(${rgb.r},${rgb.g},${rgb.b},${Math.min(intensity, 0.95)})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
  // PNG compresses solid-to-transparent gradients very well
  return c.toDataURL('image/png');
}

/** Generate a tiled film-grain noise image as a data URL. */
function generateGrainDataUrl(): string {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.floor(Math.random() * 255);
    img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL('image/jpeg', 0.5); // JPEG keeps noise tiles small
}

interface Font {
  filename: string;
  name: string;
  url: string;
}

export function EditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [compactPane, setCompactPane] = useState<'canvas' | 'tools' | 'inspector'>('canvas');
  const [autoFit, setAutoFit] = useState(true);
  const [leftWidth, setLeftWidth] = useState(340);
  const [rightWidth, setRightWidth] = useState(360);
  const [templateName, setTemplateName] = useState('');
  const [details, setDetails] = useState<TemplateDetails>({ version: '1.0.0', description: '', changelog: '' });
  const [detailsSaved, setDetailsSaved] = useState(JSON.stringify(details));
  const [metadataOpen, setMetadataOpen] = useState(false);
  const metadataDirty = JSON.stringify(details) !== detailsSaved;
  useEffect(() => {
    if (!metadataDirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [metadataDirty]);
  const [activeTool, setActiveTool] = useState('select');
  const [activePanel, setActivePanel] = useState<'properties' | 'layers' | 'ai'>('properties');
  const [layers, setLayers] = useState<any[]>([]);
  const [canvasWidth, setCanvasWidth] = useState(1920);
  const [canvasHeight, setCanvasHeight] = useState(1080);
  const [canvasReady, setCanvasReady] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [saveHistoryOpen, setSaveHistoryOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [customFonts, setCustomFonts] = useState<Font[]>([]);

  const [randomOnGeneration, setRandomOnGeneration] = useState(false);
  const [posterBackground, setPosterBackground] = useState<PosterBackground>();

  const {
    canvas, setCanvas, selectedObject, setSelectedObject,
    zoom, setZoom, undo, redo, saveToHistory, setIsRestoring, resetHistory
  } = useCanvasStore();
  const historyIndex = useCanvasStore((s) => s.historyIndex);
  const historyLength = useCanvasStore((s) => s.history.length);
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < historyLength - 1;
  useEffect(() => {
    setPosterBackground((canvas as any)?.posterBackground);
  }, [canvas, canvasReady, historyIndex]);

  // Fetch and inject custom fonts
  useEffect(() => {
    const loadFonts = async () => {
      try {
        const res = await apiClient.get('/fonts');
        const fonts: Font[] = res.data.fonts || [];
        setCustomFonts(fonts);

        // Inject @font-face rules
        const styleId = 'custom-fonts-style';
        let styleEl = document.getElementById(styleId) as HTMLStyleElement;
        if (!styleEl) {
          styleEl = document.createElement('style');
          styleEl.id = styleId;
          document.head.appendChild(styleEl);
        }

        const baseUrl = import.meta.env.VITE_API_URL || '/api';
        const fontRules = fonts.map(font => {
          const fontUrl = resolveApiUrl(font.url, baseUrl);
          return `
            @font-face {
              font-family: ${JSON.stringify(font.name)};
              src: url(${JSON.stringify(fontUrl)});
              font-display: swap;
            }
          `;
        }).join('\n');

        styleEl.textContent = fontRules;

        // Wait for fonts to load
        if (fonts.length > 0) {
          Promise.all(fonts.map(font => document.fonts.load(`16px ${JSON.stringify(font.name)}`))).then(() => {
            fonts.forEach(font => fabric.cache.clearFontCache(font.name));
            if (canvas) canvas.renderAll();
          }).catch(err => console.error('Failed to load custom font files:', err));
        }
      } catch (err) {
        console.error('Failed to load custom fonts:', err);
      }
    };

    loadFonts();
  }, [canvas]);

  // Initialize Zoom to fit
  useEffect(() => {
    setZoom(0.5);
  }, []);

  const { data: templateData } = useTemplate(id || '');
  const readOnly = !!id && (!templateData || templateData.isLocked);
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;
  const lockMutation = useSetTemplateLock();
  const createMutation = useCreateTemplate();
  const updateMutation = useUpdateTemplate();
  const saving = createMutation.isPending || updateMutation.isPending;
  const drafts = useEditorDraft(canvas, canvasReady, readOnly, id, templateName, canvasWidth, canvasHeight);
  const loadedTemplate = useRef('');
  const loadedCanvas = useRef(canvas);
  const dirtyRef = useRef(false); dirtyRef.current = drafts.dirty;
  const hasChangesRef = useRef(drafts.hasChanges); hasChangesRef.current = () => drafts.hasChanges() || metadataDirty;
  const markLoadedRef = useRef(drafts.markLoaded); markLoadedRef.current = drafts.markLoaded;
  const restoreDraft = async () => {
    const draft = drafts.pendingDraft;
    if (!canvas || !draft || readOnly) return;
    try {
      await useCanvasStore.getState().applyCanvasJSON(JSON.parse(draft.canvasJson));
      setTemplateName(draft.name); setCanvasWidth(draft.width); setCanvasHeight(draft.height);
      setRandomOnGeneration(Boolean((canvas as any).randomOnGeneration));
      syncLayersRef.current(); drafts.acknowledgeDraft();
      toast({ title: i18n.t('designer.draftRestored'), description: i18n.t('designer.draftRestoredHint') });
    } catch { toast({ title: i18n.t('designer.draftRestoreFailed'), variant: 'destructive' }); }
  };

  useEffect(() => {
    useCanvasStore.getState().setReadOnly(readOnly);
    if (canvas) {
      canvas.selection = !readOnly;
      canvas.skipTargetFind = readOnly;
      if (readOnly) { canvas.discardActiveObject(); setSelectedObject(null); }
      canvas.requestRenderAll();
    }
  }, [canvas, readOnly, canvasReady, setSelectedObject]);
  useEffect(() => () => useCanvasStore.getState().setReadOnly(false), []);

  async function unlockTemplate() {
    if (!id || !templateData?.canManage || lockMutation.isPending) return;
    try { await lockMutation.mutateAsync({ id, isLocked: false }); toast({ title: i18n.t('designer.unlocked') }); }
    catch (error: any) { toast({ title: i18n.t('designer.unlockFailed'), description: getLocalizedApiError(error), variant: 'destructive' }); }
  }
  async function copyTemplate() {
    if (!id) return;
    try { const { data } = await apiClient.post(`/templates/${id}/duplicate`); navigate(`/editor/${data.id}`); }
    catch { toast({ title: i18n.t('designer.copyFailed'), variant: 'destructive' }); }
  }


  // Helper to sync layers from canvas
  const syncLayers = useCallback(() => {
    if (!canvas) return;
    const objs = canvas.getObjects().slice().reverse().map((obj: any) => {
      // Ensure object has an ID
      if (!obj.id) {
        obj.id = Math.random().toString(36).substr(2, 9);
      }
      return {
        id: obj.id,
        type: obj.type,
        name: obj.name,
        visible: obj.visible !== false,
        locked: !obj.selectable // Use the selectable flag as the truth for locking status since we set selectable=false when locked
      };
    });
    setLayers(objs);
  }, [canvas]);

  // Canvas Initialization - use ref to prevent re-initialization
  const isCanvasInitialized = useRef(false);

  // Use refs to avoid stale closures and prevent effect re-runs
  const syncLayersRef = useRef(syncLayers);
  const saveToHistoryRef = useRef(saveToHistory);
  const setCanvasRef = useRef(setCanvas);
  const setSelectedObjectRef = useRef(setSelectedObject);

  // Keep refs up to date
  useEffect(() => {
    syncLayersRef.current = syncLayers;
    saveToHistoryRef.current = saveToHistory;
    setCanvasRef.current = setCanvas;
    setSelectedObjectRef.current = setSelectedObject;
  });

  useEffect(() => {
    if (!canvasRef.current || isCanvasInitialized.current) return;
    isCanvasInitialized.current = true;

    // Configure default object styles (Fabric 6 uses FabricObject)
    fabric.FabricObject.prototype.set({
      transparentCorners: false,
      cornerColor: '#6366f1',
      cornerStyle: 'circle',
      cornerStrokeColor: '#ffffff',
      cornerSize: 10,
      padding: 5,
      borderColor: '#6366f1'
    });

    const fabricCanvas = new fabric.Canvas(canvasRef.current as HTMLCanvasElement, {
      width: canvasWidth,
      height: canvasHeight,
      backgroundColor: '#ffffff',
      selection: true,
      preserveObjectStacking: true
    });

    setCanvasRef.current(fabricCanvas);

    // ===== SNAPPING CONFIGURATION =====
    const SNAP_THRESHOLD = 8; // pixels for position snapping
    const ANGLE_SNAP_THRESHOLD = 5; // degrees for rotation snapping
    const SNAP_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315, 360];

    // Store for guide lines
    let horizontalGuides: fabric.Line[] = [];
    let verticalGuides: fabric.Line[] = [];

    // Helper: Create a guide line
    const createGuideLine = (points: [number, number, number, number]): fabric.Line => {
      const line = new fabric.Line(points, {
        stroke: '#6366f1',
        strokeWidth: 1,
        strokeDashArray: [5, 5],
        selectable: false,
        evented: false,
        excludeFromExport: true,
      });
      (line as any).isGuideLine = true;
      return line;
    };

    // Helper: Clear all guide lines
    const clearGuides = () => {
      [...horizontalGuides, ...verticalGuides].forEach(line => {
        fabricCanvas.remove(line);
      });
      horizontalGuides = [];
      verticalGuides = [];
    };

    // Helper: Get object snap points
    const getSnapPoints = (obj: fabric.FabricObject) => {
      const bound = obj.getBoundingRect();
      return {
        left: bound.left,
        right: bound.left + bound.width,
        centerX: bound.left + bound.width / 2,
        top: bound.top,
        bottom: bound.top + bound.height,
        centerY: bound.top + bound.height / 2,
      };
    };

    // Event Listeners
    fabricCanvas.on('selection:created', (e: any) => setSelectedObjectRef.current(e.selected?.[0]));
    fabricCanvas.on('selection:updated', (e: any) => setSelectedObjectRef.current(e.selected?.[0]));
    fabricCanvas.on('selection:cleared', () => setSelectedObjectRef.current(null));

    fabricCanvas.on('object:added', (e: any) => {
      if ((e.target as any)?.isGuideLine) return;
      syncLayersRef.current();
      saveToHistoryRef.current();
    });
    fabricCanvas.on('object:removed', (e: any) => {
      if ((e.target as any)?.isGuideLine) return;
      syncLayersRef.current();
      saveToHistoryRef.current();
    });
    fabricCanvas.on('object:modified', () => {
      clearGuides();
      syncLayersRef.current();
      saveToHistoryRef.current();
    });

    // ===== ANGLE SNAPPING =====
    fabricCanvas.on('object:rotating', (e: any) => {
      const obj = e.target;
      if (!obj) return;
      setSelectedObjectRef.current(obj);

      let angle = obj.angle % 360;
      if (angle < 0) angle += 360;

      for (const snapAngle of SNAP_ANGLES) {
        if (Math.abs(angle - snapAngle) < ANGLE_SNAP_THRESHOLD) {
          obj.angle = snapAngle === 360 ? 0 : snapAngle;
          break;
        }
      }
    });

    fabricCanvas.on('object:scaling', (e: any) => { setSelectedObjectRef.current(e.target); });

    // ===== POSITION SNAPPING (SMART GUIDES) =====
    fabricCanvas.on('object:moving', (e: any) => {
      const movingObj = e.target;
      if (!movingObj) return;
      setSelectedObjectRef.current(movingObj);

      clearGuides();

      const movingPoints = getSnapPoints(movingObj);
      const canvasW = fabricCanvas.getWidth();
      const canvasH = fabricCanvas.getHeight();

      let snapX: number | null = null;
      let snapY: number | null = null;

      // Check against canvas center
      const canvasCenterX = canvasW / 2;
      const canvasCenterY = canvasH / 2;

      if (Math.abs(movingPoints.centerX - canvasCenterX) < SNAP_THRESHOLD) {
        snapX = canvasCenterX;
        const line = createGuideLine([canvasCenterX, 0, canvasCenterX, canvasH]);
        verticalGuides.push(line);
        fabricCanvas.add(line);
      }

      if (Math.abs(movingPoints.centerY - canvasCenterY) < SNAP_THRESHOLD) {
        snapY = canvasCenterY;
        const line = createGuideLine([0, canvasCenterY, canvasW, canvasCenterY]);
        horizontalGuides.push(line);
        fabricCanvas.add(line);
      }

      // Check against other objects
      const allObjects = fabricCanvas.getObjects().filter(
        (obj: any) => obj !== movingObj && !obj.isGuideLine
      );

      for (const otherObj of allObjects) {
        const otherPoints = getSnapPoints(otherObj as fabric.FabricObject);

        // Vertical alignments (X axis)
        const xChecks = [
          { moving: 'left', other: 'left' },
          { moving: 'left', other: 'right' },
          { moving: 'right', other: 'left' },
          { moving: 'right', other: 'right' },
          { moving: 'centerX', other: 'centerX' },
        ];

        for (const check of xChecks) {
          const movingVal = movingPoints[check.moving as keyof typeof movingPoints];
          const otherVal = otherPoints[check.other as keyof typeof otherPoints];
          if (snapX === null && Math.abs(movingVal - otherVal) < SNAP_THRESHOLD) {
            snapX = otherVal;
            const minY = Math.min(movingPoints.top, otherPoints.top);
            const maxY = Math.max(movingPoints.bottom, otherPoints.bottom);
            const line = createGuideLine([otherVal, minY - 20, otherVal, maxY + 20]);
            verticalGuides.push(line);
            fabricCanvas.add(line);
            break;
          }
        }

        // Horizontal alignments (Y axis)
        const yChecks = [
          { moving: 'top', other: 'top' },
          { moving: 'top', other: 'bottom' },
          { moving: 'bottom', other: 'top' },
          { moving: 'bottom', other: 'bottom' },
          { moving: 'centerY', other: 'centerY' },
        ];

        for (const check of yChecks) {
          const movingVal = movingPoints[check.moving as keyof typeof movingPoints];
          const otherVal = otherPoints[check.other as keyof typeof otherPoints];
          if (snapY === null && Math.abs(movingVal - otherVal) < SNAP_THRESHOLD) {
            snapY = otherVal;
            const minX = Math.min(movingPoints.left, otherPoints.left);
            const maxX = Math.max(movingPoints.right, otherPoints.right);
            const line = createGuideLine([minX - 20, otherVal, maxX + 20, otherVal]);
            horizontalGuides.push(line);
            fabricCanvas.add(line);
            break;
          }
        }
      }

      // NOTE: We intentionally do NOT apply snapping during drag to prevent jitter.
      // The guide lines show where the object WOULD snap.
      // Snapping is purely visual feedback during drag.
    });

    // Clean up guides on mouse up
    fabricCanvas.on('mouse:up', () => {
      clearGuides();
    });

    return () => {
      fabricCanvas.dispose();
      setCanvasRef.current(null);
      isCanvasInitialized.current = false;
    };
  }, []);

  const fitToView = useCallback((width: number, height: number) => {
    const container = containerRef.current;
    return container ? calculateFitZoom(container.clientWidth, container.clientHeight, width, height) : 0.5;
  }, []);

  // Follow viewport/panel changes while fitted; retain a user-selected zoom until "fit" is pressed.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !canvas || !autoFit) return;
    const resize = () => {
      if (container.clientWidth && container.clientHeight) setZoom(fitToView(canvasWidth, canvasHeight));
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container); resize();
    return () => observer.disconnect();
  }, [canvas, autoFit, canvasWidth, canvasHeight, fitToView, setZoom]);

  // Load template data when available
  useEffect(() => {
    const defaultW = 1920;
    const defaultH = 1080;

    if (loadedCanvas.current !== canvas) { loadedCanvas.current = canvas; loadedTemplate.current = ''; }
    const version = `${id || 'new'}:${templateData?.updatedAt || ''}`;
    if (loadedTemplate.current === version || (loadedTemplate.current.startsWith(`${id || 'new'}:`) && hasChangesRef.current())) return;
    // Basic initialization
    if (canvas && !id) {
      const initial = { version: '1.0.0', description: '', changelog: '' };
      setDetails(initial); setDetailsSaved(JSON.stringify(initial));
      setCanvasWidth(defaultW);
      setCanvasHeight(defaultH);
      const initialZoom = fitToView(defaultW, defaultH);
      canvas.setDimensions({
        width: defaultW * initialZoom,
        height: defaultH * initialZoom
      });
      canvas.setZoom(initialZoom);
      setZoom(initialZoom);
      resetHistory();
      loadedTemplate.current = version;
      setCanvasReady(true);
      return;
    }

    if (!canvas || !templateData) return;

    let cancelled = false;
    const loadTemplate = async () => {
      setCanvasReady(false);
      setTemplateName(templateData.name || '');
      const loadedDetails = { version: templateData.version || '1.0.0', description: templateData.description || '', changelog: templateData.changelog || '', author: templateData.author, minAppVersion: templateData.minAppVersion };
      setDetails(loadedDetails); setDetailsSaved(JSON.stringify(loadedDetails));
      const width = templateData.width || defaultW;
      const height = templateData.height || defaultH;
      setCanvasWidth(width);
      setCanvasHeight(height);

      const currentZoom = fitToView(width, height);
      // Set physical dimensions based on zoom
      canvas.setDimensions({
        width: width * currentZoom,
        height: height * currentZoom
      });
      canvas.setZoom(currentZoom);
      setZoom(currentZoom);

      if (templateData.canvasJson) {
        try {
          const jsonData = JSON.parse(templateData.canvasJson);
          setIsRestoring(true);
          await canvas.loadFromJSON(jsonData);
          if (cancelled) return;
          if (jsonData.background && typeof jsonData.background === 'object') {
            canvas.backgroundColor = jsonData.background.type === 'radial'
              ? new fabric.Gradient<'radial'>(jsonData.background)
              : new fabric.Gradient<'linear'>(jsonData.background);
          }

          setRandomOnGeneration(Boolean(jsonData.randomOnGeneration));
          (canvas as any).randomOnGeneration = Boolean(jsonData.randomOnGeneration);
          (canvas as any).randomBackgroundStyle = jsonData.randomBackgroundStyle;
          (canvas as any).posterBackground = jsonData.posterBackground;
          (canvas as any).posterSource = jsonData.posterSource;
          setPosterBackground(jsonData.posterBackground);

          // Restore custom properties from JSON data
          const objects = canvas.getObjects();
          if (jsonData.objects && Array.isArray(jsonData.objects)) {
            jsonData.objects.forEach((objData: any, index: number) => {
              if (objects[index]) {
                const obj = objects[index] as any;
                if (objData.id) obj.id = objData.id;
                if (objData.name) obj.name = objData.name;
                if (objData.posterVar) obj.posterVar = objData.posterVar;
                if (objData.isPoster) obj.isPoster = objData.isPoster;
                if (objData.textVar) obj.textVar = objData.textVar;
                if (objData.fitText !== undefined) obj.fitText = objData.fitText;
                if (objData.wrapText !== undefined) obj.wrapText = objData.wrapText;
              }
            });
          }
          // Restore dimensions and zoom after JSON load as it might overwrite it
          await applyPosterBackground(canvas, width, height);
          if (cancelled) return;
          canvas.setDimensions({
            width: width * currentZoom,
            height: height * currentZoom
          });
          canvas.setZoom(currentZoom);
          canvas.renderAll();
          syncLayersRef.current();
          resetHistory(jsonData);
        } catch (err) {
          console.error('Failed to load canvas JSON:', err);
          toast({ title: i18n.t('designer.loadFailed'), description: i18n.t('designer.loadFailedHint'), variant: 'destructive' });
          return;
        } finally {
          setIsRestoring(false);
        }
      } else {
        resetHistory();
      }
      if (cancelled) return;
      loadedTemplate.current = version;
      if (dirtyRef.current === false && canvasReady) {
        markLoadedRef.current({ name: templateData.name || '', width, height, canvasJson: JSON.stringify(canvas.toObject(CANVAS_PROPERTIES)) });
      }
      setCanvasReady(true);
    };

    loadTemplate();
    return () => { cancelled = true; };
  }, [canvas, templateData, id, setZoom, setIsRestoring, resetHistory]);

  // Sync fabric zoom and dimensions when zoom state changes
  useEffect(() => {
    if (canvas) {
      canvas.setDimensions({
        width: canvasWidth * zoom,
        height: canvasHeight * zoom
      });
      canvas.setZoom(zoom);
      canvas.renderAll();
    }
  }, [zoom, canvas, canvasWidth, canvasHeight]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!canvas) return;

    let clipboard: fabric.FabricObject | null = null;

    const handleKeyDown = async (e: KeyboardEvent) => {
      if (readOnlyRef.current) return;
      // Ignore if typing in an input/textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const activeObject = canvas.getActiveObject();

      // Delete key - delete selected object
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (activeObject) {
          canvas.remove(activeObject);
          canvas.discardActiveObject();
          canvas.renderAll();
          saveToHistory();
        }
        e.preventDefault();
      }

      // Ctrl+C - Copy
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        if (activeObject) {
          clipboard = await activeObject.clone();
        }
      }

      // Ctrl+V - Paste
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        if (clipboard) {
          const cloned = await clipboard.clone();
          cloned.set({
            left: (cloned.left || 0) + 20,
            top: (cloned.top || 0) + 20,
          });
          (cloned as any).id = Math.random().toString(36).substr(2, 9);
          canvas.add(cloned);
          canvas.setActiveObject(cloned);
          canvas.renderAll();
          saveToHistory();
        }
      }

      // Ctrl+Z - Undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo().then(() => syncLayersRef.current());
      }

      // Ctrl+Shift+Z or Ctrl+Y - Redo
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo().then(() => syncLayersRef.current());
      }

      // Ctrl+D - Duplicate (clone in-place + 20px offset)
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault();
        if (activeObject) {
          const cloned = await activeObject.clone();
          cloned.set({
            left: (cloned.left || 0) + 20,
            top: (cloned.top || 0) + 20,
          });
          (cloned as any).id = Math.random().toString(36).substr(2, 9);
          canvas.add(cloned);
          canvas.setActiveObject(cloned);
          canvas.renderAll();
          saveToHistory();
        }
      }

      // Esc - 取消选择
      if (e.key === 'Escape') {
        if (activeObject) {
          canvas.discardActiveObject();
          canvas.renderAll();
        }
      }

      // 方向键微调位置（Shift = 10px，否则 1px）
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && activeObject) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        activeObject.set({
          left: (activeObject.left || 0) + dx,
          top: (activeObject.top || 0) + dy,
        });
        activeObject.setCoords();
        canvas.renderAll();
        saveToHistory();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canvas, saveToHistory, undo, redo]);
  const addObject = useCallback(async (type: string, payload?: any) => {
    if (readOnlyRef.current) return;
    if (!canvas) {
      console.log('Canvas not ready');
      return;
    }
    let obj: fabric.FabricObject | undefined;
    // CRITICAL: Use the viewport center to get logical coordinates correctly mapped to screen vision
    const vCenter = canvas.getVpCenter();
    const centerX = vCenter.x;
    const centerY = vCenter.y;
    const id = Math.random().toString(36).substr(2, 9);

    switch (type) {
      case 'text': {
        const text = new fabric.IText(t('designer.sampleText'), {
          left: centerX, top: centerY,
          originX: 'center', originY: 'center',
          fontSize: 32, fill: '#1f2937', fontFamily: 'Inter, sans-serif'
        });
        (text as any).id = id;
        obj = text;
        break;
      }
      case 'rect': {
        const rect = new fabric.Rect({
          left: centerX, top: centerY,
          originX: 'center', originY: 'center',
          width: 150, height: 220, fill: '#4fd1c5', rx: 12, ry: 12
        });
        (rect as any).id = id;
        obj = rect;
        break;
      }
      case 'circle': {
        const circle = new fabric.Circle({
          left: centerX, top: centerY,
          originX: 'center', originY: 'center',
          radius: 75, fill: '#667eea'
        });
        (circle as any).id = id;
        obj = circle;
        break;
      }
      case 'triangle': {
        const triangle = new fabric.Triangle({
          left: centerX, top: centerY,
          originX: 'center', originY: 'center',
          width: 150, height: 225, fill: '#f59e0b'
        });
        (triangle as any).id = id;
        obj = triangle;
        break;
      }
      case 'line': {
        const line = new fabric.Line([-75, 0, 75, 0], {
          left: centerX, top: centerY,
          stroke: '#111827', strokeWidth: 6,
          originX: 'center', originY: 'center'
        });
        (line as any).id = id;
        obj = line;
        break;
      }
      case 'star': {
        // Create star polygon points
        const createStarPoints = (spikes: number, outerRadius: number, innerRadius: number) => {
          const points: { x: number; y: number }[] = [];
          const step = Math.PI / spikes;
          for (let i = 0; i < 2 * spikes; i++) {
            const r = i % 2 === 0 ? outerRadius : innerRadius;
            const a = i * step - Math.PI / 2;
            points.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
          }
          return points;
        };
        const starPoints = createStarPoints(5, 75, 35);
        const star = new fabric.Polygon(starPoints, {
          left: centerX, top: centerY,
          originX: 'center', originY: 'center',
          fill: '#ec4899'
        });
        (star as any).id = id;
        obj = star;
        break;
      }
      case 'arrow': {
        const pathData = 'M 0 -8 L 110 -8 L 110 -20 L 150 0 L 110 20 L 110 8 L 0 8 Z';
        const arrow = new fabric.Path(pathData, {
          left: centerX, top: centerY,
          originX: 'center', originY: 'center',
          fill: '#10b981'
        });
        (arrow as any).id = id;
        obj = arrow;
        break;
      }
      case 'poster': {
        if (payload) {
          // Load poster from URL
          try {
            const imgEl = document.createElement('img');
            imgEl.src = payload;
            imgEl.crossOrigin = 'anonymous';

            await new Promise((resolve, reject) => {
              imgEl.onload = resolve;
              imgEl.onerror = reject;
            });

            const fabricImg = new fabric.FabricImage(imgEl, {
              left: centerX, top: centerY,
              originX: 'center', originY: 'center',
            });

            // Scale to reasonable size if too big
            if (fabricImg.width && fabricImg.width > 500) {
              fabricImg.scaleToWidth(500);
            }

            (fabricImg as any).id = id;
            (fabricImg as any).isPoster = true;
            // Apply rounded corners via clipPath
            fabricImg.set('clipPath', new fabric.Rect({
              width: fabricImg.width,
              height: fabricImg.height,
              rx: 12,
              ry: 12,
              originX: 'center',
              originY: 'center',
            }));
            obj = fabricImg;
          } catch (err) {
            console.error('Failed to load poster:', err);
            toast({ title: i18n.t('common.error'), description: i18n.t('designer.posterLoadFailed'), variant: 'destructive' });
          }
        } else {
          // Create a poster placeholder rect with pattern fill
          const posterRect = new fabric.Rect({
            left: centerX, top: centerY,
            originX: 'center', originY: 'center',
            width: 150, height: 220,
            fill: '#667eea',
            rx: 12, ry: 12,
            stroke: '#4f46e5',
            strokeWidth: 2
          });
          (posterRect as any).id = id;
          (posterRect as any).isPoster = true;
          obj = posterRect;
        }
        break;
      }
      case 'image': {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = 'image/*';
        input.onchange = (e: any) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = (ev) => {
            const imgEl = document.createElement('img');
            imgEl.src = ev.target?.result as string;
            imgEl.onload = () => {
              if (readOnlyRef.current) return;
              const fabricImg = new fabric.FabricImage(imgEl, {
                left: centerX, top: centerY,
                originX: 'center', originY: 'center',
                scaleX: 0.5, scaleY: 0.5
              });
              (fabricImg as any).id = id;
              canvas.add(fabricImg);
              canvas.setActiveObject(fabricImg);
              canvas.renderAll();
            };
          };
          reader.readAsDataURL(file);
        };
        input.click();
        return;
      }
    }
    if (obj && !readOnlyRef.current) {
      canvas.add(obj);
      canvas.setActiveObject(obj);
      canvas.renderAll();
    }
  }, [canvas, t]);

  const handleSave = async () => {
    if (!canvas || readOnlyRef.current || saving) return;
    try {
      canvas.discardActiveObject();
      const currentZoom = canvas.getZoom(), currentWidth = canvas.getWidth(), currentHeight = canvas.getHeight();
      let thumbnailDataUrl: string;
      try {
        canvas.setZoom(1);
        canvas.setDimensions({ width: canvasWidth, height: canvasHeight });
        canvas.renderAll();
        thumbnailDataUrl = canvas.toDataURL({ format: 'jpeg', quality: 0.8, multiplier: Math.min(480 / canvasWidth, 270 / canvasHeight) });
      } finally {
        canvas.setZoom(currentZoom);
        canvas.setDimensions({ width: currentWidth, height: currentHeight });
        canvas.renderAll();
      }
      const canvasJson = JSON.stringify(canvas.toObject(CANVAS_PROPERTIES));
      const savedSnapshot = { name: templateName, width: canvasWidth, height: canvasHeight, canvasJson };
      if (id && templateData?.canManage !== false) {
        await updateMutation.mutateAsync({ id, name: templateName, ...details, canvasJson, width: canvasWidth, height: canvasHeight, thumbnail: thumbnailDataUrl });
      } else {
        const result = await createMutation.mutateAsync({
          name: id ? t('designer.copyName', { name: templateName }) : templateName || t('designer.newTemplate'), ...details, canvasJson,
          width: canvasWidth, height: canvasHeight, thumbnail: thumbnailDataUrl
        });
        drafts.markSaved(savedSnapshot);
        navigate(`/editor/${result.id}`, { replace: true });
      }
      drafts.markSaved(savedSnapshot);
      setDetailsSaved(JSON.stringify(details));
      toast({ title: i18n.t('common.success'), description: i18n.t('designer.saved') });
    } catch (error: any) {
      toast({ title: i18n.t('designer.saveFailed'), description: getLocalizedApiError(error), variant: 'destructive' });
    }
  };

  // Change background
  const changeBackground = useCallback(async (bg: any) => {
    if (readOnlyRef.current) return;
    if (!canvas) {
      console.log('Canvas not ready for background change');
      return;
    }

    const previousBackground = {
      posterBackground: (canvas as any).posterBackground,
      randomOnGeneration: (canvas as any).randomOnGeneration,
      randomBackgroundStyle: (canvas as any).randomBackgroundStyle
    };
    // Handle random generation flag
    if (bg.randomOnGeneration !== undefined) {
      setRandomOnGeneration(bg.randomOnGeneration);
      (canvas as any).randomOnGeneration = bg.randomOnGeneration;
    }

    if (!bg.type) {
      saveToHistory();
      return;
    }
    // A manually chosen replacement background opts out of the template's style-specific palette.
    if (['color', 'gradient', 'random-gradient', 'mesh', 'stripes', 'poster-blur'].includes(bg.type)) {
      (canvas as any).randomBackgroundStyle = undefined;
      (canvas as any).posterBackground = undefined;
      setPosterBackground(undefined);
    }

    // Get gradient coords based on direction
    const getGradientCoords = (direction: string) => {
      const width = canvas.getWidth();
      const height = canvas.getHeight();
      switch (direction) {
        case 'leftToRight':
          return { x1: 0, y1: 0, x2: width, y2: 0 };
        case 'topToBottom':
          return { x1: 0, y1: 0, x2: 0, y2: height };
        case 'bottomToTop':
          return { x1: 0, y1: height, x2: 0, y2: 0 };
        case 'leftTopToRightBottom':
          return { x1: 0, y1: 0, x2: width, y2: height };
        case 'rightTopToLeftBottom':
          return { x1: width, y1: 0, x2: 0, y2: height };
        default:
          return { x1: 0, y1: 0, x2: width, y2: height };
      }
    };

    if (bg.type === 'poster-blur') {
      const settings: PosterBackground = { blur: bg.blur, dim: bg.dim, source: bg.source === 'backdrop' ? 'backdrop' : 'poster' };
      (canvas as any).posterBackground = settings;
      setPosterBackground(settings);
      (canvas as any).randomOnGeneration = false;
      setRandomOnGeneration(false);
      try {
        await applyPosterBackground(canvas, canvasWidth, canvasHeight);
      } catch {
        Object.assign(canvas, previousBackground);
        setPosterBackground(previousBackground.posterBackground);
        setRandomOnGeneration(Boolean(previousBackground.randomOnGeneration));
        toast({ title: i18n.t('designer.backgroundLoadFailed'), description: i18n.t('designer.backgroundLoadHint'), variant: 'destructive' });
        return;
      }
    } else if (bg.type === 'color') {
      canvas.backgroundImage = undefined as any;
      canvas.backgroundColor = bg.color;
    } else if (bg.type === 'gradient') {
      canvas.backgroundImage = undefined as any;
      const intensity = bg.intensity ?? 50;
      const midStart = (50 - intensity / 2) / 100;
      const midEnd = (50 + intensity / 2) / 100;

      if (bg.gradientStyle === 'radial') {
        const width = canvas.getWidth();
        const height = canvas.getHeight();
        const cx = width / 2;
        const cy = height / 2;
        const r = Math.sqrt(cx * cx + cy * cy);
        const gradient = new fabric.Gradient({
          type: 'radial',
          coords: { x1: cx, y1: cy, x2: cx, y2: cy, r1: 0, r2: r },
          colorStops: [
            { offset: 0, color: bg.color1 },
            { offset: midStart, color: bg.color1 },
            { offset: midEnd, color: bg.color2 },
            { offset: 1, color: bg.color2 }
          ]
        });
        canvas.backgroundColor = gradient as any;
      } else {
        const coords = getGradientCoords(bg.direction);
        const gradient = new fabric.Gradient({
          type: 'linear',
          coords,
          colorStops: [
            { offset: 0, color: bg.color1 },
            { offset: midStart, color: bg.color1 },
            { offset: midEnd, color: bg.color2 },
            { offset: 1, color: bg.color2 }
          ]
        });
        canvas.backgroundColor = gradient as any;
      }
    } else if (bg.type === 'random-gradient') {
      canvas.backgroundImage = undefined as any;
      const h1 = Math.floor(Math.random() * 360);
      const s1 = Math.floor(40 + Math.random() * 40);
      const l1 = Math.floor(35 + Math.random() * 30);
      const h2 = Math.floor(Math.random() * 360);
      const s2 = Math.floor(40 + Math.random() * 40);
      const l2 = Math.floor(35 + Math.random() * 30);
      const color1 = `hsl(${h1},${s1}%,${l1}%)`;
      const color2 = `hsl(${h2},${s2}%,${l2}%)`;
      const coords = getGradientCoords(bg.direction);
      const intensity = bg.intensity ?? 50;
      const midStart = (50 - intensity / 2) / 100;
      const midEnd = (50 + intensity / 2) / 100;
      const gradient = new fabric.Gradient({
        type: 'linear',
        coords,
        colorStops: [
          { offset: 0, color: color1 },
          { offset: midStart, color: color1 },
          { offset: midEnd, color: color2 },
          { offset: 1, color: color2 }
        ]
      });
      canvas.backgroundColor = gradient as any;

    } else if (bg.type === 'mesh') {
      // Generate mesh gradient image and set as backgroundImage
      const dataUrl = generateMeshGradientDataUrl(bg.colors, canvasWidth, canvasHeight);
      const img = await fabric.FabricImage.fromURL(dataUrl);
      img.set({
        left: 0, top: 0, originX: 'left', originY: 'top',
        scaleX: canvasWidth / (img.width || canvasWidth),
        scaleY: canvasHeight / (img.height || canvasHeight),
        selectable: false, evented: false
      });
      canvas.backgroundColor = '#000000';
      canvas.backgroundImage = img as any;

    } else if (bg.type === 'stripes') {
      const svgUrl = generateStripesSvgDataUrl(bg.color1, bg.color2, bg.angle, bg.stripeWidth, canvasWidth, canvasHeight);
      const img = await fabric.FabricImage.fromURL(svgUrl);
      img.set({
        left: 0, top: 0, originX: 'left', originY: 'top',
        scaleX: canvasWidth / (img.width || canvasWidth),
        scaleY: canvasHeight / (img.height || canvasHeight),
        selectable: false, evented: false
      });
      canvas.backgroundColor = '';
      canvas.backgroundImage = img as any;

    } else if (bg.type === 'vignette') {
      // Generate vignette image and add as a named Fabric object (so it appears in layers panel)
      const dataUrl = generateVignetteDataUrl(canvasWidth, canvasHeight, bg.intensity, bg.spread, bg.color);
      const img = await fabric.FabricImage.fromURL(dataUrl);
      img.set({
        left: 0, top: 0, originX: 'left', originY: 'top',
        scaleX: canvasWidth / (img.width || canvasWidth),
        scaleY: canvasHeight / (img.height || canvasHeight),
        selectable: true, evented: true, name: EDITOR_EFFECT_NAMES.vignette
      } as any);
      canvas.add(img);
      canvas.sendObjectToBack(img);

    } else if (bg.type === 'clear-vignette') {
      canvas.getObjects().forEach(obj => {
        if ((obj as any).name === EDITOR_EFFECT_NAMES.vignette) canvas.remove(obj);
      });

    } else if (bg.type === 'grain') {
      // Generate a 128x128 noise tile and tile it via fabric.Pattern on a Rect
      const tileDataUrl = generateGrainDataUrl();
      const tileImg = new Image();
      tileImg.src = tileDataUrl;
      // Wait for image load (data URL is synchronous in most browsers, but be safe)
      await new Promise<void>((resolve) => {
        if (tileImg.complete) { resolve(); } else { tileImg.onload = () => resolve(); }
      });
      const pattern = new fabric.Pattern({ source: tileImg, repeat: 'repeat' });
      const grainRect = new fabric.Rect({
        left: 0, top: 0,
        width: canvasWidth, height: canvasHeight,
        fill: pattern,
        opacity: bg.opacity,
        globalCompositeOperation: 'overlay',
        selectable: true, evented: true,
        name: EDITOR_EFFECT_NAMES.noise,
        originX: 'left', originY: 'top',
      } as any);
      canvas.add(grainRect);
      canvas.sendObjectToBack(grainRect);

    } else if (bg.type === 'clear-grain') {
      canvas.getObjects().forEach(obj => {
        if ((obj as any).name === EDITOR_EFFECT_NAMES.noise) canvas.remove(obj);
      });
    }

    canvas.renderAll();
    saveToHistory();
  }, [canvas, saveToHistory, canvasWidth, canvasHeight, t]);

  // Handle preview - export canvas to image and show in modal
  const handlePreview = useCallback(() => {
    if (!canvas) return;

    // Deselect any selected objects for clean preview
    canvas.discardActiveObject();
    canvas.renderAll();

    // Store current dimensions and zoom
    const currentZoom = canvas.getZoom();
    const currentWidth = canvas.getWidth();
    const currentHeight = canvas.getHeight();

    // Temporarily reset to full size for export
    canvas.setZoom(1);
    canvas.setDimensions({ width: canvasWidth, height: canvasHeight });
    canvas.renderAll();

    // Export canvas to data URL at full resolution
    const dataUrl = canvas.toDataURL({
      format: 'png',
      quality: 1,
      multiplier: 1
    });

    // Restore original dimensions and zoom
    canvas.setZoom(currentZoom);
    canvas.setDimensions({ width: currentWidth, height: currentHeight });
    canvas.renderAll();

    setPreviewImage(dataUrl);
    setPreviewOpen(true);
  }, [canvas, canvasWidth, canvasHeight]);

  return (
    <div className="editor-shell bg-(--bg-secondary) overflow-hidden" data-compact-pane={compactPane}>
      <div className="editor-compact-tabs" role="group" aria-label={t('designer.workspace')}>
        <button type="button" aria-pressed={compactPane === 'canvas'} onClick={() => setCompactPane('canvas')}><MousePointer2 size={16} />{t('designer.canvas')}</button>
        <button type="button" aria-pressed={compactPane === 'tools'} onClick={() => setCompactPane('tools')}><PanelLeft size={16} />{t('designer.assets')}</button>
        <button type="button" aria-pressed={compactPane === 'inspector'} onClick={() => setCompactPane('inspector')}><PanelRight size={16} />{t('designer.propertiesAndAI')}</button>
      </div>
      {/* Left - Toolbox Panel */}
      <aside
        style={{ width: leftWidth, minWidth: 260, maxWidth: 540, flexShrink: 0 }}
        className="editor-toolbox bg-(--bg-primary) border-r border-(--border-color) overflow-hidden flex flex-col"
      >
        {readOnly ? <div className="editor-readonly-panel"><Lock size={28} /><strong>{t('designer.locked')}</strong><p>{t('designer.readOnlyHint')}</p><p>{t('designer.unlockHint')}</p></div> : <ToolboxPanel
          onAddText={() => addObject('text')}
          onAddImage={() => addObject('image')}
          onAddShape={(type, payload) => addObject(type, payload)}
          onChangeBackground={changeBackground}
          initialRandomOnGeneration={randomOnGeneration}
          initialPosterBackground={posterBackground}
        />}
      </aside>

      {/* Left Resize Divider */}
      <div
        className="editor-resizer w-1 shrink-0 bg-(--border-color) hover:bg-(--primary) active:bg-(--primary) cursor-col-resize transition-colors select-none"
        onMouseDown={(e) => {
          e.preventDefault();
          const startX = e.clientX;
          const startWidth = leftWidth;
          const onMove = (ev: MouseEvent) => {
            const newW = Math.min(540, Math.max(260, startWidth + ev.clientX - startX));
            setLeftWidth(newW);
          };
          const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
          };
          window.addEventListener('mousemove', onMove);
          window.addEventListener('mouseup', onUp);
        }}
      />

      {/* Center - Canvas Area (Flexible) */}
      <div className="editor-center flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header Bar */}
        <header className="editor-document-header h-14 px-6 flex items-center justify-between bg-(--bg-primary) border-b border-(--border-color) shrink-0">
          <div className="editor-document-name flex items-center gap-4">
            <button aria-label={t('designer.back')} onClick={() => navigate('/templates')} className="p-2 rounded-lg hover:bg-(--bg-tertiary) transition-all text-(--text-secondary) hover:text-(--primary)">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="editor-name-field flex items-center gap-2">
              <input
                type="text"
                aria-label={t('designer.name')}
                readOnly={readOnly}
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder={t('designer.newTemplate')}
                className="bg-transparent text-lg font-bold text-(--text-primary) focus:outline-none focus:border-b-2 focus:border-(--primary) transition-all"
              />
              <Edit className="w-4 h-4 text-(--text-tertiary)" />
              {drafts.draftUnavailable && <span role="alert" style={{ fontSize: 12, color: 'var(--danger)' }}>{t('designer.draftUnavailable')}</span>}
              {(drafts.dirty || metadataDirty) && <span style={{ fontSize: 12, whiteSpace: 'nowrap', flexShrink: 0, color: 'var(--text-secondary)' }}>{t('designer.unsaved')}</span>}
              {templateData?.isLocked && <span className="template-lock-badge" title={t('designer.lockedHint')}><Lock size={12} />{t('designer.lockedBadge')}</span>}
            </div>
          </div>
          <div className="editor-document-actions flex items-center gap-2">
            <Button variant="ghost" className="h-9 gap-2" onClick={() => setMetadataOpen(true)}>{t('designer.metadata')}</Button>
            {id && templateData?.canManage && <Button variant="ghost" className="h-9 gap-2" onClick={() => setSaveHistoryOpen(true)}><History size={16} />{t('designer.history')}</Button>}
            {templateData?.isLocked && <>
              <Button variant="ghost" className="h-9 gap-2" onClick={copyTemplate}><Copy size={16} />{t('designer.copyToEdit')}</Button>
              {templateData.canManage && <Button className="h-9 gap-2" onClick={unlockTemplate} disabled={lockMutation.isPending}>{lockMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Unlock size={16} />}{t('designer.unlockToEdit')}</Button>}
            </>}

            <Button variant="ghost" className="h-9 gap-2 text-(--text-secondary) hover:text-(--text-primary)" onClick={handlePreview}>
              <Eye className="w-4 h-4" />
              {t('common.preview')}
            </Button>
            {!readOnly && <Button className="h-9 gap-2 bg-(--primary) text-white hover:opacity-90" onClick={handleSave} disabled={saving}>
              <Save className="w-4 h-4" />
              {saving ? t('designer.saving') : templateData?.canManage === false ? t('designer.saveCopy') : t('common.save')}
            </Button>}
          </div>
        </header>

        {/* Horizontal Tools Bar */}
        <div className="editor-toolbar h-12 px-4 flex items-center gap-2 bg-(--bg-primary) border-b border-(--border-color) shrink-0">
          <button
            onClick={() => setActiveTool('select')}
            className={cn(
              "h-9 px-3 rounded-lg flex items-center gap-2 transition-all text-sm font-medium",
              activeTool === 'select'
                ? "bg-(--primary) text-white shadow-md"
                : "text-(--text-secondary) hover:bg-(--bg-tertiary) hover:text-(--text-primary)"
            )}
          >
            <MousePointer2 className="w-4 h-4" />
            {t('common.select')}
          </button>

          <div className="w-px h-6 bg-(--border-color)" />

          <button
            disabled={readOnly}
            onClick={() => { setActiveTool('text'); addObject('text'); setTimeout(() => setActiveTool('select'), 200); }}
            className={cn(
              "h-9 px-3 rounded-lg flex items-center gap-2 transition-all text-sm font-medium",
              activeTool === 'text'
                ? "bg-(--primary) text-white shadow-md"
                : "text-(--text-secondary) hover:bg-(--bg-tertiary) hover:text-(--text-primary)"
            )}
          >
            <Type className="w-4 h-4" />
            {t('designer.text')}
          </button>

          <button
            disabled={readOnly}
            onClick={() => { setActiveTool('image'); addObject('image'); setTimeout(() => setActiveTool('select'), 200); }}
            className={cn(
              "h-9 px-3 rounded-lg flex items-center gap-2 transition-all text-sm font-medium",
              activeTool === 'image'
                ? "bg-(--primary) text-white shadow-md"
                : "text-(--text-secondary) hover:bg-(--bg-tertiary) hover:text-(--text-primary)"
            )}
          >
            <ImageIcon className="w-4 h-4" />
            {t('designer.image')}
          </button>

          <div className="w-px h-6 bg-(--border-color)" />

          <button
            disabled={readOnly}
            onClick={() => { setActiveTool('rect'); addObject('rect'); setTimeout(() => setActiveTool('select'), 200); }}
            className={cn(
              "h-9 w-9 rounded-lg flex items-center justify-center transition-all",
              activeTool === 'rect'
                ? "bg-(--primary) text-white shadow-md"
                : "text-(--text-secondary) hover:bg-(--bg-tertiary) hover:text-(--text-primary)"
            )}
            title={t('designer.rectangle')}
          >
            <Square className="w-4 h-4" />
          </button>

          <button
            disabled={readOnly}
            onClick={() => { setActiveTool('circle'); addObject('circle'); setTimeout(() => setActiveTool('select'), 200); }}
            className={cn(
              "h-9 w-9 rounded-lg flex items-center justify-center transition-all",
              activeTool === 'circle'
                ? "bg-(--primary) text-white shadow-md"
                : "text-(--text-secondary) hover:bg-(--bg-tertiary) hover:text-(--text-primary)"
            )}
            title={t('designer.circle')}
          >
            <Circle className="w-4 h-4" />
          </button>

          <button
            disabled={readOnly}
            onClick={() => { setActiveTool('triangle'); addObject('triangle'); setTimeout(() => setActiveTool('select'), 200); }}
            className={cn(
              "h-9 w-9 rounded-lg flex items-center justify-center transition-all",
              activeTool === 'triangle'
                ? "bg-(--primary) text-white shadow-md"
                : "text-(--text-secondary) hover:bg-(--bg-tertiary) hover:text-(--text-primary)"
            )}
            title={t('designer.triangle')}
          >
            <Triangle className="w-4 h-4" />
          </button>

          <div className="flex-1" />

          <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-(--bg-tertiary) border border-(--border-color)">
            <button
              className="p-1.5 rounded-md hover:bg-(--bg-secondary) transition-all text-(--text-secondary) disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              onClick={() => undo().then(() => syncLayersRef.current())}
              disabled={readOnly || !canUndo}
              title={t('designer.undoHint')}
            >
              <Undo className="w-4 h-4" />
            </button>
            <button
              className="p-1.5 rounded-md hover:bg-(--bg-secondary) transition-all text-(--text-secondary) disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              onClick={() => redo().then(() => syncLayersRef.current())}
              disabled={readOnly || !canRedo}
              title={t('designer.redoHint')}
            >
              <Redo className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-(--bg-tertiary) border border-(--border-color)">
            <button className="p-1 rounded-md hover:bg-(--bg-secondary) transition-all" aria-label={t('designer.zoomOut')} onClick={() => { setAutoFit(false); setZoom(Math.max(0.01, zoom - 0.1)); }}>
              <ZoomOut className="w-4 h-4 text-(--text-secondary)" />
            </button>
            <span className="text-xs font-bold w-10 text-center text-(--text-primary)">{Math.round(zoom * 100)}%</span>
            <button className="p-1 rounded-md hover:bg-(--bg-secondary) transition-all" aria-label={t('designer.zoomIn')} onClick={() => { setAutoFit(false); setZoom(Math.min(2, zoom + 0.1)); }}>
              <ZoomIn className="w-4 h-4 text-(--text-secondary)" />
            </button>
          </div>
          <button type="button" className="editor-fit-button" aria-label={t('designer.fit')} title={t('designer.fit')} onClick={() => { setAutoFit(true); setZoom(fitToView(canvasWidth, canvasHeight)); }}><Maximize2 size={16} /></button>
        </div>

        <main
          ref={containerRef}
          className="editor-canvas-area flex-1 overflow-auto bg-(--bg-tertiary) flex items-center justify-center relative"
        >
          <div className="absolute inset-0 bg-dot-pattern pointer-events-none opacity-30" />

          {!canvasReady && (
            <div className="absolute inset-0 flex items-center justify-center bg-(--bg-tertiary) z-30">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-4 border-(--primary) border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-(--text-secondary) font-medium animate-pulse">{t('designer.initializing')}</span>
              </div>
            </div>
          )}

          <div
            className={cn(
              "shadow-2xl rounded-lg overflow-hidden bg-white ring-1 ring-black/5 relative z-10",
              !canvasReady ? "opacity-0 invisible" : "opacity-100 visible"
            )}
            style={{
              width: canvasWidth * zoom,
              height: canvasHeight * zoom,
              padding: 0, flexShrink: 0
            }}
          >
            <canvas
              ref={canvasRef}
            />
          </div>

          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-4 px-4 py-2 rounded-full bg-black/60 text-white text-xs backdrop-blur-md z-20">
            <span>{canvasWidth} × {canvasHeight}px</span>
          </div>
        </main>
      </div>

      {/* Right Resize Divider */}
      <div
        className="editor-resizer w-1 shrink-0 bg-(--border-color) hover:bg-(--primary) active:bg-(--primary) cursor-col-resize transition-colors select-none"
        onMouseDown={(e) => {
          e.preventDefault();
          const startX = e.clientX;
          const startWidth = rightWidth;
          const onMove = (ev: MouseEvent) => {
            const newW = Math.min(600, Math.max(300, startWidth - (ev.clientX - startX)));
            setRightWidth(newW);
          };
          const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
          };
          window.addEventListener('mousemove', onMove);
          window.addEventListener('mouseup', onUp);
        }}
      />

      {/* Right Sidebar */}
      <aside
        style={{ width: rightWidth, minWidth: 300, maxWidth: 600, flexShrink: 0 }}
        className="editor-inspector bg-(--bg-primary) border-l border-(--border-color) flex flex-col overflow-hidden"
      >
        <div className="flex border-b border-(--border-color) p-1">
          <button
            className={cn("flex-1 py-2.5 text-xs font-bold rounded-lg transition-all", activePanel === 'properties' ? "bg-(--bg-secondary) text-(--primary) shadow-sm" : "text-(--text-tertiary) hover:text-(--text-secondary)")}
            onClick={() => setActivePanel('properties')}
          >
            {t('designer.properties')}
          </button>
          <button
            className={cn("flex-1 py-2.5 text-xs font-bold rounded-lg transition-all", activePanel === 'layers' ? "bg-(--bg-secondary) text-(--primary) shadow-sm" : "text-(--text-tertiary) hover:text-(--text-secondary)")}
            onClick={() => setActivePanel('layers')}
          >
            {t('designer.layers')}
          </button>
          <button
            className={cn("flex-1 py-2.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1", activePanel === 'ai' ? "bg-(--bg-secondary) text-(--primary) shadow-sm" : "text-(--text-tertiary) hover:text-(--text-secondary)")}
            onClick={() => setActivePanel('ai')}
          >
            <Sparkles className="w-3 h-3" />
            AI
          </button>
        </div>
        <div className="flex-1 overflow-auto p-1">
          {readOnly ? <div className="editor-readonly-panel"><Lock size={28} /><strong>{t('designer.readOnly')}</strong><p>{t('designer.readOnlyAIHint')}</p><div className="editor-readonly-layers">{layers.map(layer => <div key={layer.id}>{layer.name || layer.type}</div>)}</div></div> : <>

          {activePanel === 'properties' && (
            <PropertyPanel
              selectedObject={selectedObject}
              customFonts={customFonts}
              onPropertyChange={async (prop, val) => {
                if (readOnlyRef.current || !selectedObject || !canvas) return;

                // SPECIAL HANDLING: Poster Variant Switching
                // Allow if it is marked as poster OR if it is an image/rect that we are turning into a poster
                const canBePoster = (selectedObject as any).isPoster || selectedObject.type === 'image' || selectedObject.type === 'rect';

                if (prop === 'posterVar' && canBePoster) {
                  // val format: "postN" (e.g. "post1", "post5")
                  const match = val.match(/post(\d+)/);
                  if (match) {
                    const posterIndex = match[1];
                    const sampleUrl = getSamplePosterUrl(posterIndex, canvas);

                    try {
                      // CAPTURE STATE BEFORE LOADING
                      const currentWidth = selectedObject.getScaledWidth();
                      const currentHeight = selectedObject.getScaledHeight();
                      const { left, top, angle, opacity, originX, originY } = selectedObject;

                      const imgEl = document.createElement('img');
                      imgEl.crossOrigin = 'anonymous';
                      imgEl.src = sampleUrl;
                      await new Promise((resolve, reject) => {
                        imgEl.onload = resolve;
                        imgEl.onerror = reject;
                      });

                      // RACE CONDITION CHECK
                      if (readOnlyRef.current || !canvas || !canvas.getObjects().includes(selectedObject as any)) return;

                      // CREATE NEW TARGET OBJECT
                      const fabricImg = new fabric.FabricImage(imgEl, {
                        left, top, angle, opacity, originX, originY,
                        // Scale to match EXACTLY the previous visual dimensions
                        scaleX: currentWidth / (imgEl.naturalWidth || 1),
                        scaleY: currentHeight / (imgEl.naturalHeight || 1)
                      });

                      // MIGRATE PROPERTIES
                      (fabricImg as any).id = (selectedObject as any).id;
                      (fabricImg as any).name = (selectedObject as any).name || 'Poster';
                      (fabricImg as any).isPoster = true;
                      (fabricImg as any).posterVar = val;

                      // HANDLE CLIPPATH (Rounded Corners)
                      // logic: Preserving the VALID visual radius
                      let currentVisualRx = 0;
                      let currentVisualRy = 0;

                      if (selectedObject.type === 'rect') {
                        // For Rect, visual radius = rx * scaleX
                        const r = selectedObject as fabric.Rect;
                        currentVisualRx = (r.rx || 0) * (r.scaleX || 1);
                        currentVisualRy = (r.ry || 0) * (r.scaleY || 1);
                      } else if (selectedObject.clipPath && selectedObject.clipPath instanceof fabric.Rect) {
                        // For Image, visual radius = clipPath.rx * image.scaleX
                        // Note: clipPath usually has scaleX=1 relative to image content unscaled? 
                        // Fabric docs: clipPath is positioned/scaled relative to object center. 
                        // If clipPath has width=naturalWidth, it scales with the object.
                        const cp = selectedObject.clipPath as fabric.Rect;
                        currentVisualRx = (cp.rx || 0) * (selectedObject.scaleX || 1);
                        currentVisualRy = (cp.ry || 0) * (selectedObject.scaleY || 1);
                      }

                      // Apply to new object if radius > 0
                      if (currentVisualRx > 0 || currentVisualRy > 0) {
                        const effectiveScaleX = fabricImg.scaleX || 1;
                        const effectiveScaleY = fabricImg.scaleY || 1;

                        fabricImg.set('clipPath', new fabric.Rect({
                          width: imgEl.naturalWidth,
                          height: imgEl.naturalHeight,
                          // Calculate internal Rx needed to achieve the target Visual Rx
                          // internalRx * scaleX = visualRx  => internalRx = visualRx / scaleX
                          rx: currentVisualRx / effectiveScaleX,
                          ry: currentVisualRy / effectiveScaleY,
                          originX: 'center',
                          originY: 'center',
                        }));
                      }

                      // REPLACE IN CANVAS
                      const index = canvas.getObjects().indexOf(selectedObject);
                      if (index !== -1) {
                        canvas.remove(selectedObject);
                        canvas.insertAt(index, fabricImg);
                        canvas.setActiveObject(fabricImg);
                        setSelectedObject(fabricImg);

                        await applyPosterBackground(canvas, canvasWidth, canvasHeight);
                        canvas.renderAll();
                        saveToHistory();
                      }
                      return;
                    } catch (e) {
                      console.warn('Failed to load sample poster:', e);
                    }
                  }
                }

                // Special handling for clipPath (rounded corners)
                if (prop === 'rx_ry' && val) {
                  selectedObject.set('rx', val.rx);
                  selectedObject.set('ry', val.ry);
                } else if (prop === 'clipPath' && val) {
                  const clipRect = new fabric.Rect({
                    width: val.width,
                    height: val.height,
                    rx: val.rx,
                    ry: val.ry,
                    originX: 'center',
                    originY: 'center',
                  });
                  selectedObject.set('clipPath', clipRect);
                } else {
                  (selectedObject as any).set(prop, val);
                }

                canvas.renderAll();
                // Just pass the object as is; the state update below will trigger re-render
                setSelectedObject(selectedObject);
                setLayers([...layers]); // This triggers a re-render and syncs layer state
                saveToHistory();
              }}
              onDelete={() => {
                if (readOnlyRef.current || !selectedObject || !canvas) return;
                canvas.remove(selectedObject);
                canvas.discardActiveObject();
                canvas.renderAll();
                setSelectedObject(null);
                saveToHistory();
              }}
              onClone={async () => {
                if (readOnlyRef.current || !selectedObject || !canvas) return;
                const cloned = await selectedObject.clone();
                cloned.set({ left: (selectedObject.left || 0) + 20, top: (selectedObject.top || 0) + 20 });
                (cloned as any).id = Math.random().toString(36).substr(2, 9);
                canvas.add(cloned);
                canvas.setActiveObject(cloned);
                canvas.renderAll();
                saveToHistory();
              }}
            />
          )}
          {activePanel === 'layers' && (
            <LayerPanel
              layers={layers}
              selectedId={selectedObject?.id ?? null}
              onSelect={(id) => {
                const obj = canvas?.getObjects().find((o: any) => (o as any).id === id);
                if (obj) { canvas?.setActiveObject(obj); canvas?.renderAll(); }
              }}
              onToggleVisibility={(id) => {
                const obj = canvas?.getObjects().find((o: any) => (o as any).id === id);
                if (obj) { obj.visible = !obj.visible; canvas?.renderAll(); syncLayers(); }
              }}
              onToggleLock={(id) => {
                const obj = canvas?.getObjects().find((o: any) => (o as any).id === id);
                if (obj) {
                  const isLocked = !obj.lockMovementX;
                  obj.set({
                    lockMovementX: isLocked,
                    lockMovementY: isLocked,
                    lockScalingX: isLocked,
                    lockScalingY: isLocked,
                    lockRotation: isLocked,
                    selectable: !isLocked,
                    evented: !isLocked
                  });
                  canvas?.renderAll();
                  syncLayers();
                }
              }}
              onReorder={(id, direction) => {
                const obj = canvas?.getObjects().find((o: any) => (o as any).id === id);
                if (obj && canvas) {
                  if (direction === 'up') canvas.bringObjectForward(obj);
                  else canvas.sendObjectBackwards(obj);
                  canvas.renderAll();
                  syncLayers();
                }
              }}
              onRename={(id, name) => {
                const obj = canvas?.getObjects().find((o: any) => (o as any).id === id);
                if (obj) {
                  (obj as any).name = name;
                  syncLayers();
                }
              }}
              onMove={(fromIndex, toIndex) => {
                if (!canvas) return;
                // 'layers' is reversed (index 0 = top).
                // Fabric objects (index 0 = bottom).
                const total = layers.length;

                // Convert UI indices to Fabric indices
                // UI: 0(Top) -> N-1(Bottom)
                // Fabric: N-1(Top) -> 0(Bottom)
                const fabricFromIndex = total - 1 - fromIndex;
                const fabricToIndex = total - 1 - toIndex;

                const obj = canvas.item(fabricFromIndex);
                if (obj) {
                  canvas.moveObjectTo(obj, fabricToIndex);
                  canvas.renderAll();
                  syncLayers();
                  saveToHistory();
                }
              }}
            />
          )}
          <div style={{ display: activePanel === 'ai' ? 'flex' : 'none', flexDirection: 'column', height: '100%' }}>
            <AIChatPanel width={canvasWidth} height={canvasHeight} onApplied={() => syncLayersRef.current()} />
          </div>
          </>}
        </div>

      </aside>

      {drafts.pendingDraft && !readOnly && <div role="dialog" aria-label={t('designer.restoreDraftTitle')} style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 100, padding: 20, background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: 12, boxShadow: '0 8px 30px #0004' }}>
        <p>{t('designer.restoreDraftHint', { time: formatDisplayDate(drafts.pendingDraft.savedAt, i18n.language, { dateStyle: 'medium', timeStyle: 'short' }) || t('common.unknownTime') })}</p>
        <Button onClick={restoreDraft}>{t('designer.restoreDraft')}</Button><Button variant="ghost" onClick={drafts.discardDraft}>{t('designer.discardDraft')}</Button>
      </div>}
      <TemplateMetadata open={metadataOpen} onOpenChange={setMetadataOpen} value={details} onApply={setDetails} readOnly={readOnly} />
      {id && templateData?.canManage && <TemplateHistory id={id} open={saveHistoryOpen} onOpenChange={setSaveHistoryOpen} locked={templateData.isLocked} saving={saving} />}

      {/* Preview Modal */}
      {previewOpen && (
        <div role="dialog" aria-modal="true" aria-label={t('common.preview')} className="fixed inset-0 z-[201] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in p-4">
          <div className="relative w-full max-w-4xl max-h-full bg-(--bg-primary) rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-(--border-color)">
            <div className="flex items-center justify-between p-4 border-b border-(--border-color) shrink-0">
              <h3 className="font-bold text-(--text-primary)">{t('common.preview')}</h3>
              <button
                aria-label={t('common.close')}
                onClick={() => setPreviewOpen(false)}
                className="w-8 h-8 rounded-lg bg-(--bg-tertiary) hover:bg-(--bg-secondary) flex items-center justify-center transition-all"
              >
                <X className="w-4 h-4 text-(--text-secondary)" />
              </button>
            </div>
            <div className="flex-1 min-h-0 w-full flex items-center justify-center p-6 bg-black/20">
              {previewImage && (
                <img
                  src={previewImage}
                  alt={t('common.preview')}
                  className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
                  style={{ width: 'auto', height: 'auto' }}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
