import { useState } from 'react';
import {
  ChevronDown,
  Type,
  Image as ImageIcon,
  Square,
  Circle,
  Triangle,
  Minus,
  Star,
  ArrowRight,
  ArrowUp,
  Palette,
  Sparkles,
  Shuffle,
  ArrowDown,
  ArrowRightIcon,
  ArrowDownRight,
  ArrowDownLeft,
  Plus
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ToolboxPanelProps {
  onAddText: () => void;
  onAddImage: () => void;
  onAddShape: (type: string, payload?: any) => void;
  onChangeBackground: (bg: any) => void;
}

// Gradient presets
const gradientPresets = [
  { css: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color1: '#667eea', color2: '#764ba2' },
  { css: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', color1: '#f093fb', color2: '#f5576c' },
  { css: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)', color1: '#4facfe', color2: '#00f2fe' },
  { css: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)', color1: '#43e97b', color2: '#38f9d7' },
  { css: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)', color1: '#fa709a', color2: '#fee140' },
  { css: 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)', color1: '#a8edea', color2: '#fed6e3' },
  { css: 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)', color1: '#ff9a9e', color2: '#fecfef' },
  { css: 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)', color1: '#ffecd2', color2: '#fcb69f' },
  { css: 'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)', color1: '#a18cd1', color2: '#fbc2eb' },
  { css: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)', color1: '#1e3c72', color2: '#2a5298' },
  { css: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%)', color1: '#0f0c29', color2: '#302b63' },
  { css: 'linear-gradient(135deg, #232526 0%, #414345 100%)', color1: '#232526', color2: '#414345' },
];

const directions = [
  { id: 'leftToRight', label: '左→右', icon: ArrowRightIcon },
  { id: 'topToBottom', label: '上→下', icon: ArrowDown },
  { id: 'bottomToTop', label: '下→上', icon: ArrowUp },
  { id: 'leftTopToRightBottom', label: '左上→右下', icon: ArrowDownRight },
  { id: 'rightTopToLeftBottom', label: '右上→左下', icon: ArrowDownLeft },
];

const shapes = [
  { type: 'rect', label: '矩形', icon: Square },
  { type: 'circle', label: '圆形', icon: Circle },
  { type: 'triangle', label: '三角形', icon: Triangle },
  { type: 'line', label: '直线', icon: Minus },
  { type: 'star', label: '五角星', icon: Star },
  { type: 'arrow', label: '箭头', icon: ArrowRight },
];

export function ToolboxPanel({ onAddText, onAddImage, onAddShape, onChangeBackground }: ToolboxPanelProps) {
  const [expandedSections, setExpandedSections] = useState({
    background: true,
    elements: true,
  });
  const [bgType, setBgType] = useState<'color' | 'gradient' | 'random'>('gradient');
  const [bgColor, setBgColor] = useState('#ffffff');
  const [selectedPreset, setSelectedPreset] = useState(-1);
  const [gradientDirection, setGradientDirection] = useState('leftTopToRightBottom');
  const [randomOnGeneration, setRandomOnGeneration] = useState(false);

  const toggleSection = (section: 'background' | 'elements') => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const handleColorChange = (color: string) => {
    setBgColor(color);
    onChangeBackground({ type: 'color', color });
  };

  const applyPreset = (idx: number) => {
    setSelectedPreset(idx);
    const preset = gradientPresets[idx];
    onChangeBackground({
      type: 'gradient',
      color1: preset.color1,
      color2: preset.color2,
      direction: gradientDirection
    });
  };

  const handleDirectionChange = (dir: string) => {
    setGradientDirection(dir);
    // If a preset is selected, reapply with new direction
    if (selectedPreset >= 0) {
      const preset = gradientPresets[selectedPreset];
      onChangeBackground({
        type: 'gradient',
        color1: preset.color1,
        color2: preset.color2,
        direction: dir
      });
    }
  };

  const applyRandomGradient = () => {
    onChangeBackground({ type: 'random-gradient', direction: gradientDirection });
  };

  return (
    <div className="h-full overflow-auto p-3 space-y-3">
      {/* Background Settings */}
      <div className="rounded-xl border border-(--border-color) bg-(--bg-primary) overflow-hidden">
        <button
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-(--bg-tertiary) transition-all"
          onClick={() => toggleSection('background')}
        >
          <div className="flex items-center gap-2.5">
            <Palette className="w-4 h-4 text-(--primary)" />
            <span className="text-sm font-semibold text-(--text-primary)">背景设置</span>
          </div>
          <ChevronDown className={cn("w-4 h-4 text-(--text-tertiary) transition-transform", expandedSections.background && "rotate-180")} />
        </button>

        {expandedSections.background && (
          <div className="px-4 pb-4 space-y-4">
            {/* Background Type Tabs */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'color' as const, icon: Palette, label: '纯色' },
                { id: 'gradient' as const, icon: Sparkles, label: '渐变' },
                { id: 'random' as const, icon: Shuffle, label: '随机' },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setBgType(item.id)}
                  className={cn(
                    "flex flex-col items-center gap-1.5 py-2.5 rounded-lg text-xs font-medium transition-all",
                    bgType === item.id
                      ? "bg-(--primary) text-white shadow-md"
                      : "bg-(--bg-tertiary) text-(--text-secondary) hover:bg-(--bg-secondary)"
                  )}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </button>
              ))}
            </div>

            {/* Color Mode */}
            {bgType === 'color' && (
              <div className="flex flex-col items-center gap-2">
                <span className="text-xs text-(--text-tertiary)">选择颜色</span>
                <input
                  type="color"
                  value={bgColor}
                  onChange={(e) => handleColorChange(e.target.value)}
                  className="w-12 h-12 rounded-lg border-2 border-(--border-color) cursor-pointer"
                />
              </div>
            )}

            {/* Gradient Mode */}
            {bgType === 'gradient' && (
              <div className="space-y-3">
                <span className="text-xs text-(--text-tertiary)">预设渐变</span>
                <div className="grid grid-cols-4 gap-2">
                  {gradientPresets.map((preset, idx) => (
                    <button
                      key={idx}
                      onClick={() => applyPreset(idx)}
                      className={cn(
                        "aspect-square rounded-lg transition-all hover:scale-105",
                        selectedPreset === idx && "ring-2 ring-(--primary) ring-offset-2"
                      )}
                      style={{ background: preset.css }}
                    />
                  ))}
                </div>

                {/* Direction Selector */}
                <div className="space-y-2">
                  <span className="text-xs text-(--text-tertiary)">渐变方向</span>
                  <div className="flex gap-2">
                    {directions.map((dir) => (
                      <button
                        key={dir.id}
                        onClick={() => handleDirectionChange(dir.id)}
                        className={cn(
                          "w-9 h-9 rounded-lg flex items-center justify-center transition-all border",
                          gradientDirection === dir.id
                            ? "bg-(--primary) text-white border-(--primary)"
                            : "bg-(--bg-tertiary) text-(--text-secondary) border-(--border-color) hover:border-(--primary)"
                        )}
                        title={dir.label}
                      >
                        <dir.icon className="w-4 h-4" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Random Mode */}
            {bgType === 'random' && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 text-amber-600 text-xs">
                  <Sparkles className="w-4 h-4" />
                  <span>每次点击生成随机渐变色</span>
                </div>

                {/* Random Background on Generation Toggle */}
                <label className="flex items-center gap-3 p-3 rounded-lg border border-(--border-color) cursor-pointer hover:bg-(--bg-tertiary) transition-all">
                  <input
                    type="checkbox"
                    checked={randomOnGeneration}
                    onChange={(e) => {
                      setRandomOnGeneration(e.target.checked);
                      onChangeBackground({ type: 'random-gradient', direction: gradientDirection, randomOnGeneration: e.target.checked });
                    }}
                    className="w-4 h-4 accent-(--primary) cursor-pointer"
                  />
                  <div className="flex-1">
                    <span className="text-sm font-medium text-(--text-primary)">生成任务时随机背景</span>
                    <p className="text-xs text-(--text-tertiary) mt-0.5">每次执行任务时自动使用随机背景</p>
                  </div>
                  <Shuffle className="w-4 h-4 text-(--text-tertiary)" />
                </label>

                {/* Direction Selector for Random */}
                <div className="space-y-2">
                  <span className="text-xs text-(--text-tertiary)">渐变方向</span>
                  <div className="flex gap-2">
                    {directions.map((dir) => (
                      <button
                        key={dir.id}
                        onClick={() => setGradientDirection(dir.id)}
                        className={cn(
                          "w-9 h-9 rounded-lg flex items-center justify-center transition-all border",
                          gradientDirection === dir.id
                            ? "bg-(--primary) text-white border-(--primary)"
                            : "bg-(--bg-tertiary) text-(--text-secondary) border-(--border-color) hover:border-(--primary)"
                        )}
                        title={dir.label}
                      >
                        <dir.icon className="w-4 h-4" />
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={applyRandomGradient}
                  className="w-full py-2.5 rounded-lg bg-linear-to-r from-amber-500 to-rose-500 text-white text-sm font-medium hover:opacity-90 transition-all"
                >
                  <Shuffle className="w-4 h-4 inline mr-2" />
                  随机渐变背景
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Elements */}
      <div className="rounded-xl border border-(--border-color) bg-(--bg-primary) overflow-hidden">
        <button
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-(--bg-tertiary) transition-all"
          onClick={() => toggleSection('elements')}
        >
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-4 h-4 text-(--primary)" />
            <span className="text-sm font-semibold text-(--text-primary)">添加元素</span>
          </div>
          <ChevronDown className={cn("w-4 h-4 text-(--text-tertiary) transition-transform", expandedSections.elements && "rotate-180")} />
        </button>

        {expandedSections.elements && (
          <div className="px-4 pb-4 space-y-4">
            {/* Basic Elements */}
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={onAddText}
                className="flex flex-col items-center gap-2 p-3 rounded-xl bg-(--bg-tertiary) hover:shadow-md hover:-translate-y-0.5 transition-all"
              >
                <div className="w-10 h-10 rounded-xl bg-linear-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white">
                  <Type className="w-5 h-5" />
                </div>
                <span className="text-xs font-medium text-(--text-primary)">文字</span>
              </button>
              <button
                onClick={onAddImage}
                className="flex flex-col items-center gap-2 p-3 rounded-xl bg-(--bg-tertiary) hover:shadow-md hover:-translate-y-0.5 transition-all"
              >
                <div className="w-10 h-10 rounded-xl bg-linear-to-br from-cyan-500 to-blue-500 flex items-center justify-center text-white">
                  <ImageIcon className="w-5 h-5" />
                </div>
                <span className="text-xs font-medium text-(--text-primary)">图片</span>
              </button>
            </div>

            {/* Posters Section */}
            <div className="flex items-center gap-3 text-xs text-(--text-tertiary)">
              <div className="flex-1 h-px bg-(--border-color)" />
              <span>海报模板</span>
              <div className="flex-1 h-px bg-(--border-color)" />
            </div>

            <div className="grid grid-cols-3 gap-2">
              {/* Generate 1-9 poster buttons */}
              {Array.from({ length: 9 }).map((_, i) => (
                <button
                  key={`poster-${i + 1}`}
                  onClick={() => onAddShape('poster', `http://localhost:3000/api/templates/posters/${i + 1}.jpg`)}
                  className="aspect-[2/3] relative rounded-lg overflow-hidden border border-(--border-color) hover:border-(--primary) transition-all hover:scale-105 group"
                  title={`海报 ${i + 1}`}
                >
                  <img
                    src={`http://localhost:3000/api/templates/posters/${i + 1}.jpg`}
                    alt={`Poster ${i + 1}`}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Plus className="w-6 h-6 text-white drop-shadow-md" />
                  </div>
                </button>
              ))}
            </div>

            {/* Shapes Divider */}
            <div className="flex items-center gap-3 text-xs text-(--text-tertiary) mt-2">
              <div className="flex-1 h-px bg-(--border-color)" />
              <span>形状</span>
              <div className="flex-1 h-px bg-(--border-color)" />
            </div>

            {/* Shapes Grid */}
            <div className="grid grid-cols-3 gap-2">
              {shapes.map((shape) => (
                <button
                  key={shape.type}
                  onClick={() => onAddShape(shape.type)}
                  className="aspect-square flex items-center justify-center rounded-xl bg-(--bg-tertiary) text-(--text-secondary) hover:text-(--primary) hover:border-(--primary) border border-transparent hover:shadow-md transition-all"
                  title={shape.label}
                >
                  <shape.icon className="w-6 h-6" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
