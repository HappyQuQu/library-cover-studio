import * as mediaClient from './mediaClient.service.js';
import { isBlackImage } from '../utils/imageUtils.js';

/** Count only library-bound images; text-only layouts do not need artwork. */
export function requiredPosterCount(canvasJson: string): number {
  const canvas = JSON.parse(canvasJson);
  return Math.min(9, (canvas.objects || []).reduce((count: number, object: any) => {
    if (object.visible === false || object.opacity === 0) return count;
    const variable = object.posterVar?.match(/post(\d+)/)?.[1];
    const asset = !variable && typeof object.src === 'string' ? (object.src.match(/\{\{poster(\d+)\}\}/)?.[1] || object.src.match(/\/posters\/(\d+)\.(?:jpg|png|jpeg)/i)?.[1]) : undefined;
    return Math.max(count, Number(variable || asset || (object.isPoster || object.src === '{{poster}}' ? 1 : 0)));
  }, canvas.posterBackground ? 1 : 0));
}

/** Shared asset selection keeps preview and task execution consistent. */
export async function fetchLibraryPosters(server: { type: string; url: string }, apiKey: string, libraryId: string,
  sortBy = 'DateCreated', maxBatches = Number.POSITIVE_INFINITY, onPoster?: (poster: Buffer, name: string, imageType: string) => Promise<void>, libraryType?: string, requiredCount = 9) {
  const posters: Buffer[] = [];
  for (let batch = 0; posters.length < requiredCount && batch < maxBatches; batch++) {
    const result = await mediaClient.getLibraryItems(server.type, server.url, apiKey, libraryId, {
      limit: 10, startIndex: batch * 10, sortBy, sortOrder: ['Name', 'SortName'].includes(sortBy) ? 'Ascending' : 'Descending', libraryType
    });
    for (const item of result.items) {
      if (posters.length === requiredCount) break;
      for (const type of ['Primary', 'Art', 'Backdrop', 'Banner', 'Logo', 'Thumb', 'Disc', 'Box', 'Screenshot', 'Menu', 'Chapter', 'BoxRear', 'Profile']) {
        try {
          if (!item.imageTags?.[type]) continue;
          const poster = await mediaClient.downloadCover(server.type, server.url, apiKey, item.id, type, { tag: item.imageTags[type] });
          if (!poster?.length || poster.length === 11488 || await isBlackImage(poster)) continue;
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
  if (uniqueCount) while (posters.length < requiredCount) posters.push(posters[posters.length % uniqueCount]);
  return { posters, uniqueCount };
}
