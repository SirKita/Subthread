// Render public/icon/source.svg to the four manifest PNG sizes.
// Usage: pnpm icons                      → public/icon/{16,32,48,128}.png (the shipped icons)
//        pnpm icons --preview [name...]  → public/icon/variants/preview.png: a contact sheet of
//                                          public/icon/variants/<name>.svg (+ <name>-light.svg),
//                                          all of them or only the names given, at 16 px (actual
//                                          size and 4× nearest-neighbour zoom), 32 and 128 px on a
//                                          light and a dark toolbar background, plus 16 px strips
//                                          on #FFFFFF and #202124 (Chrome's toolbar colours).
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
// 16 px icons laid out like a toolbar row, at actual size and 4× zoom, on Chrome's exact colours.
const STRIPS = [
  { name: '#FFFFFF strip', bg: '#ffffff' },
  { name: '#202124 strip', bg: '#202124' },
];
const STRIP_H = 40;
const STRIP_ICON = 16;
const STRIP_GAP = 12;
const STRIP_ZOOM = 4;

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

async function renderPreview(only) {
  const files = await readdir(VARIANTS_DIR);
  const all = files
    .filter((file) => file.endsWith('.svg') && !file.endsWith('-light.svg'))
    .map((file) => file.slice(0, -'.svg'.length))
    .sort();
  const missing = only.filter((name) => !all.includes(name));
  if (missing.length > 0) throw new Error(`no such variant(s): ${missing.join(', ')}`);
  const names = only.length > 0 ? only : all;
  if (names.length === 0) throw new Error(`no variant SVGs in ${VARIANTS_DIR}`);

  // One raster per (file, size), reused everywhere; zoomed cells are nearest-neighbour upscales.
  const rasters = new Map();
  const raster = async (name, theme, size) => {
    const file = `${VARIANTS_DIR}/${name}${theme === 'light' ? '-light' : ''}.svg`;
    const key = `${file}@${size}`;
    if (!rasters.has(key)) rasters.set(key, await rasterize(file, size).toBuffer());
    return rasters.get(key);
  };
  const zoom = (png, w, h) =>
    sharp(png).resize(w, h, { kernel: sharp.kernel.nearest }).png().toBuffer();

  const width = LABEL_W + THEMES.length * COLUMNS.length * CELL + 16;
  const bandHeight = HEAD_H + names.length * CELL;
  const stripWidth = names.length * THEMES.length * (STRIP_ICON + STRIP_GAP) + STRIP_GAP;
  const stripRow = STRIP_H * STRIP_ZOOM + 24;
  const stripsTop = TOOLBARS.length * bandHeight;
  const height = stripsTop + HEAD_H + STRIPS.length * stripRow;
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
          const png = await raster(name, theme, column.size);
          const px = column.size * column.zoom;
          layers.push({
            input: column.zoom === 1 ? png : await zoom(png, px, px),
            left: Math.round(LABEL_W + (t * COLUMNS.length + c) * CELL + (CELL - px) / 2),
            top: Math.round(rowTop + (CELL - px) / 2),
          });
        }
      }
    }
  }

  // Toolbar strips: every included icon at 16 px in a row, actual size on the left, 4× on the right.
  const neutral = { bg: '#9e9e9e', fg: '#111111' };
  labels.push(
    `<rect x="0" y="${stripsTop}" width="${width}" height="${height - stripsTop}" fill="${neutral.bg}"/>`,
  );
  labels.push(
    text(12, stripsTop + 28, '16 px on toolbar strips: actual size, then ×4', neutral.fg),
  );
  for (const [s, strip] of STRIPS.entries()) {
    const top = stripsTop + HEAD_H + s * stripRow;
    const icons = [];
    for (const [i, name] of names.entries()) {
      for (const [t, theme] of THEMES.entries()) {
        icons.push({
          input: await raster(name, theme, STRIP_ICON),
          left: STRIP_GAP + (i * THEMES.length + t) * (STRIP_ICON + STRIP_GAP),
          top: (STRIP_H - STRIP_ICON) / 2,
        });
      }
    }
    const stripPng = await sharp({
      create: { width: stripWidth, height: STRIP_H, channels: 4, background: strip.bg },
    })
      .composite(icons)
      .png()
      .toBuffer();
    labels.push(text(12, top + STRIP_H / 2 + 5, strip.name, neutral.fg));
    layers.push({ input: stripPng, left: LABEL_W + 40, top });
    layers.push({
      input: await zoom(stripPng, stripWidth * STRIP_ZOOM, STRIP_H * STRIP_ZOOM),
      left: LABEL_W + 40 + stripWidth + 24,
      top,
    });
  }

  const overlay = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${labels.join('')}</svg>`;
  await sharp({ create: { width, height, channels: 4, background: TOOLBARS[0].bg } })
    .composite([{ input: Buffer.from(overlay), left: 0, top: 0 }, ...layers])
    .png()
    .toFile(PREVIEW);
  console.log(`wrote ${PREVIEW} (${names.join(', ')})`);
}

const args = process.argv.slice(2);
if (args.includes('--preview')) {
  await renderPreview(args.filter((arg) => !arg.startsWith('--')));
} else {
  await renderShipped();
}
