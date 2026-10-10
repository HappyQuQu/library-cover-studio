import { Trash2, Copy, MousePointer2, Wand2, AlignLeft, AlignCenter, AlignRight, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { getSamplePosterUrl } from '@/lib/posters';

interface PropertyPanelProps {
  selectedObject: any;
  onPropertyChange: (prop: string, value: any) => void;
  onDelete: () => void;
  onClone: () => void;
  customFonts?: any[];
}

// Helper to ensure color is hex
function toHex(color: any): string {
  if (!color) return '#000000';
  if (typeof color !== 'string') return '#000000';
  if (color.startsWith('#')) return color;

  // Handle rgb(r, g, b)
  const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (match) {
    const [_, r, g, b] = match;
    return "#" +
      (1 << 24 | parseInt(r) << 16 | parseInt(g) << 8 | parseInt(b)).toString(16).slice(1);
  }
  return '#000000';
}

export function PropertyPanel({ selectedObject, onPropertyChange, onDelete, onClone, customFonts = [] }: PropertyPanelProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'style' | 'shadow'>('style');

  if (!selectedObject) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-10 text-center h-full">
        <div className="w-16 h-16 rounded-2xl bg-(--bg-tertiary) flex items-center justify-center mb-4 shadow-inner">
          <MousePointer2 className="w-8 h-8 text-(--text-tertiary)" />
        </div>
        <h4 className="text-sm font-semibold text-(--text-secondary)">{t('designer.noSelection', '未选择对象')}</h4>
        <p className="text-xs text-(--text-tertiary) mt-2 max-w-[200px] leading-relaxed">
          {t('designer.selectionHint', '点击画布上的元素来编辑其属性，或从侧边栏添加新元素')}
        </p>
      </div>
    );
  }

  const isText = selectedObject.type === 'i-text' || selectedObject.type === 'textbox';

  return (
    <div className="p-5 flex flex-col gap-6 animate-fade-in pb-20">
      {/* Quick Actions at Top */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <Button
          variant="outline"
          size="sm"
          className="h-8 hover:bg-destructive/5 hover:text-destructive hover:border-destructive/30 transition-colors"
          onClick={onDelete}
        >
          <Trash2 className="w-3.5 h-3.5 mr-1.5" />
          {t('common.delete', '删除')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 hover:bg-(--primary)/5 hover:text-(--primary) hover:border-(--primary)/30 transition-colors"
          onClick={onClone}
        >
          <Copy className="w-3.5 h-3.5 mr-1.5" />
          {t('designer.duplicate', '复制')}
        </Button>
      </div>

      {/* Transformation Controls */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-[10px] font-bold text-(--text-tertiary) uppercase tracking-wider">
            {t('designer.layout', '布局')}
          </h4>
          <span className="text-[10px] bg-(--bg-tertiary) px-1.5 py-0.5 rounded text-(--text-tertiary) font-mono">
            {selectedObject.type}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-[10px] text-(--text-tertiary) font-medium ml-1">X</label>
            <Input
              type="number"
              value={Math.round(selectedObject.left || 0)}
              className="h-8 text-xs bg-(--bg-primary) border-(--border-color) focus:border-(--primary) transition-all font-mono text-(--text-primary)"
              onChange={(e) => onPropertyChange('left', parseInt(e.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] text-(--text-tertiary) font-medium ml-1">Y</label>
            <Input
              type="number"
              value={Math.round(selectedObject.top || 0)}
              className="h-8 text-xs bg-(--bg-primary) border-(--border-color) focus:border-(--primary) transition-all font-mono text-(--text-primary)"
              onChange={(e) => onPropertyChange('top', parseInt(e.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] text-(--text-tertiary) font-medium ml-1">{t('common.width', '宽度')}</label>
            <Input
              type="number"
              value={Math.round(selectedObject.getScaledWidth ? selectedObject.getScaledWidth() : (selectedObject.width * (selectedObject.scaleX || 1)))}
              className="h-8 text-xs bg-(--bg-tertiary) border-transparent text-(--text-secondary) font-mono"
              readOnly
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] text-(--text-tertiary) font-medium ml-1">{t('common.height', '高度')}</label>
            <Input
              type="number"
              value={Math.round(selectedObject.getScaledHeight ? selectedObject.getScaledHeight() : (selectedObject.height * (selectedObject.scaleY || 1)))}
              className="h-8 text-xs bg-(--bg-tertiary) border-transparent text-(--text-secondary) font-mono"
              readOnly
            />
          </div>
          <div className="col-span-2 space-y-1.5">
            <label className="text-[10px] text-(--text-tertiary) font-medium ml-1">{t('designer.rotation', '旋转角度')}</label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={Math.round(selectedObject.angle || 0) % 360}
                className="h-8 text-xs bg-(--bg-primary) border-(--border-color) focus:border-(--primary) transition-all font-mono text-(--text-primary)"
                onChange={(e) => onPropertyChange('angle', parseInt(e.target.value))}
              />
              <input
                type="range"
                min="0"
                max="360"
                value={Math.round(selectedObject.angle || 0) % 360}
                onChange={(e) => onPropertyChange('angle', parseInt(e.target.value))}
                className="flex-1 h-1.5 bg-(--bg-tertiary) rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-(--primary)"
              />
            </div>
          </div>
        </div>
      </section>

      <div className="h-px bg-(--border-color)" />

      {/* Style & Shadow Tabs */}
      <div className="flex bg-(--bg-tertiary) p-1 rounded-lg">
        <button
          onClick={() => setActiveTab('style')}
          className={cn(
            "flex-1 py-1.5 text-xs font-medium rounded-md transition-all",
            activeTab === 'style' ? "bg-white text-(--primary) shadow-sm" : "text-(--text-tertiary) hover:text-(--text-secondary)"
          )}
        >
          {t('designer.appearance', '外观')}
        </button>
        <button
          onClick={() => setActiveTab('shadow')}
          className={cn(
            "flex-1 py-1.5 text-xs font-medium rounded-md transition-all",
            activeTab === 'shadow' ? "bg-white text-(--primary) shadow-sm" : "text-(--text-tertiary) hover:text-(--text-secondary)"
          )}
        >
          {t('designer.shadow', '阴影')}
        </button>
      </div>

      {activeTab === 'style' ? (
        <>
          {/* Fill & Opacity */}
          <section className="space-y-4 animate-fade-in">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-(--text-secondary)">{t('designer.fillColor', '填充颜色')}</span>
                <div className="flex items-center gap-2 bg-(--bg-tertiary) pl-2 pr-1 py-1 rounded-md border border-(--border-color)">
                  <span className="text-[10px] font-mono text-(--text-tertiary) uppercase">{selectedObject.fill?.toString()}</span>
                  <input
                    type="color"
                    value={toHex(selectedObject.fill)}
                    className="w-5 h-5 p-0 border-none bg-transparent cursor-pointer rounded overflow-hidden"
                    onChange={(e) => onPropertyChange('fill', e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-(--text-secondary)">{t('designer.opacity', '不透明度')}</span>
                <span className="text-[10px] font-medium text-(--text-tertiary)">{Math.round(selectedObject.opacity * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={selectedObject.opacity}
                className="w-full h-1.5 bg-(--bg-tertiary) rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-(--primary) [&::-webkit-slider-thumb]:shadow-md hover:[&::-webkit-slider-thumb]:scale-110 transition-all"
                onChange={(e) => onPropertyChange('opacity', parseFloat(e.target.value))}
              />
            </div>

            {/* Rounded Corners for Poster/Image/Rect */}
            {(selectedObject.isPoster || selectedObject.type === 'image' || selectedObject.type === 'rect') && (() => {
              const isRect = selectedObject.type === 'rect';
              const scaleX = selectedObject.scaleX || 1;
              const scaleY = selectedObject.scaleY || 1;
              const currentRx = isRect ? (selectedObject.rx || 0) : (selectedObject.clipPath?.rx || 0);
              const visualRadius = Math.round(currentRx * scaleX);

              return (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-(--text-secondary)">圆角</span>
                    <span className="text-[10px] font-medium text-(--text-tertiary)">{visualRadius}px</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={visualRadius}
                    className="w-full h-1.5 bg-(--bg-tertiary) rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-(--primary) [&::-webkit-slider-thumb]:shadow-md hover:[&::-webkit-slider-thumb]:scale-110 transition-all"
                    onChange={(e) => {
                      const newVisualRadius = parseInt(e.target.value);
                      const internalRx = newVisualRadius / scaleX;
                      const internalRy = newVisualRadius / scaleY;

                      if (isRect) {
                        onPropertyChange('rx_ry', { rx: internalRx, ry: internalRy });
                      } else {
                        onPropertyChange('clipPath', {
                          type: 'rect',
                          width: selectedObject.width,
                          height: selectedObject.height,
                          rx: internalRx,
                          ry: internalRy,
                          originX: 'center',
                          originY: 'center',
                        });
                      }
                    }}
                  />
                </div>
              );
            })()}
          </section>

          {/* Text Styling */}
          {isText && (
            <section className="animate-fade-in pt-4 border-t border-(--border-color) space-y-4">
              {/* Font Family */}
              <div className="space-y-1.5">
                <label className="text-[10px] text-(--text-tertiary) font-medium ml-1">{t('designer.fontFamily', '字体')}</label>
                <select
                  value={selectedObject.fontFamily || 'Arial'}
                  onChange={(e) => onPropertyChange('fontFamily', e.target.value)}
                  className="w-full h-8 text-xs bg-(--bg-primary) border border-(--border-color) rounded-md px-2 focus:border-(--primary) transition-all text-(--text-primary)"
                >
                  <optgroup label="无衬线字体">
                    <option value="Arial">Arial</option>
                    <option value="Helvetica">Helvetica</option>
                    <option value="Microsoft YaHei">微软雅黑</option>
                    <option value="PingFang SC">苹方</option>
                    <option value="Noto Sans SC">思源黑体</option>
                    <option value="sans-serif">系统默认无衬线</option>
                  </optgroup>
                  <optgroup label="衬线字体">
                    <option value="Times New Roman">Times New Roman</option>
                    <option value="Georgia">Georgia</option>
                    <option value="SimSun">宋体</option>
                    <option value="Noto Serif SC">思源宋体</option>
                    <option value="serif">系统默认衬线</option>
                  </optgroup>
                  <optgroup label="等宽字体">
                    <option value="Courier New">Courier New</option>
                    <option value="Consolas">Consolas</option>
                    <option value="monospace">系统默认等宽</option>
                  </optgroup>
                  <optgroup label="艺术字体">
                    <option value="Impact">Impact</option>
                    <option value="Comic Sans MS">Comic Sans MS</option>
                  </optgroup>
                  {customFonts.length > 0 && (
                    <optgroup label="上传字体">
                      {customFonts.map(font => (
                        <option key={font.filename} value={font.name}>{font.name}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] text-(--text-tertiary) font-medium ml-1">{t('designer.fontSize', '字号')}</label>
                  <Input
                    type="number"
                    value={selectedObject.fontSize}
                    className="h-8 text-xs bg-(--bg-primary) border-(--border-color)"
                    onChange={(e) => onPropertyChange('fontSize', parseInt(e.target.value))}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] text-(--text-tertiary) font-medium ml-1">行高</label>
                  <Input
                    type="number"
                    value={selectedObject.lineHeight || 1}
                    step="0.1"
                    className="h-8 text-xs bg-(--bg-primary) border-(--border-color)"
                    onChange={(e) => onPropertyChange('lineHeight', parseFloat(e.target.value))}
                  />
                </div>
              </div>

              <div className="flex gap-1 bg-(--bg-tertiary) p-1 rounded-lg">
                <Button variant="ghost" size="sm" className={cn("flex-1 h-7 p-0", selectedObject.fontWeight === 'bold' && "bg-white text-(--primary) shadow-sm")} onClick={() => onPropertyChange('fontWeight', selectedObject.fontWeight === 'bold' ? 'normal' : 'bold')}>B</Button>
                <Button variant="ghost" size="sm" className={cn("flex-1 h-7 p-0 italic", selectedObject.fontStyle === 'italic' && "bg-white text-(--primary) shadow-sm")} onClick={() => onPropertyChange('fontStyle', selectedObject.fontStyle === 'italic' ? 'normal' : 'italic')}>I</Button>
                <Button variant="ghost" size="sm" className={cn("flex-1 h-7 p-0 underline", selectedObject.underline && "bg-white text-(--primary) shadow-sm")} onClick={() => onPropertyChange('underline', !selectedObject.underline)}>U</Button>
              </div>

              <div className="flex gap-1 bg-(--bg-tertiary) p-1 rounded-lg">
                <Button variant="ghost" size="sm" className={cn("flex-1 h-7 p-0", selectedObject.textAlign === 'left' && "bg-white text-(--primary) shadow-sm")} onClick={() => onPropertyChange('textAlign', 'left')}><AlignLeft className="w-3.5 h-3.5" /></Button>
                <Button variant="ghost" size="sm" className={cn("flex-1 h-7 p-0", selectedObject.textAlign === 'center' && "bg-white text-(--primary) shadow-sm")} onClick={() => onPropertyChange('textAlign', 'center')}><AlignCenter className="w-3.5 h-3.5" /></Button>
                <Button variant="ghost" size="sm" className={cn("flex-1 h-7 p-0", selectedObject.textAlign === 'right' && "bg-white text-(--primary) shadow-sm")} onClick={() => onPropertyChange('textAlign', 'right')}><AlignRight className="w-3.5 h-3.5" /></Button>
              </div>
            </section>
          )}

          {/* Variable Binding - Text Only */}
          {isText && (() => {
            const TEXT_VARS = [
              { var: '{{primary_title}}', label: '主标题', desc: '媒体库名称' },
              { var: '{{secondary_title}}', label: '副标题', desc: '自定义副标题文字' },
              { var: '{{title}}', label: '媒体标题', desc: '媒体项目标题' },
              { var: '{{year}}', label: '年份', desc: '发行年份' },
              { var: '{{rating}}', label: '评分', desc: '评分，如 8.5' },
              { var: '{{genres}}', label: '类型', desc: '媒体类型，如 动作 / 剧情' },
            ];
            const boundVar = TEXT_VARS.find(v => selectedObject.textVar === v.var);
            return (
              <section className="bg-(--bg-secondary)/50 border border-(--border-color) rounded-xl p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-(--text-secondary) uppercase flex items-center gap-1.5">
                    <Wand2 className="w-3 h-3 text-(--primary)" />
                    {t('designer.placeholder', '变量绑定')}
                  </span>
                  {boundVar && (
                    <span className="text-[10px] text-green-600 flex items-center gap-0.5 font-medium">
                      <Check className="w-2.5 h-2.5" /> 已绑定
                    </span>
                  )}
                </div>

                {/* 已绑定时显示说明 */}
                {boundVar && (
                  <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-green-50 border border-green-200">
                    <Check className="w-3 h-3 text-green-600 shrink-0" />
                    <span className="text-[11px] text-green-700 leading-relaxed flex-1">
                      渲染时显示 <strong>{boundVar.desc}</strong>，原文字不变
                    </span>
                  </div>
                )}

                <div className="flex flex-wrap gap-1.5">
                  {TEXT_VARS.map((item) => {
                    const isActive = selectedObject.textVar === item.var;
                    return (
                      <button
                        key={item.var}
                        onClick={() => {
                          // 已绑定 → 点击取消绑定；未绑定 → 设置 textVar（不改 text）
                          onPropertyChange('textVar', isActive ? '' : item.var);
                        }}
                        title={isActive ? '点击取消绑定' : `渲染时替换为：${item.desc}（不改变原文字）`}
                        className={cn(
                          "flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium border transition-all",
                          isActive
                            ? "bg-(--primary) text-white border-(--primary) shadow-sm"
                            : "bg-(--bg-primary) text-(--text-secondary) border-(--border-color) hover:border-(--primary) hover:text-(--primary)"
                        )}
                      >
                        {isActive && <Check className="w-2.5 h-2.5" />}
                        {item.label}
                      </button>
                    );
                  })}
                </div>

                {!boundVar && (
                  <p className="text-[10px] text-(--text-tertiary) leading-relaxed">
                    点击标签绑定变量，渲染时自动替换，不改变画布中的文字内容
                  </p>
                )}
              </section>
            );
          })()}

          {/* Variable Binding - Poster Only */}
          {(selectedObject.isPoster || selectedObject.type === 'image') && (
            <section className="bg-(--bg-secondary)/50 border border-(--border-color) rounded-xl p-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-(--text-secondary) uppercase flex items-center gap-1.5">
                  <Wand2 className="w-3 h-3 text-(--primary)" />
                  海报变量
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {Array.from({ length: 9 }).map((_, i) => {
                  const varName = `post${i + 1}`;
                  const isActive = selectedObject.posterVar === varName;
                  const imgUrl = getSamplePosterUrl(i + 1);

                  return (
                    <button
                      key={varName}
                      onClick={() => onPropertyChange('posterVar', varName)}
                      className={cn(
                        "relative aspect-[2/3] rounded-lg border overflow-hidden transition-all group",
                        isActive
                          ? "ring-2 ring-(--primary) border-transparent"
                          : "border-(--border-color) hover:border-(--primary) hover:shadow-sm"
                      )}
                      title={`切换到海报 ${i + 1}`}
                    >
                      <img
                        src={imgUrl}
                        alt={`Poster ${i + 1}`}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                      <div className={cn(
                        "absolute inset-0 flex items-center justify-center bg-black/40 transition-opacity",
                        isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                      )}>
                        <span className="text-[10px] font-mono text-white font-bold bg-black/50 px-1.5 py-0.5 rounded backdrop-blur-sm">
                          {`{{${varName}}}`}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
              {selectedObject.posterVar && (
                <p className="text-[10px] text-(--text-tertiary)">
                  当前绑定: <code className="text-(--primary)">{`{{${selectedObject.posterVar}}}`}</code>
                </p>
              )}
            </section>
          )}
        </>
      ) : (
        /* Shadow Controls */
        <section className="space-y-5 animate-fade-in">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-(--text-secondary)">启用阴影</span>
            <input
              type="checkbox"
              checked={!!selectedObject.shadow}
              onChange={(e) => {
                const val = e.target.checked ? { color: 'rgba(0,0,0,0.5)', blur: 10, offsetX: 5, offsetY: 5 } : null;
                onPropertyChange('shadow', val);
              }}
              className="w-4 h-4 accent-(--primary) rounded cursor-pointer"
            />
          </div>

          {selectedObject.shadow && (
            <>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-(--text-tertiary)">模糊度</span>
                  <span className="text-[10px] text-(--text-tertiary)">{selectedObject.shadow.blur}px</span>
                </div>
                <input
                  type="range" min="0" max="50"
                  value={selectedObject.shadow.blur || 0}
                  onChange={(e) => onPropertyChange('shadow', { ...selectedObject.shadow, blur: parseInt(e.target.value) })}
                  className="w-full h-1.5 bg-(--bg-tertiary) rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:bg-(--primary) [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-(--text-tertiary)">偏移量</span>
                  <span className="text-[10px] text-(--text-tertiary)">{selectedObject.shadow.offsetX}px</span>
                </div>
                <input
                  type="range" min="-50" max="50"
                  value={selectedObject.shadow.offsetX || 0}
                  onChange={(e) => onPropertyChange('shadow', {
                    ...selectedObject.shadow,
                    offsetX: parseInt(e.target.value),
                    offsetY: parseInt(e.target.value)
                  })}
                  className="w-full h-1.5 bg-(--bg-tertiary) rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:bg-(--primary) [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full"
                />
              </div>
              <div className="space-y-2">
                <span className="text-xs font-medium text-(--text-tertiary)">颜色</span>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={toHex(selectedObject.shadow.color)}
                    onChange={(e) => onPropertyChange('shadow', { ...selectedObject.shadow, color: e.target.value })}
                    className="w-full h-8 rounded cursor-pointer border border-(--border-color)"
                  />
                </div>
              </div>
            </>
          )}
        </section>
      )}

    </div>
  );
}
