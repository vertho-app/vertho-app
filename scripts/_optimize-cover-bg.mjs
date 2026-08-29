// INTERNO/descartável: comprime o fundo da capa (PNG 2x) → JPEG otimizado.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const sharp = require('sharp');
const DIR = 'C:/GAS/Vertho App/nextjs-app/public/report';
const src = `${DIR}/pdi-cover-bg.png`;
const out = `${DIR}/pdi-cover-bg.jpg`;
await sharp(src).resize({ width: 1191 }).jpeg({ quality: 88, mozjpeg: true }).toFile(out);
console.log('png:', (fs.statSync(src).size / 1024 | 0) + 'KB', '→ jpg:', (fs.statSync(out).size / 1024 | 0) + 'KB');
