import path from 'node:path';
import { mkdir, readdir } from 'node:fs/promises';
import sharp from 'sharp';

const root = path.resolve('tmp/pdfs/gruposinal');
const pagesRoot = path.join(root, process.argv[2] || 'pages');
const outputRoot = path.join(root, process.argv[3] || 'contact-sheets');
const tileWidth = 220;
const pageHeight = 311;
const labelHeight = 24;
const tileHeight = pageHeight + labelHeight;
const gap = 12;
const columns = 4;

await mkdir(outputRoot, { recursive: true });
const folders = (await readdir(pagesRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory());

for (const folder of folders) {
  const sourceDir = path.join(pagesRoot, folder.name);
  const pages = (await readdir(sourceDir)).filter((name) => name.endsWith('.png'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const tiles = [];
  for (let index = 0; index < pages.length; index++) {
    const page = await sharp(path.join(sourceDir, pages[index]))
      .resize({ width: tileWidth, height: pageHeight, fit: 'contain', background: '#ffffff' })
      .png().toBuffer();
    const label = Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#ffffff"/><text x="10" y="17" font-family="Arial" font-size="13" fill="#334155">Página ${index + 1}</text></svg>`);
    const tile = await sharp({ create: { width: tileWidth, height: tileHeight, channels: 4, background: '#ffffff' } })
      .composite([{ input: page, left: 0, top: 0 }, { input: label, left: 0, top: pageHeight }])
      .png().toBuffer();
    tiles.push({ input: tile, left: (index % columns) * (tileWidth + gap), top: Math.floor(index / columns) * (tileHeight + gap) });
  }
  const rows = Math.ceil(tiles.length / columns);
  await sharp({
    create: {
      width: columns * tileWidth + (columns - 1) * gap,
      height: rows * tileHeight + (rows - 1) * gap,
      channels: 4,
      background: '#cbd5e1',
    },
  }).composite(tiles).png().toFile(path.join(outputRoot, `${folder.name}.png`));
}

console.log(JSON.stringify({ sheets: folders.length, outputRoot }, null, 2));
