/**
 * Refaz SÓ a síntese de um painel cujas rodadas já rodaram.
 *
 *   node scripts/painel/refazer-sintese.mjs <resultado.json> [--saida=novo.json]
 *   node --env-file=.env.local scripts/painel/refazer-sintese.mjs --id=<uuid do board>
 *
 * Existe porque a síntese é o único passo sem rede de proteção: se ela cai
 * (28/07: "API Error: Connection closed mid-response"), o painel inteiro — duas
 * rodadas, quatro modelos, ~20 min e cota de três assinaturas — fica sem
 * produto. As propostas já estão salvas; só falta sintetizar de novo.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { sintetizar } from './painel.mjs'

const argv = process.argv.slice(2)
const flag = (n, padrao = null) => {
  const a = argv.find((x) => x.startsWith(`--${n}=`))
  return a ? a.slice(n.length + 3) : padrao
}
const arquivo = argv.find((a) => !a.startsWith('--'))
const boardId = flag('id')

if (!arquivo && !boardId) {
  console.error('uso: node refazer-sintese.mjs <resultado.json> [--saida=novo.json]')
  console.error('     node --env-file=.env.local refazer-sintese.mjs --id=<uuid>')
  process.exit(2)
}

let painel
let sb = null

if (boardId) {
  const { createClient } = await import('@supabase/supabase-js')
  sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })
  const { data, error } = await sb.from('board_paineis').select('*').eq('id', boardId).single()
  if (error) {
    console.error(`não achei o painel: ${error.message}`)
    process.exit(1)
  }
  painel = data.resultado
  if (!painel) {
    console.error('esse painel não tem resultado gravado — as rodadas não chegaram a terminar')
    process.exit(1)
  }
} else {
  painel = JSON.parse(readFileSync(arquivo, 'utf8'))
}

if (!painel.rodada1?.length || !painel.rodada2?.length) {
  console.error('o resultado não tem as duas rodadas — não há o que sintetizar')
  process.exit(1)
}

console.log(`rodadas encontradas: R1 ${painel.rodada1.map((p) => p.letra).join('')} · R2 ${painel.rodada2.map((p) => p.letra).join('')}`)
console.log('sintetizando (até 3 tentativas)...')

const t0 = Date.now()
const { sintese, convergencia } = await sintetizar({
  pergunta: painel.pergunta,
  contexto: painel.contexto,
  contexto_dir: painel.contexto_dir,
  raiz: painel.raiz,
  r1: painel.rodada1,
  r2: painel.rodada2,
  tentativas: 3,
})

if (!sintese.ok) {
  console.error(`\nfalhou de novo (tentativa ${sintese.tentativa}): ${String(sintese.erro).slice(0, 300)}`)
  process.exit(1)
}

const completo = {
  ...painel,
  convergencia,
  sintese: sintese.dados,
  sintese_erro: null,
  metricas: {
    ...(painel.metricas || {}),
    sintese_refeita_em_s: Math.round((Date.now() - t0) / 1000),
    sintese_tentativa: sintese.tentativa,
  },
}

const saida = flag('saida', arquivo)
if (saida) {
  writeFileSync(saida, JSON.stringify(completo, null, 2), 'utf8')
  console.log(`\ngravado em ${saida}`)
}

if (sb && boardId) {
  const { error } = await sb
    .from('board_paineis')
    .update({
      status: 'concluido',
      resultado: completo,
      resumo: sintese.dados.resumo || null,
      erro: null,
      concluido_em: new Date().toISOString(),
    })
    .eq('id', boardId)
  if (error) console.error(`não consegui gravar no board: ${error.message}`)
  else console.log(`board atualizado: /admin/vertho/board/${boardId}`)
}

console.log(`\n${Math.round((Date.now() - t0) / 1000)}s · tentativa ${sintese.tentativa}`)
console.log(`RESPOSTA: ${sintese.dados.resumo}`)
