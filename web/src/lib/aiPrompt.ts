import type { DesignScope } from './aiDesign';

// Model instructions are source content. Interface-language changes must never rewrite them.
export const DEFAULT_REFERENCE_PROMPT = '分析参考图的配色、构图和文字层级，参考其风格设计一张媒体库海报，保留主副标题变量。';
export function buildDesignPrompt(prompt: string, scope: DesignScope, selectedIds: string[]): string {
  const constraints = scope === 'selection'
    ? `仅修改这些图层 ID：${selectedIds.join('、')}。保留这些 ID，返回完整画布 JSON。其他图层和背景必须原样保留。`
    : scope === 'new' ? '生成新的封面设计，保留上下文中的锁定图层。' : '在当前设计上优化，保留所有现有图层 ID、图片素材和变量绑定。';
  return `${prompt}\n\n设计约束：${constraints}\n所有锁定图层保持原样。`;
}
