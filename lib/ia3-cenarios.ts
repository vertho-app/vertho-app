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

// ── Prompts (movidos VERBATIM de fase1.ts) ──────────────────────────────────

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

9. ANONIMIZAÇÃO DE INSTITUIÇÕES (OBRIGATÓRIO)
   NUNCA use o nome REAL — nem invente nome PRÓPRIO — de escola, rede,
   secretaria ou cidade. Situe o caso de forma GENÉRICA, preservando o contexto
   regional do PPP sem identificar (ex.: "uma escola da rede municipal no
   sertão da Bahia", "a Secretaria Municipal de Educação", "o município", "uma
   escola urbana da rede"). O contexto real do PPP serve APENAS para dar
   realismo pedagógico — jamais para nomear a instituição. Personagens (pessoas)
   seguem com nomes próprios fictícios brasileiros, como já previsto.

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

export function buildIA3UserPrompt(empresa: any, cargoNome: string, cargoDetalhe: any, comp: any, descritores: any[], valores: string[], contextoPPP: string, gabCIS: any): string {
  const blocks: string[] = [];

  blocks.push(`═══ EMPRESA ═══
Nome: ${empresa.nome}
Segmento: ${empresa.segmento || 'Não informado'}`);

  blocks.push(`═══ CARGO ═══
Cargo: ${cargoNome}`);

  if (cargoDetalhe.descricao || cargoDetalhe.principais_entregas || cargoDetalhe.stakeholders || cargoDetalhe.decisoes_recorrentes || cargoDetalhe.tensoes_comuns) {
    let ctx = '═══ CONTEXTO ORGANIZACIONAL ═══';
    if (cargoDetalhe.descricao) ctx += `\nDescrição do cargo: ${cargoDetalhe.descricao}`;
    if (cargoDetalhe.principais_entregas) ctx += `\nPrincipais entregas: ${cargoDetalhe.principais_entregas}`;
    if (cargoDetalhe.stakeholders) ctx += `\nStakeholders: ${cargoDetalhe.stakeholders}`;
    if (cargoDetalhe.decisoes_recorrentes) ctx += `\nDecisões recorrentes: ${cargoDetalhe.decisoes_recorrentes}`;
    if (cargoDetalhe.tensoes_comuns) ctx += `\nTensões e situações difíceis: ${cargoDetalhe.tensoes_comuns}`;
    blocks.push(ctx);
  }

  blocks.push(`═══ COMPETÊNCIA-ALVO ═══
Código: ${comp.cod_comp || '—'}
Nome: ${comp.nome}
${comp.descricao ? `Descrição: ${comp.descricao}` : ''}`);

  if (descritores.length > 0) {
    let desc = `═══ DESCRITORES DA COMPETÊNCIA (${descritores.length}) ═══`;
    descritores.forEach((d: any, i: number) => {
      desc += `\nD${i + 1}: ${d.cod_desc} — ${d.nome_curto || d.descritor_completo || ''}`;
      if (d.n1_gap) desc += `\n  N1 (Gap): ${d.n1_gap}`;
      if (d.n2_desenvolvimento) desc += `\n  N2 (Desenvolvimento): ${d.n2_desenvolvimento}`;
      if (d.n3_meta) desc += `\n  N3 (Meta): ${d.n3_meta}`;
      if (d.n4_referencia) desc += `\n  N4 (Referência): ${d.n4_referencia}`;
    });
    blocks.push(desc);
  }

  blocks.push(`═══ VALORES ORGANIZACIONAIS ═══\n${valores.join(', ')}`);

  if (gabCIS) {
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
    blocks.push(perfil);
  }

  if (contextoPPP) {
    blocks.push(`═══ CONTEXTO PPP / DOSSIÊ ═══\n${contextoPPP.slice(0, 3000)}`);
  }

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

  const { data: descritores } = await tdb.from('competencias')
    .select('cod_desc, nome_curto, descritor_completo, n1_gap, n2_desenvolvimento, n3_meta, n4_referencia')
    .eq('cod_comp', comp.cod_comp)
    .not('cod_desc', 'is', null);

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

export function montarAlternativasIA3(resultado: any, cen: any, perguntas: any[]): Record<string, any> {
  return {
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
  const delQuery = tdb.from('banco_cenarios').delete()
    .eq('competencia_id', args.compId)
    .eq('cargo', args.cargoNome);
  await (args.pppEscolaId ? delQuery.eq('ppp_escola_id', args.pppEscolaId) : delQuery.is('ppp_escola_id', null));

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
  const { empresaId, cargoNome, competenciaId, pppEscolaId = null, aiConfig = {} } = args;

  const mc = await montarContextoIA3(sbRaw, empresaId, cargoNome, competenciaId, pppEscolaId);
  if (!('ctx' in mc)) return { success: false, error: mc.error };
  const { tdb, empresa, comp, descritores, contextoPPP, valores, cargoDetalhe, gabCIS } = mc.ctx;

  const system = buildIA3SystemPrompt();
  const user = buildIA3UserPrompt(empresa, cargoNome, cargoDetalhe, comp, descritores, valores, contextoPPP, gabCIS);

  let resposta = await callAI(system, user, aiConfig, 6144, { taskKey: 'ia3_cenarios' });
  let resultado = await extractJSON(resposta);
  if (!resultado) return { success: false, error: 'IA não retornou JSON válido' };

  let norm = validarRespostaIA3(resultado, descritores.length);
  if (!norm) return { success: false, error: 'IA não retornou cenário válido' };

  // Retry se erros críticos (mesma mecânica do síncrono original)
  if (norm.errors.length > 0) {
    console.warn(`[IA3] ${comp.nome}: validação (${norm.errors.join('; ')}). Retry.`);
    const retryUser = user + `\n\n═══ ATENÇÃO: CORREÇÃO NECESSÁRIA ═══\n${norm.errors.join('\n')}\nCorrija e retorne JSON válido.`;
    resposta = await callAI(system, retryUser, aiConfig, 6144, { taskKey: 'ia3_cenarios' });
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

  const alternativas = montarAlternativasIA3(resultado, norm.cen, norm.perguntas);
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

  let compNome = '';
  let descritoresTexto = '';
  if (cen.competencia_id) {
    const sbForComp = tdb || sbRaw;
    const { data: comp } = await sbForComp.from('competencias')
      .select('nome, cod_comp, descricao')
      .eq('id', cen.competencia_id)
      .single();
    if (comp) compNome = comp.nome;

    const { data: descs } = await sbForComp.from('competencias')
      .select('cod_desc, nome_curto, descritor_completo')
      .eq('cod_comp', comp?.cod_comp)
      .not('cod_desc', 'is', null);
    if (descs?.length) {
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

  const alt = typeof cen.alternativas === 'string' ? JSON.parse(cen.alternativas) : (cen.alternativas || {});
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
  const resposta = await callAI(system, user, { model: modeloResolvido }, 4096, { taskKey: 'ia3_check', empresaId: cen.empresa_id || undefined });
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

  // Feedback enriquecido do check atual (mesma montagem histórica)
  const alertas = typeof cen.alertas_check === 'object' ? (cen.alertas_check || {}) : {};
  const feedbackParts = [cen.justificativa_check, cen.sugestao_check];
  if (alertas.ponto_mais_fraco) feedbackParts.push(`Ponto mais fraco: ${alertas.ponto_mais_fraco}`);
  if (Array.isArray(alertas.descritores_sem_cobertura) && alertas.descritores_sem_cobertura.length) {
    feedbackParts.push(`Descritores sem cobertura: ${alertas.descritores_sem_cobertura.join(', ')}`);
  }
  if (Array.isArray(alertas.perguntas_com_risco)) {
    alertas.perguntas_com_risco.forEach((p: any) => {
      feedbackParts.push(`P${p.numero}: ${p.problema}. Sugestão: ${p.correcao_recomendada}`);
    });
  }
  const feedbackExtra = feedbackParts.filter(Boolean).join('\n');

  const mc = await montarContextoIA3(sbRaw, cen.empresa_id, cen.cargo, cen.competencia_id, cen.ppp_escola_id ?? null);
  if (!('ctx' in mc)) return { success: false, error: mc.error };
  const { empresa, comp, descritores, contextoPPP, valores, cargoDetalhe, gabCIS } = mc.ctx;

  const system = buildIA3SystemPrompt();
  let user = buildIA3UserPrompt(empresa, cen.cargo, cargoDetalhe, comp, descritores, valores, contextoPPP, gabCIS);
  if (feedbackExtra) user += `\n\nFEEDBACK DA REVISÃO ANTERIOR (CORRIJA ESTES PONTOS):\n${feedbackExtra}`;
  // Anti-inflação (medido 23/07: a 2ª rodada estourou contenção ao "corrigir
  // adicionando"): os limites de sobriedade valem MESMO cobrindo críticas.
  user += `\n\n═══ REGRAS DA REGENERAÇÃO ═══
1. Corrigir NÃO é adicionar: prefira REMOVER/enxugar a acrescentar.
2. Os limites de sobriedade são inegociáveis: contexto ≤900 caracteres (conte antes de finalizar), máx 2 tensões, máx 2 stakeholders.
3. Se o feedback pedir mais cobertura, obtenha-a REFORMULANDO perguntas — nunca inflando o contexto.`;

  const resposta = await callAI(system, user, aiConfig, 6144, { taskKey: 'ia3_cenarios' });
  const resultado = await extractJSON(resposta);
  const norm = resultado ? validarRespostaIA3(resultado, descritores.length) : null;
  if (!norm) return { success: false, error: 'IA não retornou cenário válido — NADA foi alterado (a versão atual continua valendo)' };

  const alternativas = montarAlternativasIA3(resultado, norm.cen, norm.perguntas);
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
  const checkModelo = await getModelForTask(cen.empresa_id, 'ia3_check');
  const respChk = await callAI(sysChk, userChk, { model: checkModelo }, 4096, { taskKey: 'ia3_check', empresaId: cen.empresa_id });
  const normed = normalizarResultadoCheckIA3(await extractJSON(respChk));
  if (!normed) return { success: false, error: 'Auditoria da candidata falhou — NADA foi alterado (a versão atual continua valendo)' };

  const notaAnterior: number | null = typeof cen.nota_check === 'number' ? cen.nota_check : null;
  const notaCandidata = normed.resultado.nota;

  if (!travaRegeneracao(cen.nota_check, notaCandidata)) {
    return {
      success: true, aplicado: false, nota: notaCandidata, notaAnterior,
      message: `Regeneração DESCARTADA: candidata ${notaCandidata}pts < atual ${notaAnterior}pts — mantida a versão atual (trava: nunca piora).`,
    };
  }

  // Aplica: conteúdo + auditoria da candidata numa escrita só (tenant-scoped)
  const r = normed.resultado;
  const { error: updErr } = await sbRaw.from('banco_cenarios').update({
    titulo: candidato.titulo,
    descricao: candidato.descricao,
    alternativas,
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
    },
    checked_at: new Date().toISOString(),
  }).eq('id', cen.id).eq('empresa_id', cen.empresa_id);
  if (updErr) return { success: false, error: `Regeneração: UPDATE falhou (${updErr.message}) — versão anterior preservada` };

  return {
    success: true, aplicado: true, nota: notaCandidata, notaAnterior, status: normed.statusCheck,
    message: `Regenerado: ${notaCandidata}pts (${normed.statusCheck})${notaAnterior != null ? ` — antes ${notaAnterior}pts` : ''}.`,
  };
}
