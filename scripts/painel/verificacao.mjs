/**
 * Verificação MECÂNICA das fontes citadas pelos autores.
 *
 * O rótulo "Medido:" é auto-declarado — nada impede um modelo de chamar um chute
 * de medição, e o refinamento cruzado então PROPAGA a afirmação sem ninguém
 * reabrir o arquivo. Foi assim que os quatro repetiram, no painel do CONARH, que
 * `actions/lead-comercial.ts` servia para a captura de leads da feira.
 *
 * Aqui o código confere o que dá para conferir sem interpretar: o arquivo
 * citado existe? tem a linha citada? O que não é caminho de arquivo (um comando
 * rodado, um doc externo) fica NEUTRO — acusar o que não se sabe verificar seria
 * ruído, e ruído treina a ignorar o alarme.
 */
import { existsSync, statSync, readFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'

/** `caminho/arquivo.ts:123` ou `caminho/arquivo.ts` — com : opcional. */
const CITACAO = /^([A-Za-z]:[\\/][^\s:]+?|[\w.@-]+(?:[\\/][\w.@ -]+)*\.[A-Za-z0-9]{1,6})(?::(\d+)(?:-(\d+))?)?$/

const STATUS = {
  OK: 'ok',
  SEM_ARQUIVO: 'arquivo-inexistente',
  SEM_LINHA: 'linha-inexistente',
  NEUTRO: 'nao-verificavel',
}

function resolverCaminho(bruto, bases) {
  const p = bruto.replace(/\//g, '\\')
  if (isAbsolute(p)) return existsSync(p) ? p : null
  for (const base of bases.filter(Boolean)) {
    const tentativa = join(base, p)
    if (existsSync(tentativa)) return tentativa
  }
  return null
}

/**
 * @param {Array} propostas rodada (achatada: {letra, nome, evidence})
 * @param {{raiz?:string, contextoDir?:string}} ctx
 * @returns {{itens:Array, resumo:object}}
 */
export function verificarCitacoes(propostas, ctx = {}) {
  const bases = [ctx.raiz, ctx.contextoDir]
  const itens = []

  for (const p of propostas || []) {
    for (const e of p.evidence || []) {
      const fonte = String(e.source || '').trim()
      const medida = e.provenance === 'Medido'

      // Só o que se apresenta COMO medição é cobrado. "Suponho" declarado é
      // honesto por definição.
      if (!medida) continue

      const m = fonte.match(CITACAO)
      if (!fonte || !m) {
        itens.push({ letra: p.letra, claim: e.claim, source: fonte, status: STATUS.NEUTRO })
        continue
      }

      const [, caminhoBruto, linhaStr] = m
      const caminho = resolverCaminho(caminhoBruto, bases)

      if (!caminho) {
        itens.push({ letra: p.letra, claim: e.claim, source: fonte, status: STATUS.SEM_ARQUIVO })
        continue
      }

      if (linhaStr) {
        let linhas = 0
        try {
          if (statSync(caminho).size < 8 * 1024 * 1024) {
            linhas = readFileSync(caminho, 'utf8').split('\n').length
          }
        } catch {
          /* ilegível: trata como neutro abaixo */
        }
        if (linhas === 0) {
          itens.push({ letra: p.letra, claim: e.claim, source: fonte, status: STATUS.NEUTRO })
          continue
        }
        if (Number(linhaStr) > linhas) {
          itens.push({
            letra: p.letra,
            claim: e.claim,
            source: fonte,
            status: STATUS.SEM_LINHA,
            detalhe: `o arquivo tem ${linhas} linhas`,
          })
          continue
        }
      }

      itens.push({ letra: p.letra, claim: e.claim, source: fonte, status: STATUS.OK })
    }
  }

  const conta = (s) => itens.filter((i) => i.status === s).length
  return {
    itens,
    resumo: {
      total: itens.length,
      ok: conta(STATUS.OK),
      arquivo_inexistente: conta(STATUS.SEM_ARQUIVO),
      linha_inexistente: conta(STATUS.SEM_LINHA),
      nao_verificavel: conta(STATUS.NEUTRO),
      quebradas: conta(STATUS.SEM_ARQUIVO) + conta(STATUS.SEM_LINHA),
    },
  }
}

/**
 * Teto de confiança derivado EM CÓDIGO — a confiança de uma proposta não pode
 * ser maior que a da evidência mais fraca que a sustenta.
 *
 * Não corrige o número declarado: expõe a diferença. Um autor que se diz 0,96
 * apoiado só em "Suponho" fica visível — foi o caso do Gemini no painel do
 * CONARH, o mais confiante e o que menos riscos declarou.
 */
export function tetoDeConfianca(proposta, verificacao) {
  const ev = proposta.evidence || []
  const minhas = (verificacao?.itens || []).filter((i) => i.letra === proposta.letra)
  const quebradas = minhas.filter((i) => i.status === STATUS.SEM_ARQUIVO || i.status === STATUS.SEM_LINHA).length

  const medidas = ev.filter((e) => e.provenance === 'Medido').length
  const naoVerificadas = ev.filter((e) => e.provenance === 'Memoria-nao-verificada').length

  let teto = 0.95
  let motivo = 'evidência medida e conferida'

  if (!ev.length) {
    teto = 0.6
    motivo = 'nenhuma evidência apresentada'
  } else if (quebradas > 0) {
    teto = 0.5
    motivo = `${quebradas} citação(ões) que não conferem no disco`
  } else if (naoVerificadas > 0) {
    teto = 0.7
    motivo = 'apoia-se em memória não verificada'
  } else if (!medidas) {
    teto = 0.75
    motivo = 'nenhuma afirmação medida — só inferência'
  }

  const declarada = typeof proposta.confidence === 'number' ? proposta.confidence : null
  return {
    declarada,
    teto,
    efetiva: declarada == null ? teto : Math.min(declarada, teto),
    estourou: declarada != null && declarada > teto,
    motivo,
  }
}

/** Bloco para injetar no prompt: o que a máquina apurou sobre as citações. */
export function textoVerificacao(verificacao, tetos) {
  const { resumo, itens } = verificacao
  if (!resumo.total) return 'VERIFICACAO MECANICA DAS FONTES: nenhuma afirmacao foi rotulada "Medido" com fonte citavel.'

  const quebradas = itens.filter((i) => i.status === STATUS.SEM_ARQUIVO || i.status === STATUS.SEM_LINHA)
  const linhas = [
    `VERIFICACAO MECANICA DAS FONTES (feita em codigo, nao por um modelo):`,
    `  ${resumo.ok} citacao(oes) conferem no disco · ${resumo.quebradas} NAO conferem · ${resumo.nao_verificavel} nao sao caminho de arquivo (neutro).`,
  ]

  if (quebradas.length) {
    linhas.push('  CITACOES QUE NAO EXISTEM -- trate a afirmacao apoiada nelas como NAO medida:')
    for (const q of quebradas.slice(0, 12)) {
      linhas.push(`    [${q.letra}] "${String(q.claim).slice(0, 110)}" -> ${q.source} (${q.status}${q.detalhe ? `, ${q.detalhe}` : ''})`)
    }
  }

  const estourados = (tetos || []).filter((t) => t.estourou)
  if (estourados.length) {
    linhas.push('  CONFIANCA ACIMA DO QUE A EVIDENCIA SUSTENTA:')
    for (const t of estourados) {
      linhas.push(`    [${t.letra}] declarou ${t.declarada}, teto ${t.teto} -- ${t.motivo}`)
    }
  }

  return linhas.join('\n')
}
