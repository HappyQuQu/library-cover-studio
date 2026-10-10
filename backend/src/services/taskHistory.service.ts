import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { TASK_HISTORY_DIR } from '../config/paths.js';

/** Only server-generated identifiers can address a snapshot; never accept a storage path from the client. */
export function historyImagePath(name: string | null | undefined): string | undefined {
  if (!name || !/^[a-f0-9-]{36}(?:\.png|-thumb\.jpg)$/i.test(name)) return;
  return path.join(TASK_HISTORY_DIR, name);
}

export async function saveHistoryCover(id: string, buffer: Buffer) {
  const imageName = `${id}.png`, thumbnailName = `${id}-thumb.jpg`;
  const imagePath = historyImagePath(imageName), thumbnailPath = historyImagePath(thumbnailName);
  if (!imagePath || !thumbnailPath) throw new Error('Invalid history identifier');
  await fs.mkdir(TASK_HISTORY_DIR, { recursive: true });
  const image = sharp(buffer);
  const { width, height } = await image.metadata();
  const png = await image.png().toBuffer();
  // Keep the original and a small preview independently from optional cover exports.
  try {
    await fs.writeFile(imagePath, png, { flag: 'wx' });
    await fs.writeFile(thumbnailPath, await sharp(png).resize({ width: 480, height: 300, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#111111' }).jpeg({ quality: 85 }).toBuffer(), { flag: 'wx' });
  } catch (error) {
    await removeHistoryImages([imageName, thumbnailName]);
    throw error;
  }
  return { imageName, thumbnailName, width, height };
}

export async function removeHistoryImages(names: (string | null)[]) {
  for (const name of names) {
    const file = historyImagePath(name);
    if (file) await fs.rm(file, { force: true });
  }
}
