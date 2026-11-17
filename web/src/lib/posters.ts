import { apiClient } from '@/api/client';
import artworkSlots from '../../../backend/src/config/artworkSlots.json';

export const { maxArtworkSlots, bundledArtworkSamples } = artworkSlots;

export function getArtworkSlotNumber(variable: string): number | undefined {
  const match = /^post([1-9]\d?)$/.exec(variable);
  const slot = Number(match?.[1]);
  return slot <= maxArtworkSlots ? slot : undefined;
}

type PosterCanvas = { posterSource?: string; getObjects?: () => unknown[] } | null;

export function getSamplePosterUrl(index: number | string, canvas?: PosterCanvas, artworkSource?: string): string {
  const baseUrl = (apiClient.defaults.baseURL || '/api').replace(/\/+$/, '');
  const source = artworkSource === 'poster' || artworkSource === 'backdrop' ? artworkSource : canvas?.posterSource;
  const directory = source === 'backdrop' ? 'backdrops/' : '';
  return `${baseUrl}/templates/posters/${directory}${index}.jpg`;
}
