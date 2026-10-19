import * as mediaClient from './mediaClient.service.js';
import { isBlackImage } from '../utils/imageUtils.js';
import { artworkSlotNumber, type ArtworkSource, type ArtworkBuffers } from './artworkSource.service.js';
export { requiredArtworkSources } from './artworkSource.service.js';

/** Count only library-bound images; text-only layouts do not need artwork. */
export function requiredPosterCount(canvasJson: string): number {
  const canvas = JSON.parse(canvasJson);
  return Math.min(9, (canvas.objects || []).reduce((count: number, object: any) => {
    if (object.visible === false || object.opacity === 0) return count;
    return Math.max(count, artworkSlotNumber(object));
  }, canvas.posterBackground ? 1 : 0));
}

export function usesBackdropBackground(canvasJson: string): boolean {
  return JSON.parse(canvasJson).posterBackground?.source === 'backdrop';
}

export function getPosterSource(canvasJson: string): 'poster' | 'backdrop' {
  return JSON.parse(canvasJson).posterSource === 'backdrop' ? 'backdrop' : 'poster';
}

/** Shared asset selection keeps preview and task execution consistent. */
export async function fetchLibraryPosters(server: { type: string; url: string }, apiKey: string, libraryId: string,
  sortBy = 'DateCreated', maxBatches = Number.POSITIVE_INFINITY, onPoster?: (poster: Buffer, name: string, imageType: string) => Promise<void>, libraryType?: string, requiredCount = 9, includeBackdrop = false, posterSource: ArtworkSource = 'poster', sources: ArtworkSource[] = [posterSource]) {
  const posters: Buffer[] = [];
  sources = [...new Set([posterSource, ...sources])];
  const artworkBuffers: ArtworkBuffers = { [posterSource]: posters };
  for (const source of sources) artworkBuffers[source] ||= [];
  let backdrop: Buffer | undefined;
  for (let batch = 0; posters.length < requiredCount && batch < maxBatches; batch++) {
    const result = await mediaClient.getLibraryItems(server.type, server.url, apiKey, libraryId, {
      limit: 10, startIndex: batch * 10, sortBy, sortOrder: ['Name', 'SortName'].includes(sortBy) ? 'Ascending' : 'Descending', libraryType
    });
    for (const item of result.items) {
      if (posters.length === requiredCount) break;
      const downloaded = new Map<string, Promise<Buffer | null>>();
      const download = (type: string, maxWidth = 1000) => {
        const key = `${type}:${maxWidth}`;
        if (!downloaded.has(key)) downloaded.set(key, (async () => {
          if (!item.imageTags?.[type]) return null;
          const image = await mediaClient.downloadCover(server.type, server.url, apiKey, item.id, type, { tag: item.imageTags[type], maxWidth });
          return image?.length && image.length !== 11488 && !await isBlackImage(image) ? image : null;
        })());
        return downloaded.get(key)!;
      };
      const imageTypesFor = (source: ArtworkSource) => source === 'backdrop'
        ? ['Backdrop', 'Thumb', 'Primary', 'Art', 'Banner', 'Screenshot']
        : ['Primary', 'Art', 'Backdrop', 'Banner', 'Logo', 'Thumb', 'Disc', 'Box', 'Screenshot', 'Menu', 'Chapter', 'BoxRear', 'Profile'];
      const select = async (source: ArtworkSource) => {
        for (const type of imageTypesFor(source)) {
          try {
            const image = await download(type);
            if (image) return image;
          } catch (error) {
            if (!(error instanceof mediaClient.MediaServerError) || error.code !== 'MEDIA_INVALID_IMAGE') throw error;
          }
        }
        return null;
      };
      for (const type of imageTypesFor(posterSource)) {
        try {
          if (!item.imageTags?.[type]) continue;
          const poster = await download(type);
          if (!poster) continue;
          // Bind the backdrop to the first usable poster, skipping items with broken covers.
          if (includeBackdrop && !posters.length && item.imageTags?.Backdrop) {
            try {
              const candidate = type === 'Backdrop' ? poster : await download('Backdrop', 1920);
              if (candidate) backdrop = candidate;
            } catch (error) {
              if (!(error instanceof mediaClient.MediaServerError) || error.code !== 'MEDIA_INVALID_IMAGE') throw error;
            }
          }
          // Both sources use this same item. Missing alternate artwork falls back within the item.
          for (const source of sources) if (source !== posterSource) artworkBuffers[source]!.push(await select(source) || poster);
          posters.push(poster); await onPoster?.(poster, item.name, type); break;
        } catch (error) {
          // Missing/corrupt artwork can be skipped; connection and permission errors must surface.
          if (!(error instanceof mediaClient.MediaServerError) || error.code !== 'MEDIA_INVALID_IMAGE') throw error;
        }
      }
    }
    if (result.items.length < 10 || (batch + 1) * 10 >= result.totalCount) break;
  }
  const uniqueCount = posters.length;
  if (uniqueCount) for (const images of Object.values(artworkBuffers)) {
    while (images.length < requiredCount) images.push(images[images.length % uniqueCount]);
  }
  return { posters, uniqueCount, backdrop, artworkBuffers };
}
