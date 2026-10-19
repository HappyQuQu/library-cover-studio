import { apiClient } from '@/api/client';

type PosterCanvas = { posterSource?: string; getObjects?: () => unknown[] } | null;

/** Both artwork sources have nine distinct bundled examples, matching their slot number. */
export function getSamplePosterUrl(index: number | string, canvas?: PosterCanvas, artworkSource?: string): string {
  const baseUrl = (apiClient.defaults.baseURL || '/api').replace(/\/+$/, '');
  const source = artworkSource === 'poster' || artworkSource === 'backdrop' ? artworkSource : canvas?.posterSource;
  const directory = source === 'backdrop' ? 'backdrops/' : '';
  return `${baseUrl}/templates/posters/${directory}${index}.jpg`;
}
