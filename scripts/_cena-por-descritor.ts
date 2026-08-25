/* eslint-disable */
// Nível POR DESCRITOR, agregado sobre as cenas gravadas. Zero IA.
//
// ═══ A PERGUNTA ═══
//
// A média da cena esconde de qual descritor vem o teto. Se o braço N3 fecha em
// N2, isso pode ser (a) o ator, (b) a âncora do classificador — ou (c) alguns
// descritores serem INALCANÇÁVEIS naquela cena.
//
// (c) tem assinatura própria e barata de ver: se D2 ("escuta TODAS as partes")
// e D4 ("acordo com compromissos de AMBOS") ficam presos em N2 enquanto os
// outros chegam a N3, o teto não é do ator nem da âncora — é da CENA, que só
// tem uma das partes na sala. O avaliado consegue prometer que vai ouvir a
// outra parte; não consegue ouvi-la. E o próprio prompt do extrator manda:
// "falar sobre o comportamento não é ter o comportamento".
//
// Uso: npx tsx scripts/_cena-por-descritor.ts cena-fase0e-n3.json [mais.json ...]
import { readFileSync, existsSync } from 'node:fs';
import { consolidarCena, nivelDaEvidencia } from '@/lib/season-engine/cena/beats';

const NOME: Record<string, string> = {
  n1_gap: 'N1', n2_em_desenvolvimento: 'N2', n3_meta: 'N3', sem_sinal: '--',
};

interface Acc { aut: number[]; ass: number[]; evs: Record<string, number> }
const porD = new Map<number, Acc>();
let cenas = 0;
let nomes: string[] = [];

for (const arq of process.argv.slice(2)) {
  if (!existsSync(arq)) continue;
  const d = JSON.parse(readFileSync(arq, 'utf-8'));
  const nd = d.ctx.descritores.length;
  nomes = d.ctx.descritores.map((x: any) => `D${x.indice} ${x.nomeCurto}`);
  for (const r of d.rodadas) {
    if (!r?.extracao || !r.estado) continue;
    cenas++;
    const c = consolidarCena(r.extracao.evidencias, nd, {
      beats: d.ctx.beats, beatsCumpridos: r.estado.beatsCumpridos,
    });
    for (let i = 1; i <= nd; i++) {
      const a = porD.get(i) ?? { aut: [], ass: [], evs: {} };
      if (c.notas[i - 1] != null) a.aut.push(c.notas[i - 1] as number);
      if (c.encerramento.notas[i - 1] != null) a.ass.push(c.encerramento.notas[i - 1] as number);
      porD.set(i, a);
    }
    for (const ev of r.extracao.evidencias) {
      const a = porD.get(ev.indice);
      if (!a) continue;
      const n = NOME[nivelDaEvidencia(ev)] ?? '?';
      a.evs[n] = (a.evs[n] ?? 0) + 1;
    }
  }
}

const med = (xs: number[]) => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2) : ' -- ');
console.log(`\n${cenas} cena(s)\n`);
console.log('descritor                        autonomia  assistido   evidências extraídas      teto?');
for (const [i, a] of [...porD.entries()].sort((x, y) => x[0] - y[0])) {
  const dist = ['N1', 'N2', 'N3'].map((n) => `${n}:${a.evs[n] ?? 0}`).join(' ');
  // "Teto" = nenhuma cena chegou ao nível-meta neste descritor, no encerramento.
  const teto = a.ass.length && !a.ass.some((n) => n >= 3.2) ? '  🔴 nunca chegou a N3' : '';
  console.log(`${(nomes[i - 1] ?? 'D' + i).padEnd(32)} ${med(a.aut).padEnd(10)} ${med(a.ass).padEnd(11)} ${dist.padEnd(25)}${teto}`);
}
console.log('');
