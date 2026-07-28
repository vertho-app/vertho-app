/**
 * Reproduz a falha do motor B (codex) no cenário REAL do painel: prompt de
 * verdade, pasta de contexto e os quatro motores em paralelo.
 *
 *   node scripts/painel/_repro-b.mjs <arquivo-de-prompt> <pasta-de-contexto>
 *
 * Isolado, o codex sempre respondeu (287s, 369s). No painel, morre em ~16s
 * devolvendo o eco do prompt. A diferença tem de estar aqui.
 */
import { readFileSync } from 'node:fs'
import { chamarMotor, MOTORES } from './engine.mjs'

const [arq, ctxDir] = process.argv.slice(2)
if (!arq) {
  console.error('uso: node _repro-b.mjs <arquivo-de-prompt> [pasta-de-contexto]')
  process.exit(2)
}

const prompt = readFileSync(arq, 'utf8')
const ctx = { raiz: process.cwd(), contextoDir: ctxDir || undefined }
console.log(`prompt: ${Math.round(prompt.length / 1024)} KB · contexto: ${ctxDir || '(nenhum)'}\n`)

const t0 = Date.now()
const ids = Object.keys(MOTORES)
const rs = await Promise.all(
  ids.map(async (id) => {
    const r = await chamarMotor(id, prompt, ctx, 'repro', 1)
    const s = Math.round((Date.now() - t0) / 1000)
    console.log(
      `${String(s).padStart(4)}s  ${MOTORES[id].letra} ${MOTORES[id].nome.padEnd(18)} ${
        r.ok ? 'ok' : `FALHOU (${r.segundos}s): ${String(r.erro).slice(0, 90)}`
      }`,
    )
    return { id, ...r }
  }),
)

const falhas = rs.filter((r) => !r.ok)
console.log(`\n${rs.length - falhas.length}/${rs.length} responderam`)
process.exit(falhas.length ? 1 : 0)
