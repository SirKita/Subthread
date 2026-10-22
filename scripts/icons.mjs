// Render public/icon/source.svg to the four manifest PNG sizes.
// Usage: pnpm icons            → public/icon/{16,32,48,128}.png (the shipped icons)
//        pnpm icons --preview  → public/icon/variants/preview.png: a contact sheet of every
//                                public/icon/variants/<name>.svg (+ <name>-light.svg) at
//                                16 px (actual size and 4× nearest-neighbour zoom), 32 and
//                                128 px, on a light and a dark toolbar background.
/* global Buffer */
import { mkdir, readdir } from 'node:fs/promises';
import sharp from 'sharp';

const SOURCE = 'public/icon/source.svg';
const OUT_DIR = 'public/icon';
const SIZES = [16, 32, 48, 128];

const VARIANTS_DIR = 'public/icon/variants';
const PREVIEW = `${VARIANTS_DIR}/preview.png`;
const CELL = 152; // grid cell in px; fits the 128 render with a gutter
const LABEL_W = 88; // row-label column
const HEAD_H = 44; // per-band header with column titles
const COLUMNS = [
  { size: 16, zoom: 1, title: '16' },
  { size: 16, zoom: 4, title: '16 ×4' },
  { size: 32, zoom: 1, title: '32' },
  { size: 128, zoom: 1, title: '128' },
];
const THEMES = ['dark', 'light']; // <name>.svg is the dark-background icon, <name>-light.svg the inverted one
const TOOLBARS = [
  { name: 'on a light toolbar', bg: '#f1f3f4', fg: '#202124' },
  { name: 'on a dark toolbar', bg: '#35363a', fg: '#e8eaed' },
];

/** Rasterize an SVG at `size` px: rendered at 8× and downsampled, exactly as the shipped PNGs are. */
function rasterize(svgPath, size) {
  return sharp(svgPath, { density: 72 * (size / 128) * 8 })
    .resize(size, size)
    .png();
}

async function renderShipped() {
  await mkdir(OUT_DIR, { recursive: true });
  for (const size of SIZES) {
    await rasterize(SOURCE, size).toFile(`${OUT_DIR}/${size}.png`);
    console.log(`wrote ${OUT_DIR}/${size}.png`);
  }
}

async function renderPreview() {
  const files = await readdir(VARIANTS_DIR);
  const names = files
    .filter((file) => file.endsWith('.svg') && !file.endsWith('-light.svg'))
    .map((file) => file.slice(0, -'.svg'.length))
    .sort();
  if (names.length === 0) throw new Error(`no variant SVGs in ${VARIANTS_DIR}`);

  // One raster per (file, size), reused across bands; zoomed cells are nearest-neighbour upscales.
  const rasters = new Map();
  const cell = async (name, theme, column) => {
    const file = `${VARIANTS_DIR}/${name}${theme === 'light' ? '-light' : ''}.svg`;
    const key = `${file}@${column.size}`;
    if (!rasters.has(key)) rasters.set(key, await rasterize(file, column.size).toBuffer());
    const png = rasters.get(key);
    const px = column.size * column.zoom;
    const input =
      column.zoom === 1
        ? png
        : await sharp(png).resize(px, px, { kernel: sharp.kernel.nearest }).png().toBuffer();
    return { input, px };
  };

  const width = LABEL_W + THEMES.length * COLUMNS.length * CELL + 16;
  const bandHeight = HEAD_H + names.length * CELL;
  const height = TOOLBARS.length * bandHeight;
  const layers = [];
  const labels = [];
  const text = (x, y, content, fill, anchor = 'start') =>
    `<text x="${x}" y="${y}" fill="${fill}" text-anchor="${anchor}" ` +
    `font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="14">${content}</text>`;

  for (const [band, toolbar] of TOOLBARS.entries()) {
    const top = band * bandHeight;
    labels.push(
      `<rect x="0" y="${top}" width="${width}" height="${bandHeight}" fill="${toolbar.bg}"/>`,
    );
    labels.push(text(12, top + 18, toolbar.name, toolbar.fg));
    for (const [t, theme] of THEMES.entries()) {
      for (const [c, column] of COLUMNS.entries()) {
        const x = LABEL_W + (t * COLUMNS.length + c) * CELL;
        const title = c === 0 ? `${theme} icon · ${column.title}` : column.title;
        labels.push(text(x + CELL / 2, top + 36, title, toolbar.fg, 'middle'));
      }
    }
    for (const [row, name] of names.entries()) {
      const rowTop = top + HEAD_H + row * CELL;
      labels.push(text(12, rowTop + CELL / 2 + 5, name.toUpperCase(), toolbar.fg));
      for (const [t, theme] of THEMES.entries()) {
        for (const [c, column] of COLUMNS.entries()) {
          const { input, px } = await cell(name, theme, column);
          layers.push({
            input,
            left: Math.round(LABEL_W + (t * COLUMNS.length + c) * CELL + (CELL - px) / 2),
            top: Math.round(rowTop + (CELL - px) / 2),
          });
        }
      }
    }
  }

  const overlay = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${labels.join('')}</svg>`;
  await sharp({ create: { width, height, channels: 4, background: TOOLBARS[0].bg } })
    .composite([{ input: Buffer.from(overlay), left: 0, top: 0 }, ...layers])
    .png()
    .toFile(PREVIEW);
  console.log(
    `wrote ${PREVIEW} (${names.length} variants × ${THEMES.length} themes × ${COLUMNS.length} cells × ${TOOLBARS.length} toolbars)`,
  );
}

if (process.argv.includes('--preview')) {
  await renderPreview();
} else {
  await renderShipped();
}
