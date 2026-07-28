/**
 * E2E do upload: sobe um arquivo para o Storage como a tela faz, enfileira um
 * painel apontando para ele e confere que a resposta usa o CONTEÚDO do arquivo.
 *
 *   node --env-file=.env.local scripts/painel/_e2e-upload.mjs   (com o worker ligado)
 *
 * O truque: o arquivo contém um fato que os modelos não teriam como inventar.
 * Se a resposta trouxer o fato, o arquivo chegou até eles.
 */
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const SEGREDO = `ZEPHYR-${Math.floor(Math.random() * 9000 + 1000)}`
const conteudo = `# Nota interna de teste

O código de operação da campanha piloto é ${SEGREDO}.
A meta de inscrições da campanha é 137 escolas até 12 de novembro.
O responsável pela campanha é a área de Expansão.
`

const path = `${new Date().toISOString().slice(0, 10)}/${randomUUID()}-nota-teste.md`
const up = await sb.storage.from('board-contexto').upload(path, Buffer.from(conteudo, 'utf8'), {
  contentType: 'text/plain; charset=utf-8',
})
if (up.error) {
  console.error('upload falhou:', up.error.message)
  process.exit(1)
}
console.log(`arquivo no storage: ${path}`)

const { data, error } = await sb
  .from('board_paineis')
  .insert({
    titulo: 'E2E — upload de contexto',
    pergunta:
      'Leia a nota interna anexada e responda em uma frase: qual e o codigo de operacao da campanha piloto e qual e a meta de inscricoes? Se o arquivo nao estiver acessivel, diga isso claramente em vez de adivinhar.',
    arquivos: [{ nome: 'nota-teste.md', path, bytes: conteudo.length }],
    // os quatro: cada CLI tem uma regra de workspace diferente, e é justamente
    // aí que mora o erro
    motores: ['claude', 'codex', 'kimi', 'gemini'],
    status: 'pendente',
    criado_por: 'e2e@local',
  })
  .select('id')
  .single()

if (error) {
  console.error('enfileirar falhou:', error.message)
  process.exit(1)
}

console.log(`painel ${data.id} — esperando o worker (segredo plantado: ${SEGREDO})\n`)

const t0 = Date.now()
let ultimo = ''
while ((Date.now() - t0) / 1000 < 600) {
  const { data: p } = await sb.from('board_paineis').select('status, progresso, resultado, erro').eq('id', data.id).single()
  const marca = `${p?.status}:${(p?.progresso || []).length}`
  if (marca !== ultimo) {
    ultimo = marca
    console.log(`${String(Math.round((Date.now() - t0) / 1000)).padStart(4)}s  ${p.status}  (${(p.progresso || []).length} eventos)`)
  }

  if (p?.status === 'concluido') {
    // Checagem POR AUTOR, na rodada 1 (antes de qualquer contato): é a única
    // forma de saber quem leu o arquivo de fato. Olhar só a síntese esconde o
    // caso em que um motor leu e os outros copiaram dele — foi exatamente
    // assim que o furo do --add-dir passou despercebido em 28/07.
    const r1 = p.resultado?.rodada1 || []
    console.log('\nquem leu o arquivo (rodada 1, sem contato entre eles):')
    let leram = 0
    for (const autor of r1) {
      const texto = JSON.stringify(autor)
      const leu = texto.includes(SEGREDO)
      if (leu) leram++
      console.log(`  ${autor.letra} ${String(autor.nome).padEnd(18)} ${leu ? 'leu' : 'NÃO LEU'}`)
    }

    const sintese = JSON.stringify(p.resultado?.sintese || {})
    console.log(`\nresumo: ${p.resultado?.sintese?.resumo}`)
    const ok = leram === r1.length && r1.length > 0 && sintese.includes(SEGREDO)
    console.log(
      ok
        ? `\nOK — os ${leram} motores leram o arquivo enviado pela tela`
        : `\nFALHOU — só ${leram}/${r1.length} motores leram o arquivo`
    )
    process.exit(ok ? 0 : 1)
  }
  if (p?.status === 'erro') {
    console.error(`\nFALHOU: ${p.erro}`)
    process.exit(1)
  }
  await new Promise((r) => setTimeout(r, 3000))
}
console.error('\ntimeout')
process.exit(1)
