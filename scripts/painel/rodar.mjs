/**
 * Roda um painel pela linha de comando e grava o JSON do resultado.
 *
 *   node scripts/painel/rodar.mjs "<pergunta>" --contexto=<pasta> --saida=<arquivo.json>
 *
 * Serve para testar o motor sem banco e sem Claude Code no caminho.
 */
import { writeFileSync } from 'node:fs'
import { rodarPainel } from './painel.mjs'

const argv = process.argv.slice(2)
const pergunta = argv.find((a) => !a.startsWith('--'))
const flag = (n, padrao = null) => {
  const a = argv.find((x) => x.startsWith(`--${n}=`))
  return a ? a.slice(n.length + 3) : padrao
}

if (!pergunta) {
  console.error('uso: node rodar.mjs "<pergunta>" [--contexto=<pasta>] [--saida=<arquivo>] [--motores=claude,codex]')
  process.exit(2)
}

const pedido = {
  pergunta,
  contexto: flag('info'),
  contexto_dir: flag('contexto'),
  raiz: flag('raiz'),
  brief: flag('brief'),
  motores: flag('motores') ? flag('motores').split(',') : undefined,
}

const t0 = Date.now()
const rel = (t) => `${String(Math.floor((t - t0) / 1000)).padStart(4)}s`

const r = await rodarPainel(pedido, (e) => {
  if (e.motor) {
    console.log(`${rel(Date.now())}  ${e.fase}  ${e.letra} ${e.ok ? `ok (${e.segundos}s)` : `FALHOU: ${String(e.erro).slice(0, 120)}`}`)
  } else if (e.fase === 'rodada1') {
    console.log(`${rel(Date.now())}  rodada 1 — ${e.total} autores, ${e.arquivos} arquivo(s) de contexto`)
  } else if (e.fase === 'rodada2' && e.total) {
    console.log(`${rel(Date.now())}  rodada 2 — ${e.total} autores`)
  } else if (e.fase === 'sintese' && e.ok === undefined) {
    console.log(`${rel(Date.now())}  sintese`)
  }
})

const saida = flag('saida')
if (saida) {
  writeFileSync(saida, JSON.stringify(r, null, 2), 'utf8')
  console.log(`\nresultado gravado em ${saida}`)
}

if (r.erro) {
  console.error(`\nPAINEL FALHOU: ${r.erro}`)
  process.exit(1)
}

console.log(`\n=== ${r.metricas.segundos}s no total ===`)
console.log(`presenca: R1 ${r.presenca.r1.join('')} · R2 ${r.presenca.r2.join('')}${r.presenca.perdidos.length ? ` · PERDIDOS: ${r.presenca.perdidos.map((p) => p.letra).join('')}` : ''}`)
console.log(`convergencia: ${r.convergencia.recusas_declaradas} recusas, ${r.convergencia.pontos_em_disputa} em disputa${r.convergencia.alerta_conformidade ? '  *** ALERTA DE CONFORMIDADE ***' : ''}`)
console.log(`custo Claude equivalente: us$ ${r.metricas.custo_claude_usd.toFixed(2)} (coberto pela assinatura)`)
console.log(`\nRESPOSTA: ${r.sintese ? r.sintese.resumo : `(sintese falhou: ${r.sintese_erro})`}`)
