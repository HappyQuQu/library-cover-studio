import { useState } from 'react';
import { Layers, Eye, EyeOff, Lock, Unlock, ChevronUp, ChevronDown, GripVertical } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface LayerPanelProps {
  layers: any[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggleVisibility: (id: string) => void;
  onToggleLock: (id: string) => void;
  onReorder: (id: string, direction: 'up' | 'down') => void;
  onRename: (id: string, name: string) => void;
  onMove?: (dragIndex: number, hoverIndex: number) => void;
}

export function LayerPanel({
  layers,
  selectedId,
  onSelect,
  onToggleVisibility,
  onToggleLock,
  onReorder,
  onRename,
  onMove
}: LayerPanelProps) {
  const { t } = useTranslation();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
    // Set a transparent drag image if desired, or let browser handle it
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault(); // Necessary to allow dropping
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) return;

    if (onMove) {
      onMove(draggedIndex, dropIndex);
    }
    setDraggedIndex(null);
  };

  return (
    <div className="flex flex-col h-full animate-fade-in p-2">
      <div className="flex items-center justify-between p-3 mb-2 rounded-lg bg-(--bg-tertiary)/50 border border-(--border-color)">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-(--primary)" />
          <span className="text-xs font-bold text-(--text-secondary)">{t('designer.layers', '图层')}</span>
        </div>
        <span className="text-[10px] bg-(--bg-glass) px-1.5 py-0.5 rounded text-(--text-tertiary) font-mono shadow-sm">
          {layers.length}
        </span>
      </div>

      <div className="flex-1 overflow-auto space-y-1 pr-1">
        {layers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-center px-4">
            <p className="text-[12px] text-(--text-tertiary)">{t('designer.noLayers', '暂无图层')}</p>
          </div>
        ) : (
          layers.map((layer, index) => {
            const isSelected = selectedId === layer.id;
            const isDragging = draggedIndex === index;

            return (
              <div
                key={layer.id}
                draggable
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={(e) => handleDrop(e, index)}
                onClick={() => onSelect(layer.id)}
                className={cn(
                  "group flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-all border border-transparent duration-200",
                  isSelected
                    ? "bg-white shadow-sm border-(--primary)/20 shadow-glow"
                    : "hover:bg-white/60 hover:shadow-sm hover:border-(--border-color)",
                  isDragging ? "opacity-30 border-dashed border-(--primary) scale-95" : "hover:scale-[1.01]"
                )}
              >
                {/* Drag Handle (Visual) */}
                <div className="text-(--text-tertiary)/30 group-hover:text-(--text-tertiary) cursor-grab active:cursor-grabbing">
                  <GripVertical className="w-3.5 h-3.5 result-handle" />
                </div>

                {/* Layer Preview / Icon */}
                <div className="w-8 h-8 rounded-md bg-(--bg-tertiary) flex items-center justify-center border border-(--border-color) overflow-hidden shrink-0">
                  {/* Ideally fetch preview here, for now rely on type */}
                  <span className="text-[9px] font-mono text-(--text-tertiary) uppercase">{layer.type.slice(0, 2)}</span>
                </div>

                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  {editingId === layer.id ? (
                    <input
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onBlur={() => {
                        onRename(layer.id, editingName);
                        setEditingId(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          onRename(layer.id, editingName);
                          setEditingId(null);
                        }
                        if (e.key === 'Escape') {
                          setEditingId(null);
                        }
                      }}
                      autoFocus
                      className="text-[12px] font-medium bg-transparent border-b border-(--primary) outline-none text-(--text-primary) w-full"
                    />
                  ) : (
                    <div
                      className={cn(
                        "text-[12px] font-medium truncate transition-colors cursor-text",
                        isSelected ? "text-(--primary)" : "text-(--text-primary)"
                      )}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        setEditingId(layer.id);
                        setEditingName(layer.name || (layer.type === 'i-text' ? 'Text' : layer.type));
                      }}
                    >
                      {layer.name || (layer.type === 'i-text' ? 'Text' : layer.type)}
                    </div>
                  )}
                </div>

                {/* Quick Actions */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => { e.stopPropagation(); onToggleLock(layer.id); }}
                    className={cn(
                      "p-1.5 rounded-md transition-colors",
                      layer.locked ? "text-(--accent) bg-(--accent)/10" : "text-(--text-tertiary) hover:bg-(--bg-tertiary) hover:text-(--text-secondary)"
                    )}
                  >
                    {layer.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onToggleVisibility(layer.id); }}
                    className={cn(
                      "p-1.5 rounded-md transition-colors",
                      !layer.visible ? "text-(--text-tertiary) opacity-50" : "text-(--text-tertiary) hover:bg-(--bg-tertiary) hover:text-(--text-secondary)"
                    )}
                  >
                    {layer.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  </button>
                  <div className="flex flex-col gap-0.5 ml-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); onReorder(layer.id, 'up'); }}
                      disabled={index === 0}
                      className="p-0.5 text-(--text-tertiary) hover:text-(--primary) disabled:opacity-0"
                    >
                      <ChevronUp className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onReorder(layer.id, 'down'); }}
                      disabled={index === layers.length - 1}
                      className="p-0.5 text-(--text-tertiary) hover:text-(--primary) disabled:opacity-0"
                    >
                      <ChevronDown className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
