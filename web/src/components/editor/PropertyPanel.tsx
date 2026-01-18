import { Trash2, Copy, MousePointer2, Wand2, AlignLeft, AlignCenter, AlignRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useState } from 'react';

interface PropertyPanelProps {
  selectedObject: any;
  onPropertyChange: (prop: string, value: any) => void;
  onDelete: () => void;
  onClone: () => void;
}

export function PropertyPanel({ selectedObject, onPropertyChange, onDelete, onClone }: PropertyPanelProps) {
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
              className="h-8 text-xs bg-(--bg-primary) border-(--border-color) focus:border-(--primary) transition-all font-mono"
              onChange={(e) => onPropertyChange('left', parseInt(e.target.value))} 
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] text-(--text-tertiary) font-medium ml-1">Y</label>
            <Input 
              type="number" 
              value={Math.round(selectedObject.top || 0)} 
              className="h-8 text-xs bg-(--bg-primary) border-(--border-color) focus:border-(--primary) transition-all font-mono"
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
                    value={selectedObject.fill as string} 
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
          </section>

          {/* Text Styling */}
          {isText && (
            <section className="animate-fade-in pt-4 border-t border-(--border-color) space-y-4">
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

           {/* Variable Binding */}
          <section className="bg-(--bg-secondary)/50 border border-(--border-color) rounded-xl p-3 space-y-3">
             <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-(--text-secondary) uppercase flex items-center gap-1.5">
                   <Wand2 className="w-3 h-3 text-(--primary)" />
                   {t('designer.placeholder', '变量绑定')}
                </span>
             </div>
             <div className="grid grid-cols-1 gap-1.5">
               {[
                  { var: '{{title}}', label: t('designer.movieTitle', '影片标题') },
                  { var: '{{year}}', label: t('designer.year', '年份') },
               ].map((item) => (
                  <button 
                    key={item.var}
                    onClick={() => isText && onPropertyChange('text', (selectedObject.text || '') + item.var)}
                    className="flex items-center justify-between px-3 py-2 rounded-lg bg-white border border-(--border-color) hover:border-(--primary) hover:shadow-sm transition-all group text-left"
                  >
                    <code className="text-[10px] font-mono text-(--primary) bg-(--primary)/10 px-1 rounded">{item.var}</code>
                    <span className="text-[10px] text-(--text-tertiary) group-hover:text-(--text-secondary)">{item.label}</span>
                  </button>
               ))}
             </div>
          </section>
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
                          value={typeof selectedObject.shadow.color === 'string' ? selectedObject.shadow.color : '#000000'}
                          onChange={(e) => onPropertyChange('shadow', { ...selectedObject.shadow, color: e.target.value })}
                          className="w-full h-8 rounded cursor-pointer border border-(--border-color)"
                       />
                    </div>
                 </div>
              </>
           )}
        </section>
      )}

      {/* Footer Actions */}
      <div className="mt-auto pt-4 border-t border-(--border-color) grid grid-cols-2 gap-3 fixed bottom-4 w-[280px] bg-(--bg-glass) backdrop-blur-md p-4 left-[96px] rounded-t-xl z-50 shadow-[0_-4px_10px_rgba(0,0,0,0.05)] border-x" style={{ left: 'auto', width: 'auto', position: 'static', background: 'transparent', padding: 0, border: 'none', boxShadow: 'none' }}>
        <Button 
          variant="outline" 
          className="h-9 hover:bg-destructive/5 hover:text-destructive hover:border-destructive/30 transition-colors"
          onClick={onDelete}
        >
          <Trash2 className="w-4 h-4 mr-2" />
          {t('common.delete', '删除')}
        </Button>
        <Button variant="outline" className="h-9 hover:bg-(--primary)/5 hover:text-(--primary) hover:border-(--primary)/30 transition-colors" onClick={onClone}>
          <Copy className="w-4 h-4 mr-2" />
          {t('designer.duplicate', '复制')}
        </Button>
      </div>
    </div>
  );
}
