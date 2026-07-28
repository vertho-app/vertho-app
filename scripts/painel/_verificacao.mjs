/**
 * Testa o verificador mecânico de fontes.
 *
 *   node scripts/painel/_verificacao.mjs
 *
 * O caso que importa é o do meio: uma citação que PARECE medição e aponta para
 * arquivo que não existe. Se isso passar como "ok", o verificador não serve —
 * é justamente esse chute vestido de medida que o refinamento cruzado propaga.
 */
import { verificarCitacoes, tetoDeConfianca, textoVerificacao } from './verificacao.mjs'

const RAIZ = process.cwd()
let falhas = 0
const ok = (cond, msg) => {
  console.log(`${cond ? '  ok  ' : '  FALHOU  '} ${msg}`)
  if (!cond) falhas++
}

const propostas = [
  {
    letra: 'A',
    confidence: 0.9,
    evidence: [
      { claim: 'o wrapper de IA existe', provenance: 'Medido', source: 'actions/ai-client.ts' },
      { claim: 'status tem os dominios', provenance: 'Medido', source: 'lib/status.ts:13' },
    ],
  },
  {
    letra: 'B',
    confidence: 0.95,
    evidence: [
      { claim: 'o motor de captura vive aqui', provenance: 'Medido', source: 'actions/lead-fantasma.ts:12' },
      { claim: 'a regra esta nesta linha', provenance: 'Medido', source: 'lib/status.ts:99999' },
    ],
  },
  {
    letra: 'C',
    confidence: 0.88,
    evidence: [
      { claim: 'rodei o comando e deu 26', provenance: 'Medido', source: 'rg -l requireEmpresaSupabase | wc -l' },
      { claim: 'acho que o cron roda de madrugada', provenance: 'Suponho' },
    ],
  },
  { letra: 'D', confidence: 0.96, evidence: [{ claim: 'lembro que era assim', provenance: 'Memoria-nao-verificada' }] },
]

const v = verificarCitacoes(propostas, { raiz: RAIZ })

console.log('1) classificação das citações')
const porLetra = (l) => v.itens.filter((i) => i.letra === l)
ok(porLetra('A').every((i) => i.status === 'ok'), 'A: as duas citações reais conferem')
ok(porLetra('B').some((i) => i.status === 'arquivo-inexistente'), 'B: arquivo inventado é pego')
ok(porLetra('B').some((i) => i.status === 'linha-inexistente'), 'B: linha impossível é pega')
ok(porLetra('C')[0].status === 'nao-verificavel', 'C: comando rodado fica NEUTRO (não acusa)')
ok(v.resumo.quebradas === 2, `resumo conta 2 quebradas (deu ${v.resumo.quebradas})`)

console.log('\n2) teto de confiança')
const tetos = propostas.map((p) => ({ letra: p.letra, ...tetoDeConfianca(p, v) }))
for (const t of tetos) {
  console.log(`  ${t.letra}: declarou ${t.declarada} · teto ${t.teto} · efetiva ${t.efetiva}${t.estourou ? '  <- estourou' : ''}  (${t.motivo})`)
}
const tB = tetos.find((t) => t.letra === 'B')
const tD = tetos.find((t) => t.letra === 'D')
const tA = tetos.find((t) => t.letra === 'A')
ok(tB.estourou && tB.teto === 0.5, 'B (citação quebrada) tem teto 0,5 e estoura')
ok(tD.estourou && tD.teto === 0.7, 'D (memória não verificada) tem teto 0,7 e estoura')
ok(!tA.estourou, 'A (tudo medido e conferido) NÃO estoura')

console.log('\n3) bloco que vai para o prompt')
const texto = textoVerificacao(v, tetos)
console.log(texto.split('\n').map((l) => `  | ${l}`).join('\n'))
ok(texto.includes('lead-fantasma'), 'o bloco nomeia a citação inexistente')
ok(texto.includes('declarou 0.96'), 'o bloco expõe a confiança acima da evidência')

console.log(`\n${falhas ? `${falhas} FALHA(S)` : 'tudo ok'}`)
process.exit(falhas ? 1 : 0)
