/**
 * Reproduz a falha do motor B pelo CAMINHO REAL (chamarMotor + spawn), não pelo
 * terminal — que é onde ela nunca aparecia.
 *
 *   node scripts/painel/_codex-spawn.mjs
 *
 * Usa um prompt pequeno de propósito: o que se testa aqui é o processo nascer e
 * responder, não a qualidade do texto. Se voltar JSON, o spawn está certo.
 */
import { chamarMotor } from './engine.mjs'

const PROMPT = `Responda SOMENTE com um objeto JSON puro, sem cercas de codigo:
{"proposta":"<uma frase>","resumo":"<uma frase>","premissas":[],"evidence":[],"riscos":[],"confidence":0.5}
A frase pode ser qualquer coisa sobre feiras de RH.`

const t0 = Date.now()
const r = await chamarMotor('codex', PROMPT, { raiz: process.cwd() }, 'spawn-teste', 1)
const s = Math.round((Date.now() - t0) / 1000)

if (r.ok) {
  console.log(`OK em ${s}s — resumo: ${String(r.dados.resumo).slice(0, 80)}`)
  process.exit(0)
}

console.error(`FALHOU em ${s}s`)
console.error(String(r.erro).slice(0, 400))
process.exit(1)
