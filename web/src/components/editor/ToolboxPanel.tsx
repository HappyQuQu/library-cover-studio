import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import {
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
  Plus,
  LayoutGrid,
  Layers2,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getSamplePosterUrl } from '@/lib/posters';
import { useCanvasStore } from '@/stores/canvasStore';
import { DEFAULT_POSTER_BACKGROUND, type PosterBackground } from '@/lib/posterBackground';

interface ToolboxPanelProps {
  onAddText: () => void;
  onAddImage: () => void;
  onAddShape: (type: string, payload?: any) => void;
  onChangeBackground: (bg: any) => void;
  initialRandomOnGeneration?: boolean;
  initialPosterBackground?: PosterBackground;
}

// Solid color presets (movie-poster friendly palettes)
const solidColorPresets = [
  // 经典暗色
  '#0a0a0a', '#1a1a1a', '#2d2d2d', '#404040',
  // 深蓝系
  '#0d1117', '#0f172a', '#1e3a5f', '#1e40af',
  // 暗夜紫
  '#1a1a2e', '#16213e', '#2d1b4e', '#4c1d95',
  // 暖色暗调
  '#1c0a00', '#3b0764', '#78350f', '#7f1d1d',
  // 深绿/青
  '#052e16', '#064e3b', '#0f4c3a', '#134e4a',
  // 中性亮色
  '#f8fafc', '#e2e8f0', '#94a3b8', '#64748b',
];

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


const stripeAngles = [
  { deg: 0, label: '0°' },
  { deg: 45, label: '45°' },
  { deg: 90, label: '90°' },
  { deg: 135, label: '135°' },
];


// Reusable slider style
const sliderCls = "w-full h-1.5 bg-(--bg-tertiary) rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-(--primary) [&::-webkit-slider-thumb]:shadow-md";

export function ToolboxPanel({ onAddText, onAddImage, onAddShape, onChangeBackground, initialRandomOnGeneration = false, initialPosterBackground }: ToolboxPanelProps) {
  const { t } = useTranslation();
  const canvas = useCanvasStore(state => state.canvas);
  const landscapePosters = (canvas as any)?.posterSource === 'backdrop';
const directions = [
  { id: 'leftToRight', label: t('designer.leftToRight'), icon: ArrowRightIcon },
  { id: 'topToBottom', label: t('designer.topToBottom'), icon: ArrowDown },
  { id: 'bottomToTop', label: t('designer.bottomToTop'), icon: ArrowUp },
  { id: 'leftTopToRightBottom', label: t('designer.diagonalDown'), icon: ArrowDownRight },
  { id: 'rightTopToLeftBottom', label: t('designer.diagonalUp'), icon: ArrowDownLeft },
];
const shapes = [
  { type: 'rect', label: t('designer.rectangle'), icon: Square },
  { type: 'circle', label: t('designer.circle'), icon: Circle },
  { type: 'triangle', label: t('designer.triangle'), icon: Triangle },
  { type: 'line', label: t('designer.line'), icon: Minus },
  { type: 'star', label: t('designer.star'), icon: Star },
  { type: 'arrow', label: t('designer.arrow'), icon: ArrowRight },
];

  const [activeTab, setActiveTab] = useState<'elements' | 'background'>('elements');
  const [bgType, setBgType] = useState<'color' | 'gradient' | 'random' | 'pattern' | 'poster-blur'>(initialPosterBackground ? 'poster-blur' : 'gradient');
  const [posterSource, setPosterSource] = useState<'poster' | 'backdrop'>(initialPosterBackground?.source ?? 'poster');
  const [posterBlur, setPosterBlur] = useState(initialPosterBackground?.blur ?? DEFAULT_POSTER_BACKGROUND.blur);
  const [posterDim, setPosterDim] = useState(initialPosterBackground?.dim ?? DEFAULT_POSTER_BACKGROUND.dim);
  useEffect(() => {
    if (initialPosterBackground) {
      setBgType('poster-blur');
      setPosterSource(initialPosterBackground.source ?? 'poster');
      setPosterBlur(initialPosterBackground.blur);
      setPosterDim(initialPosterBackground.dim);
    } else {
      setBgType(current => current === 'poster-blur' ? 'gradient' : current);
    }
  }, [initialPosterBackground]);

  // Color state
  const [bgColor, setBgColor] = useState('#ffffff');

  // Gradient state
  const [selectedPreset, setSelectedPreset] = useState(-1);
  const [gradientDirection, setGradientDirection] = useState('leftTopToRightBottom');
  const [gradientStyle, setGradientStyle] = useState<'linear' | 'radial'>('linear');
  const [customColor1, setCustomColor1] = useState('#667eea');
  const [customColor2, setCustomColor2] = useState('#764ba2');
  const [gradientIntensity, setGradientIntensity] = useState(50);

  // Random state
  const [randomOnGeneration, setRandomOnGeneration] = useState(initialRandomOnGeneration);

  // Mesh gradient state
  const [meshColors, setMeshColors] = useState(['#1a1a2e', '#e94560', '#0f3460', '#533483']);

  // Stripes state
  const [stripeColor1, setStripeColor1] = useState('#1a1a1a');
  const [stripeColor2, setStripeColor2] = useState('#333333');
  const [stripeAngle, setStripeAngle] = useState(45);
  const [stripeWidth, setStripeWidth] = useState(30);

  // Overlay effects state
  const [vignetteColor, setVignetteColor] = useState('#000000');
  const [vignetteIntensity, setVignetteIntensity] = useState(75);
  const [vignetteSpread, setVignetteSpread] = useState(50);
  const [grainOpacity, setGrainOpacity] = useState(15);

  useEffect(() => {
    setRandomOnGeneration(initialRandomOnGeneration);
  }, [initialRandomOnGeneration]);

  const handleColorChange = (color: string) => {
    setBgColor(color);
    onChangeBackground({ type: 'color', color });
  };

  const applyPreset = (idx: number) => {
    setSelectedPreset(idx);
    const preset = gradientPresets[idx];
    onChangeBackground({ type: 'gradient', gradientStyle, color1: preset.color1, color2: preset.color2, direction: gradientDirection });
  };

  const handleDirectionChange = (dir: string) => {
    setGradientDirection(dir);
    if (selectedPreset >= 0) {
      const preset = gradientPresets[selectedPreset];
      onChangeBackground({ type: 'gradient', gradientStyle, color1: preset.color1, color2: preset.color2, direction: dir });
    }
  };

  const applyCustomGradient = () => {
    setSelectedPreset(-1);
    onChangeBackground({ type: 'gradient', gradientStyle, color1: customColor1, color2: customColor2, direction: gradientDirection, intensity: gradientIntensity });
  };

  const applyRandomGradient = () => {
    onChangeBackground({ type: 'random-gradient', direction: gradientDirection, intensity: gradientIntensity });
  };

  const applyMeshGradient = () => {
    onChangeBackground({ type: 'mesh', colors: meshColors });
  };

  const applyStripes = () => {
    onChangeBackground({ type: 'stripes', color1: stripeColor1, color2: stripeColor2, angle: stripeAngle, stripeWidth });
  };

  const updateMeshColor = (idx: number, color: string) => {
    const next = [...meshColors];
    next[idx] = color;
    setMeshColors(next);
  };

  return (
    <div className="h-full overflow-auto flex flex-col">
      {/* Main Tab Navigation */}
      <div className="flex border-b border-(--border-color) bg-(--bg-primary) sticky top-0 z-10">
        <button
          onClick={() => setActiveTab('elements')}
          className={cn(
            "flex-1 py-3 text-sm font-medium transition-all flex items-center justify-center gap-2",
            activeTab === 'elements'
              ? "text-(--primary) border-b-2 border-(--primary) bg-(--primary)/5"
              : "text-(--text-secondary) hover:text-(--text-primary) hover:bg-(--bg-tertiary)"
          )}
        >
          <Sparkles className="w-4 h-4" />
          {t('designer.addElement')}
        </button>
        <button
          onClick={() => setActiveTab('background')}
          className={cn(
            "flex-1 py-3 text-sm font-medium transition-all flex items-center justify-center gap-2",
            activeTab === 'background'
              ? "text-(--primary) border-b-2 border-(--primary) bg-(--primary)/5"
              : "text-(--text-secondary) hover:text-(--text-primary) hover:bg-(--bg-tertiary)"
          )}
        >
          <Palette className="w-4 h-4" />
          {t('designer.background')}
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-auto p-3">
        {/* Elements Tab */}
        {activeTab === 'elements' && (
          <div className="space-y-4 animate-fade-in">
            {/* Posters Section */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-semibold text-(--text-primary)">{t('designer.posterTemplates')}</span>
                <div className="flex-1 h-px bg-(--border-color)" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                {Array.from({ length: 9 }).map((_, i) => (
                  <button
                    key={`poster-${i + 1}`}
                    onClick={() => onAddShape('poster', getSamplePosterUrl(i + 1, canvas))}
                    className={cn(landscapePosters ? 'aspect-video' : 'aspect-[2/3]', 'relative rounded-lg overflow-hidden border border-(--border-color) hover:border-(--primary) transition-all hover:scale-105 group')}
                    title={t('designer.posterNumber', { number: i + 1 })}
                  >
                    <img
                      src={getSamplePosterUrl(i + 1, canvas)}
                      alt={t('designer.posterNumber', { number: i + 1 })}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Plus className="w-6 h-6 text-white drop-shadow-md" />
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Basic Elements */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-semibold text-(--text-primary)">{t('designer.basicElements')}</span>
                <div className="flex-1 h-px bg-(--border-color)" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={onAddText}
                  className="flex flex-col items-center gap-2 p-3 rounded-xl bg-(--bg-tertiary) hover:shadow-md hover:-translate-y-0.5 transition-all"
                >
                  <div className="w-10 h-10 rounded-xl bg-linear-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white">
                    <Type className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-medium text-(--text-primary)">{t('designer.text')}</span>
                </button>
                <button
                  onClick={onAddImage}
                  className="flex flex-col items-center gap-2 p-3 rounded-xl bg-(--bg-tertiary) hover:shadow-md hover:-translate-y-0.5 transition-all"
                >
                  <div className="w-10 h-10 rounded-xl bg-linear-to-br from-cyan-500 to-blue-500 flex items-center justify-center text-white">
                    <ImageIcon className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-medium text-(--text-primary)">{t('designer.image')}</span>
                </button>
              </div>
            </div>

            {/* Shapes */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-semibold text-(--text-primary)">{t('designer.shape')}</span>
                <div className="flex-1 h-px bg-(--border-color)" />
              </div>
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
          </div>
        )}

        {/* Background Tab */}
        {activeTab === 'background' && (
          <div className="space-y-4 animate-fade-in">
            {/* Background Type Selector — 2x2 grid */}
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'color' as const, icon: Palette, label: t('designer.solid') },
                { id: 'gradient' as const, icon: Sparkles, label: t('designer.gradient') },
                { id: 'random' as const, icon: Shuffle, label: t('designer.randomGradient') },
                { id: 'pattern' as const, icon: LayoutGrid, label: t('designer.pattern') },
                { id: 'poster-blur' as const, icon: ImageIcon, label: t('designer.movieBackground') },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setBgType(item.id)}
                  className={cn(
                    "flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-medium transition-all",
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

            {bgType === 'poster-blur' && (
              <div className="space-y-4">
                <label className="block space-y-2 text-xs text-(--text-secondary)">
                  <span>{t('designer.backgroundSource')}</span>
                  <select aria-label={t('designer.movieBackgroundSource')} value={posterSource} onChange={e => setPosterSource(e.target.value as 'poster' | 'backdrop')}
                    className="w-full rounded-lg border border-(--border-default) bg-(--bg-secondary) p-2">
                    <option value="poster">{t('designer.firstPoster')}</option><option value="backdrop">{t('designer.firstBackdrop')}</option>
                  </select>
                </label>
                <p className="text-xs text-(--text-tertiary) leading-relaxed">{t('designer.movieBackgroundHint')}</p>
                <label className="block space-y-2 text-xs text-(--text-secondary)">
                  <span className="flex justify-between">{t('designer.blurAmount')} <span>{posterBlur}</span></span>
                  <input type="range" aria-label={t('designer.posterBackgroundBlur')} min="0" max="150" step="5" value={posterBlur}
                    onChange={e => setPosterBlur(Number(e.target.value))} className={sliderCls} />
                </label>
                <label className="block space-y-2 text-xs text-(--text-secondary)">
                  <span className="flex justify-between">{t('designer.darken')} <span>{Math.round(posterDim * 100)}%</span></span>
                  <input type="range" aria-label={t('designer.posterBackgroundDim')} min="0" max="80" step="5" value={Math.round(posterDim * 100)}
                    onChange={e => setPosterDim(Number(e.target.value) / 100)} className={sliderCls} />
                </label>
                <button type="button" onClick={() => onChangeBackground({ type: 'poster-blur', blur: posterBlur, dim: posterDim, source: posterSource })}
                  className="w-full rounded-lg bg-(--primary) text-white py-2.5 text-xs font-medium hover:opacity-90 transition-opacity">
                  {t('designer.applyMovieBackground')}
                </button>
              </div>
            )}

            {/* ── Color Mode ── */}
            {bgType === 'color' && (
              <div className="space-y-3">
                <span className="text-xs text-(--text-tertiary)">{t('designer.colorPresets')}</span>
                <div className="grid grid-cols-8 gap-1.5">
                  {solidColorPresets.map((color) => (
                    <button
                      key={color}
                      onClick={() => handleColorChange(color)}
                      className={cn(
                        "aspect-square rounded-md transition-all hover:scale-110 border",
                        bgColor === color
                          ? "ring-2 ring-(--primary) ring-offset-1 border-transparent"
                          : "border-(--border-color)"
                      )}
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-3 pt-1 border-t border-(--border-color)">
                  <span className="text-xs text-(--text-tertiary)">{t('designer.custom')}</span>
                  <input aria-label={t('designer.solid')}
                    type="color"
                    value={bgColor}
                    onChange={(e) => handleColorChange(e.target.value)}
                    className="w-10 h-10 rounded-lg border-2 border-(--border-color) cursor-pointer"
                  />
                  <span className="text-xs font-mono text-(--text-secondary)">{bgColor}</span>
                </div>
              </div>
            )}

            {/* ── Gradient Mode ── */}
            {bgType === 'gradient' && (
              <div className="space-y-3">
                {/* Linear / Radial toggle */}
                <div className="space-y-1.5">
                  <span className="text-xs text-(--text-tertiary)">{t('designer.gradientStyle')}</span>
                  <div className="grid grid-cols-2 gap-2">
                    {(['linear', 'radial'] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => setGradientStyle(s)}
                        className={cn(
                          "py-1.5 rounded-lg text-xs font-medium transition-all border",
                          gradientStyle === s
                            ? "bg-(--primary) text-white border-(--primary)"
                            : "bg-(--bg-tertiary) text-(--text-secondary) border-(--border-color) hover:border-(--primary)"
                        )}
                      >
                        {s === 'linear' ? t('designer.linearGradient') : t('designer.radialGradient')}
                      </button>
                    ))}
                  </div>
                </div>

                <span className="text-xs text-(--text-tertiary)">{t('designer.gradientPresets')}</span>
                <div className="grid grid-cols-4 gap-2">
                  {gradientPresets.map((preset, idx) => (
                    <button
                      key={idx}
                      title={t('designer.gradientNumber', { number: idx + 1 })}
                      onClick={() => applyPreset(idx)}
                      className={cn(
                        "aspect-square rounded-lg transition-all hover:scale-105",
                        selectedPreset === idx && "ring-2 ring-(--primary) ring-offset-2"
                      )}
                      style={{ background: preset.css }}
                    />
                  ))}
                </div>

                {/* Direction — only for linear */}
                {gradientStyle === 'linear' && (
                  <div className="space-y-2">
                    <span className="text-xs text-(--text-tertiary)">{t('designer.gradientDirection')}</span>
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
                )}

                {/* Custom gradient */}
                <div className="space-y-2 pt-2 border-t border-(--border-color)">
                  <span className="text-xs text-(--text-tertiary)">{t('designer.customGradient')}</span>
                  <div className="flex items-center gap-2">
                    <input aria-label={t('designer.colorOne')} type="color" value={customColor1} onChange={(e) => setCustomColor1(e.target.value)}
                      className="w-10 h-10 rounded-lg border border-(--border-color) cursor-pointer" title={t('designer.colorOne')} />
                    <span className="text-xs text-(--text-tertiary) flex-1 text-center">→</span>
                    <input aria-label={t('designer.colorTwo')} type="color" value={customColor2} onChange={(e) => setCustomColor2(e.target.value)}
                      className="w-10 h-10 rounded-lg border border-(--border-color) cursor-pointer" title={t('designer.colorTwo')} />
                    <button onClick={applyCustomGradient}
                      className="px-3 py-2 rounded-lg bg-(--primary) text-white text-xs font-medium hover:opacity-90 transition-all">
                      {t('designer.apply')}
                    </button>
                  </div>
                  <div className="h-6 rounded-lg border border-(--border-color)" style={{
                    background: gradientStyle === 'radial'
                      ? `radial-gradient(circle, ${customColor1} 0%, ${customColor2} 100%)`
                      : `linear-gradient(135deg, ${customColor1} 0%, ${customColor1} ${50 - gradientIntensity / 2}%, ${customColor2} ${50 + gradientIntensity / 2}%, ${customColor2} 100%)`
                  }} />
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-(--text-tertiary)">{t('designer.gradientIntensity')}</span>
                      <span className="text-[10px] font-medium text-(--text-tertiary)">{gradientIntensity}%</span>
                    </div>
                    <input aria-label={t('designer.gradientIntensity')} type="range" min="0" max="100" value={gradientIntensity}
                      onChange={(e) => setGradientIntensity(parseInt(e.target.value))} className={sliderCls} />
                    <div className="flex justify-between text-[9px] text-(--text-tertiary)">
                      <span>{t('designer.soft')}</span><span>{t('designer.sharp')}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Random Mode ── */}
            {bgType === 'random' && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 text-amber-600 text-xs">
                  <Sparkles className="w-4 h-4" />
                  <span>{t('designer.randomGradientHint')}</span>
                </div>
                <label className="flex items-center gap-3 p-3 rounded-lg border border-(--border-color) cursor-pointer hover:bg-(--bg-tertiary) transition-all">
                  <input aria-label={t('designer.randomizeOnGeneration')}
                    type="checkbox"
                    checked={randomOnGeneration}
                    onChange={(e) => {
                      setRandomOnGeneration(e.target.checked);
                      onChangeBackground({ randomOnGeneration: e.target.checked });
                    }}
                    className="w-4 h-4 accent-(--primary) cursor-pointer"
                  />
                  <div className="flex-1">
                    <span className="text-sm font-medium text-(--text-primary)">{t('designer.randomizeOnGeneration')}</span>
                    <p className="text-xs text-(--text-tertiary) mt-0.5">{t('designer.randomizeHint')}</p>
                  </div>
                  <Shuffle className="w-4 h-4 text-(--text-tertiary)" />
                </label>
                <div className="space-y-2">
                  <span className="text-xs text-(--text-tertiary)">{t('designer.gradientDirection')}</span>
                  <div className="flex gap-2">
                    {directions.map((dir) => (
                      <button key={dir.id} onClick={() => setGradientDirection(dir.id)}
                        className={cn("w-9 h-9 rounded-lg flex items-center justify-center transition-all border",
                          gradientDirection === dir.id ? "bg-(--primary) text-white border-(--primary)"
                            : "bg-(--bg-tertiary) text-(--text-secondary) border-(--border-color) hover:border-(--primary)")}
                        title={dir.label}>
                        <dir.icon className="w-4 h-4" />
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-(--text-tertiary)">{t('designer.gradientIntensity')}</span>
                    <span className="text-[10px] font-medium text-(--text-tertiary)">{gradientIntensity}%</span>
                  </div>
                  <input aria-label={t('designer.gradientIntensity')} type="range" min="0" max="100" value={gradientIntensity}
                    onChange={(e) => setGradientIntensity(parseInt(e.target.value))} className={sliderCls} />
                  <div className="flex justify-between text-[9px] text-(--text-tertiary)"><span>{t('designer.soft')}</span><span>{t('designer.sharp')}</span></div>
                </div>
                <button onClick={applyRandomGradient}
                  className="w-full py-2.5 rounded-lg bg-linear-to-r from-amber-500 to-rose-500 text-white text-sm font-medium hover:opacity-90 transition-all">
                  <Shuffle className="w-4 h-4 inline mr-2" />{t('designer.randomGradientBackground')}
                </button>
              </div>
            )}

            {/* ── Pattern Mode ── */}
            {bgType === 'pattern' && (
              <div className="space-y-4">
                {/* Mesh Gradient */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-(--text-primary)">{t('designer.meshGradient')}</span>
                    <div className="flex-1 h-px bg-(--border-color)" />
                  </div>
                  <p className="text-[11px] text-(--text-tertiary)">{t('designer.meshHint')}</p>
                  {/* 2x2 color pickers */}
                  <div className="grid grid-cols-2 gap-2">
                    {meshColors.map((color, idx) => (
                      <div key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-(--bg-tertiary)">
                        <input aria-label={t('designer.colorNumber', { number: idx + 1 })}
                          type="color"
                          value={color}
                          onChange={(e) => updateMeshColor(idx, e.target.value)}
                          className="w-8 h-8 rounded cursor-pointer border border-(--border-color)"
                        />
                        <span className="text-[10px] font-mono text-(--text-secondary)">{color}</span>
                      </div>
                    ))}
                  </div>
                  {/* Preview */}
                  <div className="h-16 rounded-xl border border-(--border-color) overflow-hidden" style={{
                    background: `radial-gradient(ellipse at 20% 20%, ${meshColors[0]}cc 0%, transparent 60%),
                                 radial-gradient(ellipse at 80% 20%, ${meshColors[1]}cc 0%, transparent 60%),
                                 radial-gradient(ellipse at 20% 80%, ${meshColors[2]}cc 0%, transparent 60%),
                                 radial-gradient(ellipse at 80% 80%, ${meshColors[3]}cc 0%, transparent 60%)`,
                    backgroundColor: meshColors[0],
                  }} />
                  <button onClick={applyMeshGradient}
                    className="w-full py-2 rounded-lg bg-(--primary) text-white text-xs font-medium hover:opacity-90 transition-all">
                    {t('designer.applyMesh')}
                  </button>
                </div>

                {/* Stripes */}
                <div className="space-y-2 pt-2 border-t border-(--border-color)">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-(--text-primary)">{t('designer.stripes')}</span>
                    <div className="flex-1 h-px bg-(--border-color)" />
                  </div>
                  <p className="text-[11px] text-(--text-tertiary)">{t('designer.stripesHint')}</p>
                  {/* Colors */}
                  <div className="flex items-center gap-2">
                    <input aria-label={t('designer.stripeOne')} type="color" value={stripeColor1} onChange={(e) => setStripeColor1(e.target.value)}
                      className="w-10 h-10 rounded-lg border border-(--border-color) cursor-pointer" title={t('designer.stripeOne')} />
                    <div className="flex-1 h-10 rounded-lg border border-(--border-color) overflow-hidden" style={{
                      backgroundImage: `repeating-linear-gradient(${stripeAngle}deg, ${stripeColor1} 0px, ${stripeColor1} ${stripeWidth}px, ${stripeColor2} ${stripeWidth}px, ${stripeColor2} ${stripeWidth * 2}px)`
                    }} />
                    <input aria-label={t('designer.stripeTwo')} type="color" value={stripeColor2} onChange={(e) => setStripeColor2(e.target.value)}
                      className="w-10 h-10 rounded-lg border border-(--border-color) cursor-pointer" title={t('designer.stripeTwo')} />
                  </div>
                  {/* Angle */}
                  <div className="space-y-1">
                    <span className="text-xs text-(--text-tertiary)">{t('designer.angle')}</span>
                    <div className="grid grid-cols-4 gap-1.5">
                      {stripeAngles.map(({ deg, label }) => (
                        <button key={deg} onClick={() => setStripeAngle(deg)}
                          className={cn("py-1.5 rounded-lg text-xs font-medium transition-all border",
                            stripeAngle === deg ? "bg-(--primary) text-white border-(--primary)"
                              : "bg-(--bg-tertiary) text-(--text-secondary) border-(--border-color) hover:border-(--primary)"
                          )}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Width */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-(--text-tertiary)">{t('designer.stripeWidth')}</span>
                      <span className="text-[10px] font-medium text-(--text-tertiary)">{stripeWidth}px</span>
                    </div>
                    <input aria-label={t('designer.stripeWidth')} type="range" min="5" max="120" value={stripeWidth}
                      onChange={(e) => setStripeWidth(parseInt(e.target.value))} className={sliderCls} />
                  </div>
                  <button onClick={applyStripes}
                    className="w-full py-2 rounded-lg bg-(--primary) text-white text-xs font-medium hover:opacity-90 transition-all">
                    {t('designer.applyStripes')}
                  </button>
                </div>
              </div>
            )}

            {/* ── Overlay Effects (always visible) ── */}
            <div className="pt-2 border-t border-(--border-color) space-y-3">
              <div className="flex items-center gap-2">
                <Layers2 className="w-3.5 h-3.5 text-(--text-tertiary)" />
                <span className="text-xs font-semibold text-(--text-primary)">{t('designer.overlays')}</span>
                <span className="text-[10px] text-(--text-tertiary)">{t('designer.overlaysHint')}</span>
              </div>

              {/* Vignette */}
              <div className="p-3 rounded-xl bg-(--bg-tertiary) space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-(--text-primary)">{t('designer.vignette')}</span>
                  <span className="text-[10px] text-(--text-tertiary)">{t('designer.vignetteOverlay')}</span>
                </div>
                {/* Preview */}
                <div className="h-12 rounded-lg overflow-hidden border border-(--border-color)" style={{
                  background: `radial-gradient(ellipse at center, transparent ${100 - vignetteSpread}%, ${vignetteColor}${Math.round(vignetteIntensity * 2.55).toString(16).padStart(2, '0')} 100%), #1a1a2e`
                }} />
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-(--text-tertiary)">{t('designer.vignetteColor')}</span>
                  <input aria-label={t('designer.vignetteColor')} type="color" value={vignetteColor} onChange={(e) => setVignetteColor(e.target.value)}
                    className="w-6 h-6 rounded border border-(--border-color) cursor-pointer p-0" title={t('designer.vignetteColor')} />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-[10px] text-(--text-tertiary)">{t('designer.intensity')}</span>
                    <span className="text-[10px] text-(--text-tertiary)">{vignetteIntensity}%</span>
                  </div>
                  <input aria-label={t('designer.intensity')} type="range" min="10" max="95" value={vignetteIntensity}
                    onChange={(e) => setVignetteIntensity(parseInt(e.target.value))} className={sliderCls} />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-[10px] text-(--text-tertiary)">{t('designer.radius')}</span>
                    <span className="text-[10px] text-(--text-tertiary)">{vignetteSpread}%</span>
                  </div>
                  <input aria-label={t('designer.radius')} type="range" min="10" max="90" value={vignetteSpread}
                    onChange={(e) => setVignetteSpread(parseInt(e.target.value))} className={sliderCls} />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => onChangeBackground({ type: 'vignette', intensity: vignetteIntensity / 100, spread: vignetteSpread / 100, color: vignetteColor })}
                    className="flex-1 py-1.5 rounded-lg bg-(--bg-secondary) border border-(--border-color) text-xs font-medium text-(--text-primary) hover:border-(--primary) hover:text-(--primary) transition-all"
                  >
                    {t('designer.addVignette')}
                  </button>
                  <button
                    onClick={() => onChangeBackground({ type: 'clear-vignette' })}
                    className="px-3 py-1.5 rounded-lg bg-(--bg-secondary) border border-(--border-color) text-(--text-tertiary) hover:border-red-500 hover:text-red-500 hover:bg-red-50 transition-all focus:outline-none"
                    title={t('designer.clearVignette')}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Film Grain */}
              <div className="p-3 rounded-xl bg-(--bg-tertiary) space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-(--text-primary)">{t('designer.noiseTexture')}</span>
                  <span className="text-[10px] text-(--text-tertiary)">{t('designer.filmGrain')}</span>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-[10px] text-(--text-tertiary)">{t('designer.opacity')}</span>
                    <span className="text-[10px] text-(--text-tertiary)">{grainOpacity}%</span>
                  </div>
                  <input aria-label={t('designer.opacity')} type="range" min="3" max="40" value={grainOpacity}
                    onChange={(e) => setGrainOpacity(parseInt(e.target.value))} className={sliderCls} />
                  <div className="flex justify-between text-[9px] text-(--text-tertiary)">
                    <span>{t('designer.subtle')}</span><span>{t('designer.strong')}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => onChangeBackground({ type: 'grain', opacity: grainOpacity / 100 })}
                    className="flex-1 py-1.5 rounded-lg bg-(--bg-secondary) border border-(--border-color) text-xs font-medium text-(--text-primary) hover:border-(--primary) hover:text-(--primary) transition-all"
                  >
                    {t('designer.addNoise')}
                  </button>
                  <button
                    onClick={() => onChangeBackground({ type: 'clear-grain' })}
                    className="px-3 py-1.5 rounded-lg bg-(--bg-secondary) border border-(--border-color) text-(--text-tertiary) hover:border-red-500 hover:text-red-500 hover:bg-red-50 transition-all focus:outline-none"
                    title={t('designer.clearNoise')}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
