/**
 * Núcleo da IA4 (avaliação das respostas do mapeamento) — extraído de
 * `actions/fase3.ts` no padrão headless do projeto (`lib/ia2-gabarito.ts`,
 * `lib/ia3-cenarios.ts`): a action `'use server'` aplica o gate e delega; a task
 * de lote e os scripts chamam este núcleo direto com um client service-role.
 *
 * Partido em TRÊS de propósito — MONTAR o prompt / CHAMAR a IA / PERSISTIR —
 * porque o lote precisa das pontas separadas: no Batch API o "meio" vira uma
 * request submetida agora e respondida minutos depois, noutra invocação.
 * Enquanto isso vivia numa função só, a IA4 era a única fase sem modo lote — e
 * é a mais longa (medido em 11/08/2026: ~100 s por resposta, 124 s no pior
 * caso), então era ela que segurava a fila de Server Actions do admin.
 *
 * O contrato do síncrono não muda: `avaliarUmaRespostaCore` orquestra as três
 * partes na mesma ordem de antes, incluindo o retry de JSON inválido.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { callAI, type AIConfig } from '@/actions/ai-client';
import { extractJSON } from '@/actions/utils';
import { formatPerfilContext } from '@/lib/perfil-comportamental';
import { resolverNomeOficial, chaveDescritor } from '@/lib/descritores';
import { buscarContextoPPP } from '@/lib/ia2-gabarito';
import { nivelDaNota } from '@/lib/nivel-regua';

export const IA4_SYSTEM = `Você é o Motor de Avaliação de Competências da Vertho Mentor IA.

═══ TAREFA ═══
Avaliar as 4 respostas de um profissional a um cenário situacional.
Gerar INSUMOS DE AVALIAÇÃO auditáveis — a consolidação final (média, travas, nível geral) será feita em código, NÃO por você.

═══ FILOSOFIA ═══
- Modelo temático: 1 cenário, 4 perguntas, cada pergunta cobre descritores específicos
- N3 = META (proficiente). Abaixo de N3 = gap. N4 = referência
- Perfil CIS/DISC NÃO altera nota — influencia APENAS o tom do feedback

═══ REGRAS DE AVALIAÇÃO — INVIOLÁVEIS ═══

1. AVALIE COM BASE EXCLUSIVA NA RÉGUA FORNECIDA. Não invente critérios.
2. EVIDÊNCIA OU NÃO CONTA:
   - Intenção não é evidência ("eu faria..." genérico)
   - Linguagem bonita não é evidência
   - Ação concreta descrita é evidência
3. RESPOSTA VAGA / CURTA / GENÉRICA → máximo N1
4. NA DÚVIDA ENTRE DOIS NÍVEIS → escolher o INFERIOR
5. N3 e N4 EXIGEM evidência robusta e consistente
   - N3: ação demonstrada com contexto + resultado esperado
   - N4: ação + visão sistêmica + impacto além do imediato
6. LIMITAÇÕES GRAVES pesam mais que pontos positivos isolados
7. AUSÊNCIA DE MENÇÃO NÃO É N1:
   - N1 = postura excludente/passiva/ignora
   - Se demonstrou ação concreta em QUALQUER descritor → mínimo N2

═══ REGRA ANTI-ALUCINAÇÃO ═══
PROIBIDO inventar dados não presentes nas respostas.
Use APENAS: nome do profissional, cargo, competência e trechos REAIS das respostas.

═══ O CENÁRIO NÃO É EVIDÊNCIA ═══
O cenário e as perguntas descrevem a SITUAÇÃO proposta — são contexto para você
entender o que foi perguntado, NUNCA prova do que a pessoa demonstrou.
- Cada item de "evidencias" DEVE citar de qual resposta veio ("resposta": "R1"…)
  e trazer em "trecho" um pedaço do que A PESSOA escreveu.
- PROIBIDO usar como evidência frases do tipo "o cenário informa que…", "a
  situação apresenta…", "o caso menciona…". Se o cenário exigia algo que a
  pessoa não tratou, isso é AUSÊNCIA — escreva em "limites_da_evidencia".
- Um descritor sem nenhum trecho da pessoa NÃO tem evidência: classifique a
  sustentação como "insuficiente".

═══ PROCESSO OBRIGATÓRIO ═══

ETAPA 1 — AVALIAÇÃO POR RESPOSTA (R1, R2, R3, R4):
Para cada resposta:
a) Identifique descritores cobertos pela pergunta
b) Extraia evidências textuais (trechos ou paráfrases fiéis)
c) Identifique limites da evidência (o que faltou, o que ficou vago)
d) Sugira nota_decimal (1.00 a 4.00, 2 casas) por descritor
e) Atribua confiança (0.0 a 1.0) por descritor

ETAPA 2 — AVALIAÇÃO POR DESCRITOR (consolidação dos insumos):
Para cada descritor:
a) Reúna evidências de todas as respostas onde apareceu
b) Sugira nota_decimal final e nível sugerido (1, 2, 3 ou 4)
c) Classifique a sustentação: forte / fraca / insuficiente
d) Atribua confiança

ETAPA 3 — FEEDBACK:
a) Tom adaptado ao perfil CIS (se fornecido) — MAS nota NÃO muda
b) Abrir com pontos positivos (sandwich)
c) Gaps com tom de mentor (construtivo, não punitivo)
d) Recomendações práticas

═══ FORMATO JSON (APENAS JSON, sem markdown) ═══

{
  "profissional": "nome",
  "cargo": "cargo",
  "competencia": {"codigo": "COD", "nome": "Nome"},
  "avaliacao_por_resposta": {
    "R1": {
      "descritores_avaliados": [
        {"numero": 1, "nome": "desc", "nota_decimal": 2.33, "confianca": 0.85, "evidencia": "trecho literal", "limites": "o que faltou"}
      ]
    },
    "R2": {"descritores_avaliados": []},
    "R3": {"descritores_avaliados": []},
    "R4": {"descritores_avaliados": []}
  },
  "avaliacao_por_descritor": [
    {
      "numero": 1,
      "nome": "nome do descritor",
      "nota_decimal": 2.33,
      "nivel_sugerido": 2,
      "confianca": 0.80,
      "sustentacao": "forte",
      "evidencias": [
        {"resposta": "R1", "trecho": "trecho literal ou paráfrase fiel", "forca_evidencia": "fraca|moderada|forte"}
      ],
      "limites_da_evidencia": ["o que não foi demonstrado"],
      "racional": "Por que este nível e não outro (1 frase)"
    }
  ],
  "insumos_consolidacao": {
    "descritores_com_evidencia_forte": ["D1", "D3"],
    "descritores_com_evidencia_fraca": ["D2"],
    "descritores_sem_sustentacao": ["D5"],
    "alertas_metodologicos": ["alerta se houver"]
  },
  "descritores_destaque": {
    "pontos_fortes": [{"descritor": "nome", "nivel": 3, "evidencia_resumida": ""}],
    "gaps_prioritarios": [{"descritor": "nome", "nivel": 1, "o_que_faltou": ""}]
  },
  "feedback": {
    "tom_base": "acolhedor / direto / técnico (baseado no perfil CIS)",
    "resumo_geral": "2-3 frases de visão geral",
    "mensagem_positiva": "O que fez bem (específico)",
    "mensagem_construtiva": "Onde melhorar (específico, tom mentor)",
    "recomendacoes": ["ação prática 1", "ação prática 2"]
  },
  "recomendacoes_pdi": [
    {
      "descritor_foco": "D1",
      "nivel_atual_sugerido": 2,
      "nivel_meta": 3,
      "acao": "ação prática sugerida",
      "por_que_importa": "frase curta",
      "barreira_provavel": "frase curta"
    }
  ]
}

REGRAS DO JSON:
- nota_decimal: 1.00 a 4.00
- confianca: 0.0 a 1.0
- sustentacao: "forte" | "fraca" | "insuficiente"
- NÃO calcule media_descritores, nivel_geral, gap ou travas — isso é feito em código`;

export const IA4_CALL_OPTIONS = { timeoutMs: 240000, maxRetries: 0 } as const;

/**
 * Teto de saída da IA4. Medido em 11-12/08/2026 com `claude-sonnet-4-6`: saída
 * MÉDIA de 6.130 tokens e MÁXIMA de 7.467 — contra um teto que era de 8.192,
 * ou seja, 9% de folga no pior caso. Modelo mais verboso (ou com raciocínio
 * disputando o mesmo teto) trunca o JSON, e aqui truncar é caro: cai no retry e,
 * se o retry também truncar, a resposta fica SEM avaliação. O teto não é
 * cobrado — só o que sai —, então folga aqui não custa nada.
 */
export const IA4_MAX_TOKENS = 16000;

/** Colunas de perfil que o prompt da IA4 consome — uma lista só, três call-sites. */
export const IA4_COLAB_COLS =
  'id, nome_completo, cargo, d_natural, i_natural, s_natural, c_natural, lid_executivo, lid_motivador, lid_metodico, lid_sistematico, perfil_dominante, comp_ousadia, comp_comando, comp_objetividade, comp_assertividade, comp_persuasao, comp_extroversao, comp_entusiasmo, comp_sociabilidade, comp_empatia, comp_paciencia, comp_persistencia, comp_planejamento, comp_organizacao, comp_detalhismo, comp_prudencia, comp_concentracao, perfil_externo_fonte, perfil_externo_dados';

export type ContextoLoteIA4 = { empresa: any; contextoPPP: string };
export type ContextoRespostaIA4 = {
  compNome: string;
  compCod: string;
  descritoresTexto: string;
  descsOficiais: any[];
  cenarioTexto: string;
  perguntasTexto: string;
};

/**
 * Contexto que é IGUAL para todas as respostas do lote (empresa + PPP). Lido 1×
 * e reaproveitado — vai no `cachedUserPrefix`, então consolidar não multiplica
 * custo. `buscarContextoPPP({empresaId})` e não `.limit(1)`: empresa-rede tem um
 * PPP por escola (F-I10).
 */
export async function carregarContextoLoteIA4(tdb: any, sbRaw: SupabaseClient, empresaId: string): Promise<ContextoLoteIA4> {
  const { data: empresa } = await sbRaw.from('empresas').select('nome, segmento').eq('id', empresaId).single();
  const contextoPPP = (await buscarContextoPPP(tdb, { empresaId })).slice(0, 2000);
  return { empresa, contextoPPP };
}

/** Contexto POR RESPOSTA: cenário respondido + régua da competência. */
export async function carregarContextoRespostaIA4(tdb: any, sbRaw: SupabaseClient, resp: any): Promise<ContextoRespostaIA4> {
  let cenarioTexto = '', perguntasTexto = '';
  if (resp.cenario_id) {
    const { data: cen } = await sbRaw.from('banco_cenarios')
      .select('titulo, descricao, alternativas')
      .eq('id', resp.cenario_id).maybeSingle();
    if (cen) {
      cenarioTexto = `${cen.titulo}\n${cen.descricao}`;
      const altObj = typeof cen.alternativas === 'object' && !Array.isArray(cen.alternativas) ? cen.alternativas : {};
      const pergs = (altObj as any).perguntas || (Array.isArray(cen.alternativas) ? cen.alternativas : []);
      perguntasTexto = pergs.map((p: any, i: number) => {
        const num = p.numero || i + 1;
        return `P${num}: ${p.texto || ''}\nDescritores primarios: ${Array.isArray(p.descritores_primarios) ? p.descritores_primarios.map((d: any) => `D${d}`).join(', ') : ''}\nDiferenciacao: ${p.o_que_diferencia_niveis || ''}`;
      }).join('\n\n');
    }
  }

  let compNome = '', compCod = '', descritoresTexto = '';
  let descsOficiais: any[] = []; // régua oficial — usada também p/ resolver o nome persistido
  if (resp.competencia_id) {
    const { data: comp } = await tdb.from('competencias')
      .select('nome, cod_comp, descricao').eq('id', resp.competencia_id).maybeSingle();
    compNome = comp?.nome || '';
    compCod = comp?.cod_comp || '';
    const { data: descs } = await tdb.from('competencias')
      .select('cod_desc, nome_curto, descritor_completo, n1_gap, n2_desenvolvimento, n3_meta, n4_referencia')
      .eq('cod_comp', comp?.cod_comp)
      .not('cod_desc', 'is', null);
    descsOficiais = descs || [];
    if (descs?.length) {
      descritoresTexto = descs.map((d: any, i: number) => {
        return `DESCRITOR ${i + 1}: ${d.cod_desc} — ${d.nome_curto || d.descritor_completo || ''}
N1 (Emergente): ${d.n1_gap || 'Não definido'}
N2 (Em desenvolvimento): ${d.n2_desenvolvimento || 'Não definido'}
N3 (Proficiente/META): ${d.n3_meta || 'Não definido'}
N4 (Referência): ${d.n4_referencia || 'Não definido'}`;
      }).join('\n\n');
    }
  }

  return { compNome, compCod, descritoresTexto, descsOficiais, cenarioTexto, perguntasTexto };
}

/**
 * Prompt caching: os blocos ESTÁVEIS por (empresa, competência, cenário) —
 * idênticos entre TODOS os colabs do lote — viram o prefixo cacheável; só o
 * PROFISSIONAL/PERFIL/RESPOSTAS (variáveis) ficam frescos. Seções rotuladas
 * (═══ … ═══) → a reordenação não muda o que a IA lê por seção.
 */
export function buildIA4UserPrompt(
  resp: any, colab: any, empresa: any, contextoPPP: string, ctx: ContextoRespostaIA4,
): { cachedUserPrefix: string; user: string } {
  // Helper unificado: DISC nativo ou OPQ32 conforme empresa
  let perfilCIS = formatPerfilContext(colab);
  // Adiciona estilo de liderança se houver dado DISC
  if (colab?.d_natural != null && colab?.lid_executivo != null) {
    perfilCIS += `\nLiderança: Executor=${colab.lid_executivo || 0}% | Motivador=${colab.lid_motivador || 0}% | Metódico=${colab.lid_metodico || 0}% | Sistemático=${colab.lid_sistematico || 0}%`;
  }

  const contextoBlocks: string[] = [];
  contextoBlocks.push(`═══ EMPRESA ═══\n${empresa?.nome || '—'} (${empresa?.segmento || '—'})`);
  if (contextoPPP) contextoBlocks.push(`═══ CONTEXTO INSTITUCIONAL ═══\n${contextoPPP}`);
  contextoBlocks.push(`═══ COMPETÊNCIA AVALIADA ═══\nCódigo: ${ctx.compCod}\nNome: ${ctx.compNome}`);
  contextoBlocks.push(`═══ RÉGUA DE MATURIDADE ═══\n${ctx.descritoresTexto || '(descritores não disponíveis)'}`);
  if (ctx.cenarioTexto) contextoBlocks.push(`═══ CENÁRIO APRESENTADO ═══\n${ctx.cenarioTexto}`);
  if (ctx.perguntasTexto) contextoBlocks.push(`═══ PERGUNTAS E MAPEAMENTO ═══\n${ctx.perguntasTexto}`);
  const cachedUserPrefix = contextoBlocks.join('\n\n');

  const userBlocks: string[] = [];
  userBlocks.push(`═══ PROFISSIONAL ═══\nNome: ${colab?.nome_completo || '—'}\nCargo: ${colab?.cargo || '—'}`);
  if (perfilCIS) userBlocks.push(`═══ PERFIL COMPORTAMENTAL ═══\n${perfilCIS}\nNOTA: O perfil NÃO altera a nota. Influencia APENAS o tom do feedback.`);
  userBlocks.push(`═══ RESPOSTAS DO PROFISSIONAL ═══
R1: ${resp.r1 || '(sem resposta)'}
R2: ${resp.r2 || '(sem resposta)'}
R3: ${resp.r3 || '(sem resposta)'}
R4: ${resp.r4 || '(sem resposta)'}`);
  userBlocks.push(`═══ INSTRUÇÃO DE AVALIAÇÃO ═══
1. Leia cada resposta SEPARADAMENTE antes de avaliar
2. Extraia evidências textuais REAIS (não invente)
3. Compare com a régua — cada nível tem critérios específicos
4. NÃO assuma comportamento não dito
5. NÃO trate intenção como evidência suficiente
6. Descritors sem evidência suficiente: declare como "insuficiente"
7. Gere insumos — a consolidação matemática é feita depois`);

  return { cachedUserPrefix, user: userBlocks.join('\n\n') };
}

/**
 * Variante "JSON válido SEM notas" (achado 1.4 do FMEA-PIPELINE): sem
 * `avaliacao_por_descritor` a média sairia 0 → nivel_ia4=1/nota_ia4=0 gravados
 * com ZERO linhas em descriptor_assessments, e a resposta ficava presa (fora da
 * fila, "Já avaliada", sem retry). É falha RETRYABLE, não nota N1.
 */
export function validarAvaliacaoIA4(avaliacao: any, rotulo: string): { ok: boolean; error?: string } {
  if (!avaliacao) return { ok: false, error: `IA não retornou JSON válido (${rotulo})` };
  if (!Array.isArray(avaliacao.avaliacao_por_descritor) || avaliacao.avaliacao_por_descritor.length === 0) {
    return { ok: false, error: `IA retornou JSON sem avaliacao_por_descritor (${rotulo}) — segue pendente para retry` };
  }
  return { ok: true };
}

/**
 * Impõe a régua de nível (`lib/nivel-regua`) em TODOS os campos de nível do
 * payload — inclusive nos que a IA escreveu.
 *
 * O nível é DERIVADO da nota; o que o modelo escreveu em `nivel_sugerido` (e nos
 * campos que copiam dele) não vale. Sem isto o mesmo documento carrega dois
 * níveis para o mesmo descritor: medido em 12/08/2026, em 42 de 288 descritores
 * das avaliações de Macaé a IA dizia N2 onde o código gravava N1, e o auditor da
 * 2ª IA leu como "consolidação contraditória" — erro grave, teto de 60 pontos.
 *
 * Exportada porque o backfill dos payloads antigos usa exatamente esta função:
 * uma normalização, não duas (`scripts/_backfill-nivel-regua.ts`).
 */
export function normalizarNiveisDaAvaliacao(avaliacao: any, notasPorDesc: Record<string, any>): void {
  if (Array.isArray(avaliacao?.avaliacao_por_descritor)) {
    for (const d of avaliacao.avaliacao_por_descritor) {
      const chave = `D${d?.numero}`;
      if (notasPorDesc[chave]) d.nivel_sugerido = notasPorDesc[chave].nivel;
    }
  }

  // Índice por chave canônica do NOME (sem código, sem acento) — o mesmo
  // tratamento que `lib/descritores` dá ao eco do modelo.
  const porNome: Record<string, number> = {};
  for (const v of Object.values(notasPorDesc) as any[]) {
    if (v?.nome) porNome[chaveDescritor(String(v.nome))] = v.nivel;
  }

  /**
   * Resolve o nível de um rótulo escrito pela IA. Casa em duas passadas porque
   * o modelo NÃO repete o mesmo texto entre as seções (medido em 12/08/2026):
   * a consolidação trazia "D4 – Proteção da aluna, gestão da relação com a
   * família…" e os gaps, para o MESMO descritor, "D4 – Proteção da aluna,
   * gestão da família…". Casamento exato por nome falhava e o campo ficava com
   * o nível da IA — que é justamente a contradição que o auditor pune.
   * 1º o CÓDIGO no prefixo ("D4 – …" → D4), que é estável; 2º a chave do nome.
   */
  const nivelDoRotulo = (rotulo: unknown): number | undefined => {
    const s = String(rotulo || '').trim();
    if (!s) return undefined;
    const cod = s.match(/^D\s*(\d+)\b/i);
    if (cod && notasPorDesc[`D${cod[1]}`]) return notasPorDesc[`D${cod[1]}`].nivel;
    return porNome[chaveDescritor(s)];
  };

  for (const lista of [avaliacao?.descritores_destaque?.pontos_fortes, avaliacao?.descritores_destaque?.gaps_prioritarios]) {
    if (!Array.isArray(lista)) continue;
    for (const item of lista) {
      const n = nivelDoRotulo(item?.descritor);
      if (n) item.nivel = n; // sem resolver o descritor, NÃO inventa: deixa como veio
    }
  }

  if (Array.isArray(avaliacao?.recomendacoes_pdi)) {
    for (const rec of avaliacao.recomendacoes_pdi) {
      const n = nivelDoRotulo(rec?.descritor_foco);
      if (n) rec.nivel_atual_sugerido = n;
    }
  }
}

export type ConsolidacaoIA4 = {
  notasPorDesc: Record<string, any>;
  mediaDescritores: number;
  nivelGeral: number;
  gap: number;
  confiancaGeral: number;
  travasAplicadas: string[];
};

/**
 * Consolidação matemática — média, travas e nível geral, sempre em CÓDIGO.
 *
 * Existia em TRÊS cópias byte-a-byte (IA4, `reavaliarResposta` e o chat ao
 * vivo), e é assim que gêmeo diverge: a correção da régua de nível entrou na
 * cópia da IA4 e a da reavaliação — o caminho que o admin usa para consertar
 * uma avaliação reprovada — teria continuado gravando o defeito. As diferenças
 * legítimas entre os três viram PARÂMETRO, não cópia:
 *   • chave do descritor: `D{numero}` na IA4, o nome no chat;
 *   • nota: `nota_decimal`, ou `nota_sugerida` no chat;
 *   • `sustentacao`: só existe onde a IA a fornece.
 */
export function consolidarNotasIA4(
  descritores: any[],
  opts: { chave?: (d: any) => string; nota?: (d: any) => number; comSustentacao?: boolean } = {},
): ConsolidacaoIA4 {
  const chaveDe = opts.chave || ((d: any) => `D${d?.numero}`);
  const notaDe = opts.nota || ((d: any) => d?.nota_decimal);
  const comSustentacao = opts.comSustentacao !== false;

  const notasPorDesc: Record<string, any> = {};
  for (const d of descritores || []) {
    const nota = Math.max(1.0, Math.min(4.0, notaDe(d) || 1.0));
    notasPorDesc[chaveDe(d)] = {
      nome: d?.nome ?? d?.descritor,
      nota_decimal: Math.round(nota * 100) / 100,
      nivel: nivelDaNota(nota),
      confianca: d?.confianca || 0,
      ...(comSustentacao ? { sustentacao: d?.sustentacao || 'insuficiente' } : {}),
    };
  }

  const notas = Object.values(notasPorDesc).map((d: any) => d.nota_decimal);
  const mediaDescritores = notas.length
    ? Math.round((notas.reduce((a: number, b: number) => a + b, 0) / notas.length) * 100) / 100
    : 0;

  let nivelGeral: number = nivelDaNota(mediaDescritores);
  const travasAplicadas: string[] = [];
  const niveisN1 = Object.values(notasPorDesc).filter((d: any) => d.nivel === 1).length;
  if (niveisN1 > 3) {
    nivelGeral = Math.min(nivelGeral, 1);
    travasAplicadas.push(`${niveisN1} descritores N1 → nível geral máximo N1`);
  } else if (niveisN1 > 0 && nivelGeral > 2) {
    nivelGeral = Math.min(nivelGeral, 2);
    travasAplicadas.push('Descritor N1 presente → nível geral máximo N2');
  }
  const temN3 = Object.values(notasPorDesc).some((d: any) => d.nivel >= 3);
  if (temN3 && nivelGeral < 2) {
    nivelGeral = 2;
    travasAplicadas.push('Evidência N3 presente → nível mínimo N2');
  }
  nivelGeral = Math.max(1, Math.min(4, nivelGeral));

  const confs = Object.values(notasPorDesc).map((d: any) => d.confianca || 0).filter((c: number) => c > 0);
  const confiancaGeral = confs.length ? Math.round((confs.reduce((a, b) => a + b, 0) / confs.length) * 100) / 100 : 0;

  return {
    notasPorDesc,
    mediaDescritores,
    nivelGeral,
    gap: Math.max(0, 3 - nivelGeral),
    confiancaGeral,
    travasAplicadas: travasAplicadas.length ? travasAplicadas : ['Nenhuma'],
  };
}

/** Bloco `consolidacao` do payload, no formato que as telas e o auditor leem. */
export function blocoConsolidacao(c: ConsolidacaoIA4) {
  return {
    notas_por_descritor: c.notasPorDesc,
    media_descritores: c.mediaDescritores,
    nivel_geral: c.nivelGeral,
    gap: c.gap,
    confianca_geral: c.confiancaGeral,
    travas_aplicadas: c.travasAplicadas,
  };
}

/**
 * Consolidação (em CÓDIGO, nunca pela IA) + persistência. Devolve o mesmo
 * `{success, message|error}` que o fluxo síncrono sempre devolveu.
 */
export async function consolidarEPersistirIA4(
  tdb: any, resp: any, colab: any, avaliacao: any, ctx: ContextoRespostaIA4,
): Promise<{ success: boolean; message?: string; error?: string }> {
  const descPorDescritor = avaliacao.avaliacao_por_descritor;
  const cons = consolidarNotasIA4(descPorDescritor);
  const { notasPorDesc, mediaDescritores, nivelGeral } = cons;

  normalizarNiveisDaAvaliacao(avaliacao, notasPorDesc);
  avaliacao.consolidacao = blocoConsolidacao(cons);

  if (!avaliacao.recomendacoes_pdi && avaliacao.feedback?.recomendacoes_pdi) {
    avaliacao.recomendacoes_pdi = avaliacao.feedback.recomendacoes_pdi;
  }

  const feedbackStr = typeof avaliacao.feedback === 'object'
    ? [avaliacao.feedback.resumo_geral, avaliacao.feedback.mensagem_positiva, avaliacao.feedback.mensagem_construtiva].filter(Boolean).join('\n')
    : (avaliacao.feedback || '');

  // ORDEM IMPORTA (achado 1.4 do FMEA-PIPELINE): as notas de descritor sobem
  // ANTES de marcar a resposta como avaliada. Se o upsert falhar, avaliacao_ia
  // continua null e a resposta segue na fila, retryable pelo fluxo normal — a
  // ordem antiga (avaliação gravada primeiro, upsert em try/catch com
  // console.warn) deixava o colaborador preso sem retry self-service.
  let competenciaNome = resp.competencia_nome;
  if (!competenciaNome && resp.competencia_id) {
    const { data: cc } = await tdb.from('competencias')
      .select('nome').eq('id', resp.competencia_id).maybeSingle();
    if (cc?.nome) {
      competenciaNome = cc.nome;
      await tdb.from('respostas').update({ competencia_nome: cc.nome }).eq('id', resp.id);
    }
  }
  if (competenciaNome && resp.colaborador_id) {
    // `descritor` é CHAVE (upsert + dedup dos relatórios) — nunca persistir o
    // eco do modelo: no mesmo dia ele devolveu "COO03_D6 — Busca de apoio" e
    // "Busca de apoio (COO03_D6)", e cada variante virava linha duplicada no
    // Retrato de Competências. Resolve contra a régua oficial (código→nome).
    const rows = descPorDescritor
      .filter((d: any) => d.nome && typeof d.nota_decimal === 'number')
      .map((d: any) => ({
        colaborador_id: resp.colaborador_id,
        cargo: resp.cargo,
        competencia: competenciaNome,
        descritor: resolverNomeOficial(d.nome, ctx.descsOficiais),
        nota: Math.max(1.0, Math.min(4.0, d.nota_decimal)),
        origem: 'ia4',
        assessment_date: new Date().toISOString(),
      }));
    if (rows.length === 0) {
      return { success: false, error: `IA não retornou notas de descritor válidas para persistir (${colab?.nome_completo || resp.colaborador_id}) — segue pendente para retry` };
    }
    const { error: upsertErr } = await tdb.from('descriptor_assessments').upsert(rows, {
      onConflict: 'colaborador_id,competencia,descritor',
    });
    if (upsertErr) {
      return { success: false, error: `descriptor_assessments upsert falhou (${colab?.nome_completo || resp.colaborador_id}): ${upsertErr.message}` };
    }
  }

  const { error: updErr } = await tdb.from('respostas').update({
    avaliacao_ia: avaliacao,
    nivel_ia4: nivelGeral,
    nota_ia4: mediaDescritores,
    pontos_fortes: avaliacao.descritores_destaque?.pontos_fortes?.map((p: any) => p.descritor || p).join('; ') || null,
    pontos_atencao: avaliacao.descritores_destaque?.gaps_prioritarios?.map((g: any) => g.descritor || g).join('; ') || null,
    feedback_ia4: feedbackStr || null,
    avaliado_em: new Date().toISOString(),
  }).eq('id', resp.id).select('id');

  if (updErr) return { success: false, error: updErr.message };

  return { success: true, message: `${colab?.nome_completo?.split(' ')[0] || '?'}: N${nivelGeral} — ${ctx.compNome || 'competência'}` };
}

/**
 * Caminho SÍNCRONO completo (contexto → prompt → IA → persistência), com o
 * retry de JSON inválido. É o que a action da tela chama por resposta, e também
 * o fallback da task de lote quando o batch não devolve uma linha.
 */
export async function avaliarUmaRespostaCore(
  tdb: any, sbRaw: SupabaseClient, resp: any, colab: any, empresa: any, contextoPPP: string, aiConfig: AIConfig,
): Promise<{ success: boolean; message?: string; error?: string }> {
  const ctx = await carregarContextoRespostaIA4(tdb, sbRaw, resp);
  const { cachedUserPrefix, user } = buildIA4UserPrompt(resp, colab, empresa, contextoPPP, ctx);
  // `taskKey`/`empresaId` explícitos no call-site (e não escondidos num objeto
  // montado antes): é assim que o ia-taskkey-guard consegue ver, e sem eles o
  // custo cai como `untagged` — em 11/08 as 72 avaliações de Macaé foram ao
  // ledger sem empresa nenhuma.
  const ia4Opts = { ...IA4_CALL_OPTIONS, cachedUserPrefix };
  const rotulo = colab?.nome_completo || resp.colaborador_id;

  let resultado = await callAI(IA4_SYSTEM, user, aiConfig, IA4_MAX_TOKENS, { ...ia4Opts, taskKey: 'ia4_avaliacao', empresaId: resp.empresa_id });
  let avaliacao = await extractJSON(resultado);

  if (!avaliacao) {
    console.warn(`[IA4] retry para ${rotulo}: primeira resposta sem JSON`);
    const userRetry = `${user}\n\n=== ATENÇÃO ===\nSua resposta anterior não foi um JSON válido. Retorne APENAS o JSON, sem texto antes ou depois, sem markdown.`;
    resultado = await callAI(IA4_SYSTEM, userRetry, aiConfig, IA4_MAX_TOKENS, { ...ia4Opts, taskKey: 'ia4_avaliacao', empresaId: resp.empresa_id });
    avaliacao = await extractJSON(resultado);
  }

  const valido = validarAvaliacaoIA4(avaliacao, rotulo);
  if (!valido.ok) return { success: false, error: valido.error };

  return consolidarEPersistirIA4(tdb, resp, colab, avaliacao, ctx);
}
