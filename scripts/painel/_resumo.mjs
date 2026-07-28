/**
 * Resumo de um painel concluído, para ler no terminal.
 *
 *   node --env-file=.env.local scripts/painel/_resumo.mjs <id>
 */
import { createClient } from '@supabase/supabase-js'

const [id] = process.argv.slice(2)
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const { data: p, error } = await sb.from('board_paineis').select('*').eq('id', id).single()
if (error) { console.error(error.message); process.exit(1) }

const r = p.resultado || {}
const s = r.sintese || {}
const c = r.convergencia || {}
const v = r.verificacao || {}

console.log(`${p.titulo} · ${p.status} · ${p.segundos}s`)
console.log(`presença: R1 ${(r.presenca?.r1 || []).join('')} · R2 ${(r.presenca?.r2 || []).join('')}${
  r.presenca?.perdidos?.length ? ` · PERDIDOS ${r.presenca.perdidos.map((x) => x.letra).join('')}` : ''
}`)
console.log(`convergência: ${c.recusas_declaradas} recusas · ${c.pontos_em_disputa} em disputa${
  c.alerta_conformidade ? ' · ALERTA DE CONFORMIDADE' : ''
}`)
if (v.resumo?.total) {
  console.log(`fontes: ${v.resumo.ok} conferem · ${v.resumo.quebradas} não existem · ${v.resumo.nao_verificavel} neutras`)
}
const estourou = (v.tetos || []).filter((t) => t.estourou)
if (estourou.length) {
  console.log(`confiança acima da evidência: ${estourou.map((t) => `${t.letra} (${t.declarada}>${t.teto})`).join(', ')}`)
}

console.log(`\nRESPOSTA: ${s.resumo || '(sem síntese)'}`)

if (s.ideias_orfas_resgatadas?.length) {
  console.log(`\nIDEIAS ÓRFÃS RESGATADAS (${s.ideias_orfas_resgatadas.length}):`)
  for (const o of s.ideias_orfas_resgatadas) console.log(`  [${o.de}] ${String(o.ideia).slice(0, 150)}`)
}
if (r.premissas_comuns?.length) {
  console.log(`\nPREMISSA COMUM ATACADA:`)
  for (const x of r.premissas_comuns) {
    console.log(`  [${x.letra}] ${String(x.premissa).slice(0, 130)} — sobreviveu: ${x.sobreviveu ? 'sim' : 'NÃO'}`)
  }
}
if (s.divergencias_reais?.length) {
  console.log(`\nDIVERGÊNCIAS (${s.divergencias_reais.length}):`)
  for (const d of s.divergencias_reais) console.log(`  · ${String(d.ponto).slice(0, 130)}`)
}
