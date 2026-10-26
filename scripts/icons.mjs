// Render public/icon/source.svg to the four manifest PNG sizes.
// Rule: the 16 px icon is silhouette-only; detail appears at 32 px and up.
// The source keeps its detail (inner ears, eyes) in a <g id="detail"> group with no nested groups;
// renders below DETAIL_MIN_PX strip that group first, so 16.png can never drift from the silhouette.
// Usage: pnpm icons                     → public/icon/{16,32,48,128}.png (the shipped icons)
//        pnpm icons --preview [svg...]  → .output/icon-preview.png (gitignored): a contact sheet of
//                                         the given SVG files (default: the shipped source) at 16 px
//                                         (actual size and 4× nearest-neighbour zoom), 32 (actual
//                                         and 2×), 48 and 128 px on a light and a dark toolbar
//                                         background, plus 16 px strips on #FFFFFF and #202124
//                                         (Chrome's toolbar colours). Judge candidates there before
//                                         promoting one to source.svg.
// Store assets, also written by `pnpm icons` — for the Chrome Web Store dashboard only, never
// referenced from the manifest, and kept out of the build by the build:publicAssets hook in
// wxt.config.ts:
//   public/icon/store-128.png      → the full icon at 96×96 centred on a transparent 128×128 canvas
//                                    (the store wants 96 px artwork with 16 px padding). The
//                                    in-extension 128.png stays full-bleed: Chrome's own UI wants that.
//   public/icon/promo-440x280.png  → small promo tile: the icon's background colour edge to edge,
//                                    the cat mark centred at ~180 px tall, no text.
/* global Buffer */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import sharp from 'sharp';

const SOURCE = 'public/icon/source.svg';
const OUT_DIR = 'public/icon';
const SIZES = [16, 32, 48, 128];
const DETAIL_MIN_PX = 32;
const DETAIL_GROUP = /<g id="detail">[\s\S]*?<\/g>/;

const STORE_ICON = 'public/icon/store-128.png';
const STORE_ICON_CANVAS = 128;
const STORE_ICON_ART = 96; // leaves 16 px of transparent padding on each side
const PROMO = 'public/icon/promo-440x280.png';
const PROMO_W = 440;
const PROMO_H = 280;
const PROMO_MARK_H = 180;
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

const PREVIEW = '.output/icon-preview.png';
const CELL = 152; // grid cell in px; fits the 128 render with a gutter
const LABEL_W = 88; // row-label column
const HEAD_H = 44; // per-band header with column titles
const COLUMNS = [
  { size: 16, zoom: 1, title: '16' },
  { size: 16, zoom: 4, title: '16 ×4' },
  { size: 32, zoom: 1, title: '32' },
  { size: 32, zoom: 2, title: '32 ×2' },
  { size: 48, zoom: 1, title: '48' },
  { size: 128, zoom: 1, title: '128' },
];
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

/**
 * Rasterize SVG text at `size` px to a PNG buffer. Up to 128 px: rendered at 8× and downsampled,
 * exactly as the shipped PNGs always were; larger sizes render at 2×. Below DETAIL_MIN_PX the
 * detail group is stripped first (silhouette only).
 */
function rasterizeSvg(svg, size) {
  const input = size < DETAIL_MIN_PX ? svg.replace(DETAIL_GROUP, '') : svg;
  const density = size <= 128 ? 72 * (size / 128) * 8 : (72 * size * 2) / 384;
  return sharp(Buffer.from(input), { density }).resize(size, size).png().toBuffer();
}

async function rasterize(svgPath, size) {
  return rasterizeSvg(await readFile(svgPath, 'utf8'), size);
}

async function renderShipped() {
  await mkdir(OUT_DIR, { recursive: true });
  for (const size of SIZES) {
    await writeFile(`${OUT_DIR}/${size}.png`, await rasterize(SOURCE, size));
    console.log(`wrote ${OUT_DIR}/${size}.png`);
  }
  await renderStoreAssets();
}

/** Dashboard-only artwork: the padded store icon and the small promo tile. */
async function renderStoreAssets() {
  const svg = await readFile(SOURCE, 'utf8');

  const pad = (STORE_ICON_CANVAS - STORE_ICON_ART) / 2;
  await sharp(await rasterizeSvg(svg, STORE_ICON_ART))
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: TRANSPARENT })
    .png()
    .toFile(STORE_ICON);
  console.log(`wrote ${STORE_ICON}`);

  // The tile's colour is the icon's background rect; the mark is the source without that rect,
  // trimmed to its bounds, scaled to PROMO_MARK_H and centred. Its detail cut-outs are in the same
  // colour as the tile, so they read as cut-outs here too.
  const background = /<rect[^>]*fill="(#[0-9a-fA-F]{6})"/.exec(svg)?.[1];
  if (!background) throw new Error(`${SOURCE}: no background rect with a hex fill`);
  const mark = await sharp(await rasterizeSvg(svg.replace(/<rect[^>]*\/>/, ''), 400))
    .trim()
    .resize({ height: PROMO_MARK_H })
    .png()
    .toBuffer();
  const { width: markW = 0, height: markH = 0 } = await sharp(mark).metadata();
  await sharp({ create: { width: PROMO_W, height: PROMO_H, channels: 4, background } })
    .composite([
      {
        input: mark,
        left: Math.round((PROMO_W - markW) / 2),
        top: Math.round((PROMO_H - markH) / 2),
      },
    ])
    .png()
    .toFile(PROMO);
  console.log(`wrote ${PROMO} (mark ${markW}×${markH} on ${background})`);
}

async function renderPreview(svgFiles) {
  const files = svgFiles.length > 0 ? svgFiles : [SOURCE];
  const rows = files.map((file) => ({ file, label: basename(file).replace(/\.svg$/i, '') }));

  // One raster per (file, size), reused everywhere; zoomed cells are nearest-neighbour upscales.
  const rasters = new Map();
  const raster = async (file, size) => {
    const key = `${file}@${size}`;
    if (!rasters.has(key)) rasters.set(key, await rasterize(file, size));
    return rasters.get(key);
  };
  const zoom = (png, w, h) =>
    sharp(png).resize(w, h, { kernel: sharp.kernel.nearest }).png().toBuffer();

  const width = LABEL_W + COLUMNS.length * CELL + 16;
  const bandHeight = HEAD_H + rows.length * CELL;
  const stripWidth = rows.length * (STRIP_ICON + STRIP_GAP) + STRIP_GAP;
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
    for (const [c, column] of COLUMNS.entries()) {
      labels.push(
        text(LABEL_W + c * CELL + CELL / 2, top + 36, column.title, toolbar.fg, 'middle'),
      );
    }
    for (const [r, row] of rows.entries()) {
      const rowTop = top + HEAD_H + r * CELL;
      labels.push(text(12, rowTop + CELL / 2 + 5, row.label, toolbar.fg));
      for (const [c, column] of COLUMNS.entries()) {
        const png = await raster(row.file, column.size);
        const px = column.size * column.zoom;
        layers.push({
          input: column.zoom === 1 ? png : await zoom(png, px, px),
          left: Math.round(LABEL_W + c * CELL + (CELL - px) / 2),
          top: Math.round(rowTop + (CELL - px) / 2),
        });
      }
    }
  }

  // Toolbar strips: every file at 16 px in a row, actual size on the left, 4× on the right.
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
    for (const [r, row] of rows.entries()) {
      icons.push({
        input: await raster(row.file, STRIP_ICON),
        left: STRIP_GAP + r * (STRIP_ICON + STRIP_GAP),
        top: (STRIP_H - STRIP_ICON) / 2,
      });
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
  await mkdir(dirname(PREVIEW), { recursive: true });
  await sharp({ create: { width, height, channels: 4, background: TOOLBARS[0].bg } })
    .composite([{ input: Buffer.from(overlay), left: 0, top: 0 }, ...layers])
    .png()
    .toFile(PREVIEW);
  console.log(`wrote ${PREVIEW} (${rows.map((row) => row.label).join(', ')})`);
}

const args = process.argv.slice(2);
if (args.includes('--preview')) {
  await renderPreview(args.filter((arg) => !arg.startsWith('--')));
} else {
  await renderShipped();
}
