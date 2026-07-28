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
function sh(comando, { timeout = TIMEOUT_MS, env = {} } = {}) {
  return new Promise((resolve) => {
    const p = spawn('pwsh', ['-NoProfile', '-NonInteractive', '-Command', comando], {
      windowsHide: true,
      env: { ...process.env, ...env },
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

/**
 * SEGURANCA — caminhos NUNCA sao interpolados no texto do comando.
 *
 * `contexto_dir` e `raiz` chegam de `criarPainel`, que e uma server action: o
 * VALOR e escolhido pelo cliente, nao pelo formulario. Concatenado numa string
 * de shell, um `"; <comando>; "` viraria execucao arbitraria NESTA maquina, com
 * os privilegios do dono. E a mesma classe da arg-injection do yt-dlp (auditoria
 * de 23/07).
 *
 * Solucao: os valores viajam em VARIAVEIS DE AMBIENTE e o comando referencia
 * `$env:...`. O PowerShell expande variavel em modo de argumento -- o conteudo
 * vira UM argumento e nao volta a ser lido como sintaxe, entao `;`, `|`, `$(...)`
 * e aspas dentro do valor sao inertes.
 */
const ENV_PROMPT = 'BOARD_PROMPT_FILE'
const ENV_TMP = 'BOARD_TMP_DIR'
const ENV_RAIZ = 'BOARD_ADD_RAIZ'
const ENV_CTX = 'BOARD_ADD_CTX'

const LER_ARQUIVO = `"Leia INTEGRALMENTE o arquivo $env:${ENV_PROMPT} e siga as instrucoes que estao nele. O arquivo e longo: leia ate o fim antes de responder."`

/** Cinto de seguranca do lado de ca: caminho com sintaxe de shell nao passa.
 *  Nao substitui o uso de env var -- soma a ele. */
const PERIGOSO = /["`;|&\n\r$(){}<>]/
export function caminhoSuspeito(p) {
  return typeof p === 'string' && p.length > 0 && PERIGOSO.test(p)
}

export const MOTORES = {
  claude: {
    letra: 'A',
    nome: 'Claude',
    via: 'claude -p · assinatura Claude',
    // stdin: prompt grande como argumento estoura o CreateProcess do Windows (~32 KB).
    // --add-dir e OBRIGATORIO para o contexto: o CLI so le dentro do workspace,
    // e a pasta de anexos fica em %TEMP%. Sem isto o modelo responde "nao
    // consegui abrir" ou, pior, deduz o conteudo -- medido 28/07, quando so o
    // Gemini (que ja tinha --add-dir) enxergou o arquivo enviado pela tela.
    // --allowedTools e o que faz a leitura funcionar: em `-p` headless nao ha
    // como responder a um pedido de permissao, entao pedir equivale a NEGAR --
    // o modelo via o --add-dir e mesmo assim levava "you haven't granted it yet".
    // So ferramentas de LEITURA: nada de Bash, Write ou Edit, que e o que
    // sustenta a promessa de "permissao de leitura apenas" feita no prompt.
    cmd: (f, ctx) =>
      `${UTF8}Get-Content -LiteralPath $env:${ENV_PROMPT} -Raw | claude -p --output-format json --model opus --allowedTools Read Glob Grep` +
      (ctx.contextoDir ? ` --add-dir $env:${ENV_CTX}` : '') +
      (ctx.raiz ? ` --add-dir $env:${ENV_RAIZ}` : ''),
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
    // read-only permite LER fora do cwd, mas o agente ancora o trabalho na raiz
    // que receber: com anexos, a raiz passa a ser a pasta deles.
    cmd: (f, ctx) =>
      `${UTF8}Get-Content -LiteralPath $env:${ENV_PROMPT} -Raw | codex exec --skip-git-repo-check --sandbox read-only` +
      (ctx.contextoDir ? ` --cd $env:${ENV_CTX}` : ''),
    parse: (out) => extrairJson(out),
  },
  kimi: {
    letra: 'C',
    nome: 'Kimi K3',
    via: 'kimi -p · plano Kimi for Coding',
    // nao le stdin (`-p -` vira o prompt literal "-"): recebe o CAMINHO.
    // --add-dir pela mesma razao do claude: workspace nao alcanca %TEMP%.
    cmd: (f, ctx) =>
      `${UTF8}kimi -p ${LER_ARQUIVO} --output-format stream-json` +
      (ctx.contextoDir ? ` --add-dir $env:${ENV_CTX}` : '') +
      (ctx.raiz ? ` --add-dir $env:${ENV_RAIZ}` : ''),
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
    // Os --add-dir vem de $env: -- ver o bloco SEGURANCA acima.
    cmd: (f, ctx) =>
      `${UTF8}${PATH_AGY}agy -p ${LER_ARQUIVO} --model "Gemini 3.6 Flash (High)" --add-dir $env:${ENV_TMP}` +
      (ctx.raiz ? ` --add-dir $env:${ENV_RAIZ}` : '') +
      (ctx.contextoDir ? ` --add-dir $env:${ENV_CTX}` : '') +
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

  // Caminho com sintaxe de shell nao roda -- nem por env var. Barrar aqui e
  // redundante de proposito: a defesa primaria e nao interpolar (ver SEGURANCA),
  // esta e a segunda linha, para o caso de alguem voltar a montar comando por
  // concatenacao um dia.
  for (const [nome, valor] of [['raiz', ctx.raiz], ['contexto_dir', ctx.contextoDir]]) {
    if (caminhoSuspeito(valor)) {
      return { ok: false, erro: `caminho recusado por conter sintaxe de shell (${nome}): ${String(valor).slice(0, 120)}` }
    }
  }

  const arquivo = join(TMP, `${tag || 'p'}_${id}.txt`)
  writeFileSync(arquivo, prompt, 'utf8')

  // Os caminhos viajam por ambiente; o comando so referencia $env:...
  const env = {
    [ENV_PROMPT]: arquivo,
    [ENV_TMP]: TMP,
    ...(ctx.raiz ? { [ENV_RAIZ]: ctx.raiz } : {}),
    ...(ctx.contextoDir ? { [ENV_CTX]: ctx.contextoDir } : {}),
  }

  let ultimo = null
  for (let n = 1; n <= tentativas; n++) {
    const inicio = Date.now()
    const r = await sh(m.cmd(arquivo, ctx), { env })
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
