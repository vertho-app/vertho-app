// E2E do /board: enfileira como a tela faz, e confere que o worker pega,
// executa e grava. Dois motores e pergunta pequena — o que se testa aqui é o
// CAMINHO, não a qualidade da resposta.
import { createClient } from '@supabase/supabase-js'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const { data, error } = await sb
  .from('board_paineis')
  .insert({
    titulo: 'E2E — caminho web → worker',
    pergunta:
      'Em duas frases: qual e o maior risco de um painel de varios modelos de IA convergirem para a mesma resposta errada, e o que fazer contra isso?',
    motores: ['claude', 'gemini'],
    status: 'pendente',
    criado_por: 'e2e@local',
  })
  .select('id')
  .single()

if (error) {
  console.error('falhou ao enfileirar:', error.message)
  process.exit(1)
}

console.log(`enfileirado: ${data.id}`)
console.log('agora rode o worker em outra janela; este script acompanha até concluir.\n')

const t0 = Date.now()
let ultimo = ''
while (Math.round((Date.now() - t0) / 1000) < 600) {
  const { data: p } = await sb
    .from('board_paineis')
    .select('status, progresso, resumo, erro, segundos')
    .eq('id', data.id)
    .single()

  const marca = `${p?.status}:${(p?.progresso || []).length}`
  if (marca !== ultimo) {
    ultimo = marca
    console.log(`${String(Math.round((Date.now() - t0) / 1000)).padStart(4)}s  ${p.status}  (${(p.progresso || []).length} eventos)`)
  }

  if (p?.status === 'concluido') {
    console.log(`\nOK — ${p.segundos}s`)
    console.log(`RESPOSTA: ${p.resumo}`)
    process.exit(0)
  }
  if (p?.status === 'erro') {
    console.error(`\nFALHOU: ${p.erro}`)
    process.exit(1)
  }
  await new Promise((r) => setTimeout(r, 3000))
}

console.error('\ntimeout de 10 min esperando o worker')
process.exit(1)
