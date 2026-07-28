/**
 * Reenfileira um painel já existente, com o mesmo enunciado e os mesmos
 * arquivos — para repetir uma rodada que perdeu um motor.
 *
 *   node --env-file=.env.local scripts/painel/_reenfileirar.mjs <id>
 */
import { createClient } from '@supabase/supabase-js'

const [id] = process.argv.slice(2)
if (!id) {
  console.error('uso: node _reenfileirar.mjs <id do painel>')
  process.exit(2)
}

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const { data: orig, error } = await sb.from('board_paineis').select('*').eq('id', id).single()
if (error) {
  console.error(error.message)
  process.exit(1)
}

const { data: novo, error: e2 } = await sb
  .from('board_paineis')
  .insert({
    titulo: orig.titulo,
    pergunta: orig.pergunta,
    contexto: orig.contexto,
    contexto_dir: orig.contexto_dir,
    arquivos: orig.arquivos,
    motores: ['claude', 'codex', 'kimi', 'gemini'],
    status: 'pendente',
    criado_por: orig.criado_por,
  })
  .select('id')
  .single()

if (e2) {
  console.error(e2.message)
  process.exit(1)
}

console.log(`reenfileirado: ${novo.id}`)
console.log(`  titulo:   ${orig.titulo}`)
console.log(`  arquivos: ${(orig.arquivos || []).length}`)
console.log(`  motores:  claude, codex, kimi, gemini`)
console.log(`\n/admin/vertho/board/${novo.id}`)
