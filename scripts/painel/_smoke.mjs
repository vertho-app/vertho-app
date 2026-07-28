// Smoke do motor: chama os 4 CLIs em paralelo com um prompt pequeno e verifica
// que cada um devolve JSON no formato pedido. Barato de proposito.
import { chamarMotor, MOTORES } from './engine.mjs'

const PROMPT = `Voce e um autor anonimo de um painel de teste.

Responda SOMENTE com um objeto JSON puro, sem cercas de codigo, sem texto antes ou depois:
{
  "resumo": "<uma frase dizendo qual modelo voce e>",
  "soma": <o resultado de 17 + 25>,
  "acentos": "avaliacao com acentuacao correta: coracao, criterio, publico"
}
Escreva o campo "acentos" com a acentuacao correta do portugues.`

const ids = Object.keys(MOTORES)
console.log(`chamando ${ids.length} motores em paralelo...\n`)

const inicio = Date.now()
const rs = await Promise.all(ids.map((id) => chamarMotor(id, PROMPT, {}, 'smoke')))
const total = Math.round((Date.now() - inicio) / 1000)

let falhas = 0
rs.forEach((r, i) => {
  const m = MOTORES[ids[i]]
  if (!r.ok) {
    falhas++
    console.log(`${m.letra} ${m.nome.padEnd(17)} FALHOU (${r.segundos ?? '?'}s): ${String(r.erro).slice(0, 160)}`)
    return
  }
  const d = r.dados
  const somaOk = d.soma === 42 ? 'ok' : `ERRO(${d.soma})`
  const acentoOk = /ção|ério|úbl/.test(String(d.acentos)) ? 'ok' : 'SEM ACENTO'
  console.log(
    `${m.letra} ${m.nome.padEnd(17)} ${String(r.segundos).padStart(3)}s  soma=${somaOk}  acentos=${acentoOk}  ${
      r.custo_usd != null ? `us$${r.custo_usd.toFixed(3)}  ` : ''
    }"${String(d.resumo).slice(0, 60)}"`,
  )
})

console.log(`\nparalelo: ${total}s (o mais lento manda) — falhas: ${falhas}/${ids.length}`)
process.exit(falhas ? 1 : 0)
