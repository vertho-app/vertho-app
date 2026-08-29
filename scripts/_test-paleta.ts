/** Smoke E2E do lib/site-palette contra um site real.
 *  Rodar: npx tsx scripts/_test-paleta.ts <url> */
import './_env';
import { extrairPaletaDoSiteCore } from '@/lib/site-palette';

async function main() {
  const url = process.argv[2] || 'https://www.anchieta.br';
  console.log('Site:', url);
  const t0 = Date.now();
  const r = await extrairPaletaDoSiteCore(url);
  console.log(`\n⏱ ${((Date.now() - t0) / 1000).toFixed(1)}s · CSS: ${r.fontes.cssArquivos} arquivo(s) · theme-color: ${r.fontes.themeColor || '—'} · manifest: ${r.fontes.manifest}`);
  console.log('\nCandidatas (top 12):');
  for (const c of r.candidatos.slice(0, 12)) console.log(`  ${c.hex} ×${c.count}${c.neutra ? ' (neutra)' : ''}`);
  console.log('\nPaleta proposta:');
  for (const [k, v] of Object.entries(r.paleta)) console.log(`  ${k.padEnd(22)} ${v}`);
  if (r.racional) console.log('\nRacional:', r.racional);
  if (r.ajustes.length) console.log('Ajustes de contraste (código):', r.ajustes.join(' · '));
}

main().catch((e) => { console.error('ERRO:', e?.message || e); process.exit(1); });
