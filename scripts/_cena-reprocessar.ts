/* eslint-disable */
// Reprocessa uma rodada JÁ GRAVADA com a consolidação ATUAL, sem chamar IA.
//
// Por que existe: descobrir se a aritmética e o mapeamento estão certos não
// precisa de rodada nova. Os diálogos e as evidências estão em disco; o que
// muda é o código que os interpreta. Uma re-execução custaria ~US$ 3,50 e 40
// minutos para responder o que um reprocessamento responde de graça — e ainda
// introduziria variação de modelo entre o antes e o depois, tornando a
// comparação impossível.
//
// Uso: npx tsx scripts/_cena-reprocessar.ts cena-fase0c.json
import { readFileSync } from 'node:fs';
import { consolidarCena } from '@/lib/season-engine/cena/beats';

const arquivo = process.argv[2];
if (!arquivo) { console.error('uso: _cena-reprocessar.ts <arquivo.json>'); process.exit(1); }
const d = JSON.parse(readFileSync(arquivo, 'utf-8'));
const beats = d.ctx.beats;
const nd = d.ctx.descritores.length;

const med = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const linhas: any[] = [];

for (const r of d.rodadas) {
  const antes = r.consolidacao;
  const agora = consolidarCena(r.extracao.evidencias, nd, { beats, beatsCumpridos: r.estado.beatsCumpridos });
  linhas.push({ nivel: r.nivel, antes: antes.media, agora: agora.media,
    nivelAntes: antes.nivel, nivelAgora: agora.nivel,
    descartadas: agora.forasDoMapa.length, cob: `${agora.cobertura.medidos}/${nd}` });
}

console.log('\nnv  antes  agora   nível          descartadas  cobertura');
for (const l of linhas) {
  const seta = l.antes === l.agora ? '  =  ' : (l.agora < l.antes ? '  ↓  ' : '  ↑  ');
  console.log(`N${l.nivel}  ${String(l.antes).padEnd(6)}${seta}${String(l.agora).padEnd(6)} ` +
    `N${l.nivelAntes ?? '-'}→N${l.nivelAgora ?? '-'}         ${String(l.descartadas).padEnd(12)} ${l.cob}`);
}
for (const nv of [1, 3]) {
  const g = linhas.filter((l) => l.nivel === nv);
  if (!g.length) continue;
  console.log(`\nN${nv}: antes ${med(g.map((x) => x.antes)).toFixed(2)} → agora ${med(g.map((x) => x.agora)).toFixed(2)}` +
    `  | níveis agora: ${g.map((x) => 'N' + (x.nivelAgora ?? '-')).join(' ')}`);
}
const totalDesc = linhas.reduce((a, l) => a + l.descartadas, 0);
const totalEv = d.rodadas.reduce((a: number, r: any) => a + r.extracao.evidencias.length, 0);
console.log(`\nevidências descartadas por beat incompatível: ${totalDesc} de ${totalEv} (${(100 * totalDesc / totalEv).toFixed(1)}%)`);
