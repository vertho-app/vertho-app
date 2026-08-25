/* eslint-disable */
// REVALIDA shards já gravados com as réguas ATUAIS. Zero IA, não escreve nada.
//
// ═══ POR QUE ESTE SCRIPT EXISTE ═══
//
// O shard grava o VEREDITO, não a régua. Quando a régua muda — e ela mudou
// duas vezes em 25/08/2026 — o veredito em disco continua sendo o antigo, e o
// runner recusa agregar a rodada por causa de uma reprovação que a versão atual
// do código não faria mais.
//
// Medido: uma cena da 0e ficou marcada inválida por uma citação emendada com
// "e" no lugar de "por isso". A tolerância de conector de borda entrou depois;
// o shard não sabe disso.
//
// ⚠️ Ele NÃO reescreve o shard. O veredito gravado é o registro do que se
// sabia na hora, e apagá-lo apagaria a única prova de que a régua mudou. Aqui
// se lê o que a régua de HOJE diz, com os dois lados na tela.
//
// Uso: npx tsx scripts/_cena-revalidar.ts cena-fase0e-n3.json
import { readFileSync, existsSync } from 'node:fs';
import { consolidarCena } from '@/lib/season-engine/cena/beats';
import { validarSaidaDaCena, saidaConfiavel } from '@/lib/season-engine/cena/validar-saida';
import { medirDitado } from '@/lib/season-engine/cena/ditado';
import { shardPath } from '@/lib/season-engine/cena/arquivo';

const combinado = process.argv[2];
if (!combinado || !existsSync(combinado)) {
  console.error('uso: _cena-revalidar.ts <combinado.json>');
  process.exit(1);
}
const d = JSON.parse(readFileSync(combinado, 'utf-8'));
const ctx = d.ctx;
const nd = ctx.descritores.length;

const linhas: any[] = [];
for (let n = 1; n <= 30; n++) {
  const p = shardPath(combinado, n);
  if (!existsSync(p)) break;
  const r = JSON.parse(readFileSync(p, 'utf-8'));
  if (r.erro || !r.estado || !r.extracao) {
    linhas.push({ n, nivel: r.nivel, estado: 'QUEBROU', detalhe: String(r.erro ?? '').slice(0, 80) });
    continue;
  }
  const c = consolidarCena(r.extracao.evidencias, nd, {
    beats: ctx.beats, beatsCumpridos: r.estado.beatsCumpridos,
  });
  const vs = validarSaidaDaCena({
    numDescritores: nd,
    totalBeats: ctx.beats.length,
    turnos: r.estado.turno,
    beatsCumpridos: r.estado.beatsCumpridos,
    contrato: {
      armadilha: ctx.cenario.armadilhaGenerica,
      tradeoff: ctx.cenario.tradeoffTestado,
      complicador: ctx.cenario.fatorComplicador,
    },
    evidencias: r.extracao.evidencias,
    consolidacao: c,
    falasDoAvaliado: r.estado.historico.filter((m: any) => m.role === 'user').map((m: any) => m.content),
    historico: r.estado.historico,
    modo: ctx.modo,
  });
  linhas.push({
    n, nivel: r.nivel, estado: saidaConfiavel(vs) ? 'ok' : 'INVÁLIDA',
    antes: r.confiavel ? 'ok' : 'INVÁLIDA',
    aut: c.media, nivelAut: c.nivel, ass: c.encerramento.media,
    fim: r.estado.motivoFim, turnos: r.estado.turno,
    ditado: medirDitado(r.extracao.evidencias, r.estado.historico),
    erros: vs.filter((x) => x.severidade === 'erro'),
  });
}

console.log('\ncena  ator  gravado    hoje       autonomia   assistido  desfecho  turnos');
for (const l of linhas) {
  if (l.estado === 'QUEBROU') {
    console.log(`r0${l.n}   N${l.nivel ?? '?'}    —          QUEBROU    ${l.detalhe}`);
    continue;
  }
  const mudou = l.antes !== l.estado ? '  ← MUDOU' : '';
  console.log(
    `r0${l.n}   N${l.nivel}    ${String(l.antes).padEnd(10)} ${String(l.estado).padEnd(10)} ` +
    `${String(l.aut).padEnd(11)} ${String(l.ass).padEnd(10)} ${String(l.fim).padEnd(9)} ${l.turnos}${mudou}`,
  );
  for (const e of l.erros) console.log(`        ${e.campo}: ${e.detalhe.slice(0, 110)}`);
}

const validas = linhas.filter((l) => l.estado === 'ok');
if (!validas.length) { console.log('\nnenhuma cena válida.\n'); process.exit(0); }
const med = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
for (const nv of [...new Set(validas.map((l) => l.nivel))].sort()) {
  const g = validas.filter((l) => l.nivel === nv);
  const desf = ['acordo', 'ruptura', 'impasse', 'teto']
    .map((m) => [m, g.filter((l) => l.fim === m).length] as const)
    .filter(([, k]) => k > 0).map(([m, k]) => `${m}×${k}`).join(' ');
  const dit = g.reduce((a, l) => a + l.ditado.ditadas, 0);
  const dec = g.reduce((a, l) => a + l.ditado.ditadas + l.ditado.proprias, 0);
  console.log(
    `\nN${nv} (n=${g.length})  autonomia ${med(g.map((l) => l.aut)).toFixed(2)} ` +
    `[${g.map((l) => 'N' + (l.nivelAut ?? '-')).join(' ')}]   assistido ${med(g.map((l) => l.ass)).toFixed(2)}` +
    `   turnos ${med(g.map((l) => l.turnos)).toFixed(1)}   ${desf}   ditação ${dit}/${dec}`,
  );
}
console.log('');
