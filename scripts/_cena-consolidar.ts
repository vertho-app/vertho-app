/* eslint-disable */
// Consolida um arquivo RE-EXTRAÍDO com o código atual e imprime a separação
// entre os braços. Zero IA — serve para medir uma mudança de REGRA rodando a
// regra de verdade, não uma reimplementação dela num script.
//
// (Reimplementar a consolidação aqui para comparar variantes seria medir a
// minha cópia contra o original — o erro clássico de refatoração com
// denominador zero. Para comparar duas regras, mude o código de produção,
// rode isto, e desfaça.)
//
// Uso: npx tsx scripts/_cena-consolidar.ts cena-fase0c-reextraido.json cena-fase0c.json
import { readFileSync } from 'node:fs';
import { consolidarCena } from '@/lib/season-engine/cena/beats';

const B = JSON.parse(readFileSync(process.argv[2], 'utf-8'));
const origem = JSON.parse(readFileSync(process.argv[3], 'utf-8'));
const ctx = B.ctx;
const nd = ctx.descritores.length;

const med = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const f2 = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : ' -- ');

const linhas = B.rodadas.map((r: any, k: number) => {
  const c = consolidarCena(r.extracao.evidencias, nd, {
    beats: ctx.beats,
    beatsCumpridos: origem.rodadas[k].estado.beatsCumpridos,
  });
  return { nivel: r.nivel, enc: c.media, abe: c.abertura.media, nEnc: c.nivel, nAbe: c.abertura.nivel };
});

console.log('ator   n   encerramento              abertura');
const R: any = {};
for (const nv of [1, 3]) {
  const g = linhas.filter((l: any) => l.nivel === nv);
  if (!g.length) continue;
  R[nv] = { enc: med(g.map((x: any) => x.enc)), abe: med(g.map((x: any) => x.abe)) };
  console.log(
    `N${nv}    ${String(g.length).padEnd(3)} ${f2(R[nv].enc)} [${g.map((x: any) => 'N' + (x.nEnc ?? '-')).join(' ')}]` +
    `   ${f2(R[nv].abe)} [${g.map((x: any) => 'N' + (x.nAbe ?? '-')).join(' ')}]`,
  );
}
if (R[1] && R[3]) {
  console.log(`separação N3−N1:  encerramento ${f2(R[3].enc - R[1].enc)}   abertura ${f2(R[3].abe - R[1].abe)}`);
}
