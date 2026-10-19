import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

test('all nine bundled landscape examples are distinct, decodable 16:9 images', async () => {
  const sharp = createRequire(new URL('../backend/package.json', import.meta.url))('sharp');
  const hashes = new Set<string>();
  for (let number = 1; number <= 9; number++) {
    const image = readFileSync(new URL(`../backend/src/template/poster/backdrops/${number}.jpg`, import.meta.url));
    const metadata = await sharp(image).metadata();
    assert.equal(metadata.format, 'jpeg');
    assert.equal(metadata.width / metadata.height, 16 / 9);
    await sharp(image).resize(64, 36).raw().toBuffer();
    hashes.add(createHash('sha256').update(image).digest('hex'));
  }
  assert.equal(hashes.size, 9, 'each choice must show a different example');
});
