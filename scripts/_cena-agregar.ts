/* eslint-disable */
// Agrega cenas de VÁRIOS arquivos que compartilham a MESMA persona. Zero IA.
//
// Existe porque `carregarShards` recusa retomar com buraco — e com razão: r07
// sem r06 é erro, não "seguir adiante". Quando uma cena do meio sai inválida,
// a saída é rodar a que falta num arquivo à parte com `--persona` congelada, e
// juntar aqui. O que torna a junção legítima é a persona ser a mesma: mesmo
// personagem, mesmo gabarito, mesma condição de cessão.
//
// ⚠️ Ele CONFERE isso antes de somar. Juntar cenas de personas diferentes é
// exatamente o erro que confundiu 0c, 0d e 0e — e que só apareceu quando fui
// ler os artefatos.
//
// Uso: npx tsx scripts/_cena-agregar.ts cena-fase0h.json cena-fase0h-b.json
import { readFileSync, existsSync } from 'node:fs';
import { hashDoGabarito, medirFatosAflorados } from '@/lib/season-engine/cena/fatos';
import { lerMotivoParada, MOTIVOS_PARADA } from '@/lib/season-engine/cena/beats';
import { shardPath } from '@/lib/season-engine/cena/arquivo';

const arquivos = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!arquivos.length) { console.error('uso: _cena-agregar.ts <a.json> [b.json ...]'); process.exit(1); }

interface Cena { nivel: number; aut: number; nivelAut: number | null; ass: number; turnos: number; fim: string; fatos: number; quais: string[] }
const cenas: Cena[] = [];
let personaRef: string | null = null;
let totalFatos = 0;

for (const arq of arquivos) {
  const d = JSON.parse(readFileSync(arq, 'utf-8'));
  // O hash do gabarito é a identidade do instrumento. `o_que_faz_ceder` entra
  // junto porque muda quando a cena fecha, e isso também é a prova.
  const assinatura = hashDoGabarito(d.persona?.fatos?.enterrados) + '|' + (d.persona?.o_que_faz_ceder ?? '');
  if (personaRef == null) personaRef = assinatura;
  else if (personaRef !== assinatura) {
    console.error(`\n🔴 ${arq} tem persona/gabarito DIFERENTE dos anteriores — agregar aqui misturaria instrumentos.`);
    console.error('   Rode a cena que falta com --persona apontando para o mesmo arquivo.\n');
    process.exit(1);
  }
  const enterrados = d.persona?.fatos?.enterrados ?? [];
  totalFatos = enterrados.length;

  for (let n = 1; n <= 40; n++) {
    const p = shardPath(arq, n);
    if (!existsSync(p)) break;
    const r = JSON.parse(readFileSync(p, 'utf-8'));
    if (r.erro || !r.confiavel || !r.estado || !r.consolidacao) continue;
    const mf = medirFatosAflorados(
      enterrados, r.estado.historico,
      (r.estado.fatosRevelados ?? []).map((x: any) => x.descritor),
    );
    cenas.push({
      nivel: r.nivel, aut: r.consolidacao.media, nivelAut: r.consolidacao.nivel,
      ass: r.consolidacao.encerramento.media, turnos: r.estado.turno,
      fim: lerMotivoParada(r.estado) ?? '-', fatos: mf.aflorados,
      quais: mf.porFato.filter((f) => f.aflorou).map((f) => `D${f.descritor}`),
    });
  }
}

const med = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const f2 = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : ' -- ');

console.log(`\n${cenas.length} cenas válidas · gabarito ${personaRef?.split('|')[0]} (${arquivos.length} arquivo(s))\n`);
console.log('ator  n   autonomia  níveis            assistido  turnos  desfechos            fatos');
const resumo: Record<number, { aut: number; fat: number; n: number }> = {} as any;
for (const nv of [...new Set(cenas.map((c) => c.nivel))].sort()) {
  const g = cenas.filter((c) => c.nivel === nv);
  const desf = [...MOTIVOS_PARADA]
    .map((m) => [m, g.filter((c) => c.fim === m).length] as const)
    .filter(([, k]) => k > 0).map(([m, k]) => `${m}×${k}`).join(' ');
  resumo[nv] = { aut: med(g.map((c) => c.aut)), fat: med(g.map((c) => c.fatos)), n: g.length };
  console.log(
    `N${nv}    ${String(g.length).padEnd(3)} ${f2(resumo[nv].aut).padEnd(10)} ` +
    `${g.map((c) => 'N' + (c.nivelAut ?? '-')).join(' ').padEnd(17)} ${f2(med(g.map((c) => c.ass))).padEnd(10)} ` +
    `${med(g.map((c) => c.turnos)).toFixed(1).padEnd(7)} ${desf.padEnd(20)} ` +
    `${resumo[nv].fat.toFixed(1)}/${totalFatos}  (${g.map((c) => c.fatos).join(' ')})`,
  );
}

/**
 * O veredito exige n>=3 por braço — ver a nota em `_cena-fase0.ts`. E imprime
 * os EXTREMOS junto da média: na fase 0e a folga entre braços era 0,56 e uma
 * única cena a levou para 0,26. Média sem extremo esconde exatamente isso.
 */
const niveis = Object.keys(resumo).map(Number).sort();
if (niveis.length >= 2) {
  const b = resumo[niveis[0]], a = resumo[niveis[niveis.length - 1]];
  const gB = cenas.filter((c) => c.nivel === niveis[0]).map((c) => c.aut);
  const gA = cenas.filter((c) => c.nivel === niveis[niveis.length - 1]).map((c) => c.aut);
  console.log(`\nDISCRIMINAÇÃO (autonomia)`);
  console.log(`  médias   N${niveis[0]}=${f2(b.aut)} (n=${b.n})   N${niveis[1]}=${f2(a.aut)} (n=${a.n})   delta=${f2(a.aut - b.aut)}`);
  console.log(`  extremos max(N${niveis[0]})=${f2(Math.max(...gB))}   min(N${niveis[1]})=${f2(Math.min(...gA))}   ` +
    `folga=${f2(Math.min(...gA) - Math.max(...gB))}${Math.min(...gA) <= Math.max(...gB) ? '  🔴 SOBREPÕE' : ''}`);
  console.log(`  fatos    N${niveis[0]}=${b.fat.toFixed(1)}   N${niveis[1]}=${a.fat.toFixed(1)}   delta=${(a.fat - b.fat).toFixed(1)}`);
  const MIN = 3;
  console.log(b.n < MIN || a.n < MIN
    ? `  → SEM VEREDITO: ${MIN} cenas por braço é o mínimo.`
    : (a.aut - b.aut >= 0.5 ? '  → o instrumento separa os níveis.' : '  → NÃO separa.'));
}
console.log('');
