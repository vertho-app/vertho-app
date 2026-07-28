/**
 * Motor do /board — roda um painel de 4 modelos SEM depender do Claude Code.
 *
 * Cada autor e um CLI oficial autenticado por ASSINATURA (nao API key):
 *   A claude -p        Claude          (plano Claude)
 *   B codex exec       gpt-5.6-sol     (plano ChatGPT)
 *   C kimi -p          Kimi K3         (plano Kimi for Coding)
 *   D agy -p           Gemini 3.6 Flash(conta Google)
 *
 * Fluxo: R1 cada um sozinho -> R2 cada um le as outras (anonimas) e fecha ->
 * sintese (Claude) comparando R1 x R2.
 *
 * Diferenca para o workflow do Claude Code: aqui NAO existe camada de relay.
 * Como este processo tem shell, ele fala com os CLIs direto -- o que elimina os
 * subagentes de transporte, o custo deles e as tres classes de bug que
 * apareceram em 27/07 (limite de linha de comando, args serializado, script
 * cacheado).
 */
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const TMP = join(tmpdir(), 'vertho-board')
mkdirSync(TMP, { recursive: true })

const TIMEOUT_MS = 12 * 60 * 1000

// ---------------------------------------------------------------- shell
function sh(comando, { timeout = TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    const p = spawn('pwsh', ['-NoProfile', '-NonInteractive', '-Command', comando], {
      windowsHide: true,
    })
    let out = ''
    let err = ''
    let morto = false
    const t = setTimeout(() => {
      morto = true
      p.kill()
    }, timeout)

    p.stdout.on('data', (d) => (out += d.toString('utf8')))
    p.stderr.on('data', (d) => (err += d.toString('utf8')))
    p.on('close', (code) => {
      clearTimeout(t)
      resolve({ ok: code === 0 && !morto, code, out, err, timeout: morto })
    })
    p.on('error', (e) => {
      clearTimeout(t)
      resolve({ ok: false, code: -1, out, err: String(e), timeout: false })
    })
  })
}

// ---------------------------------------------------------------- json
/** Ultimo objeto JSON balanceado do texto. Os CLIs imprimem cabecalho, passos
 *  intermediarios e as vezes repetem a resposta -- o que vale e o ultimo. */
export function extrairJson(texto) {
  const s = String(texto || '')
  const candidatos = []
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== '{') continue
    let nivel = 0
    let emString = false
    let escape = false
    for (let j = i; j < s.length; j++) {
      const c = s[j]
      if (escape) { escape = false; continue }
      if (c === '\\') { escape = true; continue }
      if (c === '"') { emString = !emString; continue }
      if (emString) continue
      if (c === '{') nivel++
      else if (c === '}') {
        nivel--
        if (nivel === 0) { candidatos.push(s.slice(i, j + 1)); i = j; break }
      }
    }
  }
  for (let k = candidatos.length - 1; k >= 0; k--) {
    try {
      const o = JSON.parse(candidatos[k])
      if (o && typeof o === 'object' && !Array.isArray(o)) return o
    } catch { /* proximo candidato */ }
  }
  return null
}

// ---------------------------------------------------------------- motores
const UTF8 = '[Console]::OutputEncoding=[Text.Encoding]::UTF8; $OutputEncoding=[Text.Encoding]::UTF8; '
// agy nao esta no PATH herdado por processos filhos; recarregar do registro
const PATH_AGY = "$env:Path = (Get-ItemProperty 'HKCU:\\Environment' -Name Path).Path + ';' + $env:Path; "
const LER_ARQUIVO = (f) =>
  `"Leia INTEGRALMENTE o arquivo ${f} e siga as instrucoes que estao nele. O arquivo e longo: leia ate o fim antes de responder."`

export const MOTORES = {
  claude: {
    letra: 'A',
    nome: 'Claude',
    via: 'claude -p · assinatura Claude',
    // stdin: prompt grande como argumento estoura o CreateProcess do Windows (~32 KB)
    cmd: (f) => `${UTF8}Get-Content '${f}' -Raw | claude -p --output-format json --model opus`,
    parse: (out) => {
      const env = extrairJson(out)
      // o CLI devolve um envelope; a resposta do modelo vive em .result
      if (env && typeof env.result === 'string') return extrairJson(env.result)
      return env
    },
    custo: (out) => {
      const env = extrairJson(out)
      return env && typeof env.total_cost_usd === 'number' ? env.total_cost_usd : null
    },
  },
  codex: {
    letra: 'B',
    nome: 'gpt-5.6-sol',
    via: 'codex exec · plano ChatGPT',
    // --sandbox read-only: garantia em nivel de processo de que nao escreve
    cmd: (f) => `${UTF8}Get-Content '${f}' -Raw | codex exec --skip-git-repo-check --sandbox read-only`,
    parse: (out) => extrairJson(out),
  },
  kimi: {
    letra: 'C',
    nome: 'Kimi K3',
    via: 'kimi -p · plano Kimi for Coding',
    // nao le stdin (`-p -` vira o prompt literal "-"): recebe o CAMINHO
    cmd: (f) => `${UTF8}kimi -p ${LER_ARQUIVO(f)} --output-format stream-json`,
    parse: (out) => {
      const linhas = String(out).split('\n').filter((l) => l.includes('"role":"assistant"'))
      for (let i = linhas.length - 1; i >= 0; i--) {
        try {
          const o = JSON.parse(linhas[i])
          if (typeof o.content === 'string' && o.content.trim()) {
            return extrairJson(o.content)
          }
        } catch { /* linha parcial */ }
      }
      return extrairJson(out)
    },
  },
  gemini: {
    letra: 'D',
    nome: 'Gemini 3.6 Flash',
    via: 'agy -p · conta Google',
    // --model exige o LABEL; o ID de `agy models` cai calado no default.
    // TMP precisa entrar em --add-dir ou o agy nao le o proprio prompt.
    cmd: (f, ctx) =>
      `${UTF8}${PATH_AGY}agy -p ${LER_ARQUIVO(f)} --model "Gemini 3.6 Flash (High)" --add-dir "${TMP}"` +
      (ctx.raiz ? ` --add-dir "${ctx.raiz}"` : '') +
      (ctx.contextoDir ? ` --add-dir "${ctx.contextoDir}"` : '') +
      ` --dangerously-skip-permissions --print-timeout 10m`,
    parse: (out) => extrairJson(out),
    dica:
      'AVISO DE FERRAMENTA: busca ampla TRAVA voce (node_modules, .next, dist sao enormes e estouram o seu timeout). Escope toda busca a um diretorio concreto.',
  },
}

/** Falha de rede/servidor, que uma segunda tentativa costuma resolver — ao
 *  contrario de contrato quebrado, que vai falhar igual quantas vezes rodar. */
function transitoria(texto) {
  return /API Error|Connection closed|connection reset|ECONNRESET|ETIMEDOUT|socket hang up|502|503|504|overloaded|rate.?limit/i.test(
    String(texto || ''),
  )
}

/**
 * Roda um motor com o prompt dado. Nunca lanca: devolve {ok:false, erro}.
 *
 * `tentativas` existe porque a sintese e o unico passo sem rede de protecao: se
 * ela cai, o painel inteiro (~20 min e cota das quatro assinaturas) fica sem
 * produto. Medido 28/07: "API Error: Connection closed mid-response" derrubou
 * uma sintese depois de 355s de trabalho.
 */
export async function chamarMotor(id, prompt, ctx = {}, tag = '', tentativas = 1) {
  const m = MOTORES[id]
  if (!m) return { ok: false, erro: `motor desconhecido: ${id}` }

  const arquivo = join(TMP, `${tag || 'p'}_${id}.txt`)
  writeFileSync(arquivo, prompt, 'utf8')

  let ultimo = null
  for (let n = 1; n <= tentativas; n++) {
    const inicio = Date.now()
    const r = await sh(m.cmd(arquivo, ctx))
    const segundos = Math.round((Date.now() - inicio) / 1000)

    if (!r.timeout) {
      const dados = m.parse(r.out)
      if (dados) {
        return { ok: true, dados, segundos, tentativa: n, custo_usd: m.custo ? m.custo(r.out) : null }
      }
    }

    const saida = (r.out + '\n' + r.err).trim().slice(-800)
    ultimo = {
      ok: false,
      segundos,
      tentativa: n,
      erro: r.timeout ? `timeout apos ${segundos}s` : `nenhum JSON valido na saida: ${saida}`,
    }

    const vaiTentarDeNovo = n < tentativas && (r.timeout || transitoria(saida))
    if (!vaiTentarDeNovo) break
    await new Promise((res) => setTimeout(res, 5000 * n))
  }

  return ultimo
}
