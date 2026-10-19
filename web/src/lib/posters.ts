import { apiClient } from '@/api/client';

type PosterCanvas = { posterSource?: string; getObjects?: () => unknown[] } | null;

/** Both artwork sources have nine distinct bundled examples, matching their slot number. */
export function getSamplePosterUrl(index: number | string, canvas?: PosterCanvas): string {
  const baseUrl = (apiClient.defaults.baseURL || '/api').replace(/\/+$/, '');
  const directory = canvas?.posterSource === 'backdrop' ? 'backdrops/' : '';
  return `${baseUrl}/templates/posters/${directory}${index}.jpg`;
}
