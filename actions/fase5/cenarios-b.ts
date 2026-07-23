'use server';

import { tenantDb } from '@/lib/tenant-db';
import { mapComLimite } from '@/lib/concurrency';
import { callAI, type AIConfig } from '../ai-client';
import { extractJSON } from '../utils';
import { requireAdminAction } from '@/lib/auth/action-context';
import { requireAdminSupabase, requireEmpresaSupabase } from '@/lib/admin-supabase';
import { getModelForTask, DEFAULT_TASK_MODELS } from '@/lib/ai-tasks';
import { travaRegeneracao } from '@/lib/ia3-cenarios';
import { TEMP, type Fase5Config } from './_shared';

// System prompt do check de cenário B — harmonizado com o check do cenário A
const CHECK_CEN_B_SYSTEM = `Você é o auditor de qualidade do Cenário B da Vertho.

═══ TAREFA ═══
Auditar se o Cenário B funciona como INSTRUMENTO COMPLEMENTAR real ao Cenário A,
útil para triangulação na semana 14.

Um bom Cenário B não é apenas "plausível". Ele precisa ser metodologicamente
útil como SEGUNDO instrumento de medição da mesma competência.

═══ 8 DIMENSÕES (total 100 pontos) ═══

1. ADERÊNCIA À COMPETÊNCIA (15pts)
   O cenário avalia a competência indicada? A faceta faz sentido?

2. DIFERENÇA ESTRUTURAL VS CENÁRIO A (15pts)
   A diferença é REAL e metodológica? Ou apenas cosmética (nomes/contexto trocados)?

3. COMPLEMENTARIDADE (10pts)
   Observa faceta complementar relevante? Evita repetir núcleo de dilema do A?

4. REALISMO CONTEXTUAL (10pts)
   Plausível pro cargo? Sem caricatura? Máx 2 stakeholders?

5. CLAREZA DO TRADE-OFF (15pts)
   Existe escolha difícil real? Se pode responder bem sem escolher → penalize forte.

6. PODER DISCRIMINANTE (15pts)
   Diferencia N1-N4? Resposta vaga/genérica FALHA?

7. ADEQUAÇÃO DAS PERGUNTAS À SEM14 (10pts)
   P1=situação? P2=ação? P3=raciocínio? P4=autossensibilidade?

8. UTILIDADE PARA TRIANGULAÇÃO (10pts)
   Leitura útil quando combinado com acumulada + evidências das 13 semanas?
   Reduz risco de resposta ensaiada?

═══ ERROS GRAVES (nota máxima 60) ═══
- Cenário B repete estruturalmente o A
- Faceta principal é a mesma do A sem justificativa
- Trade-off inexistente ou muito fraco
- Resposta genérica suficiente pra "ir bem"
- Perguntas fora da lógica situação/ação/raciocínio/autossensibilidade
- Cenário pouco utilizável pra triangulação
- Competência avaliada não é a indicada
- Cenário teatral / sofisticado demais

═══ CLASSIFICAÇÃO ═══
90-100 = aprovado | 80-89 = aprovado_com_ressalvas | 0-79 = revisar

═══ FORMATO JSON ═══

{
  "nota": 85,
  "status": "aprovado_com_ressalvas",
  "erro_grave": false,
  "dimensoes": {
    "aderencia_competencia": 13,
    "diferenca_estrutural_vs_a": 12,
    "complementaridade": 8,
    "realismo_contextual": 9,
    "clareza_tradeoff": 13,
    "poder_discriminante": 13,
    "adequacao_sem14": 8,
    "utilidade_triangulacao": 9
  },
  "ponto_mais_forte": "...",
  "ponto_mais_fraco": "...",
  "problema_principal_vs_cenario_a": "em que o B falha como complemento do A",
  "riscos_de_triangulacao": ["risco 1"],
  "perguntas_com_risco": [{"numero": 2, "problema": "...", "correcao_recomendada": "..."}],
  "justificativa": "síntese objetiva (2-3 frases)",
  "sugestao": "principal ajuste recomendado",
  "alertas": []
}

REGRA: Se cenário for bem escrito mas metodologicamente fraco como
COMPLEMENTO do A, PENALIZE. Prefira rigor a elegância.`;

// Helper: busca descritores (linhas filhas em competencias com mesmo cod_comp).
// Recebe tdb (tenant-scoped) — empresa_id é injetado automaticamente.
async function fetchDescritoresTexto(tdb, codComp) {
  if (!codComp) return '';
  const { data: descs } = await tdb.from('competencias')
    .select('cod_desc, nome_curto, descritor_completo, n1_gap, n2_desenvolvimento, n3_meta, n4_referencia')
    .eq('cod_comp', codComp)
    .not('cod_desc', 'is', null);
  if (!descs?.length) return '';
  return descs.map((d, i) => `D${i + 1}: ${d.cod_desc} — ${d.nome_curto || ''}\nN1: ${d.n1_gap || ''}\nN2: ${d.n2_desenvolvimento || ''}\nN3: ${d.n3_meta || ''}\nN4: ${d.n4_referencia || ''}`).join('\n\n');
}

// Helper: monta prompts de geração de cenário B
function buildCenBPrompts(empresa: any, cenA: any, comp: any, descritoresTexto: string, pppContexto: string, feedbackExtra = ''): { system: string; user: string } {
  const system = `Você é um especialista em avaliação de competências comportamentais e design de instrumentos diagnósticos da Vertho.

═══ TAREFA ═══
Criar um CENÁRIO B complementar ao Cenário A já existente.
O Cenário B NÃO é "outro cenário". É um SEGUNDO INSTRUMENTO DE MEDIÇÃO
da mesma competência, útil para triangulação na semana 14.

═══ REGRAS INEGOCIÁVEIS ═══

1. MESMA COMPETÊNCIA, OUTRA SITUAÇÃO-GATILHO
   A diferença deve ser ESTRUTURAL, não cosmética (trocar nomes não conta).

2. COMPLEMENTARIDADE
   Observar uma FACETA COMPLEMENTAR da competência.
   Se o Cenário A testava faceta X, privilegiar faceta Y.
   Não repetir o mesmo núcleo de dilema com roupas novas.

3. UTILIDADE PARA TRIANGULAÇÃO
   Reduzir risco de resposta ensaiada. Gerar leitura comparável mas não redundante.

4. REALISMO CONTEXTUAL
   Plausível pro cargo. Linguagem real. Máx 2 stakeholders nomeados.
   Nomes brasileiros. Sem teatralidade.

5. DILEMA / TRADE-OFF
   Se pode responder bem sem escolher nada → cenário FALHOU.

6. PODER DISCRIMINANTE
   N1 visivelmente diferente de N3. Resposta genérica deve FALHAR.

7. ESTRUTURA DAS 4 PERGUNTAS
   P1 = situação / leitura do caso
   P2 = ação / decisão prática
   P3 = raciocínio / critério de escolha
   P4 = autossensibilidade / consciência de limite ou risco

8. DILEMA ÉTICO EMBUTIDO
   Tensão ética sutil e natural, não didática.

═══ FORMATO JSON (APENAS JSON, sem markdown) ═══

{
  "titulo": "título curto",
  "descricao": "texto do cenário (80-150 palavras)",
  "faceta_avaliada": "faceta principal observada",
  "facetas_secundarias": ["faceta 2", "faceta 3"],
  "diferenca_estrutural_vs_cenario_a": "o que muda de verdade vs Cenário A (1 frase)",
  "por_que_essa_variacao_importa": "por que útil para triangulação (1 frase)",
  "tradeoff_testado": "qual escolha difícil está no centro",
  "armadilha_de_resposta_generica": "por que resposta vaga não resolve",
  "stakeholders_centrais": ["Nome1", "Nome2"],
  "p1": "pergunta de situação",
  "p2": "pergunta de ação",
  "p3": "pergunta de raciocínio",
  "p4": "pergunta de autossensibilidade",
  "objetivo_diagnostico": {
    "p1": "o que P1 quer revelar",
    "p2": "o que P2 quer revelar",
    "p3": "o que P3 quer revelar",
    "p4": "o que P4 quer revelar"
  },
  "referencia_avaliacao": {
    "nivel_1": "como responderia N1",
    "nivel_2": "como responderia N2",
    "nivel_3": "como responderia N3",
    "nivel_4": "como responderia N4"
  },
  "dilema_etico_embutido": {
    "valor_testado": "valor em tensão",
    "caminho_facil": "solução mais fácil",
    "caminho_etico": "solução alinhada ao valor"
  },
  "confianca_cenario": 0.85,
  "riscos_do_cenario": ["risco 1", "risco 2"]
}`;

  // ── User prompt estruturado ──
  const blocks: string[] = [];

  blocks.push(`═══ EMPRESA ═══\nNome: ${empresa.nome}\nSegmento: ${empresa.segmento || 'Não informado'}`);
  blocks.push(`═══ CARGO ═══\n${cenA.cargo}`);
  blocks.push(`═══ COMPETÊNCIA ═══\nNome: ${comp.nome}\n${comp.descricao ? `Descrição: ${comp.descricao}` : ''}`);

  if (descritoresTexto) blocks.push(`═══ DESCRITORES / RÉGUA ═══\n${descritoresTexto}`);
  if (pppContexto) blocks.push(`═══ CONTEXTO PPP / DOSSIÊ ═══\n${pppContexto}`);

  // Cenário A com metadados se disponíveis
  const altA = typeof cenA.alternativas === 'object' && !Array.isArray(cenA.alternativas) ? cenA.alternativas : {};
  let cenABlock = `═══ CENÁRIO A ORIGINAL (NÃO repetir — crie algo ESTRUTURALMENTE DIFERENTE) ═══\nTítulo: ${cenA.titulo}\nDescrição: ${cenA.descricao}`;
  if (altA.faceta_testada_principal) cenABlock += `\nFaceta avaliada: ${altA.faceta_testada_principal}`;
  if (altA.tradeoff_testado) cenABlock += `\nTrade-off: ${altA.tradeoff_testado}`;
  blocks.push(cenABlock);

  blocks.push(`═══ INSTRUÇÃO ═══
Crie um Cenário B da mesma competência, mas com situação-gatilho ESTRUTURALMENTE diferente.
Não repita o mesmo núcleo do Cenário A com roupas novas.
O Cenário B deve ser útil para triangulação na semana 14.`);

  if (feedbackExtra) {
    blocks.push(`═══ FEEDBACK DA REVISÃO ANTERIOR (CORRIJA ESTES PONTOS) ═══\n${feedbackExtra}`);
  }

  return { system, user: blocks.join('\n\n') };
}

// Helper: busca PPP resumido (mesmo padrão do check cenário A).
// Recebe tdb tenant-scoped.
async function fetchPppResumo(tdb) {
  const { data: ppp } = await tdb.from('ppp_escolas')
    .select('extracao')
    .eq('status', 'extraido')
    .limit(1)
    .maybeSingle();
  if (!ppp?.extracao) return '';
  const ext = typeof ppp.extracao === 'string' ? JSON.parse(ppp.extracao) : ppp.extracao;
  return JSON.stringify(ext).slice(0, 500);
}

// Helper: roda check em 1 cenário B e persiste resultado.
// cenarioA é opcional — se passado, o auditor compara B vs A.
async function avaliarCenB(sb: any, cen: any, comp: any, descritoresTexto: string, pppResumo: string, modelo: string | null, cenarioA?: any) {
  const alt = typeof cen.alternativas === 'string' ? JSON.parse(cen.alternativas) : (cen.alternativas || {});
  const perguntas = [alt.p1 || cen.p1, alt.p2 || cen.p2, alt.p3 || cen.p3, alt.p4 || cen.p4].filter(Boolean);
  const perguntasTexto = perguntas.map((p: any, i: number) => {
    const texto = typeof p === 'string' ? p : p.texto || JSON.stringify(p);
    const obj = alt.objetivo_diagnostico?.[`p${i + 1}`] || '';
    return `P${i + 1}: ${texto}${obj ? `\n  Objetivo: ${obj}` : ''}`;
  }).join('\n\n');

  const blocks: string[] = [];
  blocks.push(`═══ CARGO ═══\n${cen.cargo}`);
  blocks.push(`═══ COMPETÊNCIA ═══\n${comp?.nome || 'N/D'}`);
  if (descritoresTexto) blocks.push(`═══ DESCRITORES / RÉGUA ═══\n${descritoresTexto}`);

  // Cenário A pra comparação
  if (cenarioA) {
    const altA = typeof cenarioA.alternativas === 'object' && !Array.isArray(cenarioA.alternativas) ? cenarioA.alternativas : {};
    let cenABlock = `═══ CENÁRIO A ORIGINAL (pra comparação) ═══\nTítulo: ${cenarioA.titulo}\nDescrição: ${cenarioA.descricao}`;
    if (altA.faceta_testada_principal || altA.faceta_avaliada) cenABlock += `\nFaceta: ${altA.faceta_testada_principal || altA.faceta_avaliada}`;
    if (altA.tradeoff_testado) cenABlock += `\nTrade-off: ${altA.tradeoff_testado}`;
    blocks.push(cenABlock);
  }

  // Cenário B completo
  let cenBBlock = `═══ CENÁRIO B GERADO ═══\nTítulo: ${cen.titulo}\nContexto: ${cen.descricao}`;
  if (alt.faceta_avaliada) cenBBlock += `\nFaceta: ${alt.faceta_avaliada}`;
  if (Array.isArray(alt.facetas_secundarias) && alt.facetas_secundarias.length) cenBBlock += `\nFacetas secundárias: ${alt.facetas_secundarias.join(', ')}`;
  if (alt.diferenca_estrutural_vs_cenario_a) cenBBlock += `\nDiferença vs A: ${alt.diferenca_estrutural_vs_cenario_a}`;
  if (alt.por_que_essa_variacao_importa) cenBBlock += `\nPor que importa: ${alt.por_que_essa_variacao_importa}`;
  if (alt.tradeoff_testado) cenBBlock += `\nTrade-off: ${alt.tradeoff_testado}`;
  if (alt.armadilha_de_resposta_generica) cenBBlock += `\nArmadilha anti-genérico: ${alt.armadilha_de_resposta_generica}`;
  if (typeof alt.confianca_cenario === 'number') cenBBlock += `\nConfiança: ${alt.confianca_cenario}`;
  if (Array.isArray(alt.riscos_do_cenario) && alt.riscos_do_cenario.length) cenBBlock += `\nRiscos: ${alt.riscos_do_cenario.join('; ')}`;
  blocks.push(cenBBlock);

  blocks.push(`═══ PERGUNTAS ═══\n${perguntasTexto}`);
  if (pppResumo) blocks.push(`═══ CONTEXTO PPP ═══\n${pppResumo}`);
  blocks.push(`═══ INSTRUÇÃO ═══\nAudite se o Cenário B funciona como instrumento COMPLEMENTAR real ao Cenário A.\nSe bem escrito mas metodologicamente fraco como complemento, PENALIZE.`);

  const user = blocks.join('\n\n');

  const resposta = await callAI(CHECK_CEN_B_SYSTEM, user, { model: modelo || DEFAULT_TASK_MODELS['cenarios_b_check'] }, 4096, { temperature: TEMP });
  const resultado = await extractJSON(resposta);
  if (!resultado?.nota) return { success: false, error: 'Check não retornou nota' };

  // Validar coerência erro_grave × nota (veredito EM CÓDIGO)
  if (resultado.erro_grave && resultado.nota > 60) resultado.nota = 60;

  const statusCheck = resultado.nota >= 90 ? 'aprovado'
    : resultado.nota >= 80 ? 'aprovado_com_ressalvas'
    : 'revisar';

  return { success: true as const, resultado, statusCheck };
}

/** Persiste o resultado do check numa row existente (shape do Cenário B). */
async function persistirCheckCenB(sb: any, cenId: string, resultado: any, statusCheck: string) {
  const { data: cenLinha } = await sb.from('banco_cenarios').select('empresa_id').eq('id', cenId).maybeSingle();
  const qChk0 = sb.from('banco_cenarios').update({
    nota_check: resultado.nota,
    status_check: statusCheck,
    dimensoes_check: resultado.dimensoes || null,
    justificativa_check: resultado.justificativa || null,
    sugestao_check: resultado.sugestao || null,
    alertas_check: {
      alertas: resultado.alertas || [],
      ponto_mais_forte: resultado.ponto_mais_forte || null,
      ponto_mais_fraco: resultado.ponto_mais_fraco || null,
      problema_principal_vs_cenario_a: resultado.problema_principal_vs_cenario_a || null,
      riscos_de_triangulacao: resultado.riscos_de_triangulacao || [],
      perguntas_com_risco: resultado.perguntas_com_risco || [],
    },
    checked_at: new Date().toISOString(),
  }).eq('id', cenId);
  await (cenLinha?.empresa_id ? qChk0.eq('empresa_id', cenLinha.empresa_id) : qChk0.is('empresa_id', null));
}

/** Avalia E persiste (contrato original — checks avulsos/lote usam este). */
async function runCheckOnCenB(sb: any, cen: any, comp: any, descritoresTexto: string, pppResumo: string, modelo: string | null, cenarioA?: any) {
  const av = await avaliarCenB(sb, cen, comp, descritoresTexto, pppResumo, modelo, cenarioA);
  if (!av.success) return av as any;
  await persistirCheckCenB(sb, cen.id, av.resultado, av.statusCheck);
  return { success: true, nota: av.resultado.nota, status: av.statusCheck };
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. GERAR CENÁRIOS B EM LOTE
// Cria cenários B customizados por cargo/competência (diferente do A)
// Inclui: dilema ético, faceta avaliada, validação Gemini
// ══════════════════════════════════════════════════════════════════════════════

export async function gerarCenariosBLote(empresaId: string, aiConfig: Fase5Config = {}) {
  // Gate TENANT-SCOPED (auditoria 23/07): lê PPP e escreve cenários — empresaId
  // do client precisa bater com o tenant da sessão.
  const sbRaw = await requireEmpresaSupabase(empresaId, 'content.manage');
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const tdb = tenantDb(empresaId);
  try {
    // empresas: id é o tenant — sem empresa_id; usar raw
    const { data: empresa } = await sbRaw.from('empresas')
      .select('nome, segmento').eq('id', empresaId).single();

    // Cenários A existentes — banco_cenarios é misto, mas filtramos por
    // empresa explicitamente, então tdb está OK (deduz pelo tenantId).
    const { data: cenariosA } = await tdb.from('banco_cenarios')
      .select('id, titulo, descricao, cargo, competencia_id')
      .or('tipo_cenario.is.null,tipo_cenario.neq.cenario_b');

    if (!cenariosA?.length) return { success: false, error: 'Nenhum cenário A encontrado. Rode IA3 primeiro.' };

    const compIdsNeeded = [...new Set(cenariosA.map(c => c.competencia_id).filter(Boolean))];
    const compMap = {};
    const descritoresMap = {};

    // Batch (era 1 query por competência) + descritores em pool de DB (8)
    const { data: compsRows } = compIdsNeeded.length
      ? await tdb.from('competencias').select('id, nome, descricao, cod_comp').in('id', compIdsNeeded)
      : { data: [] };
    for (const comp of compsRows || []) compMap[comp.id] = comp;
    await mapComLimite(Object.values(compMap) as any[], 8, async (comp: any) => {
      descritoresMap[comp.id] = await fetchDescritoresTexto(tdb, comp.cod_comp);
    });
    const compIds = Object.keys(compMap);

    // Já tem B?
    const { data: cenariosB } = await tdb.from('banco_cenarios')
      .select('competencia_id, cargo')
      .eq('tipo_cenario', 'cenario_b');
    const jaTemB = new Set((cenariosB || []).map(c => `${c.competencia_id}::${c.cargo}`));

    // PPP da empresa (contexto institucional para geração)
    const { data: ppps } = await tdb.from('ppp_escolas')
      .select('valores').limit(1);
    const pppContexto = ppps?.[0]?.valores ? JSON.stringify(ppps[0].valores) : '';

    // PPP resumo para o check (formato diferente — extração)
    const pppResumoCheck = await fetchPppResumo(tdb);

    const checkModel = aiConfig?.checkModel;
    // GERAÇÃO em paralelo (limite 3 — TPM de IA); cada item devolve um
    // marcador e os contadores são derivados no fim (semântica preservada).
    const marcadores = await mapComLimite(cenariosA as any[], 3, async (cenA: any) => {
      const key = `${cenA.competencia_id}::${cenA.cargo}`;
      if (jaTemB.has(key)) { return 'skip_ja_tem'; }

      const comp = compMap[cenA.competencia_id];
      if (!comp) { return 'skip_sem_comp'; }

      const descritoresTexto = descritoresMap[cenA.competencia_id] || '';
      const { system, user } = buildCenBPrompts(empresa, cenA, comp, descritoresTexto, pppContexto);
      let resultado = await callAI(system, user, aiConfig, 6144, { temperature: TEMP });
      let cenarioData = await extractJSON(resultado);

      // ── Validação pós-resposta ──
      if (cenarioData) {
        const errors: string[] = [];
        if (!cenarioData.p1 || !cenarioData.p2 || !cenarioData.p3 || !cenarioData.p4) errors.push('Faltam perguntas p1-p4');
        if (typeof cenarioData.confianca_cenario === 'number' && (cenarioData.confianca_cenario < 0 || cenarioData.confianca_cenario > 1)) errors.push('confianca fora de 0-1');
        if (Array.isArray(cenarioData.stakeholders_centrais) && cenarioData.stakeholders_centrais.length > 2) errors.push('Max 2 stakeholders');

        // Heurística de semelhança: overlap de palavras substantivas entre A e B
        const stopwords = new Set(['de','da','do','das','dos','em','na','no','nas','nos','um','uma','o','a','os','as','que','e','para','com','por','se','ao','ou','mais','não','como','mas','sua','seu','seus','suas','este','esta','esse','essa']);
        const extractWords = (t: string) => (t || '').toLowerCase().replace(/[^a-záàâãéèêíóòôõúç\s]/g, '').split(/\s+/).filter(w => w.length > 3 && !stopwords.has(w));
        const wordsA = new Set(extractWords(cenA.descricao));
        const wordsB = extractWords(cenarioData.descricao || '');
        const overlap = wordsB.filter(w => wordsA.has(w)).length;
        const overlapPct = wordsB.length > 0 ? overlap / wordsB.length : 0;
        if (overlapPct > 0.6) errors.push(`Semelhança excessiva com Cenário A (${Math.round(overlapPct * 100)}% overlap)`);

        if (errors.length > 0) {
          console.warn(`[CenB] ${comp.nome}: validação (${errors.join('; ')}). Retry.`);
          resultado = await callAI(system, user + `\n\n═══ CORREÇÃO NECESSÁRIA ═══\n${errors.join('\n')}`, aiConfig, 6144, { temperature: TEMP });
          const retry = await extractJSON(resultado);
          if (retry?.titulo) cenarioData = retry;
        }
      }

      if (!cenarioData?.titulo) return 'falha';

      // Persistência enriquecida
      const { data: inserted, error: insErr } = await tdb.from('banco_cenarios').insert({
        competencia_id: cenA.competencia_id,
        cargo: cenA.cargo,
        titulo: cenarioData.titulo,
        descricao: cenarioData.descricao,
        p1: cenarioData.p1,
        p2: cenarioData.p2,
        p3: cenarioData.p3,
        p4: cenarioData.p4,
        alternativas: {
          p1: cenarioData.p1,
          p2: cenarioData.p2,
          p3: cenarioData.p3,
          p4: cenarioData.p4,
          faceta_avaliada: cenarioData.faceta_avaliada || null,
          facetas_secundarias: cenarioData.facetas_secundarias || [],
          diferenca_estrutural_vs_cenario_a: cenarioData.diferenca_estrutural_vs_cenario_a || null,
          por_que_essa_variacao_importa: cenarioData.por_que_essa_variacao_importa || null,
          tradeoff_testado: cenarioData.tradeoff_testado || null,
          armadilha_de_resposta_generica: cenarioData.armadilha_de_resposta_generica || null,
          objetivo_diagnostico: cenarioData.objetivo_diagnostico || null,
          referencia_avaliacao: cenarioData.referencia_avaliacao || null,
          dilema_etico: cenarioData.dilema_etico_embutido || null,
          confianca_cenario: typeof cenarioData.confianca_cenario === 'number' ? Math.max(0, Math.min(1, cenarioData.confianca_cenario)) : null,
          riscos_do_cenario: cenarioData.riscos_do_cenario || [],
        },
        tipo_cenario: 'cenario_b',
      }).select('id, titulo, descricao, cargo, alternativas').single();
      if (insErr) { console.error('[cenarioB insert]', insErr.message); return 'falha'; }

      // Check inline se modelo foi informado
      if (checkModel && inserted) {
        try {
          const chk = await runCheckOnCenB(sbRaw, inserted, comp, descritoresTexto, pppResumoCheck, checkModel, cenA);
          if (chk.success) {
            return chk.status === 'aprovado' ? 'gerado_aprovado' : 'gerado_revisar';
          }
        } catch (e) { console.error('[cenarioB check]', e.message); }
      }
      return 'gerado';
    });

    const gerados = marcadores.filter(m => m.startsWith('gerado')).length;
    const aprovados = marcadores.filter(m => m === 'gerado_aprovado').length;
    const revisar = marcadores.filter(m => m === 'gerado_revisar').length;

    let msg = `${gerados} cenários B gerados`;
    if (checkModel) msg += ` | ${aprovados} aprovados, ${revisar} para revisar`;
    msg += ` — ${cenariosA.length} cenários A, ${compIds.length} competências`;
    return { success: true, message: msg };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 1b. CHECK DE 1 CENÁRIO B
// ══════════════════════════════════════════════════════════════════════════════

export async function checkCenarioBUm(cenarioId: string, modelo: string | null = null) {
  const sbRaw = await requireAdminSupabase('ai.audit.regenerate');
  try {
    // banco_cenarios é misto → raw por id
    const { data: cen } = await sbRaw.from('banco_cenarios')
      .select('id, empresa_id, titulo, descricao, cargo, competencia_id, alternativas')
      .eq('id', cenarioId).single();
    if (!cen) return { success: false, error: 'Cenário não encontrado' };

    if (!cen.empresa_id) return { success: false, error: 'Cenário sem empresa_id (catálogo nacional não tem check)' };
    const tdb = tenantDb(cen.empresa_id);

    const { data: comp } = await tdb.from('competencias')
      .select('id, nome, cod_comp').eq('id', cen.competencia_id).maybeSingle();

    const descritoresTexto = comp ? await fetchDescritoresTexto(tdb, comp.cod_comp) : '';
    const pppResumo = await fetchPppResumo(tdb);

    // Buscar cenário A correspondente pra comparação
    const { data: cenA } = await tdb.from('banco_cenarios')
      .select('titulo, descricao, alternativas')
      .eq('competencia_id', cen.competencia_id).eq('cargo', cen.cargo)
      .or('tipo_cenario.is.null,tipo_cenario.neq.cenario_b')
      .limit(1).maybeSingle();

    const modeloResolvido = modelo || await getModelForTask(cen.empresa_id, 'cenarios_b_check');
    const r = await runCheckOnCenB(sbRaw, cen, comp, descritoresTexto, pppResumo, modeloResolvido, cenA || undefined);
    if (!r.success) return r;
    return { success: true, message: `Check: ${r.nota}pts — ${r.status}`, nota: r.nota, status: r.status };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 1c. REGENERAR 1 CENÁRIO B (usa feedback do check anterior)
// ══════════════════════════════════════════════════════════════════════════════

export async function regenerarCenarioB(cenarioId: string, aiConfig: AIConfig = {}) {
  const sbRaw = await requireAdminSupabase('ai.audit.regenerate');
  try {
    // banco_cenarios é misto → raw por id
    const { data: cen } = await sbRaw.from('banco_cenarios')
      .select('id, empresa_id, competencia_id, cargo, titulo, descricao, nota_check, justificativa_check, sugestao_check')
      .eq('id', cenarioId).single();
    if (!cen) return { success: false, error: 'Cenário não encontrado' };

    if (!cen.empresa_id) return { success: false, error: 'Cenário sem empresa_id (não pode regenerar catálogo nacional)' };
    const tdb = tenantDb(cen.empresa_id);

    const { data: empresa } = await sbRaw.from('empresas')
      .select('nome, segmento').eq('id', cen.empresa_id).single();

    const { data: comp } = await tdb.from('competencias')
      .select('id, nome, descricao, cod_comp').eq('id', cen.competencia_id).maybeSingle();
    if (!comp) return { success: false, error: 'Competência não encontrada' };

    const descritoresTexto = await fetchDescritoresTexto(tdb, comp.cod_comp);

    // Buscar cenário A original para referência (qualquer tipo != cenario_b para mesma comp+cargo)
    const { data: cenA } = await tdb.from('banco_cenarios')
      .select('titulo, descricao')
      .eq('competencia_id', cen.competencia_id)
      .eq('cargo', cen.cargo)
      .or('tipo_cenario.is.null,tipo_cenario.neq.cenario_b')
      .limit(1).maybeSingle();

    const { data: ppps } = await tdb.from('ppp_escolas')
      .select('valores').limit(1);
    const pppContexto = ppps?.[0]?.valores ? JSON.stringify(ppps[0].valores) : '';

    // Feedback enriquecido do check
    const feedbackParts = [cen.justificativa_check, cen.sugestao_check];
    // Ler alertas_check enriquecidos se disponíveis
    const { data: cenFull } = await sbRaw.from('banco_cenarios')
      .select('alertas_check').eq('id', cenarioId).maybeSingle();
    const alertas = typeof cenFull?.alertas_check === 'object' ? cenFull.alertas_check : {};
    if (alertas.problema_principal_vs_cenario_a) feedbackParts.push(`Problema vs A: ${alertas.problema_principal_vs_cenario_a}`);
    if (Array.isArray(alertas.riscos_de_triangulacao) && alertas.riscos_de_triangulacao.length) {
      feedbackParts.push(`Riscos de triangulação: ${alertas.riscos_de_triangulacao.join('; ')}`);
    }
    if (Array.isArray(alertas.perguntas_com_risco)) {
      alertas.perguntas_com_risco.forEach((p: any) => {
        feedbackParts.push(`P${p.numero}: ${p.problema}${p.correcao_recomendada ? ` → ${p.correcao_recomendada}` : ''}`);
      });
    }
    const feedbackExtra = feedbackParts.filter(Boolean).join('\n');
    const refCenA = cenA || { cargo: cen.cargo, titulo: cen.titulo, descricao: cen.descricao };
    refCenA.cargo = cen.cargo;

    const { system, user } = buildCenBPrompts(empresa, refCenA, comp, descritoresTexto, pppContexto, feedbackExtra);
    const resposta = await callAI(system, user, aiConfig, 6144, { temperature: TEMP });
    const cenarioData = await extractJSON(resposta);
    if (!cenarioData?.titulo) return { success: false, error: 'IA não retornou cenário válido' };

    const alternativasB = {
      p1: cenarioData.p1,
      p2: cenarioData.p2,
      p3: cenarioData.p3,
      p4: cenarioData.p4,
      faceta_avaliada: cenarioData.faceta_avaliada || null,
      facetas_secundarias: cenarioData.facetas_secundarias || [],
      diferenca_estrutural_vs_cenario_a: cenarioData.diferenca_estrutural_vs_cenario_a || null,
      por_que_essa_variacao_importa: cenarioData.por_que_essa_variacao_importa || null,
      tradeoff_testado: cenarioData.tradeoff_testado || null,
      armadilha_de_resposta_generica: cenarioData.armadilha_de_resposta_generica || null,
      objetivo_diagnostico: cenarioData.objetivo_diagnostico || null,
      referencia_avaliacao: cenarioData.referencia_avaliacao || null,
      dilema_etico: cenarioData.dilema_etico_embutido || null,
      confianca_cenario: typeof cenarioData.confianca_cenario === 'number' ? Math.max(0, Math.min(1, cenarioData.confianca_cenario)) : null,
      riscos_do_cenario: cenarioData.riscos_do_cenario || [],
    };

    // TRAVA champion/challenger (mesma do IA3, 23/07): audita a CANDIDATA em
    // memória e SÓ aplica se a nota não piorar — regenerar nunca destrói uma
    // versão melhor. Falha de auditoria = NADA muda.
    const candidato = {
      id: cen.id, empresa_id: cen.empresa_id, competencia_id: cen.competencia_id,
      cargo: cen.cargo, titulo: cenarioData.titulo, descricao: cenarioData.descricao,
      alternativas: alternativasB,
    };
    const pppResumoChk = await fetchPppResumo(tdb);
    const modeloCheck = (aiConfig as any)?.checkModel || await getModelForTask(cen.empresa_id, 'cenarios_b_check');
    const av: any = await avaliarCenB(sbRaw, candidato, comp, descritoresTexto, pppResumoChk, modeloCheck, cenA || undefined);
    if (!av.success) return { success: false, error: `Auditoria da candidata falhou (${av.error}) — NADA foi alterado` };

    const notaAnterior: number | null = typeof (cen as any).nota_check === 'number' ? (cen as any).nota_check : null;
    if (!travaRegeneracao((cen as any).nota_check, av.resultado.nota)) {
      return {
        success: true, aplicado: false, nota: av.resultado.nota, notaAnterior, status: av.statusCheck,
        message: `Regeneração DESCARTADA: candidata ${av.resultado.nota}pts < atual ${notaAnterior}pts — mantida a versão atual (trava: nunca piora).`,
      };
    }

    const { data: cenLinhaRg } = await sbRaw.from('banco_cenarios').select('empresa_id').eq('id', cenarioId).maybeSingle();
    let qRg = sbRaw.from('banco_cenarios').update({
      titulo: cenarioData.titulo,
      descricao: cenarioData.descricao,
      p1: cenarioData.p1,
      p2: cenarioData.p2,
      p3: cenarioData.p3,
      p4: cenarioData.p4,
      alternativas: alternativasB,
    }).eq('id', cenarioId);
    qRg = cenLinhaRg?.empresa_id ? qRg.eq('empresa_id', cenLinhaRg.empresa_id) : qRg.is('empresa_id', null);
    const { error: updErr } = await qRg;
    if (updErr) return { success: false, error: `${updErr.message} — versão anterior preservada` };
    await persistirCheckCenB(sbRaw, cenarioId, av.resultado, av.statusCheck);

    return {
      success: true, aplicado: true, nota: av.resultado.nota, notaAnterior, status: av.statusCheck,
      message: `Cenário B regenerado: ${av.resultado.nota}pts (${av.statusCheck})${notaAnterior != null ? ` — antes ${notaAnterior}pts` : ''}.`,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 9. CARREGAR CENÁRIOS B (para tela de visualização)
// ══════════════════════════════════════════════════════════════════════════════

export async function loadCenariosB(empresaId: string) {
  await requireAdminAction();
  if (!empresaId) return [];
  const tdb = tenantDb(empresaId);

  // Buscar cenários B
  const { data } = await tdb.from('banco_cenarios')
    .select('*')
    .eq('tipo_cenario', 'cenario_b')
    .order('cargo', { ascending: true });

  if (!data?.length) return [];

  // Buscar cenários A correspondentes para pegar o nome da competência via título
  // (workaround: a query de competencias falha no Vercel)
  const { data: cenariosA } = await tdb.from('banco_cenarios')
    .select('competencia_id, titulo')
    .or('tipo_cenario.is.null,tipo_cenario.neq.cenario_b');

  // Tentar buscar competências (pode falhar no Vercel)
  const compIds = [...new Set(data.map((c: any) => c.competencia_id).filter(Boolean))] as string[];
  const compMap: Record<string, string> = {};
  for (const cid of compIds) {
    const { data: comp } = await tdb.from('competencias').select('nome').eq('id', cid).maybeSingle();
    if (comp) compMap[cid] = comp.nome;
  }

  // Fallback: extrair faceta_avaliada do alternativas
  return data.map(c => ({
    ...c,
    competencia_nome: compMap[c.competencia_id] || c.alternativas?.faceta_avaliada || '',
    alternativas: typeof c.alternativas === 'string' ? JSON.parse(c.alternativas) : (c.alternativas || {}),
  }));
}

// ══════════════════════════════════════════════════════════════════════════════
// 10. CHECK CENÁRIOS B EM LOTE (mesma lógica do check cenário A)
// ══════════════════════════════════════════════════════════════════════════════

export async function checkCenariosBLote(empresaId: string, aiConfig: Fase5Config = {}) {
  const sbRaw = await requireAdminSupabase('ai.audit.regenerate');
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const tdb = tenantDb(empresaId);
  try {
    const { data: cenarios } = await tdb.from('banco_cenarios')
      .select('id, empresa_id, titulo, descricao, cargo, competencia_id, alternativas, nota_check')
      .eq('tipo_cenario', 'cenario_b');

    if (!cenarios?.length) return { success: false, error: 'Nenhum cenário B encontrado. Gere cenários B primeiro.' };

    const pendentes = cenarios.filter(c => c.nota_check == null);
    if (!pendentes.length) return { success: true, message: `Todos os ${cenarios.length} cenários B já foram checados` };

    const modelo = aiConfig?.checkModel || aiConfig?.model || await getModelForTask(empresaId, 'cenarios_b_check');
    const pppResumo = await fetchPppResumo(tdb);

    // Pré-carga em BATCH (elimina o cache incremental) e checks IA em
    // PARALELO com limite 4 — check é idempotente e barato de repetir,
    // o alvo seguro pra primeira leva de paralelização (review 03/07).
    const compIdsChk = [...new Set(pendentes.map(c => c.competencia_id).filter(Boolean))];
    const { data: compsChk } = compIdsChk.length
      ? await tdb.from('competencias').select('id, nome, cod_comp').in('id', compIdsChk)
      : { data: [] };
    const compCache = Object.fromEntries((compsChk || []).map(c => [c.id, c]));
    const descCache = {};
    await mapComLimite(Object.values(compCache) as any[], 8, async (comp: any) => {
      descCache[comp.id] = await fetchDescritoresTexto(tdb, comp.cod_comp);
    });

    const resultados = await mapComLimite(pendentes as any[], 4, async (cen: any) => {
      try {
        const comp = compCache[cen.competencia_id] || null;
        const descritoresTexto = comp ? (descCache[cen.competencia_id] ?? '') : '';
        const r = await runCheckOnCenB(sbRaw, cen, comp, descritoresTexto, pppResumo, modelo);
        return r.success ? 'ok' : 'erro';
      } catch { return 'erro'; }
    });
    const ok = resultados.filter(r => r === 'ok').length;
    const erros = resultados.filter(r => r === 'erro').length;

    return { success: true, message: `Check cenários B: ${ok} checados${erros ? `, ${erros} erros` : ''} (${cenarios.length - pendentes.length} já checados antes)` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 11. REGENERAR + RECHECAR EM LOTE (todos os cenários B com nota < 90)
// ══════════════════════════════════════════════════════════════════════════════

export async function regenerarERecheckarCenariosBLote(empresaId: string, aiConfig: Fase5Config = {}) {
  await requireAdminAction('ai.audit.regenerate');
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const tdb = tenantDb(empresaId);
  try {
    let query = tdb.from('banco_cenarios')
      .select('id, nota_check, titulo')
      .eq('tipo_cenario', 'cenario_b');
    if (!aiConfig?.incluirAprovados) query = query.lt('nota_check', 90);
    const { data: cenarios } = await query;

    if (!cenarios?.length) return { success: true, message: 'Nenhum cenário B para regenerar' };

    // null → checkCenarioBUm resolve pela task (cenarios_b_check, pinned).
    const checkModel = aiConfig?.checkModel || null;
    // Regenerar+recheck em paralelo (limite 3 — cada item já são 2 chamadas IA)
    const marcadoresRg = await mapComLimite(cenarios as any[], 3, async (c: any) => {
      try {
        // O regen já audita a candidata e aplica só se não piorar (trava).
        const r1: any = await regenerarCenarioB(c.id, { model: aiConfig?.model, checkModel } as any);
        if (!r1.success) { return 'erro'; }
        if (r1.aplicado === false) return 'regen_mantido';
        return r1.status === 'aprovado' ? 'regen_aprovado' : 'regen_revisar';
      } catch { return 'erro'; }
    });
    const regenerados = marcadoresRg.filter(m => m.startsWith('regen')).length;
    const aprovados = marcadoresRg.filter(m => m === 'regen_aprovado').length;
    const revisar = marcadoresRg.filter(m => m === 'regen_revisar').length;
    const mantidos = marcadoresRg.filter(m => m === 'regen_mantido').length;
    const erros = marcadoresRg.filter(m => m === 'erro').length;

    return { success: true, message: `${regenerados} regenerados | ${aprovados} aprovados, ${revisar} ainda para revisar${mantidos ? `, ${mantidos} mantidos (trava)` : ''}${erros ? `, ${erros} erros` : ''}` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
