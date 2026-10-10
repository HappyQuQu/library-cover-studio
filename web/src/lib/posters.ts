import { apiClient } from '@/api/client';

/** Share the configured API address across poster thumbnails and canvas loading. */
export function getSamplePosterUrl(index: number | string): string {
  const baseUrl = (apiClient.defaults.baseURL || '/api').replace(/\/+$/, '');
  return `${baseUrl}/templates/posters/${index}.jpg`;
}
