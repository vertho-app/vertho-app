/**
 * Inspeciona o que um autor respondeu num painel — para diagnosticar quando a
 * resposta não bate com o esperado.
 *
 *   node --env-file=.env.local scripts/painel/_inspecionar.mjs <id> [letra]
 */
import { createClient } from '@supabase/supabase-js'

const [id, letra = 'A'] = process.argv.slice(2)
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const { data, error } = await sb
  .from('board_paineis')
  .select('resultado, contexto_dir, arquivos')
  .eq('id', id)
  .single()

if (error) {
  console.error(error.message)
  process.exit(1)
}

console.log(`contexto_dir do pedido: ${data.contexto_dir}`)
console.log(`arquivos: ${JSON.stringify(data.arquivos)}`)
console.log(`arquivos vistos pelo inventário: ${JSON.stringify(data.resultado?.arquivos_de_apoio || [])}`)

const a = (data.resultado?.rodada1 || []).find((x) => x.letra === letra)
if (!a) {
  console.log(`autor ${letra} não está na rodada 1`)
  process.exit(1)
}

console.log(`\n--- proposta do ${letra} (${a.nome}) ---`)
console.log(String(a.proposta || '').slice(0, 1200))
console.log(`\n--- premissas ---`)
console.log((a.premissas || []).join('\n'))
console.log(`\n--- evidências ---`)
for (const e of a.evidence || []) console.log(`(${e.provenance}) ${e.claim}${e.source ? ` [${e.source}]` : ''}`)
