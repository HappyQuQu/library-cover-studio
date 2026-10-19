import { apiClient } from '@/api/client';

/** Share the configured API address across poster thumbnails and canvas loading. */
export function getSamplePosterUrl(index: number | string, canvas?: { posterSource?: string; getObjects?: () => any[] } | null): string {
  const baseUrl = (apiClient.defaults.baseURL || '/api').replace(/\/+$/, '');
  if (canvas?.posterSource === 'backdrop') {
    const sample = canvas.getObjects?.().find(object => {
      const element = object.getElement?.();
      const width = element?.naturalWidth ?? object.width;
      const height = element?.naturalHeight ?? object.height;
      return object.posterVar === `post${index}` && typeof object.getSrc === 'function' && width > height;
    });
    return sample?.getSrc() || `${baseUrl}/templates/posters/backdrop.jpg`;
  }
  return `${baseUrl}/templates/posters/${index}.jpg`;
}
