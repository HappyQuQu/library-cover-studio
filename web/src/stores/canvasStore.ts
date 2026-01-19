import { create } from 'zustand';
import * as fabric from 'fabric';

interface CanvasObject {
  id: string;
  type: string;
  data: any;
}

interface CanvasState {
  canvas: fabric.Canvas | null;
  selectedObject: fabric.FabricObject | null;
  objects: CanvasObject[];
  history: string[];
  historyIndex: number;
  zoom: number;

  setCanvas: (canvas: fabric.Canvas | null) => void;
  setSelectedObject: (obj: fabric.FabricObject | null) => void;
  addObject: (obj: CanvasObject) => void;
  removeObject: (id: string) => void;
  updateObject: (id: string, data: any) => void;
  setZoom: (zoom: number) => void;
  saveToHistory: () => void;
  undo: () => void;
  redo: () => void;
  clearCanvas: () => void;
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  canvas: null,
  selectedObject: null,
  objects: [],
  history: [],
  historyIndex: -1,
  zoom: 1,

  setCanvas: (canvas) => set({ canvas }),

  setSelectedObject: (obj) => set({ selectedObject: obj }),

  addObject: (obj) => {
    set((state) => ({
      objects: [...state.objects, obj]
    }));
    get().saveToHistory();
  },

  removeObject: (id) => {
    set((state) => ({
      objects: state.objects.filter((o) => o.id !== id)
    }));
    get().saveToHistory();
  },

  updateObject: (id, data) => {
    set((state) => ({
      objects: state.objects.map((o) =>
        o.id === id ? { ...o, data: { ...o.data, ...data } } : o
      )
    }));
  },

  setZoom: (zoom) => set({ zoom }),

  saveToHistory: () => {
    const { canvas, history, historyIndex } = get();
    if (canvas) {
      // Include background and custom properties in the saved JSON
      const json = JSON.stringify((canvas as any).toJSON(['id', 'posterVar', 'isPoster', 'randomOnGeneration']));
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(json);
      set({
        history: newHistory,
        historyIndex: newHistory.length - 1
      });
    }
  },

  undo: async () => {
    const { canvas, history, historyIndex } = get();
    if (canvas && historyIndex > 0) {
      const newIndex = historyIndex - 1;
      set({ historyIndex: newIndex });
      await canvas.loadFromJSON(JSON.parse(history[newIndex]));
      canvas.renderAll();
    }
  },

  redo: async () => {
    const { canvas, history, historyIndex } = get();
    if (canvas && historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      set({ historyIndex: newIndex });
      await canvas.loadFromJSON(JSON.parse(history[newIndex]));
      canvas.renderAll();
    }
  },

  clearCanvas: () => {
    const { canvas } = get();
    if (canvas) {
      canvas.clear();
      set({
        objects: [],
        selectedObject: null
      });
      get().saveToHistory();
    }
  }
}));
