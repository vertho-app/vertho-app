/**
 * Orquestra um painel completo: R1 (cada um sozinho) -> R2 (cada um le as
 * outras, anonimas, e fecha) -> sintese do Claude comparando R1 x R2.
 *
 * Regras de desenho, todas herdadas de erros medidos em 27/07:
 *  - Autores ANONIMOS entre si (A/B/C/D). Saber que a proposta rival e "do
 *    GPT-5" faz a marca pesar junto com o argumento.
 *  - So a R1 investiga. Reler a documentacao a cada rodada foi o que levou o
 *    formato a mais de uma hora.
 *  - Recusa OBRIGATORIA na R2: convergencia sem nenhuma recusa declarada e
 *    conformidade, nao acordo. O alerta e derivado em codigo, nao pela
 *    auto-avaliacao de um modelo.
 *  - Motor que cai NAO vira Claude disfarcado: o assento some e fica
 *    registrado em `perdidos`.
 */
import { readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'
import { chamarMotor, MOTORES } from './engine.mjs'
import { verificarCitacoes, tetoDeConfianca, textoVerificacao } from './verificacao.mjs'

const FORMATOS_DUVIDOSOS = ['.pdf', '.docx', '.xlsx', '.pptx', '.png', '.jpg', '.jpeg', '.webp']

const REGRA_PROCEDENCIA = `
REGRA DE PROCEDENCIA (obrigatoria)
Rotule cada afirmacao factual como:
  Medido:   li o arquivo/rodei o comando -- cite file:line ou a saida
  Suponho:  inferencia razoavel, nao verificada
  Memoria-nao-verificada: veio do enunciado, sem checagem
Chute rotulado como medicao e falta grave.`.trim()

const SEM_INVESTIGAR = `
NAO INVESTIGUE NESTA RODADA. Nao abra arquivos, nao rode buscas, nao releia a documentacao -- tudo o que voce precisa esta neste prompt. O seu trabalho agora e pensar sobre o que ja esta na mesa.
UNICA excecao: se uma proposta alheia se apoia num fato rotulado "Medido" que muda a sua posicao e voce desconfia dele, pode abrir UM arquivo para conferir esse fato. Um.`.trim()

const CONTRATO_R1 = `
FORMATO DA RESPOSTA -- OBRIGATORIO
Sua ultima mensagem deve ser UM UNICO objeto JSON puro, sem cercas de codigo, sem texto antes ou depois:
{
  "proposta": "<a proposta completa, densa e acionavel, em portugues do Brasil; pode usar markdown DENTRO da string>",
  "resumo": "<a proposta em uma frase>",
  "premissas": ["<o que voce assumiu como verdadeiro>"],
  "evidence": [ { "claim": "<afirmacao>", "provenance": "Medido" | "Suponho" | "Memoria-nao-verificada", "source": "<file:line ou comando>" } ],
  "riscos": ["<riscos da SUA proposta>"],
  "confidence": <0 a 1>
}
JSON invalido invalida a sua participacao.`.trim()

const CONTRATO_R2 = `
FORMATO DA RESPOSTA -- OBRIGATORIO
Sua ultima mensagem deve ser UM UNICO objeto JSON puro, sem cercas de codigo, sem texto antes ou depois:
{
  "proposta_final": "<a sua melhor proposta possivel, completa e autossuficiente; markdown DENTRO da string>",
  "resumo": "<uma frase>",
  "o_que_mudou_desde_r1": "<o que a sua proposta ganhou E o que perdeu>",
  "premissa_comum": {
    "premissa": "<a suposicao que TODAS as propostas assumiram sem discutir>",
    "tentativa_de_refutacao": "<o melhor argumento que voce consegue construir CONTRA ela>",
    "sobreviveu": true | false,
    "se_cair": "<o que muda na resposta se essa premissa for falsa>"
  },
  "recusou": [ { "ideia": "<o que dos outros voce deixou de fora DE PROPOSITO>", "de": "<letra do autor>", "porque": "<o argumento>" } ],
  "ainda_em_disputa": ["<pontos em que os autores NAO convergiram de verdade>"],
  "riscos": ["<riscos da proposta final>"],
  "confidence": <0 a 1>
}
JSON invalido invalida a sua participacao.`.trim()

const CONTRATO_SINTESE = `
FORMATO DA RESPOSTA -- OBRIGATORIO
Sua ultima mensagem deve ser UM UNICO objeto JSON puro, sem cercas de codigo:
{
  "resposta_final": "<a resposta definitiva ao solicitante, completa e acionavel; markdown DENTRO da string. ESTE E O PRODUTO>",
  "resumo": "<a resposta em uma frase>",
  "racional": "<o que veio de cada proposta e o que foi descartado>",
  "creditos": [ { "letra": "<A-D>", "contribuicao": "<o que veio dai>" } ],
  "ideias_orfas_resgatadas": [ { "ideia": "<boa ideia da R1 que sumiu na R2>", "de": "<letra>", "por_que_resgatar": "<por que merecia sobreviver>" } ],
  "divergencias_reais": [ { "ponto": "<onde nao convergiram>", "posicoes": "<quem defende o que>" } ],
  "avaliacao_da_convergencia": "<a convergencia foi por forca do argumento ou por conformidade? justifique com o que voce viu comparando R1 e R2>",
  "riscos": ["<riscos da resposta final>"],
  "next_steps": ["<passos concretos e verificaveis>"],
  "unverified_claims": ["<o que pesou na resposta e ninguem checou>"],
  "confidence": <0 a 1>
}`.trim()

/** Inventario da pasta de contexto -- feito com fs, sem gastar uma chamada de IA. */
export function inventariar(dir) {
  if (!dir) return { arquivos: [], duvidosos: [] }
  let nomes = []
  try {
    nomes = readdirSync(dir)
  } catch {
    return { arquivos: [], duvidosos: [], erro: `pasta nao encontrada: ${dir}` }
  }
  const arquivos = []
  for (const n of nomes) {
    if (n.toLowerCase() === 'readme.md') continue
    const caminho = join(dir, n)
    let st
    try { st = statSync(caminho) } catch { continue }
    if (!st.isFile()) continue
    arquivos.push({
      caminho,
      nome: n,
      kb: Math.round(st.size / 1024),
      duvidoso: FORMATOS_DUVIDOSOS.includes(extname(n).toLowerCase()),
    })
  }
  arquivos.sort((a, b) => b.kb - a.kb)
  return { arquivos, duvidosos: arquivos.filter((a) => a.duvidoso) }
}

function blocoContexto(inv) {
  if (!inv.arquivos.length) return '(Nenhum arquivo de apoio foi fornecido para esta consulta.)'
  const lista = inv.arquivos.map((a) => `  - ${a.caminho}  (${a.kb} KB)`).join('\n')
  const aviso = inv.duvidosos.length
    ? `\nATENCAO: ${inv.duvidosos.map((a) => a.nome).join(', ')} pode nao ser legivel pela sua ferramenta. Se nao conseguir ler, DIGA isso na sua proposta em vez de adivinhar o conteudo.`
    : ''
  return `ARQUIVOS DE APOIO -- leia os que forem relevantes antes de propor:\n${lista}${aviso}`
}

function base({ raiz, contextoDir, inv, brief }) {
  return `
CONTEXTO DO AMBIENTE
- Diretorio de trabalho: ${raiz || '(nenhum)'}
- Arquivos de apoio: ${contextoDir || '(nenhum)'}
${brief ? `\nSOBRE ESTE PROJETO\n${brief}\n` : ''}
- Use as suas ferramentas para VERIFICAR o que afirmar. Nao invente caminhos.
- Voce tem permissao de LEITURA apenas. Nao crie, altere nem apague nada.

${REGRA_PROCEDENCIA}

${blocoContexto(inv)}`.trim()
}

// Propostas circulam ACHATADAS ({letra, nome, ...campos do modelo}) — o mesmo
// formato que vai para o banco. Assim a sintese pode ser refeita depois a
// partir do resultado salvo, sem repetir as duas rodadas.
const fmtR1 = (p) => `--- PROPOSTA ${p.letra} (confianca ${p.confidence})
${p.proposta}
PREMISSAS: ${(p.premissas || []).join(' | ') || '-'}
RISCOS QUE O PROPRIO AUTOR ADMITE: ${(p.riscos || []).join(' | ') || '-'}
EVIDENCIAS: ${(p.evidence || []).map((e) => `(${e.provenance}) ${e.claim}${e.source ? ` [${e.source}]` : ''}`).join(' | ') || '-'}`

const fmtR2 = (p) => `--- PROPOSTA ${p.letra} FINAL (confianca ${p.confidence})
${p.proposta_final}
MUDOU DESDE A R1: ${p.o_que_mudou_desde_r1 || '-'}
PREMISSA COMUM QUE ELE ATACOU: ${
  p.premissa_comum
    ? `"${p.premissa_comum.premissa}" -> ${p.premissa_comum.tentativa_de_refutacao} (sobreviveu: ${p.premissa_comum.sobreviveu ? 'sim' : 'NAO'}${p.premissa_comum.se_cair ? `; se cair: ${p.premissa_comum.se_cair}` : ''})`
    : '(nao declarou)'
}
RECUSOU DOS OUTROS: ${(p.recusou || []).map((r) => `${r.ideia} (de ${r.de}) -- ${r.porque}`).join(' | ') || '(nada -- possivel conformidade)'}
AINDA EM DISPUTA: ${(p.ainda_em_disputa || []).join(' | ') || '-'}`

/** Convergencia derivada EM CODIGO — nunca pela auto-avaliacao de um modelo. */
export function medirConvergencia(r2) {
  const recusas = r2.reduce((n, p) => n + (p.recusou || []).length, 0)
  const disputa = r2.reduce((n, p) => n + (p.ainda_em_disputa || []).length, 0)
  const semRecusa = r2.filter((p) => !(p.recusou || []).length).map((p) => p.letra)
  return {
    recusas_declaradas: recusas,
    pontos_em_disputa: disputa,
    autores_sem_recusa: semRecusa,
    alerta_conformidade: recusas === 0 && disputa === 0,
  }
}

/**
 * Sintese: compara R1 com R2 e produz a resposta final.
 * Exportada para poder ser REFEITA a partir de um resultado salvo — perder as
 * duas rodadas porque a ultima chamada caiu sai caro demais.
 */
export async function sintetizar({ pergunta, contexto, contexto_dir, raiz, brief, r1, r2, tentativas = 3 }) {
  const inv = inventariar(contexto_dir)
  const BASE = base({ raiz, contextoDir: contexto_dir, inv, brief })
  const PERGUNTA = `PERGUNTA:\n${pergunta}${contexto ? `\n\nCONTEXTO FORNECIDO PELO SOLICITANTE:\n${contexto}` : ''}`
  const conv = medirConvergencia(r2)

  // Reverifica na sintese: as citacoes da R1 e as que apareceram na R2. O juiz
  // recebe o apurado em codigo, nao a palavra dos autores sobre as proprias
  // fontes.
  const verif = verificarCitacoes([...r1, ...r2], { raiz, contextoDir: contexto_dir })
  const tetos = r2.map((p) => ({ letra: p.letra, ...tetoDeConfianca(p, verif) }))
  const premissas = r2
    .filter((p) => p.premissa_comum && p.premissa_comum.premissa)
    .map((p) => `  [${p.letra}] "${p.premissa_comum.premissa}" -- sobreviveu ao ataque: ${p.premissa_comum.sobreviveu ? 'sim' : 'NAO'}`)
    .join('\n')

  const prompt = `${BASE}

Voce faz a SINTESE deste painel. Os autores responderam a mesma pergunta de forma independente e depois leram uns aos outros e fecharam. Voce NAO sabe qual modelo escreveu qual proposta -- de proposito. Julgue pelo conteudo.

${PERGUNTA}

=========== RODADA 1 (propostas independentes, antes de qualquer contato) ===========
${r1.map(fmtR1).join('\n\n')}

=========== RODADA 2 (propostas finais, depois de lerem umas as outras) ===========
${r2.map(fmtR2).join('\n\n')}

MEDIDO EM CODIGO SOBRE A RODADA 2: ${conv.recusas_declaradas} recusas declaradas no total, ${conv.pontos_em_disputa} pontos apontados como ainda em disputa.${
    conv.autores_sem_recusa.length ? ` Nao declararam nenhuma recusa: ${conv.autores_sem_recusa.join(', ')}.` : ''
  }${conv.alerta_conformidade ? ' ALERTA: ninguem recusou nada e ninguem viu disputa -- trate a convergencia como suspeita ate provar o contrario.' : ''}

${textoVerificacao(verif, tetos)}

${premissas ? `PREMISSAS COMUNS QUE OS AUTORES TENTARAM DERRUBAR:\n${premissas}` : ''}

Sua tarefa:
1. ENTREGUE A RESPOSTA FINAL ao solicitante. Completa e acionavel -- este e o produto. Nao e um resumo do que o painel disse; e a melhor resposta possivel construida a partir do que ele produziu.
2. Voce recebeu R1 e R2 lado a lado por um motivo: encontre as BOAS IDEIAS QUE MORRERAM no caminho. Proposta forte da R1 que sumiu na R2 provavelmente foi abandonada por pressao de grupo, nao por refutacao.
3. VERIFIQUE voce mesmo os 2-3 fatos que mais pesam na resposta. Refinamento cruzado propaga afirmacao rotulada como "Medido" sem reabrir -- ja aconteceu neste formato. A verificacao mecanica acima diz quais fontes EXISTEM; ela nao diz se o arquivo sustenta a afirmacao. Essa parte e sua. Nao escreva nada; apenas leia.
4. Uma afirmacao apoiada em citacao inexistente NAO entra na resposta como fato. Se a ideia for boa, sustente-a com outra coisa ou rebaixe para hipotese -- e registre isso em unverified_claims.
5. PRESERVE as divergencias reais. Consenso forcado e o modo de falha deste formato.
6. A concordancia entre os autores mede origem parecida (mesmos corpora, mesmo enunciado), nao verdade. Se houver premissa comum que ninguem derrubou, diga que a resposta inteira depende dela.
7. Sua confidence nao pode ser maior que a do fato mais fraco que sustenta a decisao.
8. unverified_claims: o que pesou na resposta e ninguem checou. Seja desconfortavelmente honesto.

${CONTRATO_SINTESE}`

  const s = await chamarMotor('claude', prompt, { raiz, contextoDir: contexto_dir }, 'sintese', tentativas)
  return { sintese: s, convergencia: conv, verificacao: verif, tetos }
}

/**
 * @param {object} pedido {pergunta, contexto, contexto_dir, raiz, brief, motores}
 * @param {(evento:object)=>void} onProgress
 */
export async function rodarPainel(pedido, onProgress = () => {}) {
  const t0 = Date.now()
  const ids = (pedido.motores && pedido.motores.length ? pedido.motores : Object.keys(MOTORES)).filter(
    (m) => MOTORES[m],
  )
  const inv = inventariar(pedido.contexto_dir)
  const ctx = { raiz: pedido.raiz, contextoDir: pedido.contexto_dir }
  const BASE = base({ raiz: pedido.raiz, contextoDir: pedido.contexto_dir, inv, brief: pedido.brief })
  const PERGUNTA = `PERGUNTA:\n${pedido.pergunta}${
    pedido.contexto ? `\n\nCONTEXTO FORNECIDO PELO SOLICITANTE:\n${pedido.contexto}` : ''
  }`

  onProgress({ fase: 'rodada1', total: ids.length, arquivos: inv.arquivos.length })

  // ---------------------------------------------------------------- rodada 1
  const promptR1 = (m) => `${BASE}
${m.dica ? `\n${m.dica}\n` : ''}
Voce e o autor da PROPOSTA ${m.letra} em um painel de autores independentes.
Os outros autores sao anonimos e voce tambem e -- julgue e seja julgado pelo conteudo, nunca por quem escreveu.

${PERGUNTA}

RODADA 1 de 2. Voce trabalha SOZINHO -- nao vera as outras propostas agora.
- Esta e a UNICA rodada em que voce investiga. Leia agora o que precisar; na proxima rodada voce so argumenta sobre o que estiver na mesa.
- Leia com CRITERIO, nao exaustivamente: escolha os poucos documentos que respondem a pergunta. As rodadas sao sincronizadas e todos esperam o mais lento.
- Proponha a melhor resposta que voce consegue, completa e acionavel. Nao entregue esboco.
- Declare as premissas que assumiu e os riscos da SUA propria proposta.
- Confidence honesta: 0.9 exige evidencia medida.

${CONTRATO_R1}`

  const r1bruto = await Promise.all(
    ids.map(async (id) => {
      const m = MOTORES[id]
      const r = await chamarMotor(id, promptR1(m), ctx, 'r1', 2)
      onProgress({ fase: 'rodada1', motor: id, letra: m.letra, ok: r.ok, segundos: r.segundos, erro: r.erro })
      // achatado: o mesmo formato que vai para o banco e que a sintese consome
      return { id, letra: m.letra, nome: m.nome, via: m.via, ok: r.ok, erro: r.erro, segundos: r.segundos, custo_usd: r.custo_usd, ...(r.dados || {}) }
    }),
  )

  const r1 = r1bruto.filter((p) => p.ok)
  if (r1.length < 2) {
    return { erro: 'Menos de duas propostas sobreviveram a rodada 1.', r1: r1bruto, segundos: Math.round((Date.now() - t0) / 1000) }
  }

  // ------------------------------------------- verificacao mecanica das fontes
  // Feita ANTES da rodada 2 de proposito: assim o autor ve, antes de incorporar
  // ideia alheia, quais "Medido" dos outros nao conferem no disco. E o unico
  // ponto do fluxo em que da para cortar a propagacao de chute vestido de
  // medicao -- que foi o que os quatro fizeram com lead-comercial.ts.
  const verifR1 = verificarCitacoes(r1, ctx)
  const tetosR1 = r1.map((p) => ({ letra: p.letra, ...tetoDeConfianca(p, verifR1) }))
  const BLOCO_VERIF = textoVerificacao(verifR1, tetosR1)

  if (verifR1.resumo.quebradas) {
    log(`Verificacao das fontes: ${verifR1.resumo.quebradas} citacao(oes) NAO conferem no disco`)
  }

  // ---------------------------------------------------------------- rodada 2
  onProgress({ fase: 'rodada2', total: r1.length, citacoes_quebradas: verifR1.resumo.quebradas })

  const r2bruto = await Promise.all(
    r1.map(async (meu) => {
      const m = MOTORES[meu.id]
      const outras = r1.filter((p) => p.letra !== meu.letra).map(fmtR1).join('\n\n')
      const prompt = `${BASE}

Voce e o autor da PROPOSTA ${meu.letra}. Os outros autores sao anonimos.

${PERGUNTA}

A SUA PROPOSTA DA RODADA 1:
${fmtR1(meu)}

AS PROPOSTAS DOS OUTROS (autores anonimos):
${outras}

${BLOCO_VERIF}

RODADA 2 de 2 -- a ultima. Entregue a melhor proposta que voce e capaz de escrever.
- Adote o que for melhor que o seu e diga de quem veio. Copiar boa ideia alheia e o objetivo, nao derrota.
- Onde a sua e superior, MANTENHA e registre em "recusou" por que a alternativa nao entra.
- OBRIGATORIO tentar preencher "recusou". Se todas as propostas convergiram, alguem cedeu sem bom motivo e o solicitante precisa saber. Lista vazia sera lida como conformidade, nao como acordo.
- Liste em "ainda_em_disputa" onde a convergencia foi aparente, nao real.
- NAO adote afirmacao alheia cuja fonte a verificacao acima marcou como inexistente. Se a ideia for boa mesmo assim, adote SEM a justificativa falsa e diga que a base nao se sustenta.
- PREMISSA COMUM (obrigatorio): quatro propostas parecidas costumam compartilhar uma suposicao que ninguem discutiu -- e ela e o ponto cego coletivo. Identifique essa suposicao, construa o MELHOR argumento contra ela e diga honestamente se ela sobrevive. Concordancia entre modelos mede origem parecida, nao verdade.

${SEM_INVESTIGAR}

${CONTRATO_R2}`

      const r = await chamarMotor(meu.id, prompt, ctx, 'r2', 2)
      onProgress({ fase: 'rodada2', motor: meu.id, letra: meu.letra, ok: r.ok, segundos: r.segundos, erro: r.erro })
      return { id: meu.id, letra: meu.letra, nome: meu.nome, via: meu.via, ok: r.ok, erro: r.erro, segundos: r.segundos, custo_usd: r.custo_usd, ...(r.dados || {}) }
    }),
  )

  const r2 = r2bruto.filter((p) => p.ok)
  if (!r2.length) {
    return { erro: 'Nenhuma proposta sobreviveu a rodada 2.', r1, r2: r2bruto, segundos: Math.round((Date.now() - t0) / 1000) }
  }

  // ---------------------------------------------------------------- sintese
  onProgress({ fase: 'sintese' })

  const { sintese: s, convergencia, verificacao, tetos } = await sintetizar({
    pergunta: pedido.pergunta,
    contexto: pedido.contexto,
    contexto_dir: pedido.contexto_dir,
    raiz: pedido.raiz,
    brief: pedido.brief,
    r1,
    r2,
  })
  onProgress({ fase: 'sintese', ok: s.ok, segundos: s.segundos, erro: s.erro, tentativa: s.tentativa })

  const segundos = Math.round((Date.now() - t0) / 1000)

  return {
    pergunta: pedido.pergunta,
    contexto: pedido.contexto || null,
    contexto_dir: pedido.contexto_dir || null,
    arquivos_de_apoio: inv.arquivos,
    autores: ids.map((id) => ({ letra: MOTORES[id].letra, nome: MOTORES[id].nome, via: MOTORES[id].via, motor: id })),
    presenca: {
      r1: r1.map((p) => p.letra),
      r2: r2.map((p) => p.letra),
      perdidos: r1bruto
        .filter((p) => !p.ok || !r2.some((q) => q.letra === p.letra))
        .map((p) => ({ letra: p.letra, nome: p.nome, erro: p.erro || 'caiu na rodada 2' })),
    },
    rodada1: r1,
    rodada2: r2,
    convergencia,
    // apurado em código: quais fontes citadas existem e onde a confiança
    // declarada passa do que a evidência sustenta
    verificacao: {
      resumo: verificacao.resumo,
      quebradas: verificacao.itens.filter(
        (i) => i.status === 'arquivo-inexistente' || i.status === 'linha-inexistente'
      ),
      tetos,
    },
    premissas_comuns: r2
      .filter((p) => p.premissa_comum && p.premissa_comum.premissa)
      .map((p) => ({ letra: p.letra, ...p.premissa_comum })),
    sintese: s.ok ? s.dados : null,
    sintese_erro: s.ok ? null : s.erro,
    metricas: {
      segundos,
      custo_claude_usd: [...r1, ...r2, s].reduce((n, p) => n + (p && p.custo_usd ? p.custo_usd : 0), 0),
      por_motor: r1bruto.map((p) => ({ letra: p.letra, nome: p.nome, r1_s: p.segundos ?? null })),
    },
  }
}
