/* eslint-disable */
// Compara duas rodadas nos sinais que o pré-registro nomeou. Zero IA.
//
// ⚠️ 0c e 0d NÃO são a mesma medida — entre elas o interlocutor mudou, então é
// outro instrumento. O que esta comparação serve para responder é ESTREITO e
// foi escrito antes: os efeitos previstos (turnos, impasse, ditação, cobertura)
// aconteceram? A comparação de NOTA entre as duas não vale, e por isso ela não
// é impressa aqui.
//
// Uso: npx tsx scripts/_cena-comparar-rodadas.ts cena-fase0c-reextraido.json cena-fase0c.json cena-fase0d.json
import { readFileSync } from 'node:fs';
import { medirDitado } from '@/lib/season-engine/cena/ditado';
import { lerMotivoParada } from '@/lib/season-engine/cena/beats';

const A = JSON.parse(readFileSync(process.argv[2], 'utf-8'));   // 0c re-extraída
const Aorig = JSON.parse(readFileSync(process.argv[3], 'utf-8')); // 0c com estado
const B = JSON.parse(readFileSync(process.argv[4], 'utf-8'));   // 0d

interface Linha { rodada: string; nivel: number; turnos: number; fim: string; cobertura: string; d: number; p: number; s: number; ditados: number }

const linhas: Linha[] = [];
A.rodadas.forEach((r: any, k: number) => {
  const est = Aorig.rodadas[k]?.estado;
  if (!r?.extracao || !est) return;
  const m = medirDitado(r.extracao.evidencias, est.historico);
  linhas.push({
    rodada: '0c', nivel: r.nivel, turnos: est.turno, fim: lerMotivoParada(est) ?? '-',
    cobertura: `${r.consolidacao?.cobertura.medidos}/${r.consolidacao?.cobertura.total}`,
    d: m.ditadas, p: m.proprias, s: m.semElemento, ditados: est.ditados?.length ?? 0,
  });
});
for (const r of B.rodadas) {
  if (!r?.extracao || !r.estado) continue;
  const m = medirDitado(r.extracao.evidencias, r.estado.historico);
  linhas.push({
    rodada: '0d', nivel: r.nivel, turnos: r.estado.turno, fim: lerMotivoParada(r.estado) ?? '-',
    cobertura: `${r.consolidacao?.cobertura.medidos}/${r.consolidacao?.cobertura.total}`,
    d: m.ditadas, p: m.proprias, s: m.semElemento, ditados: r.estado.ditados?.length ?? 0,
  });
}

const md = (xs: number[]) => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : '—');
console.log('\nrodada  ator  n   turnos   desfechos                    cobertura   ditação (dit/decidível)   sem elemento   interlocutor ditou');
for (const rod of ['0c', '0d']) {
  for (const nv of [1, 3]) {
    const g = linhas.filter((l) => l.rodada === rod && l.nivel === nv);
    if (!g.length) continue;
    const fins = [...new Set(g.map((l) => l.fim))]
      .map((f) => `${f}×${g.filter((l) => l.fim === f).length}`).join(' ');
    const d = g.reduce((a, l) => a + l.d, 0), p = g.reduce((a, l) => a + l.p, 0);
    const s = g.reduce((a, l) => a + l.s, 0);
    console.log(
      `${rod}      N${nv}    ${String(g.length).padEnd(3)} ${md(g.map((l) => l.turnos)).padEnd(8)} ` +
      `${fins.padEnd(28)} ${[...new Set(g.map((l) => l.cobertura))].join(' ').padEnd(11)} ` +
      `${String(d).padStart(2)}/${String(d + p).padEnd(21)} ${String(s).padEnd(14)} ${g.reduce((a, l) => a + l.ditados, 0)}`,
    );
  }
}
console.log('\n⚠️ A nota NÃO é comparável entre as rodadas: o interlocutor mudou, é outro instrumento.\n');
