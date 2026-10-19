import i18n from './i18n';
import { CodedError } from './codedError';
export type DesignScope = 'new' | 'canvas' | 'selection';
export type CanvasJSON = Record<string, any> & { objects: Record<string, any>[] };

export const CANVAS_PROPERTIES = ['id', 'name', 'posterVar', 'isPoster', 'textVar', 'fitText', 'wrapText', 'randomOnGeneration', 'randomBackgroundStyle', 'posterBackground', 'posterSource',
  'lockMovementX', 'lockMovementY', 'lockScalingX', 'lockScalingY', 'lockRotation', 'selectable', 'evented'];

export function isLocked(object: Record<string, any>): boolean {
  return !!(object.lockMovementX || object.lockMovementY || object.lockScalingX || object.lockScalingY || object.lockRotation);
}

/** Keep image data locally; the model receives stable IDs and small asset references. */
export function summarizeCanvas(json: CanvasJSON): CanvasJSON {
  return JSON.parse(JSON.stringify(json, (key, value) =>
    key === 'src' && typeof value === 'string' && value.startsWith('data:') ? '[original-asset]' : value));
}

function restoreAsset(object: Record<string, any>, original?: Record<string, any>) {
  const next = { ...original, ...object };
  if (original?.src) next.src = original.src;
  // Template variable bindings are metadata, not a design choice.
  for (const key of ['posterVar', 'textVar', 'isPoster', 'fitText', 'wrapText']) {
    if (original?.[key] !== undefined) next[key] = original[key];
  }
  return next;
}

/** Enforce edit boundaries even when a model returns changes outside the requested scope. */
export function constrainDesign(result: CanvasJSON, baseline: CanvasJSON, scope: DesignScope, selectedIds: string[]): CanvasJSON {
  if (!result || !Array.isArray(result.objects)) throw new CodedError('AI_INVALID_CANVAS');
  if (result.objects.some(object => !object || typeof object !== 'object')) throw new CodedError('AI_INVALID_CANVAS');
  const ids = result.objects.map(object => object.id).filter(Boolean);
  if (new Set(ids).size !== ids.length) throw new CodedError('AI_DUPLICATE_IDS');
  const originalById = new Map(baseline.objects.map(object => [object.id, object]));
  const generatedById = new Map(result.objects.map(object => [object.id, object]));
  if (scope === 'selection') {
    if (!selectedIds.length) throw new CodedError('AI_SELECTION_REQUIRED');
    if (selectedIds.some(id => !generatedById.has(id))) throw new CodedError('AI_SELECTION_MISSING');
    return { ...baseline, objects: baseline.objects.map(object =>
      selectedIds.includes(object.id) && !isLocked(object)
        ? restoreAsset(generatedById.get(object.id)!, object) : object) };
  }
  const objects = result.objects.filter(object => !isLocked(originalById.get(object.id) || {})).map(object => {
    const original = originalById.get(object.id);
    return original && isLocked(original) ? original : restoreAsset(object, scope === 'canvas' ? original : undefined);
  });
  if (scope === 'canvas') baseline.objects.forEach((object, index) => {
    if (!isLocked(object) && !objects.some(next => next.id === object.id)) objects.splice(Math.min(index, objects.length), 0, object);
  });
  // Retain locked objects at their original stacking positions, even in a new design.
  baseline.objects.forEach((object, index) => {
    if (isLocked(object) && !objects.some(next => next.id === object.id)) objects.splice(Math.min(index, objects.length), 0, object);
  });
  const next: CanvasJSON = { ...(scope === 'canvas' ? baseline : {}), ...result, objects };
  if (scope === 'canvas' && baseline.posterSource !== undefined) next.posterSource = baseline.posterSource;
  if (scope === 'canvas' && result.backgroundImage) {
    next.backgroundImage = restoreAsset(result.backgroundImage, baseline.backgroundImage);
  }
  return next;
}

export function describeChangeKeys(baseline: CanvasJSON, result: CanvasJSON, scope: DesignScope) {
  if (scope === 'new') return ['aiChat.changeNew', 'aiChat.changeLocked'] as const;
  const originals = new Map(baseline.objects.map(object => [object.id, object]));
  const labels = new Set<'aiChat.changeAdded' | 'aiChat.changeText' | 'aiChat.changeLayout' | 'aiChat.changeStyle' | 'aiChat.changeRemoved' | 'aiChat.changeBackground'>();
  const changed = (a: any, b: any, keys: string[]) => keys.some(key => JSON.stringify(a[key]) !== JSON.stringify(b[key]));
  for (const object of result.objects) {
    const original = originals.get(object.id);
    if (!original) { labels.add('aiChat.changeAdded'); continue; }
    if (changed(original, object, ['text', 'fontSize', 'fontFamily', 'fontWeight', 'textAlign', 'lineHeight', 'charSpacing'])) labels.add('aiChat.changeText');
    if (changed(original, object, ['left', 'top', 'width', 'height', 'scaleX', 'scaleY', 'angle'])) labels.add('aiChat.changeLayout');
    if (changed(original, object, ['fill', 'stroke', 'opacity', 'shadow', 'rx', 'ry'])) labels.add('aiChat.changeStyle');
  }
  if (baseline.objects.some(object => !result.objects.some(next => next.id === object.id))) labels.add('aiChat.changeRemoved');
  if (changed(baseline, result, ['background', 'backgroundImage', 'posterBackground'])) labels.add('aiChat.changeBackground');
  return labels.size ? [...labels] : ['aiChat.changeUnchanged'] as const;
}

/** Compatibility helper; chat state stores keys rather than these display strings. */
export function describeChanges(baseline: CanvasJSON, result: CanvasJSON, scope: DesignScope): string[] {
  return describeChangeKeys(baseline, result, scope).map(key => i18n.t(key));
}
