import React from 'react';
import { Image } from '@react-pdf/renderer';
import { readFileSync } from 'fs';
import { join } from 'path';

// Carrega a imagem de fundo uma única vez no cold start do servidor.
let bgBase64 = null;
try {
  const bgPath = join(process.cwd(), 'public', 'template-fundo-relatorios.png');
  const bgBuffer = readFileSync(bgPath);
  bgBase64 = `data:image/png;base64,${bgBuffer.toString('base64')}`;
  console.log('[PageBackground] loaded:', bgBuffer.length, 'bytes');
} catch (e) {
  console.error('[PageBackground] failed to load:', e.message);
}

// A4 em pontos: 595.28 x 841.89
export default function PageBackground() {
  if (!bgBase64) return null;
  return (
    <Image
      src={bgBase64}
      fixed
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: 595.28,
        height: 841.89,
      }}
    />
  );
}
