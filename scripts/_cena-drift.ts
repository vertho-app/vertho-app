/* eslint-disable */
// Mede a DERIVA dentro da cena: para cada descritor que apareceu 2+ vezes, o
// nível da última evidência é maior, igual ou menor que o da primeira?
//
// Existe porque a conclusão de 25/08 ("a deriva é do ATOR, não do extrator")
// foi tirada da distribuição de vereditos ao longo do tempo — e o extrator de
// então classificava OCORRÊNCIA. Com o classificador ancorado a mesma conta
// pode dar outro resultado, e é ela que decide se a separação Abertura ×
// Encerramento mede alguma coisa ou é ruído com duas casas.
//
// Uso: npx tsx scripts/_cena-drift.ts cena-fase0c.json cena-fase0c-reextraido.json
import { readFileSync } from 'node:fs';

const ORD: Record<string, number> = { n1_gap: 1, n2_em_desenvolvimento: 2, n3_meta: 3 };
const VER: Record<string, number> = { falhou: 1, tentou: 2, demonstrou: 3 };

function deriva(rodadas: any[], leitor: (e: any) => number | undefined) {
  let sobe = 0, desce = 0, igual = 0, pares = 0;
  for (const r of rodadas) {
    if (!r?.extracao?.evidencias) continue;
    const porD: Record<number, Array<{ t: number; n: number }>> = {};
    for (const e of r.extracao.evidencias) {
      const n = leitor(e);
      if (!n) continue;
      (porD[e.indice] ||= []).push({ t: e.turno ?? 0, n });
    }
    for (const s of Object.values(porD)) {
      if (s.length < 2) continue;
      pares++;
      s.sort((a, b) => a.t - b.t);
      const d = s[s.length - 1].n - s[0].n;
      if (d > 0) sobe++; else if (d < 0) desce++; else igual++;
    }
  }
  return { pares, sobe, desce, igual };
}

const A = JSON.parse(readFileSync(process.argv[2], 'utf-8'));
const B = JSON.parse(readFileSync(process.argv[3], 'utf-8'));

console.log('descritores com 2+ evidências — a última contra a primeira:');
console.log('  ANTES (ocorrência):', JSON.stringify(deriva(A.rodadas, (e) => VER[e.veredito])));
console.log('  AGORA (ancorado)  :', JSON.stringify(deriva(B.rodadas, (e) => ORD[e.nivel ?? ''])));

const evs = B.rodadas.flatMap((r: any) => r.extracao?.evidencias ?? []);
const n3arm = B.rodadas.filter((r: any) => r.nivel === 3).flatMap((r: any) => r.extracao?.evidencias ?? []);
const n2s = n3arm.filter((e: any) => e.nivel === 'n2_em_desenvolvimento');
console.log(`\nbraço N3: ${n2s.length} de ${n3arm.length} evidências ficaram em n2. Amostra:`);
for (const e of n2s.slice(0, 6)) {
  console.log(`  D${e.indice} t${e.turno}${e.provocado ? ' [provocado]' : ''}: ${String(e.comentario ?? '').slice(0, 160)}`);
}
console.log(`\nprovocado: ${evs.filter((e: any) => e.provocado).length} de ${evs.length}`);
