export type ArtworkSource = 'poster' | 'backdrop';
export type ArtworkBuffers = Partial<Record<ArtworkSource, Buffer[]>>;

export function resolveArtworkSource(object: { artworkSource?: string }, canvas: { posterSource?: string }): ArtworkSource {
  if (object.artworkSource === 'poster' || object.artworkSource === 'backdrop') return object.artworkSource;
  return canvas.posterSource === 'backdrop' ? 'backdrop' : 'poster';
}

/** Legacy URLs and explicit bindings refer to the same ordered movie slots. */
export function artworkSlotNumber(object: { posterVar?: string; src?: string; isPoster?: boolean }): number {
  const source = typeof object.src === 'string' ? object.src : '';
  const value = (typeof object.posterVar === 'string' && object.posterVar.match(/post(\d+)/)?.[1])
    || source.match(/\{\{poster(\d+)\}\}/)?.[1]
    || source.match(/\/posters\/(?:backdrops\/)?(\d+)\.(?:jpg|png|jpeg)/i)?.[1];
  return Number(value || (object.isPoster || source === '{{poster}}' ? 1 : 0));
}

export function requiredArtworkSources(canvasJson: string): ArtworkSource[] {
  const canvas = JSON.parse(canvasJson);
  const sources = new Set<ArtworkSource>([resolveArtworkSource({}, canvas)]);
  for (const object of canvas.objects || []) {
    if (object.visible !== false && object.opacity !== 0 && artworkSlotNumber(object)) sources.add(resolveArtworkSource(object, canvas));
  }
  if (canvas.posterBackground) sources.add(canvas.posterBackground.source === 'backdrop' ? 'backdrop' : 'poster');
  return [...sources];
}
