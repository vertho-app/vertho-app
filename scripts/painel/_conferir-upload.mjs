/**
 * Confere, num painel já concluído, QUEM leu o arquivo de contexto.
 *
 *   node --env-file=.env.local scripts/painel/_conferir-upload.mjs <id> <SEGREDO>
 *
 * Verifica a rodada 1 autor por autor: é lá, antes de qualquer contato entre
 * eles, que se sabe quem realmente abriu o arquivo — na síntese, um pode ter
 * copiado do outro.
 */
import { createClient } from '@supabase/supabase-js'

const [id, segredo] = process.argv.slice(2)
if (!id || !segredo) {
  console.error('uso: node _conferir-upload.mjs <id> <SEGREDO>')
  process.exit(2)
}

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const { data: p, error } = await sb.from('board_paineis').select('*').eq('id', id).single()
if (error) {
  console.error(error.message)
  process.exit(1)
}

console.log(`status: ${p.status}${p.segundos ? ` · ${p.segundos}s` : ''}`)
if (p.erro) console.log(`erro: ${p.erro}`)

const r1 = p.resultado?.rodada1 || []
if (!r1.length) {
  console.log('sem rodada 1 no resultado')
  process.exit(1)
}

console.log('\nquem leu o arquivo (rodada 1, sem contato entre eles):')
let leram = 0
for (const a of r1) {
  const leu = JSON.stringify(a).includes(segredo)
  if (leu) leram++
  console.log(`  ${a.letra} ${String(a.nome).padEnd(18)} ${leu ? 'leu' : 'NÃO LEU'}`)
}

if (p.resultado?.sintese?.resumo) console.log(`\nresumo: ${p.resultado.sintese.resumo}`)

const ok = leram === r1.length
console.log(ok ? `\nOK — os ${leram} motores leram` : `\nFALHOU — ${leram}/${r1.length} leram`)
process.exit(ok ? 0 : 1)
