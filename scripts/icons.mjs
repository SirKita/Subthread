// Render public/icon/source.svg to the four manifest PNG sizes.
// Usage: pnpm icons
import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';

const SOURCE = 'public/icon/source.svg';
const OUT_DIR = 'public/icon';
const SIZES = [16, 32, 48, 128];

await mkdir(OUT_DIR, { recursive: true });
for (const size of SIZES) {
  await sharp(SOURCE, { density: 72 * (size / 128) * 8 })
    .resize(size, size)
    .png()
    .toFile(`${OUT_DIR}/${size}.png`);
  console.log(`wrote ${OUT_DIR}/${size}.png`);
}
