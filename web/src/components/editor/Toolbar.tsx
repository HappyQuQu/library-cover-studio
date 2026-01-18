import { MousePointer2, Type as TypeIcon, Square, Circle, Image as ImageIcon, Palette, Wand2, Triangle, Star, ChevronDown, Plus, Brush, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useState } from 'react';

interface ToolbarProps {
  activeTool: string;
  onToolClick: (toolId: string) => void;
}

export function Toolbar({ activeTool, onToolClick }: ToolbarProps) {
  const { t } = useTranslation();
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    background: true,
    elements: true,
  });

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const shapes = [
    { id: 'rect', icon: Square, label: '矩形' },
    { id: 'circle', icon: Circle, label: '圆形' },
    { id: 'triangle', icon: Triangle, label: '三角形' },
  ];

  const gradientPresets = [
    { css: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
    { css: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' },
    { css: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' },
    { css: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)' },
    { css: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)' },
    { css: 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)' },
    { css: 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)' },
    { css: 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)' },
    { css: 'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)' },
    { css: 'linear-gradient(135deg, #fad0c4 0%, #ffd1ff 100%)' },
    { css: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)' },
    { css: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)' },
  ];

  return (
    <div className="h-full p-3 overflow-y-auto">
      {/* Background Settings Section */}
      <div className="mb-3 bg-(--bg-secondary) rounded-xl border border-(--border-color) overflow-hidden">
        <button 
          className="w-full flex items-center justify-between p-4 hover:bg-(--bg-tertiary) transition-colors"
          onClick={() => toggleSection('background')}
        >
          <div className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-(--primary)" />
            <span className="text-sm font-semibold text-(--text-primary)">{t('designer.background', '背景设置')}</span>
          </div>
          <ChevronDown className={cn("w-4 h-4 text-(--text-tertiary) transition-transform", expandedSections.background && "rotate-180")} />
        </button>

        {expandedSections.background && (
          <div className="px-4 pb-4 animate-fade-in">
            <div className="flex gap-2 mb-4">
              <button className="flex-1 flex flex-col items-center gap-1 py-3 px-2 rounded-lg bg-linear-to-br from-(--primary) to-purple-600 text-white text-xs font-medium shadow-lg">
                <Sparkles className="w-5 h-5" />
                <span>渐变</span>
              </button>
              <button className="flex-1 flex flex-col items-center gap-1 py-3 px-2 rounded-lg bg-(--bg-tertiary) text-(--text-secondary) text-xs font-medium hover:bg-(--bg-primary) transition-colors">
                <Brush className="w-5 h-5" />
                <span>纯色</span>
              </button>
              <button className="flex-1 flex flex-col items-center gap-1 py-3 px-2 rounded-lg bg-(--bg-tertiary) text-(--text-secondary) text-xs font-medium hover:bg-(--bg-primary) transition-colors">
                <Wand2 className="w-5 h-5" />
                <span>随机</span>
              </button>
            </div>

            <div className="text-xs text-(--text-secondary) mb-2">预设渐变</div>
            <div className="grid grid-cols-4 gap-2 mb-4">
              {gradientPresets.map((preset, idx) => (
                <button
                  key={idx}
                  className="aspect-square rounded-lg cursor-pointer border-2 border-transparent hover:border-(--primary) hover:scale-105 transition-all"
                  style={{ background: preset.css }}
                  title={`渐变 ${idx + 1}`}
                />
              ))}
            </div>

            <button className="w-full py-2.5 rounded-lg bg-(--primary) text-white text-sm font-medium hover:opacity-90 transition-opacity">
              应用背景
            </button>
          </div>
        )}
      </div>

      {/* Add Elements Section */}
      <div className="mb-3 bg-(--bg-secondary) rounded-xl border border-(--border-color) overflow-hidden">
        <button 
          className="w-full flex items-center justify-between p-4 hover:bg-(--bg-tertiary) transition-colors"
          onClick={() => toggleSection('elements')}
        >
          <div className="flex items-center gap-2">
            <Plus className="w-4 h-4 text-(--primary)" />
            <span className="text-sm font-semibold text-(--text-primary)">{t('designer.addElement', '添加元素')}</span>
          </div>
          <ChevronDown className={cn("w-4 h-4 text-(--text-tertiary) transition-transform", expandedSections.elements && "rotate-180")} />
        </button>

        {expandedSections.elements && (
          <div className="px-4 pb-4 animate-fade-in">
            <div className="grid grid-cols-3 gap-3 mb-4">
              <button
                onClick={() => onToolClick('text')}
                className={cn(
                  "flex flex-col items-center gap-2 p-4 rounded-xl transition-all border",
                  activeTool === 'text' 
                    ? "bg-linear-to-br from-(--primary) to-purple-600 text-white border-transparent shadow-lg"
                    : "bg-(--bg-tertiary) text-(--text-secondary) border-(--border-color) hover:border-(--primary) hover:text-(--primary)"
                )}
              >
                <div className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center",
                  activeTool === 'text' ? "bg-white/20" : "bg-linear-to-br from-purple-500 to-indigo-600 text-white"
                )}>
                  <TypeIcon className="w-5 h-5" />
                </div>
                <span className="text-xs font-medium">文字</span>
              </button>

              <button
                onClick={() => onToolClick('image')}
                className={cn(
                  "flex flex-col items-center gap-2 p-4 rounded-xl transition-all border",
                  activeTool === 'image' 
                    ? "bg-linear-to-br from-(--primary) to-purple-600 text-white border-transparent shadow-lg"
                    : "bg-(--bg-tertiary) text-(--text-secondary) border-(--border-color) hover:border-(--primary) hover:text-(--primary)"
                )}
              >
                <div className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center",
                  activeTool === 'image' ? "bg-white/20" : "bg-linear-to-br from-cyan-500 to-blue-500 text-white"
                )}>
                  <ImageIcon className="w-5 h-5" />
                </div>
                <span className="text-xs font-medium">图片</span>
              </button>

              <button
                onClick={() => onToolClick('poster')}
                className={cn(
                  "flex flex-col items-center gap-2 p-4 rounded-xl transition-all border",
                  activeTool === 'poster' 
                    ? "bg-linear-to-br from-(--primary) to-purple-600 text-white border-transparent shadow-lg"
                    : "bg-(--bg-tertiary) text-(--text-secondary) border-(--border-color) hover:border-(--primary) hover:text-(--primary)"
                )}
              >
                <div className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center",
                  activeTool === 'poster' ? "bg-white/20" : "bg-linear-to-br from-emerald-500 to-teal-500 text-white"
                )}>
                  <Star className="w-5 h-5" />
                </div>
                <span className="text-xs font-medium">海报</span>
              </button>
            </div>

            <div className="flex items-center gap-3 mb-3">
              <div className="flex-1 h-px bg-(--border-color)" />
              <span className="text-xs text-(--text-tertiary)">形状</span>
              <div className="flex-1 h-px bg-(--border-color)" />
            </div>

            <div className="grid grid-cols-3 gap-2">
              {shapes.map((shape) => (
                <button
                  key={shape.id}
                  onClick={() => onToolClick(shape.id)}
                  className={cn(
                    "aspect-square flex items-center justify-center rounded-lg transition-all border",
                    activeTool === shape.id 
                      ? "bg-(--primary) text-white border-transparent"
                      : "bg-(--bg-tertiary) text-(--text-secondary) border-(--border-color) hover:border-(--primary) hover:text-(--primary)"
                  )}
                  title={shape.label}
                >
                  <shape.icon className="w-6 h-6" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Selection Tool */}
      <div className="sticky bottom-0 pt-2 bg-(--bg-primary)">
        <button
          onClick={() => onToolClick('select')}
          className={cn(
            "w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl transition-all font-medium",
            activeTool === 'select' 
              ? "bg-(--primary) text-white shadow-lg"
              : "bg-(--bg-secondary) text-(--text-secondary) border border-(--border-color) hover:border-(--primary)"
          )}
        >
          <MousePointer2 className="w-5 h-5" />
          <span className="text-sm">{t('common.select', '选择工具')}</span>
        </button>
      </div>
    </div>
  );
}
