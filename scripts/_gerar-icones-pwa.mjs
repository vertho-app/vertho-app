/**
 * Gera os ícones 192/512 do manifest a partir do logo em alta (1142×1151).
 *
 * Script LOCAL (prefixo `_`, não versionado no fluxo normal): o artefato que vai
 * pro repo é o PNG, não a dependência. Usa o `sharp` que já vem transitivamente
 * com o Next — por isso não entra no package.json.
 *
 * Fundo navy (#0B1B33 = o `theme_color` já declarado no manifest) em vez de
 * transparente: o glifo é ciano claro e, sobre fundo claro no Android, ficaria
 * quase invisível no prompt de instalação e na gaveta de apps. Não é escolha de
 * marca nova — é a cor que o próprio manifest já declara.
 *
 * Uso: node scripts/_gerar-icones-pwa.mjs
 */
import sharp from 'sharp';

const FONTE = 'public/logo-vertho-sem-texto.png';
const FUNDO = { r: 0x0b, g: 0x1b, b: 0x33, alpha: 1 };

// Padding de ~14%: ícone que sangra até a borda é recortado pelas máscaras
// redondas/squircle do Android e do iOS.
const PADDING = 0.14;

for (const tamanho of [192, 512]) {
  const interno = Math.round(tamanho * (1 - PADDING * 2));

  const glifo = await sharp(FONTE)
    .trim() // remove a moldura transparente do arquivo original
    .resize(interno, interno, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  await sharp({
    create: { width: tamanho, height: tamanho, channels: 4, background: FUNDO },
  })
    .composite([{ input: glifo, gravity: 'centre' }])
    .png()
    .toFile(`public/icon-${tamanho}.png`);

  console.log(`✓ public/icon-${tamanho}.png`);
}
