/* eslint-disable */
// AUDITORIA DA FLAG `provocado` — zero IA, sobre a re-extração já gravada.
//
// A flag virou carga estrutural: ela limita a nota (teto n3→n2) e é o eixo da
// leitura Abertura × Encerramento. E é julgamento de modelo sobre conversa —
// a mesma classe que já falhou três vezes neste módulo (juiz parte-interessada,
// cobertura mentirosa, índice que numerava entradas). Antes de deixá-la
// carregar o rótulo do PDI, ela precisa de denominador.
//
// Quatro perguntas, todas respondíveis sem chamar IA:
//   1. quantas ABERTURAS já nascem provocadas? (se muitas, a abertura também
//      está contaminada e a decisão não pode ser vendida como "medida limpa")
//   2. a flag DEGENEROU? (se quase toda evidência n2/n3 é provocada, ela não
//      separa nada — cena é, por definição, sequência de demanda)
//   3. quanto o TETO custa? (quanto a abertura subiria sem ele)
//   4. 🔑 DITADO ou PRODUÇÃO SOB DEMANDA? O prompt define `provocado` como
//      "PEDIDO **ou** entregue pronto". São coisas diferentes: exigir domínio
//      ("quem? até quando?") é o beat 2 fazendo o trabalho dele, e responder a
//      isso é o que o N3 da régua É. Só o elemento que aparece PRONTO na fala
//      anterior do interlocutor é eco. Aqui isso vira contagem: os tokens
//      concretos da citação (números, datas, nomes próprios) já estavam na
//      última fala do interlocutor?
//
// Uso: npx tsx scripts/_cena-auditar-provocado.ts cena-fase0c-reextraido.json cena-fase0c.json
import { readFileSync } from 'node:fs';
// O detector é o MESMO que o validador usa em produção. Uma cópia aqui daria
// dois números para a mesma pergunta, e o script é justamente o que decide se
// a régua de produção está certa — medir a cópia não mediria nada.
import { classificarCitacao, elementosConcretos, falaAnteriorDoInterlocutor } from '@/lib/season-engine/cena/ditado';

const B = JSON.parse(readFileSync(process.argv[2], 'utf-8'));
const origem = JSON.parse(readFileSync(process.argv[3], 'utf-8'));
const ctx = B.ctx;
const NOTA: Record<string, number> = { n1_gap: 1.4, n2_em_desenvolvimento: 2.2, n3_meta: 3.2 };

let aberturasTotal = 0, aberturasProv = 0;
const porBraco: Record<number, { tot: number; prov: number }> = { 1: { tot: 0, prov: 0 }, 3: { tot: 0, prov: 0 } };
let n2n3 = 0, n2n3prov = 0;
let ditado = 0, sobDemanda = 0, semConcreto = 0;
const amostraSobDemanda: string[] = [];
const somaAbe: Record<number, number[]> = { 1: [], 3: [] };
const somaAbeSemTeto: Record<number, number[]> = { 1: [], 3: [] };
let suprimidasPorConfianca = 0;

for (let k = 0; k < B.rodadas.length; k++) {
  const r = B.rodadas[k];
  if (!r?.extracao) continue;
  const hist = origem.rodadas[k].estado.historico as Array<{ role: string; content: string; turno: number }>;

  const porD: Record<number, any[]> = {};
  for (const e of r.extracao.evidencias) {
    const b = ctx.beats.find((x: any) => x.numero === e.beat);
    if (b && !b.descritores.includes(e.indice)) continue;
    if (!NOTA[e.nivel]) continue;
    (porD[e.indice] ||= []).push(e);
    if (e.nivel !== 'n1_gap') { n2n3++; if (e.provocado) n2n3prov++; }

    // ── ditado × produção sob demanda ────────────────────────────────────
    if (e.provocado) {
      const anterior = falaAnteriorDoInterlocutor(hist as any, e.turno);
      const v = classificarCitacao(e.citacao, anterior);
      if (v === 'sem_elemento') semConcreto++;
      else if (v === 'ditado') ditado++;
      else {
        sobDemanda++;
        if (amostraSobDemanda.length < 5) {
          const cs = elementosConcretos(e.citacao);
          amostraSobDemanda.push(`D${e.indice} t${e.turno} [${cs.slice(0, 3).join(', ')}] "${String(e.citacao).slice(0, 90)}"`);
        }
      }
    }
  }

  const fracas: number[] = [];
  for (const [i, evs] of Object.entries(porD)) {
    const s = (evs as any[]).sort((a, b) => (a.turno || 0) - (b.turno || 0));
    const primeira = s[0];
    aberturasTotal++;
    porBraco[r.nivel].tot++;
    if (primeira.provocado) { aberturasProv++; porBraco[r.nivel].prov++; }
    const comTeto = primeira.provocado && primeira.nivel === 'n3_meta' ? NOTA.n2_em_desenvolvimento : NOTA[primeira.nivel];
    somaAbe[r.nivel].push(Math.min(comTeto, 3.4));
    somaAbeSemTeto[r.nivel].push(Math.min(NOTA[primeira.nivel], 3.4));
    if (s.every((e: any) => e.forca === 'fraca')) fracas.push(Number(i));
  }
  // A régua de supressão do ENCERRAMENTO derruba o rótulo quando mais da metade
  // dos descritores tem só evidência fraca. A da ABERTURA hoje não faz isso.
  if (fracas.length * 2 > ctx.descritores.length) suprimidasPorConfianca++;
}

const md = (xs: number[]) => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2) : '--');
const pc = (a: number, b: number) => (b ? `${a}/${b} = ${(100 * a / b).toFixed(0)}%` : '--');

console.log('\n1 · ABERTURAS que já nascem provocadas');
console.log(`   total: ${pc(aberturasProv, aberturasTotal)}`);
console.log(`   braço N1: ${pc(porBraco[1].prov, porBraco[1].tot)}    braço N3: ${pc(porBraco[3].prov, porBraco[3].tot)}`);

console.log('\n2 · DEGENERESCÊNCIA da flag (evidências n2/n3 marcadas provocado)');
console.log(`   ${pc(n2n3prov, n2n3)}   — acima de ~70% a flag não separa nada`);

console.log('\n3 · O QUE O TETO CUSTA NA ABERTURA');
console.log(`   N1: com teto ${md(somaAbe[1])}  sem teto ${md(somaAbeSemTeto[1])}`);
console.log(`   N3: com teto ${md(somaAbe[3])}  sem teto ${md(somaAbeSemTeto[3])}`);

console.log('\n4 · DITADO × PRODUÇÃO SOB DEMANDA (entre as marcadas provocado)');
console.log(`   elemento concreto JÁ ESTAVA na fala anterior do interlocutor: ${ditado}`);
console.log(`   elemento concreto NÃO estava — o avaliado gerou: ${sobDemanda}`);
console.log(`   citação sem elemento concreto (indecidível por este teste): ${semConcreto}`);
if (amostraSobDemanda.length) {
  console.log('   amostra do "gerou sozinho, mas está marcado provocado":');
  amostraSobDemanda.forEach((a) => console.log(`     ${a}`));
}

console.log('\n5 · A ASSIMETRIA DE SUPRESSÃO');
console.log(`   rodadas em que a régua de baixa confiança derrubaria o rótulo: ${suprimidasPorConfianca} de ${B.rodadas.length}`);
console.log('   (desde 25/08 a régua vale para as duas leituras — este número diz se isso mudou algo)\n');
