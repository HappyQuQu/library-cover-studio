import { create } from 'zustand';
import * as fabric from 'fabric';
import { CANVAS_PROPERTIES } from '@/lib/aiDesign';

/**
 * Fabric.js 6 的 loadFromJSON 会把 gradient background 赋值为 plain object 而非 Gradient 实例，
 * 导致 canvas 渲染时 ctx.fillStyle = "[object Object]" 无效 → 背景消失。
 * 此函数在 loadFromJSON 之后补丁修复。
 */
async function reapplyBackground(canvas: fabric.Canvas, json: any) {
  (canvas as any).randomOnGeneration = Boolean(json.randomOnGeneration);
  (canvas as any).randomBackgroundStyle = json.randomBackgroundStyle;
  // 修复 gradient backgroundColor
  const bg = (canvas as any).backgroundColor;
  if (bg && typeof bg === 'object' && !(bg instanceof fabric.Gradient)) {
    try {
      (canvas as any).backgroundColor = new fabric.Gradient(json.background);
    } catch {
      // 构造失败就重置为白色，至少不会崩溃
      (canvas as any).backgroundColor = '#ffffff';
    }
  }
  // 修复 backgroundImage 未加载的情况
  if (json.backgroundImage && !(canvas as any).backgroundImage) {
    try {
      const img = await fabric.FabricImage.fromObject(json.backgroundImage);
      (canvas as any).backgroundImage = img;
    } catch { /* ignore */ }
  }
}

interface CanvasState {
  canvas: fabric.Canvas | null;
  selectedObject: fabric.FabricObject | null;
  history: string[];
  historyIndex: number;
  zoom: number;
  isRestoring: boolean; // 正在执行撤销/重做，阻止事件触发 saveToHistory
  readOnly: boolean;
  setReadOnly: (readOnly: boolean) => void;

  setCanvas: (canvas: fabric.Canvas | null) => void;
  setSelectedObject: (obj: fabric.FabricObject | null) => void;
  setZoom: (zoom: number) => void;
  setIsRestoring: (isRestoring: boolean) => void;
  saveToHistory: () => void;
  resetHistory: (snapshot?: any) => void;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  clearCanvas: () => void;
  applyCanvasJSON: (json: any) => Promise<void>;
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  canvas: null,
  selectedObject: null,
  history: [],
  historyIndex: -1,
  zoom: 1,
  isRestoring: false,
  readOnly: false,
  setReadOnly: (readOnly) => set({ readOnly }),

  setCanvas: (canvas) => set({ canvas, selectedObject: null }),

  setSelectedObject: (obj) => set({ selectedObject: obj }),

  setZoom: (zoom) => set({ zoom }),

  setIsRestoring: (isRestoring) => set({ isRestoring }),

  saveToHistory: () => {
    const { canvas, history, historyIndex, isRestoring } = get();
    // 正在撤销/重做时不保存历史，避免 object:added 事件覆盖历史
    if (isRestoring || !canvas) return;

    // toJSON 会自动包含 backgroundImage，传入自定义属性确保对象级别的属性也被序列化
    const json = JSON.stringify(canvas.toObject(CANVAS_PROPERTIES));
    if (history[historyIndex] === json) return;
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(json);
    // 最多保留 50 步历史，避免内存占用过大
    if (newHistory.length > 50) newHistory.shift();
    set({
      history: newHistory,
      historyIndex: newHistory.length - 1
    });
  },

  resetHistory: (snapshot) => {
    const { canvas } = get();
    if (!canvas) return;

    const json = JSON.stringify(snapshot ?? canvas.toObject(CANVAS_PROPERTIES));
    set({
      history: [json],
      historyIndex: 0
    });
  },

  undo: async () => {
    if (get().readOnly) return;
    const { canvas, history, historyIndex } = get();
    if (!canvas || historyIndex <= 0) return;

    const newIndex = historyIndex - 1;
    const parsed = JSON.parse(history[newIndex]);
    set({ isRestoring: true, historyIndex: newIndex });
    try {
      await canvas.loadFromJSON(parsed);
      await reapplyBackground(canvas, parsed);
      canvas.discardActiveObject();
      set({ selectedObject: null });
      canvas.renderAll();
    } finally {
      set({ isRestoring: false });
    }
  },

  redo: async () => {
    if (get().readOnly) return;
    const { canvas, history, historyIndex } = get();
    if (!canvas || historyIndex >= history.length - 1) return;

    const newIndex = historyIndex + 1;
    const parsed = JSON.parse(history[newIndex]);
    set({ isRestoring: true, historyIndex: newIndex });
    try {
      await canvas.loadFromJSON(parsed);
      await reapplyBackground(canvas, parsed);
      canvas.discardActiveObject();
      set({ selectedObject: null });
      canvas.renderAll();
    } finally {
      set({ isRestoring: false });
    }
  },

  clearCanvas: () => {
    if (get().readOnly) return;
    const { canvas } = get();
    if (canvas) {
      canvas.clear();
      set({ selectedObject: null });
      get().saveToHistory();
    }
  },

  // 从 AI 生成结果等外部 JSON 应用到画布，保证历史正确且不被 object:added 覆盖
  applyCanvasJSON: async (json: any) => {
    if (get().readOnly) throw new Error('模板已锁定，请先解锁再编辑');
    const { canvas } = get();
    if (!canvas) return;
    const original = canvas.toObject(CANVAS_PROPERTIES);
    get().saveToHistory();
    set({ isRestoring: true });
    try {
      await canvas.loadFromJSON(json);
      await reapplyBackground(canvas, json);
      canvas.discardActiveObject();
      set({ selectedObject: null });
      canvas.renderAll();
    } catch (error) {
      await canvas.loadFromJSON(original);
      await reapplyBackground(canvas, original);
      canvas.renderAll();
      throw error;
    } finally {
      set({ isRestoring: false });
    }
    get().saveToHistory();
  }
}));
