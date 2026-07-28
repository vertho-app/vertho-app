/**
 * Worker do /board — roda NA MÁQUINA do Rodrigo, não na Vercel.
 *
 *   cd nextjs-app
 *   node --env-file=.env.local scripts/painel/worker.mjs
 *
 * Fica em polling na tabela board_paineis, pega o pedido pendente mais antigo,
 * executa os quatro CLIs (que estão autenticados por assinatura AQUI) e grava o
 * resultado. A web enfileira; esta máquina executa.
 *
 * Enquanto este processo não estiver rodando, todo pedido fica 'pendente' — a
 * tela mostra isso explicitamente em vez de fingir que o painel está lento.
 */
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { rodarPainel } from './painel.mjs'
import { versoesDosCLIs } from './engine.mjs'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) {
  console.error('faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — rode com --env-file=.env.local')
  process.exit(2)
}

const sb = createClient(URL, KEY, { auth: { persistSession: false } })
const RAIZ = process.env.BOARD_RAIZ || process.cwd()

/**
 * Polling com recuo progressivo.
 *
 * Este worker fica ligado o dia inteiro (tarefa agendada no logon), e a fila
 * quase sempre está vazia: 5s fixos seriam ~17 mil consultas por dia para nada.
 * Depois de um pedido, volta ao mínimo — quem acabou de pedir um painel
 * provavelmente vai pedir outro.
 */
const INTERVALO_MIN = Number(process.env.BOARD_POLL_MS || 5000)
// 30s de teto: a tela acusa "worker desligado" aos 2 min, então o recuo precisa
// ficar bem abaixo disso — senão um worker vivo pareceria morto.
const INTERVALO_MAX = Number(process.env.BOARD_POLL_MAX_MS || 30000)
let intervalo = INTERVALO_MIN

const agora = () => new Date().toISOString()
const log = (...a) => console.log(new Date().toLocaleTimeString('pt-BR'), ...a)

let encerrando = false
process.on('SIGINT', () => {
  console.log('\nencerrando depois do painel atual...')
  encerrando = true
})

async function pegarPedido() {
  const { data, error } = await sb
    .from('board_paineis')
    .select('*')
    .eq('status', 'pendente')
    .order('criado_em', { ascending: true })
    .limit(1)
  if (error) throw error
  if (!data || !data.length) return null

  const p = data[0]
  // Trava otimista: só assume o pedido se ele ainda estiver pendente. Evita que
  // duas instâncias do worker rodem o mesmo painel (e gastem cota em dobro).
  const { data: travado, error: e2 } = await sb
    .from('board_paineis')
    .update({ status: 'rodando', iniciado_em: agora(), progresso: [] })
    .eq('id', p.id)
    .eq('status', 'pendente')
    .select()
  if (e2) throw e2
  return travado && travado.length ? travado[0] : null
}

/**
 * Traz os arquivos enviados pela tela para o disco local.
 *
 * Quem lê o contexto são os quatro CLIs, que rodam AQUI — o arquivo no Storage
 * não serve para eles. O nome é re-sanitizado na gravação: a chave veio do
 * banco, e nome de arquivo com `..` ou barra escaparia da pasta.
 */
async function baixarArquivos(p) {
  const lista = Array.isArray(p.arquivos) ? p.arquivos : []
  if (!lista.length) return { dir: null, baixados: 0 }

  const dir = join(tmpdir(), 'board-contexto', p.id)
  mkdirSync(dir, { recursive: true })

  let baixados = 0
  for (const a of lista) {
    const { data, error } = await sb.storage.from('board-contexto').download(a.path)
    if (error) {
      log(`  arquivo "${a.nome}" não baixou: ${error.message}`)
      continue
    }
    const nome = String(a.nome).replace(/^.*[\\/]/, '').replace(/[^A-Za-z0-9._-]/g, '_') || 'arquivo.txt'
    writeFileSync(join(dir, nome), Buffer.from(await data.arrayBuffer()))
    baixados++
  }

  log(`  ${baixados}/${lista.length} arquivo(s) de contexto em ${dir}`)
  return { dir, baixados }
}

async function executar(p) {
  log(`painel ${p.id.slice(0, 8)} — "${String(p.titulo || p.pergunta).slice(0, 60)}"`)

  const eventos = []
  let ultimaGravacao = 0
  const onProgress = async (e) => {
    eventos.push({ ...e, em: agora() })
    if (e.motor) log(`  ${e.fase} ${e.letra} ${e.ok ? `ok (${e.segundos}s)` : `FALHOU: ${String(e.erro).slice(0, 90)}`}`)
    else log(`  ${e.fase}`)
    // grava no máximo a cada 2s para a tela andar sem martelar o banco
    const t = Date.now()
    if (t - ultimaGravacao > 2000) {
      ultimaGravacao = t
      await sb.from('board_paineis').update({ progresso: eventos }).eq('id', p.id)
    }
  }

  let baixados = null
  try {
    // Arquivos enviados pela tela têm precedência sobre a pasta local: se o
    // pedido trouxe anexos, é sobre eles que a pergunta é.
    baixados = await baixarArquivos(p)
    const contextoDir = baixados.dir || p.contexto_dir

    const r = await rodarPainel(
      {
        pergunta: p.pergunta,
        contexto: p.contexto,
        contexto_dir: contextoDir,
        raiz: RAIZ,
        motores: p.motores,
      },
      onProgress,
    )

    if (r.erro) {
      await sb
        .from('board_paineis')
        .update({ status: 'erro', erro: r.erro, progresso: eventos, resultado: r, concluido_em: agora(), segundos: r.segundos ?? null })
        .eq('id', p.id)
      log(`  ERRO: ${r.erro}`)
      return
    }

    await sb
      .from('board_paineis')
      .update({
        status: 'concluido',
        concluido_em: agora(),
        progresso: eventos,
        resultado: r,
        resumo: r.sintese ? r.sintese.resumo : null,
        segundos: r.metricas.segundos,
        custo_usd: Number(r.metricas.custo_claude_usd.toFixed(4)),
        erro: r.sintese ? null : `sintese falhou: ${r.sintese_erro}`,
      })
      .eq('id', p.id)

    log(
      `  concluido em ${r.metricas.segundos}s — presenca R1 ${r.presenca.r1.join('')} / R2 ${r.presenca.r2.join('')}` +
        `${r.presenca.perdidos.length ? ` — PERDIDOS ${r.presenca.perdidos.map((x) => x.letra).join('')}` : ''}` +
        `${r.convergencia.alerta_conformidade ? ' — ALERTA DE CONFORMIDADE' : ''}`,
    )
  } catch (e) {
    await sb
      .from('board_paineis')
      .update({ status: 'erro', erro: String(e && e.message ? e.message : e), progresso: eventos, concluido_em: agora() })
      .eq('id', p.id)
    log(`  EXCECAO: ${e}`)
  } finally {
    // a cópia local é descartável — o original fica no Storage
    if (baixados && baixados.dir) {
      try {
        rmSync(baixados.dir, { recursive: true, force: true })
      } catch {
        /* pasta temporaria: falhar aqui nao muda o resultado do painel */
      }
    }
  }
}

log(`worker do /board no ar — polling de ${INTERVALO_MIN / 1000}s a ${INTERVALO_MAX / 1000}s`)
log(`raiz: ${RAIZ}`)

// Anunciar as versões: o worker roda sob a tarefa agendada, com PATH diferente
// do terminal, e um CLI velho falha de um jeito que PARECE erro do modelo.
// Em 28/07 a tarefa resolvia codex 0.130 (que não conhece gpt-5.6-sol) enquanto
// o terminal resolvia 0.145 — dois painéis perderam o autor B por causa disso.
for (const [nome, versao] of Object.entries(versoesDosCLIs())) {
  log(`  ${nome}: ${versao}`)
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

while (!encerrando) {
  try {
    const p = await pegarPedido()
    if (p) {
      await executar(p)
      intervalo = INTERVALO_MIN // ficou ativo: volta a responder rápido
    } else {
      await dormir(intervalo)
      intervalo = Math.min(Math.round(intervalo * 1.5), INTERVALO_MAX)
    }
  } catch (e) {
    // Rede caindo ou banco fora: recua igual, senão vira tempestade de retry
    log(`erro no loop: ${e && e.message ? e.message : e}`)
    await dormir(intervalo)
    intervalo = Math.min(Math.round(intervalo * 1.5), INTERVALO_MAX)
  }
}

log('worker encerrado')
