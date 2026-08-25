/* eslint-disable */
// Diagnóstico de UMA citação reprovada pelo validador: é invenção do extrator
// ou é falso positivo da régua de emenda? Zero IA.
// Uso: npx tsx scripts/_cena-citacao-diag.ts <shard.json> <descritor>
import { readFileSync } from 'node:fs';
import { normalizar, MIN_CITACAO } from '@/lib/season-engine/cena/validar-saida';

const d = JSON.parse(readFileSync(process.argv[2], 'utf-8'));
const alvo = Number(process.argv[3]);
const falas = d.estado.historico.filter((m: any) => m.role === 'user').map((m: any) => m.content);
const T = normalizar(falas.join('  '));

for (const ev of d.extracao.evidencias.filter((e: any) => e.indice === alvo)) {
  const frags = String(ev.citacao).split(/\.{2,}|…/);
  const suspeita = frags.map(normalizar).filter((f) => f.length >= MIN_CITACAO).some((f) => !T.includes(f));
  if (!suspeita) continue;
  console.log(`\nD${ev.indice} t${ev.turno} — "${ev.citacao}"`);
  for (const f of frags) {
    const n = normalizar(f);
    if (n.length < MIN_CITACAO) { console.log(`   [curto, ignorado] ${JSON.stringify(f)}`); continue; }
    console.log(`   ${T.includes(n) ? 'ACHADO ' : 'AUSENTE'}  ${JSON.stringify(f.slice(0, 90))}`);
  }
}
const chave = normalizar(process.argv[4] ?? 'zero toler');
const i = T.indexOf(chave);
console.log(`\nfala do avaliado em torno de "${chave}":`);
console.log(i >= 0 ? '   ...' + T.slice(Math.max(0, i - 80), i + 200) + '...' : '   (não aparece)');
