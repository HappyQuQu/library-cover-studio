import { fileURLToPath } from 'node:url';
import artworkSlots from '../config/artworkSlots.json' with { type: 'json' };

export const artworkSamplesDirectory = fileURLToPath(new URL('../../src/template/poster/', import.meta.url));

export function artworkSampleFilename(slot: number) {
  return `${(slot - 1) % artworkSlots.bundledArtworkSamples + 1}.jpg`;
}
