import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Undo, Redo, Save, ArrowLeft, ZoomIn, ZoomOut, Eye, Edit, MousePointer2, Type, Image as ImageIcon, Square, Circle, Triangle, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useCanvasStore } from '@/stores/canvasStore';
import { useTemplate, useCreateTemplate, useUpdateTemplate } from '@/api';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import * as fabric from 'fabric';

// Modular Components
import { PropertyPanel } from '@/components/editor/PropertyPanel';
import { LayerPanel } from '@/components/editor/LayerPanel';
import { ToolboxPanel } from '@/components/editor/ToolboxPanel';
import { apiClient } from '@/api/client';

interface Font {
  filename: string;
  name: string;
  url: string;
}

export function EditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [templateName, setTemplateName] = useState('');
  const [activeTool, setActiveTool] = useState('select');
  const [activePanel, setActivePanel] = useState<'properties' | 'layers'>('properties');
  const [layers, setLayers] = useState<any[]>([]);
  const [canvasWidth, setCanvasWidth] = useState(1920);
  const [canvasHeight, setCanvasHeight] = useState(1080);
  const [canvasReady, setCanvasReady] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [customFonts, setCustomFonts] = useState<Font[]>([]);

  const [randomOnGeneration, setRandomOnGeneration] = useState(false);

  const {
    canvas, setCanvas, selectedObject, setSelectedObject,
    zoom, setZoom, undo, redo, saveToHistory
  } = useCanvasStore();

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

        const baseUrl = import.meta.env.VITE_API_URL || '';
        const fontRules = fonts.map(font => {
          const fontUrl = font.url.startsWith('http') ? font.url : `${baseUrl}${font.url}`;
          return `
            @font-face {
              font-family: "${font.name}";
              src: url("${fontUrl}");
              font-display: swap;
            }
          `;
        }).join('\n');

        styleEl.textContent = fontRules;

        // Wait for fonts to load
        if (fonts.length > 0) {
          // @ts-ignore
          document.fonts.ready.then(() => {
            if (canvas) canvas.renderAll();
          });
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
  const createMutation = useCreateTemplate();
  const updateMutation = useUpdateTemplate();

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
        name: obj.name || `${obj.type}`,
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

    fabricCanvas.on('object:added', () => { syncLayersRef.current(); saveToHistoryRef.current(); });
    fabricCanvas.on('object:removed', () => { syncLayersRef.current(); saveToHistoryRef.current(); });
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

  // Load template data when available
  useEffect(() => {
    const defaultW = 1920;
    const defaultH = 1080;

    // Helper to calculate fit-to-view zoom
    const fitToView = (w: number, h: number) => {
      if (!containerRef.current) return 0.5;
      const container = containerRef.current;
      const padding = 120; // Room for margins
      const availableWidth = container.clientWidth - padding;
      const availableHeight = container.clientHeight - padding;

      const scaleX = availableWidth / w;
      const scaleY = availableHeight / h;
      const newZoom = Math.min(scaleX, scaleY, 1);
      return Math.floor(newZoom * 10) / 10;
    };

    // Basic initialization
    if (canvas && !id) {
      setCanvasWidth(defaultW);
      setCanvasHeight(defaultH);
      const initialZoom = fitToView(defaultW, defaultH);
      canvas.setDimensions({
        width: defaultW * initialZoom,
        height: defaultH * initialZoom
      });
      canvas.setZoom(initialZoom);
      setZoom(initialZoom);
      setCanvasReady(true);
      return;
    }

    if (!canvas || !templateData) return;

    const loadTemplate = async () => {
      setTemplateName(templateData.name || '');
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
          await canvas.loadFromJSON(jsonData);

          // Restore randomOnGeneration setting
          if (jsonData.randomOnGeneration) {
            setRandomOnGeneration(true);
            (canvas as any).randomOnGeneration = true;
          }

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
              }
            });
          }
          // Restore dimensions and zoom after JSON load as it might overwrite it
          canvas.setDimensions({
            width: width * currentZoom,
            height: height * currentZoom
          });
          canvas.setZoom(currentZoom);
          canvas.renderAll();
          syncLayersRef.current();
        } catch (err) {
          console.error('Failed to load canvas JSON:', err);
        }
      }
      setCanvasReady(true);
    };

    loadTemplate();
  }, [canvas, templateData, id, setZoom]);

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
        undo();
        e.preventDefault();
      }

      // Ctrl+Shift+Z or Ctrl+Y - Redo
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        redo();
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canvas, saveToHistory, undo, redo]);
  const addObject = useCallback(async (type: string, payload?: any) => {
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
        const text = new fabric.IText(t('designer.sampleText', '双击编辑文字'), {
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
        const pathData = 'M 0 0 L 110 0 L 110 -20 L 150 0 L 110 20 L 110 0 Z';
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
            toast({ title: t('common.error'), description: '无法加载海报图片', variant: 'destructive' });
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
    if (obj) {
      canvas.add(obj);
      canvas.setActiveObject(obj);
      canvas.renderAll();
    }
  }, [canvas, t]);

  const handleSave = async () => {
    if (!canvas) return;

    // Deselect for clean export
    canvas.discardActiveObject();
    canvas.renderAll();

    // Store current state
    const currentZoom = canvas.getZoom();
    const currentWidth = canvas.getWidth();
    const currentHeight = canvas.getHeight();

    // Temporarily reset to full size for thumbnail
    canvas.setZoom(1);
    canvas.setDimensions({ width: canvasWidth, height: canvasHeight });
    canvas.renderAll();

    // Generate thumbnail (scaled down for storage)
    const thumbnailDataUrl = canvas.toDataURL({
      format: 'jpeg',
      quality: 0.7,
      multiplier: 0.2 // 20% of original size for thumbnail
    });

    // Restore dimensions
    canvas.setZoom(currentZoom);
    canvas.setDimensions({ width: currentWidth, height: currentHeight });
    canvas.renderAll();

    // Serialize canvas with custom properties
    // IMPORTANT: Include 'randomOnGeneration' in the export
    const canvasData = canvas.toObject(['randomOnGeneration']);
    canvasData.objects = canvasData.objects.map((obj: any, index: number) => {
      const fabricObj = canvas.getObjects()[index] as any;
      return {
        ...obj,
        id: fabricObj.id,
        name: fabricObj.name,
        posterVar: fabricObj.posterVar,
        isPoster: fabricObj.isPoster
      };
    });
    const canvasJson = JSON.stringify(canvasData);
    try {
      if (id) {
        await updateMutation.mutateAsync({ id, name: templateName, canvasJson, width: canvasWidth, height: canvasHeight, thumbnail: thumbnailDataUrl });
      } else {
        const result = await createMutation.mutateAsync({
          name: templateName || t('designer.newTemplate'), canvasJson, width: canvasWidth, height: canvasHeight, thumbnail: thumbnailDataUrl
        });
        navigate(`/editor/${result.id}`, { replace: true });
      }
      toast({ title: t('common.success'), description: t('designer.saveSuccessMsg', '设计已成功保存') });
    } catch (error) {
      toast({ title: t('common.error'), variant: 'destructive' });
    }
  };

  // Change background
  const changeBackground = useCallback((bg: any) => {
    if (!canvas) {
      console.log('Canvas not ready for background change');
      return;
    }

    // Handle random generation flag
    if (bg.randomOnGeneration !== undefined) {
      setRandomOnGeneration(bg.randomOnGeneration);
      (canvas as any).randomOnGeneration = bg.randomOnGeneration;
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

    if (bg.type === 'color') {
      canvas.backgroundColor = bg.color;
    } else if (bg.type === 'gradient') {
      const coords = getGradientCoords(bg.direction);
      // Calculate color stops based on intensity
      // intensity 0 = soft blend (0% to 100%)
      // intensity 100 = sharp transition (nearly solid colors meeting in middle)
      const intensity = bg.intensity ?? 50;
      const midStart = (50 - intensity / 2) / 100;
      const midEnd = (50 + intensity / 2) / 100;
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
    } else if (bg.type === 'random-gradient') {
      const h1 = Math.floor(Math.random() * 360);
      const s1 = Math.floor(40 + Math.random() * 40);
      const l1 = Math.floor(35 + Math.random() * 30);
      const h2 = Math.floor(Math.random() * 360);
      const s2 = Math.floor(40 + Math.random() * 40);
      const l2 = Math.floor(35 + Math.random() * 30);
      const color1 = `hsl(${h1},${s1}%,${l1}%)`;
      const color2 = `hsl(${h2},${s2}%,${l2}%)`;
      const coords = getGradientCoords(bg.direction);
      // Apply intensity
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
    }
    canvas.renderAll();
    saveToHistory();
  }, [canvas, saveToHistory]);

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
    <div className="flex -mx-6 -mb-6 bg-(--bg-secondary) overflow-hidden" style={{ height: 'calc(100vh - 56px - 48px)' }}>
      {/* Left - Toolbox Panel */}
      <aside className="w-[280px] shrink-0 bg-(--bg-primary) border-r border-(--border-color) overflow-hidden">
        <ToolboxPanel
          onAddText={() => addObject('text')}
          onAddImage={() => addObject('image')}
          onAddShape={(type, payload) => addObject(type, payload)}
          onChangeBackground={changeBackground}
          initialRandomOnGeneration={randomOnGeneration}
        />
      </aside>

      {/* Center - Canvas Area (Flexible) */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header Bar */}
        <header className="h-14 px-6 flex items-center justify-between bg-(--bg-primary) border-b border-(--border-color) shrink-0">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/templates')} className="p-2 rounded-lg hover:bg-(--bg-tertiary) transition-all text-(--text-secondary) hover:text-(--primary)">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder={t('designer.newTemplate')}
                className="bg-transparent text-lg font-bold text-(--text-primary) focus:outline-none focus:border-b-2 focus:border-(--primary) transition-all"
              />
              <Edit className="w-4 h-4 text-(--text-tertiary)" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" className="h-9 gap-2 text-(--text-secondary) hover:text-(--text-primary)" onClick={handlePreview}>
              <Eye className="w-4 h-4" />
              {t('common.preview')}
            </Button>
            <Button className="h-9 gap-2 bg-(--primary) text-white hover:opacity-90" onClick={handleSave}>
              <Save className="w-4 h-4" />
              {t('common.save')}
            </Button>
          </div>
        </header>

        {/* Horizontal Tools Bar */}
        <div className="h-12 px-4 flex items-center gap-2 bg-(--bg-primary) border-b border-(--border-color) shrink-0">
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
            {t('common.select', '选择')}
          </button>

          <div className="w-px h-6 bg-(--border-color)" />

          <button
            onClick={() => { setActiveTool('text'); addObject('text'); setTimeout(() => setActiveTool('select'), 200); }}
            className={cn(
              "h-9 px-3 rounded-lg flex items-center gap-2 transition-all text-sm font-medium",
              activeTool === 'text'
                ? "bg-(--primary) text-white shadow-md"
                : "text-(--text-secondary) hover:bg-(--bg-tertiary) hover:text-(--text-primary)"
            )}
          >
            <Type className="w-4 h-4" />
            文字
          </button>

          <button
            onClick={() => { setActiveTool('image'); addObject('image'); setTimeout(() => setActiveTool('select'), 200); }}
            className={cn(
              "h-9 px-3 rounded-lg flex items-center gap-2 transition-all text-sm font-medium",
              activeTool === 'image'
                ? "bg-(--primary) text-white shadow-md"
                : "text-(--text-secondary) hover:bg-(--bg-tertiary) hover:text-(--text-primary)"
            )}
          >
            <ImageIcon className="w-4 h-4" />
            图片
          </button>

          <div className="w-px h-6 bg-(--border-color)" />

          <button
            onClick={() => { setActiveTool('rect'); addObject('rect'); setTimeout(() => setActiveTool('select'), 200); }}
            className={cn(
              "h-9 w-9 rounded-lg flex items-center justify-center transition-all",
              activeTool === 'rect'
                ? "bg-(--primary) text-white shadow-md"
                : "text-(--text-secondary) hover:bg-(--bg-tertiary) hover:text-(--text-primary)"
            )}
            title="矩形"
          >
            <Square className="w-4 h-4" />
          </button>

          <button
            onClick={() => { setActiveTool('circle'); addObject('circle'); setTimeout(() => setActiveTool('select'), 200); }}
            className={cn(
              "h-9 w-9 rounded-lg flex items-center justify-center transition-all",
              activeTool === 'circle'
                ? "bg-(--primary) text-white shadow-md"
                : "text-(--text-secondary) hover:bg-(--bg-tertiary) hover:text-(--text-primary)"
            )}
            title="圆形"
          >
            <Circle className="w-4 h-4" />
          </button>

          <button
            onClick={() => { setActiveTool('triangle'); addObject('triangle'); setTimeout(() => setActiveTool('select'), 200); }}
            className={cn(
              "h-9 w-9 rounded-lg flex items-center justify-center transition-all",
              activeTool === 'triangle'
                ? "bg-(--primary) text-white shadow-md"
                : "text-(--text-secondary) hover:bg-(--bg-tertiary) hover:text-(--text-primary)"
            )}
            title="三角形"
          >
            <Triangle className="w-4 h-4" />
          </button>

          <div className="flex-1" />

          <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-(--bg-tertiary) border border-(--border-color)">
            <button className="p-1.5 rounded-md hover:bg-(--bg-secondary) transition-all text-(--text-secondary)" onClick={undo} title={t('designer.undoHint')}>
              <Undo className="w-4 h-4" />
            </button>
            <button className="p-1.5 rounded-md hover:bg-(--bg-secondary) transition-all text-(--text-secondary)" onClick={redo} title={t('designer.redoHint')}>
              <Redo className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-(--bg-tertiary) border border-(--border-color)">
            <button className="p-1 rounded-md hover:bg-(--bg-secondary) transition-all" onClick={() => setZoom(Math.max(0.1, zoom - 0.1))}>
              <ZoomOut className="w-4 h-4 text-(--text-secondary)" />
            </button>
            <span className="text-xs font-bold w-10 text-center text-(--text-primary)">{Math.round(zoom * 100)}%</span>
            <button className="p-1 rounded-md hover:bg-(--bg-secondary) transition-all" onClick={() => setZoom(Math.min(2, zoom + 0.1))}>
              <ZoomIn className="w-4 h-4 text-(--text-secondary)" />
            </button>
          </div>
        </div>

        <main
          ref={containerRef}
          className="flex-1 overflow-auto bg-(--bg-tertiary) flex items-center justify-center p-8 relative"
        >
          <div className="absolute inset-0 bg-dot-pattern pointer-events-none opacity-30" />

          {!canvasReady && (
            <div className="absolute inset-0 flex items-center justify-center bg-(--bg-tertiary) z-30">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-4 border-(--primary) border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-(--text-secondary) font-medium animate-pulse">正在初始化画布...</span>
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
              padding: 0
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

      {/* Right Sidebar */}
      <aside className="w-[280px] shrink-0 bg-(--bg-primary) border-l border-(--border-color) flex flex-col overflow-hidden">
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
        </div>
        <div className="flex-1 overflow-auto p-1">
          {activePanel === 'properties' && (
            <PropertyPanel
              selectedObject={selectedObject}
              customFonts={customFonts}
              onPropertyChange={async (prop, val) => {
                if (!selectedObject || !canvas) return;

                // SPECIAL HANDLING: Poster Variant Switching
                // Allow if it is marked as poster OR if it is an image/rect that we are turning into a poster
                const canBePoster = (selectedObject as any).isPoster || selectedObject.type === 'image' || selectedObject.type === 'rect';

                if (prop === 'posterVar' && canBePoster) {
                  // val format: "postN" (e.g. "post1", "post5")
                  const match = val.match(/post(\d+)/);
                  if (match) {
                    const posterIndex = match[1];
                    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
                    const sampleUrl = `${baseUrl}/templates/posters/${posterIndex}.jpg`;

                    try {
                      // CAPTURE STATE BEFORE LOADING
                      const currentWidth = selectedObject.getScaledWidth();
                      const currentHeight = selectedObject.getScaledHeight();
                      const { left, top, angle, opacity, originX, originY } = selectedObject;

                      const imgEl = document.createElement('img');
                      imgEl.src = sampleUrl;
                      imgEl.crossOrigin = 'anonymous';
                      await new Promise((resolve, reject) => {
                        imgEl.onload = resolve;
                        imgEl.onerror = reject;
                      });

                      // RACE CONDITION CHECK
                      if (!canvas || !canvas.getObjects().includes(selectedObject as any)) return;

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
                if (prop === 'clipPath' && val) {
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
                if (!selectedObject || !canvas) return;
                canvas.remove(selectedObject);
                canvas.discardActiveObject();
                canvas.renderAll();
                setSelectedObject(null);
                saveToHistory();
              }}
              onClone={async () => {
                if (!selectedObject || !canvas) return;
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
        </div>

      </aside>

      {/* Preview Modal */}
      {previewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in p-4">
          <div className="relative w-full max-w-4xl max-h-full bg-(--bg-primary) rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-(--border-color)">
            <div className="flex items-center justify-between p-4 border-b border-(--border-color) shrink-0">
              <h3 className="font-bold text-(--text-primary)">{t('common.preview')}</h3>
              <button
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
                  alt="Preview"
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
