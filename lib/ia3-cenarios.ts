/**
 * Núcleo HEADLESS do IA3 — geração de cenários A + check dual (2ª IA).
 *
 * Extraído de actions/fase1.ts (22/07/2026) no padrão do projeto
 * (lib/ia2-gabarito, lib/check-ia4-core): a action 'use server' aplica o gate
 * e delega; a task de LOTE (trigger/gerar-ia3-batch) usa os BLOCOS daqui com
 * a execução em Batch API no meio (prompts → batch → validação → persistência).
 *
 * Nada aqui tem gate de sessão — callers de servidor passam o client
 * service-role; o isolamento é por tenantDb/filtros explícitos.
 */

import { tenantDb } from '@/lib/tenant-db';
import { callAI, type AIConfig } from '@/actions/ai-client';
import { extractJSON } from '@/actions/utils';
import { buscarContextoPPP, buscarValores } from '@/lib/ia2-gabarito';
import { escopoTenantDaLinha } from '@/lib/tenant-predicado';
import { buscarDescritoresDaCompetencia } from '@/lib/matriz-por-cargo';

// ── Prompts (movidos VERBATIM de fase1.ts) ──────────────────────────────────

/**
 * Regra de anonimização das instituições, compartilhada pelos prompts do Cenário A
 * (pilar 9) e do Cenário B (lib/cenarios-b-prompt.ts). O texto é o do A; o golden
 * em tests/unit/ia3/prompt-golden.test.ts garante que ele não muda em silêncio.
 */
export const REGRA_ANONIMIZACAO_INSTITUICOES = `ANONIMIZAÇÃO DE INSTITUIÇÕES (OBRIGATÓRIO)
   NUNCA use o nome REAL — nem invente nome PRÓPRIO — de escola, rede,
   secretaria ou cidade. Situe o caso de forma GENÉRICA, preservando o contexto
   regional do PPP sem identificar (ex.: "uma escola da rede municipal no
   sertão da Bahia", "a Secretaria Municipal de Educação", "o município", "uma
   escola urbana da rede"). O contexto real do PPP serve APENAS para dar
   realismo pedagógico — jamais para nomear a instituição. Personagens (pessoas)
   seguem com nomes próprios fictícios brasileiros, como já previsto.`;

export function buildIA3SystemPrompt(): string {
  return `Você é um especialista com 20 anos em avaliação de competências comportamentais em organizações brasileiras.
Sua especialidade: criar cenários situacionais como INSTRUMENTOS DIAGNÓSTICOS.

═══ OBJETIVO ═══

Criar UM cenário situacional + 4 perguntas temáticas que funcionem como
INSTRUMENTO DE ASSESSMENT. NÃO é storytelling. NÃO é treinamento. NÃO é texto bonito.
O cenário é uma radiografia: a resposta revela o nível de maturidade.

═══ PILARES DO CENÁRIO ═══

1. DECISÃO FORÇADA (REGRA DE OURO)
   Se o avaliado pode responder BEM sem abrir mão de nada, priorizar nada ou
   assumir risco algum → o cenário FALHOU como instrumento.
   - P1: ESCOLHA — trade-off real, priorização com custo
   - P2: COMO — execução sabendo que haverá resistência
   - P3: TENSÃO HUMANA — lidar com pessoa que resiste/sofre/discorda
   - P4: SUSTENTABILIDADE — como saber que funcionou no médio prazo

2. FACETA ESPECÍFICA
   O cenário testa uma FACETA ESPECÍFICA da competência, não "a competência
   de forma genérica". Explicite qual aspecto é o foco.

3. TRADE-OFF CENTRAL
   Todo cenário precisa ter UM trade-off claro no centro. Se não houver
   escolha difícil, não há diagnóstico.

4. PODER DISCRIMINANTE
   Resposta N1 deve ser VISIVELMENTE diferente de N3. Se não é, o cenário
   não discrimina. Resposta genérica/clichê DEVE falhar.

5. COBERTURA DE DESCRITORES
   Cada pergunta cobre 2-3 descritores como foco primário.
   As 4 perguntas JUNTAS cobrem TODOS os descritores fornecidos.

6. REALISMO CONTEXTUAL
   Personagens brasileiros nomeados, vocabulário da organização, 1 dado
   concreto (número, prazo, %), situação plausível no dia a dia do cargo.

7. DILEMA ÉTICO EMBUTIDO
   Pelo menos 1 situação onde o caminho mais fácil conflita com um valor
   organizacional. NÃO explicitar — deve emergir naturalmente.

8. SOBRIEDADE
   - Máx 2 stakeholders nomeados
   - Máx 2 tensões (1 central + 1 complicador)
   - Sem subtramas
   - Sem cenário teatral ou sofisticado demais
   - 10 segundos pra entender o problema
   - Contexto: máx 900 caracteres
   - Cada pergunta: máx 200 caracteres
   - Perguntas ABERTAS (não múltipla escolha)

9. ${REGRA_ANONIMIZACAO_INSTITUICOES}

═══ FORMATO JSON (APENAS JSON, sem markdown) ═══

{
  "cenario": {
    "titulo": "Título curto e descritivo",
    "contexto": "Contexto do cenário (250-400 palavras)",
    "faceta_testada_principal": "Qual aspecto específico da competência este cenário mais testa",
    "tradeoff_testado": "Qual escolha difícil o avaliado precisa fazer",
    "fator_complicador": "O que torna a situação mais difícil do que parece",
    "stakeholders_centrais": ["Nome1", "Nome2"],
    "dilema_etico": {
      "valor_testado": "Qual valor organizacional está em jogo",
      "caminho_facil": "O que a pessoa faria se cedesse",
      "caminho_etico": "O que a pessoa faria mantendo o valor"
    },
    "armadilha_de_resposta_generica": "Por que 'alinhar com todos' ou resposta vaga não resolve este cenário",
    "confianca_cenario": 0.85,
    "riscos_do_cenario": ["possível fragilidade 1", "possível fragilidade 2"]
  },
  "perguntas": [
    {
      "numero": 1,
      "texto": "Pergunta aberta (máx 200 chars)",
      "objetivo_diagnostico": "O que esta pergunta quer revelar sobre o avaliado",
      "descritores_primarios": [1, 2],
      "o_que_diferencia_niveis": "N1: ... | N2: ... | N3: ... | N4: ...",
      "resposta_generica_falha_porque": "Por que resposta vaga/clichê não funciona aqui"
    }
  ],
  "mapa_cobertura_descritores": {
    "D1": [1, 3],
    "D2": [1, 4],
    "D3": [2],
    "D4": [2, 3],
    "D5": [3, 4],
    "D6": [4]
  }
}

REGRAS DO JSON:
- 4 perguntas obrigatórias
- descritores_primarios: números dos descritores (D1=1, D2=2, etc.)
- mapa_cobertura_descritores: cada descritor deve aparecer em pelo menos 1 pergunta
- confianca_cenario: 0.0 a 1.0
- stakeholders_centrais: máximo 2`;
}

// ── Blocos do contexto do cenário ────────────────────────────────────────────
// Extraídos de `buildIA3UserPrompt` em 18/09/2026 para o Cenário B receber
// EXATAMENTE o mesmo contexto do A (lib/cenarios-b-prompt.ts). Byte a byte: o
// golden em tests/unit/ia3/prompt-golden.test.ts prova que o A não mudou.
// Bloco opcional devolve `null` quando não há o que dizer.

export function blocoEmpresaIA3(empresa: any): string {
  return `═══ EMPRESA ═══
Nome: ${empresa.nome}
Segmento: ${empresa.segmento || 'Não informado'}`;
}

export function blocoCargoIA3(cargoNome: string): string {
  return `═══ CARGO ═══
Cargo: ${cargoNome}`;
}

export function blocoContextoOrganizacionalIA3(cargoDetalhe: any): string | null {
  if (!(cargoDetalhe.descricao || cargoDetalhe.principais_entregas || cargoDetalhe.stakeholders || cargoDetalhe.decisoes_recorrentes || cargoDetalhe.tensoes_comuns)) return null;
  let ctx = '═══ CONTEXTO ORGANIZACIONAL ═══';
  if (cargoDetalhe.descricao) ctx += `\nDescrição do cargo: ${cargoDetalhe.descricao}`;
  if (cargoDetalhe.principais_entregas) ctx += `\nPrincipais entregas: ${cargoDetalhe.principais_entregas}`;
  if (cargoDetalhe.stakeholders) ctx += `\nStakeholders: ${cargoDetalhe.stakeholders}`;
  if (cargoDetalhe.decisoes_recorrentes) ctx += `\nDecisões recorrentes: ${cargoDetalhe.decisoes_recorrentes}`;
  if (cargoDetalhe.tensoes_comuns) ctx += `\nTensões e situações difíceis: ${cargoDetalhe.tensoes_comuns}`;
  return ctx;
}

export function blocoCompetenciaIA3(comp: any): string {
  return `═══ COMPETÊNCIA-ALVO ═══
Código: ${comp.cod_comp || '—'}
Nome: ${comp.nome}
${comp.descricao ? `Descrição: ${comp.descricao}` : ''}`;
}

export function blocoDescritoresIA3(descritores: any[]): string | null {
  if (!(descritores.length > 0)) return null;
  let desc = `═══ DESCRITORES DA COMPETÊNCIA (${descritores.length}) ═══`;
  descritores.forEach((d: any, i: number) => {
    desc += `\nD${i + 1}: ${d.cod_desc} — ${d.nome_curto || d.descritor_completo || ''}`;
    if (d.n1_gap) desc += `\n  N1 (Gap): ${d.n1_gap}`;
    if (d.n2_desenvolvimento) desc += `\n  N2 (Desenvolvimento): ${d.n2_desenvolvimento}`;
    if (d.n3_meta) desc += `\n  N3 (Meta): ${d.n3_meta}`;
    if (d.n4_referencia) desc += `\n  N4 (Referência): ${d.n4_referencia}`;
  });
  return desc;
}

export function blocoValoresIA3(valores: string[]): string {
  return `═══ VALORES ORGANIZACIONAIS ═══\n${valores.join(', ')}`;
}

export function blocoPerfilIdealIA3(gabCIS: any): string | null {
  if (!gabCIS) return null;
  let perfil = '═══ PERFIL IDEAL DO CARGO (IA2) ═══';
  if (gabCIS.tela4) {
    perfil += `\nDISC ideal:`;
    for (const f of ['D', 'I', 'S', 'C']) {
      if (gabCIS.tela4[f]) perfil += `\n  ${f}: ${gabCIS.tela4[f].min} → ${gabCIS.tela4[f].max}`;
    }
  }
  if (gabCIS.tela3) {
    perfil += `\nEstilos de liderança: Executor ${gabCIS.tela3.executor}% | Motivador ${gabCIS.tela3.motivador}% | Metódico ${gabCIS.tela3.metodico}% | Sistemático ${gabCIS.tela3.sistematico}%`;
  }
  perfil += `\nUse o perfil para escolher o TIPO de gatilho que revela pontos cegos deste perfil.`;
  return perfil;
}

export function blocoPppIA3(contextoPPP: string): string | null {
  if (!contextoPPP) return null;
  return `═══ CONTEXTO PPP / DOSSIÊ ═══\n${contextoPPP.slice(0, 3000)}`;
}

export function buildIA3UserPrompt(empresa: any, cargoNome: string, cargoDetalhe: any, comp: any, descritores: any[], valores: string[], contextoPPP: string, gabCIS: any): string {
  const blocks: string[] = [];

  blocks.push(blocoEmpresaIA3(empresa));
  blocks.push(blocoCargoIA3(cargoNome));
  const organizacional = blocoContextoOrganizacionalIA3(cargoDetalhe);
  if (organizacional) blocks.push(organizacional);
  blocks.push(blocoCompetenciaIA3(comp));
  const regua = blocoDescritoresIA3(descritores);
  if (regua) blocks.push(regua);
  blocks.push(blocoValoresIA3(valores));
  const perfil = blocoPerfilIdealIA3(gabCIS);
  if (perfil) blocks.push(perfil);
  const ppp = blocoPppIA3(contextoPPP);
  if (ppp) blocks.push(ppp);

  blocks.push(`═══ INSTRUÇÃO DE LEITURA ═══
1. Identifique qual FACETA da competência mais importa neste cargo específico.
2. Defina qual ESCOLHA DIFÍCIL diferenciaria respostas N1/N2/N3/N4.
3. Pense em qual RESPOSTA GENÉRICA precisaria falhar — se ela funciona, o cenário é fraco.
4. Distribua os ${descritores.length} descritores nas 4 perguntas (cada pergunta ≥2, cobertura total).
5. Verifique: o cenário tem trade-off REAL? Resposta "boa pra todos" é impossível?
6. ANONIMIZE: o nome da empresa/escola/rede/cidade acima é só para CONTEXTO — no texto do cenário use nomes FICTÍCIOS de instituições, nunca os reais.

═══ OBJETIVO ═══
Gere o cenário como INSTRUMENTO DIAGNÓSTICO que a IA4 e o check vão usar
para avaliar e auditar. Priorize clareza, discriminância e utilidade — não criatividade literária.`);

  return blocks.join('\n\n');
}

export function buildCheckIA3SystemPrompt(): string {
  return `Você é um auditor especialista em Assessment Comportamental com 20 anos de experiência.
Sua tarefa: avaliar se o cenário funciona como INSTRUMENTO DIAGNÓSTICO real.
NÃO avalie como texto literário. Avalie como ferramenta de assessment.

═══ 7 DIMENSÕES DE AVALIAÇÃO (total 100 pontos) ═══

1. ADERÊNCIA À COMPETÊNCIA (15pts)
   O cenário avalia a competência indicada? A faceta testada é relevante pro cargo?

2. COBERTURA DE DESCRITORES (15pts)
   Todos os descritores relevantes estão cobertos pelas 4 perguntas?
   O mapa de cobertura é coerente? Algum descritor ficou sem pergunta?

3. REALISMO CONTEXTUAL (15pts)
   Contexto e personagens são críveis pro cargo/empresa? Vocabulário da organização?
   Dados concretos (números, prazos)?

4. CONTENÇÃO E SOBRIEDADE (10pts)
   Contexto ≤900 chars? Máx 2 tensões? Máx 2 stakeholders nomeados?
   Perguntas ≤200 chars? Sem subtramas? Sem cenário teatral?

5. CLAREZA DO TRADE-OFF (15pts)
   Existe escolha difícil REAL no centro? O avaliado precisa abrir mão de algo?
   Se pode responder "bem pra todos" → penalize fortemente.

6. PODER DISCRIMINANTE (20pts) — DIMENSÃO MAIS IMPORTANTE
   Resposta N1 seria visivelmente diferente de N3?
   Resposta genérica/clichê FALHA? Cada pergunta exige ação concreta ou priorização?

7. AUDITABILIDADE (10pts)
   Os metadados do cenário (faceta, trade-off, armadilha, mapa) são claros e
   úteis pra revisão humana? A IA4 consegue usar isso pra avaliar?

═══ ERROS GRAVES (forçam nota máxima 60) ═══

- Pergunta fechada (sim/não)
- Cenário com 4+ tensões simultâneas
- Contexto com 5+ stakeholders nomeados
- Trade-off inexistente ou muito fraco
- Descritor relevante sem cobertura em nenhuma pergunta
- Cenário teatral/sofisticado demais para uso em produção
- Resposta genérica suficiente para "ir bem" nas 4 perguntas
- Competência avaliada não é a indicada
- Incoerência entre perguntas e mapa de cobertura

═══ CLASSIFICAÇÃO ═══

90-100 = aprovado
80-89 = aprovado_com_ressalvas
0-79 = revisar (com sugestão concreta obrigatória)

═══ FORMATO JSON (APENAS JSON, sem markdown) ═══

{
  "nota": 85,
  "status": "aprovado_com_ressalvas",
  "erro_grave": false,
  "dimensoes": {
    "aderencia_competencia": 13,
    "cobertura_descritores": 12,
    "realismo_contextual": 14,
    "contencao_sobriedade": 9,
    "clareza_tradeoff": 13,
    "poder_discriminante": 17,
    "auditabilidade": 7
  },
  "ponto_mais_forte": "O que o cenário faz melhor como instrumento",
  "ponto_mais_fraco": "Onde o cenário é mais vulnerável como instrumento",
  "descritores_sem_cobertura": ["D3", "D5"],
  "perguntas_com_risco": [
    {"numero": 2, "problema": "aceita resposta genérica", "correcao_recomendada": "reformular pra forçar priorização"}
  ],
  "justificativa": "Avaliação geral do cenário como instrumento (2-3 frases)",
  "sugestao": "O que mudar pra melhorar (se nota < 90)",
  "alertas": ["alerta 1", "alerta 2"]
}

REGRA: Se cenário for bem escrito mas metodologicamente fraco, PENALIZE.
Prefira rigor metodológico a elegância textual.`;
}

// ── Contexto de geração (gather compartilhado sync/batch) ───────────────────

export interface ContextoIA3 {
  tdb: any;
  empresa: any;
  comp: any;
  descritores: any[];
  contextoPPP: string;
  valores: string[];
  cargoDetalhe: any;
  gabCIS: any;
}

export async function montarContextoIA3(
  sbRaw: any, empresaId: string, cargoNome: string, competenciaId: string, pppEscolaId: string | null,
): Promise<{ ok: true; ctx: ContextoIA3 } | { ok: false; error: string }> {
  const tdb = tenantDb(empresaId);
  // Empresa (id é tenant — raw); ppp_texto pode não existir no schema.
  let empresa;
  const { data: emp1 } = await sbRaw.from('empresas')
    .select('nome, segmento, ppp_texto').eq('id', empresaId).single();
  empresa = emp1 || (await sbRaw.from('empresas').select('nome, segmento').eq('id', empresaId).single()).data;
  if (!empresa) return { ok: false, error: 'Empresa não encontrada' };

  const { data: comp } = await tdb.from('competencias')
    .select('id, nome, cod_comp, pilar, descricao, cargo')
    .eq('id', competenciaId).single();
  if (!comp) return { ok: false, error: 'Competência não encontrada' };

  let descritores: any[];
  try {
    descritores = await buscarDescritoresDaCompetencia(tdb, comp,
      'cod_desc, nome_curto, descritor_completo, n1_gap, n2_desenvolvimento, n3_meta, n4_referencia');
  } catch (e: any) {
    return { ok: false, error: e.message };
  }

  const contextoPPP = await buscarContextoPPP(tdb, { empresaId, pppEscolaId });
  const valores = await buscarValores(tdb, empresa.nome);

  const { data: cargoEmp } = await tdb.from('cargos_empresa')
    .select('gabarito, descricao, principais_entregas, stakeholders, decisoes_recorrentes, tensoes_comuns')
    .eq('nome', cargoNome)
    .maybeSingle();
  const cargoDetalhe = cargoEmp || {};
  const gabCIS = cargoDetalhe.gabarito ? (typeof cargoDetalhe.gabarito === 'string' ? JSON.parse(cargoDetalhe.gabarito) : cargoDetalhe.gabarito) : null;

  return { ok: true, ctx: { tdb, empresa, comp, descritores: descritores || [], contextoPPP, valores, cargoDetalhe, gabCIS } };
}

// ── Validação/normalização da resposta (pura) ───────────────────────────────

export interface RespostaIA3Normalizada {
  cen: any;
  titulo: string;
  contexto: string;
  perguntas: any[];
  errors: string[];
}

/**
 * Modelo da GERAÇÃO do IA3 quando quem chama não escolheu um. `callAI` NÃO consulta
 * `getModelForTask` (cai no DEFAULT_MODEL, o Sonnet 4.6) — foi assim que a regeneração
 * manual rodou no 4.6 sem ninguém decidir. Aqui a task `ia3_cenarios` é resolvida
 * (override do tenant > default por task, hoje o Sonnet 5.5; a task é PINADA, então o
 * `modelo_padrao` genérico do tenant não a rebaixa). Escolha explícita do chamador vence.
 */
export async function resolverAiConfigGeracaoIA3(empresaId: string | null | undefined, aiConfig: AIConfig = {}): Promise<AIConfig> {
  if (aiConfig?.model) return aiConfig;
  const { getModelForTask } = await import('@/lib/ai-tasks');
  return { ...aiConfig, model: await getModelForTask(empresaId, 'ia3_cenarios') };
}

/**
 * Teto de saída da GERAÇÃO do cenário — fonte única do caminho síncrono E do lote.
 *
 * `Medido: 30/09/2026` (Amazon Bowling, `claude-sonnet-5`): o cenário sai com
 * ~7.900 tokens em média e uma cauda que passa de 10.000. O lote tinha `6144`
 * fixo em `trigger/gerar-ia3-batch.ts`: 58 de 66 respostas pararam no teto, JSON
 * cortado, e caíram no fallback síncrono (76 s cada) — pago duas vezes, e a run
 * estourou o `maxDuration` de 1 h sem fechar o job. Dois números em dois arquivos
 * divergiram quando o modelo mudou; por isso UM só. Depois de subir para 10000, o
 * re-lote ainda truncou 3 de 32 chamadas síncronas exatamente em 10000 (`status =
 * 'truncado'` no ledger) e 2 cenários não saíram; 16000 dá folga à cauda.
 */
export const IA3_MAX_TOKENS_GERACAO = 16000;

/**
 * Relógio do `callAI` síncrono na geração. O default (120 s) não comporta o teto
 * acima: o modelo emite ~100 tokens/s (medido: 10.000 tokens em 93-107 s), então
 * 16.000 levam ~160 s e seriam abortados ANTES de fechar o JSON — trocaria o
 * truncamento por timeout. O lote não tem relógio de request; só o síncrono precisa.
 */
export const IA3_TIMEOUT_GERACAO_MS = 240_000;

/**
 * Fração de itens do lote que caíram no fallback síncrono acima da qual o
 * fallback deixa de ser exceção e vira SINTOMA (teto baixo, prompt, modelo).
 */
export const IA3_LIMIAR_FALLBACK_LOTE = 0.2;

/** Pura: o fallback síncrono do lote passou do limiar? `total` = itens que foram ao lote. */
export function fallbackDoLoteExcessivo(total: number, caidos: number, limiar = IA3_LIMIAR_FALLBACK_LOTE): boolean {
  if (!(total > 0)) return false;
  return caidos / total > limiar;
}

export function validarRespostaIA3(resultado: any, numDescritores: number): RespostaIA3Normalizada | null {
  if (!resultado) return null;
  const cen = resultado.cenario || resultado.scenario || resultado;
  const titulo = cen.titulo || cen.title || resultado.titulo || 'Cenário';
  const contexto = cen.contexto || cen.context || cen.descricao || resultado.contexto || '';
  const perguntas = resultado.perguntas || resultado.questions || cen.perguntas || [];

  if (!contexto && !titulo) return null;

  const errors: string[] = [];
  if (!Array.isArray(perguntas) || perguntas.length !== 4) {
    errors.push(`Esperado 4 perguntas, recebido ${Array.isArray(perguntas) ? perguntas.length : 0}`);
  }
  if (numDescritores && Array.isArray(perguntas)) {
    const allDescs = new Set<number>();
    perguntas.forEach((p: any) => {
      if (Array.isArray(p.descritores_primarios)) {
        p.descritores_primarios.forEach((d: number) => allDescs.add(d));
      }
    });
    const missing = [];
    for (let i = 1; i <= numDescritores; i++) {
      if (!allDescs.has(i)) missing.push(`D${i}`);
    }
    if (missing.length) errors.push(`Descritores sem cobertura: ${missing.join(', ')}`);
  }
  if (typeof cen.confianca_cenario === 'number' && (cen.confianca_cenario < 0 || cen.confianca_cenario > 1)) {
    errors.push(`confianca_cenario fora de 0-1: ${cen.confianca_cenario}`);
  }
  return { cen, titulo, contexto, perguntas, errors };
}

export function montarAlternativasIA3(resultado: any, cen: any, perguntas: any[], descritores?: { cod_desc?: string | null }[]): Record<string, any> {
  return {
    ...(descritores?.length && descritores.every(d => typeof d.cod_desc === 'string')
      ? { descritores_ordem: descritores.map(d => d.cod_desc) } : {}),
    perguntas: (resultado.perguntas || resultado.questions || cen.perguntas || perguntas),
    faceta_testada_principal: cen.faceta_testada_principal || null,
    tradeoff_testado: cen.tradeoff_testado || null,
    fator_complicador: cen.fator_complicador || null,
    dilema_etico: cen.dilema_etico || resultado.dilema_etico || null,
    armadilha_de_resposta_generica: cen.armadilha_de_resposta_generica || null,
    // O prompt da IA3 PEDE `stakeholders_centrais` (máx. 2) e o persistidor não
    // gravava — o campo existia na resposta do modelo e morria aqui. Quem
    // derivava a persona da cena tinha de adivinhar o "quem" pelo texto do
    // contexto. Campo pedido e não persistido é o mesmo bug de ler chave que
    // ninguém escreve, só que do lado da escrita.
    stakeholders_centrais: cen.stakeholders_centrais || null,
    confianca_cenario: typeof cen.confianca_cenario === 'number' ? Math.max(0, Math.min(1, cen.confianca_cenario)) : null,
    riscos_do_cenario: cen.riscos_do_cenario || null,
    mapa_cobertura_descritores: resultado.mapa_cobertura_descritores || null,
  };
}

/** Salva o cenário (limpa o anterior DESTE PPP — não apaga os outros PPPs). */
export async function persistirCenarioIA3(tdb: any, args: {
  compId: string; cargoNome: string; pppEscolaId: string | null;
  titulo: string; contexto: string; alternativas: Record<string, any>;
}): Promise<{ ok: true; cenarioId: string | null } | { ok: false; error: string }> {
  /**
   * O `delete` só alcança cenário SEM resposta ligada.
   *
   * 🔴 MEDIDO EM 25/08/2026: este `delete` + `insert` é a origem de **17 de 246
   * respostas apontando para um cenário que não existe mais** — 15 no acme
   * (14/04) e 2 no ibipeba (02/06), todas já avaliadas. Existe nota e não existe
   * mais o enunciado que a produziu: ninguém consegue reconstruir a que situação
   * a pessoa respondeu, nem contestar a avaliação.
   *
   * Preservar em vez de apagar tem um efeito colateral DESEJADO: passa a existir
   * mais de um cenário por (competência × cargo × escola), e o histórico deixa
   * de ser reescrito. Quem lê por `respostas.cenario_id` (IA4 e o check) não
   * muda — eles buscam por id. Quem lista por chave passa a ver mais de um e
   * precisa ordenar; ver o aviso em `cenario-b.ts`.
   *
   * A migration 226 põe a mesma regra no banco (FK `ON DELETE RESTRICT`), para
   * que um caminho futuro que esqueça esta checagem falhe alto em vez de apagar.
   */
  const baseSel = tdb.from('banco_cenarios').select('id')
    .eq('competencia_id', args.compId)
    .eq('cargo', args.cargoNome);
  const { data: existentes, error: errSel } = await (args.pppEscolaId
    ? baseSel.eq('ppp_escola_id', args.pppEscolaId)
    : baseSel.is('ppp_escola_id', null));
  if (errSel) return { ok: false, error: `Erro ao ler cenários existentes: ${errSel.message}` };

  const ids = (existentes || []).map((c: any) => c.id);
  if (ids.length) {
    const { data: comResposta, error: errResp } = await tdb.from('respostas')
      .select('cenario_id').in('cenario_id', ids);
    if (errResp) return { ok: false, error: `Erro ao checar respostas: ${errResp.message}` };

    const protegidos = new Set((comResposta || []).map((r: any) => r.cenario_id));
    const apagaveis = ids.filter((id: string) => !protegidos.has(id));
    if (apagaveis.length) {
      const { error: errDel } = await tdb.from('banco_cenarios').delete().in('id', apagaveis);
      if (errDel) return { ok: false, error: `Erro ao limpar cenário anterior: ${errDel.message}` };
    }
  }

  const { data: inserted, error: insertErr } = await tdb.from('banco_cenarios').insert({
    competencia_id: args.compId,
    cargo: args.cargoNome,
    ppp_escola_id: args.pppEscolaId || null,
    titulo: args.titulo,
    descricao: args.contexto,
    alternativas: args.alternativas,
  }).select('id').maybeSingle();

  if (insertErr) return { ok: false, error: `Erro ao salvar: ${insertErr.message}` };
  return { ok: true, cenarioId: inserted?.id || null };
}

// ── Core síncrono da geração (a action delega aqui) ─────────────────────────

export async function gerarCenarioIA3Core(sbRaw: any, args: {
  empresaId: string; cargoNome: string; competenciaId: string;
  pppEscolaId?: string | null; aiConfig?: AIConfig;
}): Promise<{ success: boolean; error?: string; message?: string; cenarioId?: string | null }> {
  const { empresaId, cargoNome, competenciaId, pppEscolaId = null } = args;
  const aiConfig = await resolverAiConfigGeracaoIA3(empresaId, args.aiConfig ?? {});

  const mc = await montarContextoIA3(sbRaw, empresaId, cargoNome, competenciaId, pppEscolaId);
  if (!('ctx' in mc)) return { success: false, error: mc.error };
  const { tdb, empresa, comp, descritores, contextoPPP, valores, cargoDetalhe, gabCIS } = mc.ctx;

  const system = buildIA3SystemPrompt();
  const user = buildIA3UserPrompt(empresa, cargoNome, cargoDetalhe, comp, descritores, valores, contextoPPP, gabCIS);

  let resposta = await callAI(system, user, aiConfig, IA3_MAX_TOKENS_GERACAO, { taskKey: 'ia3_cenarios', timeoutMs: IA3_TIMEOUT_GERACAO_MS, empresaId });
  let resultado = await extractJSON(resposta);
  if (!resultado) return { success: false, error: 'IA não retornou JSON válido' };

  let norm = validarRespostaIA3(resultado, descritores.length);
  if (!norm) return { success: false, error: 'IA não retornou cenário válido' };

  // Retry se erros críticos (mesma mecânica do síncrono original)
  if (norm.errors.length > 0) {
    console.warn(`[IA3] ${comp.nome}: validação (${norm.errors.join('; ')}). Retry.`);
    const retryUser = user + `\n\n═══ ATENÇÃO: CORREÇÃO NECESSÁRIA ═══\n${norm.errors.join('\n')}\nCorrija e retorne JSON válido.`;
    resposta = await callAI(system, retryUser, aiConfig, IA3_MAX_TOKENS_GERACAO, { taskKey: 'ia3_cenarios', timeoutMs: IA3_TIMEOUT_GERACAO_MS, empresaId });
    const retryResult = await extractJSON(resposta);
    if (retryResult) {
      resultado = retryResult;
      const norm2 = validarRespostaIA3(retryResult, descritores.length);
      if (norm2) {
        // Preserva o comportamento original: o retry substitui o resultado e
        // enriquece o cen com o que veio (Object.assign no cen antigo).
        Object.assign(norm.cen, norm2.cen);
        norm = { ...norm2, cen: norm.cen };
      }
    }
  }

  const alternativas = montarAlternativasIA3(resultado, norm.cen, norm.perguntas, descritores);
  const p = await persistirCenarioIA3(tdb, {
    compId: comp.id, cargoNome, pppEscolaId,
    titulo: norm.cen.titulo || norm.titulo, contexto: norm.cen.contexto || norm.contexto, alternativas,
  });
  if (!('cenarioId' in p)) return { success: false, error: p.error };
  return { success: true, message: `Cenário gerado: ${comp.nome}`, cenarioId: p.cenarioId };
}

// ── Check dual (2ª IA) ──────────────────────────────────────────────────────

/** Monta o prompt do check a partir da ROW do cenário (mesma lógica do síncrono). */
export async function montarCheckIA3Prompt(sbRaw: any, cen: any): Promise<{ system: string; user: string }> {
  const tdb = cen.empresa_id ? tenantDb(cen.empresa_id) : null;
  const alt = typeof cen.alternativas === 'string' ? JSON.parse(cen.alternativas) : (cen.alternativas || {});

  let compNome = '';
  let descritoresTexto = '';
  if (cen.competencia_id) {
    const sbForComp = tdb || sbRaw;
    const { data: comp, error: compErr } = await sbForComp.from('competencias')
      .select('nome, cod_comp, cargo, descricao')
      .eq('id', cen.competencia_id)
      .maybeSingle();
    if (compErr) throw new Error(`Check IA3: competência ${cen.competencia_id}: ${compErr.message}`);
    if (comp) compNome = comp.nome;

    const descs = await buscarDescritoresDaCompetencia(sbForComp, comp, 'cod_desc, nome_curto, descritor_completo', alt.descritores_ordem);
    if (descs.length) {
      descritoresTexto = descs.map((d: any, i: number) => `D${i + 1}: ${d.cod_desc} — ${d.nome_curto || d.descritor_completo}`).join('\n');
    }
  }

  // PPP resumido — MESMA lente com que o cenário foi gerado.
  //
  // Antes: `.limit(1)` sem ordem definida + `JSON.stringify` cru. Numa empresa-rede isso
  // dava ao auditor o PPP de uma escola qualquer, possivelmente OUTRA que a do gerador —
  // o check reprovava contexto que ele mesmo não estava vendo (F-I10 do FMEA). Agora passa
  // pelo resolvedor único: `ppp_escola_id` da row quando o cenário é por escola, contexto
  // municipal consolidado quando é de rede. Sem `empresa_id` não há PPP a resolver.
  let pppResumo = '';
  if (tdb && cen.empresa_id) {
    const contexto = await buscarContextoPPP(tdb, {
      empresaId: cen.empresa_id,
      pppEscolaId: cen.ppp_escola_id ?? null,
    });
    pppResumo = contexto.slice(0, 500);   // o check é auditoria: 500 chars bastam de âncora
  }

  const perguntasArr = alt.perguntas || (Array.isArray(alt) ? alt : []);
  const perguntasTexto = perguntasArr.map((p: any) => {
    let t = `P${p.numero || ''}: ${p.texto || JSON.stringify(p)}`;
    if (p.objetivo_diagnostico) t += `\n  Objetivo: ${p.objetivo_diagnostico}`;
    if (p.descritores_primarios) t += `\n  Descritores primários: ${Array.isArray(p.descritores_primarios) ? p.descritores_primarios.map((d: any) => `D${d}`).join(', ') : ''}`;
    if (p.o_que_diferencia_niveis) t += `\n  Diferenciação: ${p.o_que_diferencia_niveis}`;
    return t;
  }).join('\n\n');

  const faceta = alt.faceta_testada_principal || '';
  const tradeoff = alt.tradeoff_testado || '';
  const armadilha = alt.armadilha_de_resposta_generica || '';
  const mapaCobertura = alt.mapa_cobertura_descritores ? JSON.stringify(alt.mapa_cobertura_descritores) : '';
  const riscos = alt.riscos_do_cenario || '';

  const system = buildCheckIA3SystemPrompt();

  let user = `═══ CARGO ═══\n${cen.cargo}`;
  user += `\n\n═══ COMPETÊNCIA ═══\n${compNome}`;
  if (descritoresTexto) user += `\n\n═══ DESCRITORES ═══\n${descritoresTexto}`;
  user += `\n\n═══ CENÁRIO ═══\nTítulo: ${cen.titulo}\nContexto: ${cen.descricao}`;
  if (faceta) user += `\nFaceta testada: ${faceta}`;
  if (tradeoff) user += `\nTrade-off: ${tradeoff}`;
  if (armadilha) user += `\nArmadilha anti-genérico: ${armadilha}`;
  if (riscos) user += `\nRiscos declarados: ${riscos}`;
  user += `\n\n═══ PERGUNTAS ═══\n${perguntasTexto}`;
  if (mapaCobertura) user += `\n\n═══ MAPA DE COBERTURA ═══\n${mapaCobertura}`;
  if (pppResumo) user += `\n\n═══ CONTEXTO PPP ═══\n${pppResumo}`;
  user += `\n\n═══ INSTRUÇÃO ═══\nSe o cenário for bem escrito mas metodologicamente fraco, PENALIZE. Prefira rigor metodológico a elegância textual.`;

  return { system, user };
}

/** Clamp erro_grave×nota + status derivado EM CÓDIGO (pura). */
export function normalizarResultadoCheckIA3(resultado: any): { resultado: any; statusCheck: string } | null {
  if (!resultado?.nota) return null;
  const out = { ...resultado };
  if (out.erro_grave && out.nota > 60) {
    console.warn(`[Check IA3] erro_grave=true mas nota=${out.nota}. Forçando max 60.`);
    out.nota = 60;
  }
  const statusCheck = out.nota >= 90 ? 'aprovado'
    : out.nota >= 80 ? 'aprovado_com_ressalvas'
    : 'revisar';
  return { resultado: out, statusCheck };
}

export async function persistirCheckIA3(sbRaw: any, cen: any, resultado: any, statusCheck: string):
  Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: cenLinhaChk } = await sbRaw.from('banco_cenarios').select('empresa_id').eq('id', cen.id).maybeSingle();
  const { data: updated, error: updErr } = await escopoTenantDaLinha(
    sbRaw.from('banco_cenarios').update({
    nota_check: resultado.nota,
    status_check: statusCheck,
    dimensoes_check: resultado.dimensoes || null,
    justificativa_check: resultado.justificativa || null,
    sugestao_check: resultado.sugestao || null,
    alertas_check: {
      alertas: resultado.alertas || [],
      ponto_mais_forte: resultado.ponto_mais_forte || null,
      ponto_mais_fraco: resultado.ponto_mais_fraco || null,
      descritores_sem_cobertura: resultado.descritores_sem_cobertura || [],
      perguntas_com_risco: resultado.perguntas_com_risco || [],
    },
    checked_at: new Date().toISOString(),
  }).eq('id', cen.id),
    cenLinhaChk,
  ).select('id, nota_check');

  if (updErr) return { ok: false, error: `Check UPDATE falhou: ${updErr.message} (cen.id: ${cen.id})` };
  if (!updated?.length) return { ok: false, error: `Check UPDATE: 0 linhas afetadas (cen.id: ${cen.id})` };
  return { ok: true };
}

/** Core síncrono do check (a action delega aqui). */
export async function checkCenarioIA3Core(sbRaw: any, args: {
  cenarioId?: string | null; empresaId?: string | null; cargo?: string | null;
  competenciaId?: string | null; modelo?: string | null;
}): Promise<{ success: boolean; error?: string; message?: string; nota?: number; status?: string }> {
  const { cenarioId, empresaId, cargo, competenciaId, modelo } = args;

  let cen;
  if (cenarioId) {
    const { data } = await sbRaw.from('banco_cenarios').select('*').eq('id', cenarioId).single();
    cen = data;
  } else if (empresaId && cargo && competenciaId) {
    const { data } = await sbRaw.from('banco_cenarios').select('*')
      .eq('empresa_id', empresaId).eq('cargo', cargo).eq('competencia_id', competenciaId)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    cen = data;
  }
  if (!cen) return { success: false, error: `Check: cenário não encontrado (cargo:${cargo}, comp:${competenciaId})` };

  const { system, user } = await montarCheckIA3Prompt(sbRaw, cen);
  // Fallback resolve pela task (ia3_check, pinned — default GPT 5.6 Terra).
  const { getModelForTask } = await import('@/lib/ai-tasks');
  const modeloResolvido = modelo || await getModelForTask(cen.empresa_id, 'ia3_check');
  const resposta = await callAI(system, user, { model: modeloResolvido }, 7000, { taskKey: 'ia3_check', empresaId: cen.empresa_id || undefined });
  const resultado = await extractJSON(resposta);

  const normed = normalizarResultadoCheckIA3(resultado);
  if (!normed) return { success: false, error: 'Validação não retornou resultado' };

  const p = await persistirCheckIA3(sbRaw, cen, normed.resultado, normed.statusCheck);
  if ('error' in p) return { success: false, error: p.error };

  return {
    success: true,
    message: `${cen.titulo}: ${normed.resultado.nota}pts (${normed.statusCheck})`,
    nota: normed.resultado.nota,
    status: normed.statusCheck,
  };
}

// ── Regeneração com TRAVA (champion/challenger) ─────────────────────────────
// Lição de 23/07 (UniAnchieta): regenerar SOBRESCREVIA a versão boa antes de
// conhecer a nota da nova — um 88pts virou 58pts com um clique. A regeneração
// agora gera a CANDIDATA em memória, audita, e só aplica se nota >= atual.

/** Trava (pura): regeneração NUNCA piora a nota medida. Sem nota atual → aplica. */
export function travaRegeneracao(notaAtual: unknown, notaCandidata: number): boolean {
  if (typeof notaAtual !== 'number') return true;
  return notaCandidata >= notaAtual;
}

/** Campos do check que o gerador lê como feedback (e que a auditoria persiste). */
export type FeedbackCheckIA3 = { justificativa_check?: any; sugestao_check?: any; alertas_check?: any };

/** Pura: o check vira o texto que o gerador recebe na regeneração (montagem histórica, sem mudança). */
export function montarFeedbackRegeneracaoIA3(chk: FeedbackCheckIA3): string {
  const alertas: any = (typeof chk.alertas_check === 'object' && chk.alertas_check) ? chk.alertas_check : {};
  const feedbackParts = [chk.justificativa_check, chk.sugestao_check];
  if (alertas.ponto_mais_fraco) feedbackParts.push(`Ponto mais fraco: ${alertas.ponto_mais_fraco}`);
  if (Array.isArray(alertas.descritores_sem_cobertura) && alertas.descritores_sem_cobertura.length) {
    feedbackParts.push(`Descritores sem cobertura: ${alertas.descritores_sem_cobertura.join(', ')}`);
  }
  if (Array.isArray(alertas.perguntas_com_risco)) {
    alertas.perguntas_com_risco.forEach((p: any) => {
      feedbackParts.push(`P${p.numero}: ${p.problema}. Sugestão: ${p.correcao_recomendada}`);
    });
  }
  return feedbackParts.filter(Boolean).join('\n');
}

export type CandidataIA3 =
  | { ok: false; error: string }
  | {
    ok: true;
    candidato: { empresa_id: string; competencia_id: string; cargo: string; titulo: string; descricao: string; alternativas: Record<string, any> };
    alternativas: Record<string, any>;
    normed: { resultado: any; statusCheck: string };
    /** true = a nota veio de um auditor diferente do da task: NÃO comparável com a do campeão (Terra). */
    escalaPropria: boolean;
    /** O que a auditoria persiste em `banco_cenarios` — e o que alimenta a PRÓXIMA rodada de feedback. */
    auditoria: {
      nota_check: number; status_check: string; dimensoes_check: any; justificativa_check: any; sugestao_check: any;
      alertas_check: Record<string, any>;
    };
  };

/**
 * Gera a CANDIDATA a partir do feedback e a audita (2ª IA) EM MEMÓRIA — não escreve nada.
 * `cen` dá a identidade (empresa/cargo/competência/PPP); `feedbackDe` dá o feedback e
 * por padrão é o próprio check de `cen`. Separar os dois é o que permite encadear
 * rodadas: a 2ª rodada recebe o feedback da auditoria da candidata da 1ª, sem passar
 * pelo banco. Fonte única de `regenerarCenarioIA3ComTrava` e do experimento de retentativa.
 */
export async function gerarEAuditarCandidataIA3(sbRaw: any, args: {
  cen: any; feedbackDe?: FeedbackCheckIA3; aiConfig?: AIConfig;
  /** true = prompt da geração ORIGINAL (sem o bloco REGRAS DA REGENERAÇÃO). Default false: é regeneração. */
  inicial?: boolean;
  /**
   * Auditor ESPECÍFICO desta candidata (modelo). Default: o da task `ia3_check` (Terra, OpenAI). Obrigatório
   * quando o gerador é da família do Terra: gerador e auditor de famílias diferentes. A nota resultante está
   * na régua DESSE auditor, que não é a do Terra — ver `escalaPropria`.
   */
  auditor?: string;
}): Promise<CandidataIA3> {
  const { cen } = args;
  const aiConfig = await resolverAiConfigGeracaoIA3(cen.empresa_id, args.aiConfig ?? {});
  const feedbackExtra = montarFeedbackRegeneracaoIA3(args.feedbackDe ?? cen);

  const mc = await montarContextoIA3(sbRaw, cen.empresa_id, cen.cargo, cen.competencia_id, cen.ppp_escola_id ?? null);
  if (!('ctx' in mc)) return { ok: false, error: mc.error };
  const { empresa, comp, descritores, contextoPPP, valores, cargoDetalhe, gabCIS } = mc.ctx;

  const system = buildIA3SystemPrompt();
  let user = buildIA3UserPrompt(empresa, cen.cargo, cargoDetalhe, comp, descritores, valores, contextoPPP, gabCIS);
  if (feedbackExtra) user += `\n\nFEEDBACK DA REVISÃO ANTERIOR (CORRIJA ESTES PONTOS):\n${feedbackExtra}`;
  // Anti-inflação (medido 23/07: a 2ª rodada estourou contenção ao "corrigir
  // adicionando"): os limites de sobriedade valem MESMO cobrindo críticas.
  if (!args.inicial) user += `\n\n═══ REGRAS DA REGENERAÇÃO ═══
1. Corrigir NÃO é adicionar: prefira REMOVER/enxugar a acrescentar.
2. Os limites de sobriedade são inegociáveis: contexto ≤900 caracteres (conte antes de finalizar), máx 2 tensões, máx 2 stakeholders.
3. Se o feedback pedir mais cobertura, obtenha-a REFORMULANDO perguntas — nunca inflando o contexto.`;

  const resposta = await callAI(system, user, aiConfig, IA3_MAX_TOKENS_GERACAO, { taskKey: 'ia3_cenarios', timeoutMs: IA3_TIMEOUT_GERACAO_MS, empresaId: cen.empresa_id });
  const resultado = await extractJSON(resposta);
  const norm = resultado ? validarRespostaIA3(resultado, descritores.length) : null;
  if (!norm) return { ok: false, error: 'IA não retornou cenário válido — NADA foi alterado (a versão atual continua valendo)' };

  const alternativas = montarAlternativasIA3(resultado, norm.cen, norm.perguntas, descritores);
  const candidato = {
    empresa_id: cen.empresa_id,
    competencia_id: cen.competencia_id,
    cargo: cen.cargo,
    titulo: norm.cen.titulo || norm.titulo,
    descricao: norm.cen.contexto || norm.contexto,
    alternativas,
  };

  // Audita a CANDIDATA em memória (2ª IA, modelo da task ia3_check)
  const { system: sysChk, user: userChk } = await montarCheckIA3Prompt(sbRaw, candidato);
  const { getModelForTask } = await import('@/lib/ai-tasks');
  const checkModelo = args.auditor || await getModelForTask(cen.empresa_id, 'ia3_check');
  const respChk = await callAI(sysChk, userChk, { model: checkModelo }, 7000, { taskKey: 'ia3_check', empresaId: cen.empresa_id });
  const normed = normalizarResultadoCheckIA3(await extractJSON(respChk));
  if (!normed) return { ok: false, error: 'Auditoria da candidata falhou — NADA foi alterado (a versão atual continua valendo)' };

  const r = normed.resultado;
  return {
    ok: true, candidato, alternativas, normed, escalaPropria: !!args.auditor,
    auditoria: {
      nota_check: r.nota,
      status_check: normed.statusCheck,
      dimensoes_check: r.dimensoes || null,
      justificativa_check: r.justificativa || null,
      sugestao_check: r.sugestao || null,
      alertas_check: {
        alertas: r.alertas || [],
        ponto_mais_forte: r.ponto_mais_forte || null,
        ponto_mais_fraco: r.ponto_mais_fraco || null,
        descritores_sem_cobertura: r.descritores_sem_cobertura || [],
        perguntas_com_risco: r.perguntas_com_risco || [],
        // Rastro de QUEM mediu: duas réguas diferentes não se comparam sem saber de quem é cada nota.
        auditor: checkModelo,
        gerador: (aiConfig as any)?.model ?? null,
      },
    },
  };
}

export async function regenerarCenarioIA3ComTrava(sbRaw: any, args: {
  cenarioId: string; aiConfig?: AIConfig;
}): Promise<{
  success: boolean; error?: string; message?: string;
  aplicado?: boolean; nota?: number; notaAnterior?: number | null; status?: string;
}> {
  const { cenarioId, aiConfig = {} } = args;

  const { data: cen } = await sbRaw.from('banco_cenarios').select('*').eq('id', cenarioId).single();
  if (!cen) return { success: false, error: 'Cenário não encontrado' };
  if (!cen.empresa_id) return { success: false, error: 'Cenário sem empresa_id (catálogo nacional)' };

  const cand = await gerarEAuditarCandidataIA3(sbRaw, { cen, aiConfig });
  // `strict: false` não estreita união discriminada por `ok`: o cast é o estreitamento.
  if (!cand.ok) return { success: false, error: (cand as { ok: false; error: string }).error };
  const { candidato, alternativas, normed, auditoria } = cand;

  const notaAnterior: number | null = typeof cen.nota_check === 'number' ? cen.nota_check : null;
  const notaCandidata = normed.resultado.nota;

  if (!travaRegeneracao(cen.nota_check, notaCandidata)) {
    return {
      success: true, aplicado: false, nota: notaCandidata, notaAnterior,
      message: `Regeneração DESCARTADA: candidata ${notaCandidata}pts < atual ${notaAnterior}pts — mantida a versão atual (trava: nunca piora).`,
    };
  }

  // Aplica: conteúdo + auditoria da candidata numa escrita só (tenant-scoped)
  const { error: updErr } = await sbRaw.from('banco_cenarios').update({
    titulo: candidato.titulo,
    descricao: candidato.descricao,
    alternativas,
    ...auditoria,
    // Guarda o conteúdo que está sendo substituído (ver `versoesComAnteriorIA3`).
    alertas_check: { ...auditoria.alertas_check, versoes_anteriores: versoesComAnteriorIA3(cen) },
    checked_at: new Date().toISOString(),
  }).eq('id', cen.id).eq('empresa_id', cen.empresa_id);
  if (updErr) return { success: false, error: `Regeneração: UPDATE falhou (${updErr.message}) — versão anterior preservada` };

  return {
    success: true, aplicado: true, nota: notaCandidata, notaAnterior, status: normed.statusCheck,
    message: `Regenerado: ${notaCandidata}pts (${normed.statusCheck})${notaAnterior != null ? ` — antes ${notaAnterior}pts` : ''}.`,
  };
}

// ── Regeneração AUTOMÁTICA até o limiar ─────────────────────────────────────
// Decisão de 01/10/2026 (dono) sobre medição na Amazon Bowling (66 cenários):
//   · gatilho nota < 80 (e não < 90: só 7,6% chegavam a 90 mesmo com 2 tentativas, e em
//     80-89 o ganho é indistinguível do ruído de ±2 do check);
//   · feedback do CAMPEÃO a cada rodada, com a trava (nunca piora) — "do zero" sem
//     feedback foi pior nos três modelos testados;
//   · gerador = a task `ia3_cenarios` (hoje Sonnet 5.5), sem escada para modelo maior:
//     o Opus 5.5 não superou o Sonnet 5.5 e custa ~2,3x.
// Quem sai abaixo do limiar depois das rodadas NÃO é entregue por este código como
// "resolvido": fica com `alertas_check.regeneracao_auto.esgotado = true`, para a tela
// listar e uma pessoa decidir. Sem coluna nova: o registro vive em `alertas_check`.

export const IA3_LIMIAR_APROVACAO = 80;
/**
 * SNAPSHOT do conteúdo anterior antes de qualquer regeneração que SOBRESCREVE o cenário.
 * Em 01/10/2026 regenerei 52 cenários da Amazon Bowling sem guardar o texto: `banco_cenarios` não tem
 * histórico (nem PITR), e quando o dono quis comparar "antes e depois" o "antes" já não existia. A trava
 * "nunca piora" protege a NOTA; não protege o texto que alguém queria rever. As versões vão em
 * `alertas_check.versoes_anteriores` (mais recente primeiro, no máximo `IA3_MAX_VERSOES_ANTERIORES`), na
 * própria linha — sem migration e sem depender de arquivo, que a Vercel e o Trigger não têm.
 * Fica de fora o `alertas_check` do snapshot, para o histórico não aninhar a si mesmo.
 */
export const IA3_MAX_VERSOES_ANTERIORES = 3;

export function versoesComAnteriorIA3(cen: any): any[] {
  const ac: any = (cen?.alertas_check && typeof cen.alertas_check === 'object') ? cen.alertas_check : {};
  const historico: any[] = Array.isArray(ac.versoes_anteriores) ? ac.versoes_anteriores : [];
  const atual = {
    versao_de: cen?.checked_at ?? cen?.updated_at ?? cen?.created_at ?? null,
    guardada_em: new Date().toISOString(),
    titulo: cen?.titulo ?? null,
    descricao: cen?.descricao ?? null,
    alternativas: cen?.alternativas ?? null,
    nota_check: typeof cen?.nota_check === 'number' ? cen.nota_check : null,
    status_check: cen?.status_check ?? null,
    auditor: ac.auditor ?? null,
    gerador: ac.gerador ?? null,
  };
  return [atual, ...historico].slice(0, IA3_MAX_VERSOES_ANTERIORES);
}

/**
 * Auditor dos degraus em que o GERADOR é da família OpenAI (a do Terra): Claude, outra família. Decisão do
 * dono (01/10/2026): "sol com sonnet >= 80" — a aprovação desses degraus é Sonnet >= 80, SEM o Terra. A régua do
 * Sonnet é mais dura no topo que a do Terra (só 3 de 66 cenários originais passam de 80 nela), então é um
 * critério mais exigente, não mais frouxo; mas por não ser a mesma régua, a nota dele não se compara com a do
 * campeão (ver `escalaPropria`).
 */
export const IA3_AUDITOR_PARA_GPT = 'claude-sonnet-5-5';
export const IA3_MAX_RODADAS_AUTO = 3;

export type RodadaAutoIA3 = { rodada: number; ok: boolean; nota?: number; promovida?: boolean; erro?: string };

/**
 * Pura: orquestra as rodadas. `gerar` produz UMA candidata auditada a partir do feedback
 * do campeão atual. Para ao atingir o limiar ou ao esgotar `maxRodadas`; falha de uma
 * rodada gasta a rodada e segue. A trava só promove candidata que não piora.
 */
export async function rodarRetentativasIA3<C>(args: {
  notaInicial: number | null | undefined;
  feedbackInicial: any;
  limiar: number;
  maxRodadas: number;
  gerar: (feedbackDoCampeao: any) => Promise<{ ok: true; nota: number; cand: C; feedback: any; absoluta?: boolean } | { ok: false; erro: string }>;
}): Promise<{ campeao: C | null; notaFinal: number | null; rodadas: RodadaAutoIA3[]; atingiuLimiar: boolean; feedbackFinal: any }> {
  let nota: number | null = typeof args.notaInicial === 'number' ? args.notaInicial : null;
  let feedback = args.feedbackInicial;
  let campeao: C | null = null;
  const rodadas: RodadaAutoIA3[] = [];
  const noLimiar = () => typeof nota === 'number' && nota >= args.limiar;

  for (let k = 1; k <= args.maxRodadas && !noLimiar(); k++) {
    let r: Awaited<ReturnType<typeof args.gerar>>;
    try { r = await args.gerar(feedback); }
    catch (e: any) { r = { ok: false, erro: String(e?.message || e).slice(0, 160) }; }
    if (!r.ok) { rodadas.push({ rodada: k, ok: false, erro: (r as { ok: false; erro: string }).erro }); continue; }
    const boa = r as { ok: true; nota: number; cand: C; feedback: any; absoluta?: boolean };
    // `absoluta` = nota de OUTRO auditor (outra régua): não se compara com a do campeão. Só vale se
    // atingir o limiar NA RÉGUA DELE; senão a candidata é descartada e o campeão (na régua do Terra) fica.
    const promovida = boa.absoluta ? boa.nota >= args.limiar : travaRegeneracao(nota, boa.nota);
    rodadas.push({ rodada: k, ok: true, nota: boa.nota, promovida });
    if (promovida) { campeao = boa.cand; nota = boa.nota; feedback = boa.feedback; }
  }
  return { campeao, notaFinal: nota, rodadas, atingiuLimiar: noLimiar(), feedbackFinal: feedback };
}

/**
 * ESCADA de geradores (decisão de 01/10/2026): "todo cenário precisa chegar a >= 80 SEM criação humana".
 * Cada degrau é um modelo/estratégia; o campeão (melhor nota promovida) atravessa os degraus. Medido na
 * Amazon Bowling nos 14 cenários que o Sonnet 4.6 não resolvia: Sonnet 5.5 com feedback 14/14 em <=2
 * rodadas; GPT 6.1 Sol DO ZERO 14/14 já na 1ª rodada; Opus 5.5 13/14; Gemini 3.8 Flash 14/16; Kimi K3
 * lento (224 s) e com erros — fora.
 *  1. Sonnet 5.5 (a task `ia3_cenarios`) com feedback, 3 rodadas — o barato e o que já resolve a maioria.
 *  2. GPT 6.1 Sol DO ZERO, 3 rodadas (outra família, outro provedor, sem herdar o texto que falhou),
 *     AUDITADO PELO SONNET 5.5: aprovado = Sonnet >= 80, sem Terra (gerador e auditor de famílias diferentes).
 *  3. Opus 5.5 com feedback, 2 rodadas — último degrau Claude.
 * Timeout/erro de um degrau gasta a rodada e segue (o GPT 6.1 Sol deu timeout em 2 de 27 gerações).
 */
export type DegrauIA3 = { id: string; modelo: 'task' | string; rodadas: number; comFeedback: boolean; auditor?: string };

export const ESCADA_IA3: DegrauIA3[] = [
  { id: 'sonnet-feedback', modelo: 'task', rodadas: 3, comFeedback: true },
  { id: 'gpt-do-zero', modelo: 'gpt-6.1-sol', rodadas: 3, comFeedback: false, auditor: IA3_AUDITOR_PARA_GPT },
  { id: 'opus-feedback', modelo: 'claude-opus-5-5', rodadas: 2, comFeedback: true },
];

export type RodadaEscadaIA3 = RodadaAutoIA3 & { degrau: string; modelo: string };

/** Pura: percorre os degraus levando o campeão e o feedback dele; para ao atingir o limiar. */
export async function rodarEscadaIA3<C>(args: {
  notaInicial: number | null | undefined;
  feedbackInicial: any;
  limiar: number;
  degraus: DegrauIA3[];
  gerar: (degrau: DegrauIA3, feedbackDoCampeao: any) => Promise<{ ok: true; nota: number; cand: C; feedback: any; absoluta?: boolean } | { ok: false; erro: string }>;
}): Promise<{ campeao: C | null; notaFinal: number | null; rodadas: RodadaEscadaIA3[]; atingiuLimiar: boolean; degrauFinal: string | null }> {
  let nota: number | null = typeof args.notaInicial === 'number' ? args.notaInicial : null;
  let feedback = args.feedbackInicial;
  let campeao: C | null = null;
  let degrauFinal: string | null = null;
  const rodadas: RodadaEscadaIA3[] = [];
  let atingiu = typeof nota === 'number' && nota >= args.limiar;

  for (const degrau of args.degraus) {
    if (atingiu) break;
    const r = await rodarRetentativasIA3<C>({
      notaInicial: nota, feedbackInicial: feedback, limiar: args.limiar, maxRodadas: degrau.rodadas,
      // Sem feedback ("do zero"): a geração não vê o texto reprovado nem o parecer do auditor.
      gerar: (fb) => args.gerar(degrau, degrau.comFeedback ? fb : {}),
    });
    for (const x of r.rodadas) rodadas.push({ ...x, degrau: degrau.id, modelo: degrau.modelo });
    if (r.campeao) {
      campeao = r.campeao; degrauFinal = degrau.id;
    }
    // O campeão (e o feedback dele) atravessa o degrau: o seguinte parte do melhor que existe.
    feedback = r.feedbackFinal;
    nota = r.notaFinal;
    atingiu = r.atingiuLimiar;
  }
  return { campeao, notaFinal: nota, rodadas, atingiuLimiar: atingiu, degrauFinal };
}

/**
 * Núcleo headless (lib, fora de 'use server'): regenera UM cenário até a nota atingir o
 * limiar, com no máximo `maxRodadas`. Demorado (cada rodada ≈ 40-90 s) — serve a task
 * Trigger e a scripts; a tela, com o teto de request da Vercel, chama `regenerarCenario`
 * (1 rodada) várias vezes. Idempotente: nota já no limiar, ou cenário já marcado
 * `esgotado`, não gasta nada (a menos que `forcar`).
 */
export async function regenerarAteLimiarIA3(sbRaw: any, args: {
  cenarioId: string; aiConfig?: AIConfig; limiar?: number; maxRodadas?: number; degraus?: DegrauIA3[]; forcar?: boolean;
}): Promise<{
  success: boolean; error?: string; message?: string; pulado?: string;
  notaInicial?: number | null; notaFinal?: number | null; atingiuLimiar?: boolean; rodadas?: RodadaEscadaIA3[];
}> {
  const limiar = args.limiar ?? IA3_LIMIAR_APROVACAO;

  const { data: cen, error: errLeitura } = await sbRaw.from('banco_cenarios').select('*').eq('id', args.cenarioId).single();
  if (errLeitura && !cen) return { success: false, error: `Cenário não encontrado (${errLeitura.message})` };
  if (!cen) return { success: false, error: 'Cenário não encontrado' };
  if (!cen.empresa_id) return { success: false, error: 'Cenário sem empresa_id (catálogo nacional)' };
  if (typeof cen.nota_check !== 'number') return { success: true, pulado: 'sem nota: rode o check antes', notaInicial: null };
  if (cen.nota_check >= limiar) return { success: true, pulado: 'já no limiar', notaInicial: cen.nota_check, notaFinal: cen.nota_check, atingiuLimiar: true };
  const jaTentado = (cen.alertas_check as any)?.regeneracao_auto?.esgotado === true;
  if (jaTentado && !args.forcar) return { success: true, pulado: 'tentativas automáticas já esgotadas', notaInicial: cen.nota_check, notaFinal: cen.nota_check, atingiuLimiar: false };

  const aiConfig = await resolverAiConfigGeracaoIA3(cen.empresa_id, args.aiConfig ?? {});
  // `maxRodadas` explícito = só o 1º degrau (teste/script); o default é a escada inteira.
  const degraus = args.degraus ?? (args.maxRodadas ? [{ ...ESCADA_IA3[0], rodadas: args.maxRodadas }] : ESCADA_IA3);
  const r = await rodarEscadaIA3<Extract<CandidataIA3, { ok: true }>>({
    notaInicial: cen.nota_check, feedbackInicial: cen, limiar, degraus,
    gerar: async (degrau, feedback) => {
      const cfg = degrau.modelo === 'task' ? aiConfig : { ...aiConfig, model: degrau.modelo };
      const c = await gerarEAuditarCandidataIA3(sbRaw, { cen, feedbackDe: feedback, aiConfig: cfg, auditor: degrau.auditor });
      if (!c.ok) return { ok: false, erro: (c as { ok: false; error: string }).error };
      const boa = c as Extract<CandidataIA3, { ok: true }>;
      return { ok: true, nota: boa.normed.resultado.nota, cand: boa, feedback: boa.auditoria, absoluta: boa.escalaPropria };
    },
  });

  const meta = {
    tentativas: r.rodadas.length,
    notas: r.rodadas.map((x) => x.nota ?? null),
    degraus: r.rodadas.map((x) => `${x.degrau}${x.ok ? '' : ':erro'}`),
    promovidas: r.rodadas.filter((x) => x.promovida).length,
    degrauFinal: r.degrauFinal,
    modelo: aiConfig.model, limiar,
    atingiuLimiar: r.atingiuLimiar, esgotado: !r.atingiuLimiar,
    em: new Date().toISOString(),
  };

  if (r.campeao) {
    const { candidato, alternativas, auditoria } = r.campeao;
    const { error } = await sbRaw.from('banco_cenarios').update({
      titulo: candidato.titulo, descricao: candidato.descricao, alternativas,
      ...auditoria,
      // Guarda o conteúdo que está sendo substituído (ver `versoesComAnteriorIA3`).
      alertas_check: { ...auditoria.alertas_check, regeneracao_auto: meta, versoes_anteriores: versoesComAnteriorIA3(cen) },
      checked_at: new Date().toISOString(),
    }).eq('id', cen.id).eq('empresa_id', cen.empresa_id);
    if (error) return { success: false, error: `Regeneração automática: UPDATE falhou (${error.message}) — versão anterior preservada` };
  } else {
    // Nenhuma candidata promovida: o conteúdo fica; só registra que as tentativas foram gastas.
    const { error } = await sbRaw.from('banco_cenarios').update({
      alertas_check: { ...((cen.alertas_check && typeof cen.alertas_check === 'object') ? cen.alertas_check : {}), regeneracao_auto: meta },
    }).eq('id', cen.id).eq('empresa_id', cen.empresa_id);
    if (error) return { success: false, error: `Regeneração automática: registro das tentativas falhou (${error.message})` };
  }

  return {
    success: true, notaInicial: cen.nota_check, notaFinal: r.notaFinal, atingiuLimiar: r.atingiuLimiar, rodadas: r.rodadas,
    message: `${cen.nota_check} → ${r.notaFinal}pts em ${r.rodadas.length} rodada(s)${r.atingiuLimiar ? '' : ` — abaixo de ${limiar}: revisão humana`}.`,
  };
}
