'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { tenantDb } from '@/lib/tenant-db';
import { tenantEmailFrom, tenantUrl } from '@/lib/domain';
import { callAI, callAIChat, type AIConfig } from './ai-client';
import { extractJSON } from './utils';

// Configs específicas da fase 5 (estende a base com flags do check + lote)
type Fase5Config = AIConfig & {
  checkModel?: string;
  incluirAprovados?: boolean;
};

// ── Helper: upsert para relatórios agregados (colaborador_id = NULL) ────────
// PostgreSQL UNIQUE não detecta conflito em NULL, então onConflict não funciona.
// Solução: select + update/insert explícito.
async function upsertRelatorioAgregado(tdb: any, tipo: string, conteudo: any) {
  const { data: existing } = await tdb.from('relatorios')
    .select('id').eq('tipo', tipo).is('colaborador_id', null).maybeSingle();
  if (existing) {
    await tdb.from('relatorios').update({ conteudo, gerado_em: new Date().toISOString() }).eq('id', existing.id);
  } else {
    await tdb.from('relatorios').insert({ colaborador_id: null, tipo, conteudo, gerado_em: new Date().toISOString() });
  }
}

// ── Constantes (alinhadas com GAS) ──────────────────────────────────────────
const MAX_TURNOS = 8;
const TEMP = 0.4; // temperatura GAS para consistência

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
async function runCheckOnCenB(sb: any, cen: any, comp: any, descritoresTexto: string, pppResumo: string, modelo: string | null, cenarioA?: any) {
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

  const resposta = await callAI(CHECK_CEN_B_SYSTEM, user, { model: modelo || 'gemini-3-flash-preview' }, 4096, { temperature: TEMP });
  const resultado = await extractJSON(resposta);
  if (!resultado?.nota) return { success: false, error: 'Check não retornou nota' };

  // Validar coerência erro_grave × nota
  if (resultado.erro_grave && resultado.nota > 60) resultado.nota = 60;

  const statusCheck = resultado.nota >= 90 ? 'aprovado'
    : resultado.nota >= 80 ? 'aprovado_com_ressalvas'
    : 'revisar';

  await sb.from('banco_cenarios').update({
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
  }).eq('id', cen.id);

  return { success: true, nota: resultado.nota, status: statusCheck };
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. GERAR CENÁRIOS B EM LOTE
// Cria cenários B customizados por cargo/competência (diferente do A)
// Inclui: dilema ético, faceta avaliada, validação Gemini
// ══════════════════════════════════════════════════════════════════════════════

export async function gerarCenariosBLote(empresaId: string, aiConfig: Fase5Config = {}) {
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const sbRaw = createSupabaseAdmin();
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

    for (const cid of compIdsNeeded) {
      const { data: comp } = await tdb.from('competencias')
        .select('id, nome, descricao, cod_comp')
        .eq('id', cid)
        .maybeSingle();
      if (comp) {
        compMap[comp.id] = comp;
        descritoresMap[comp.id] = await fetchDescritoresTexto(tdb, comp.cod_comp);
      }
    }
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
    let gerados = 0, aprovados = 0, revisar = 0, skipJaTemB = 0, skipSemComp = 0;
    for (const cenA of cenariosA) {
      const key = `${cenA.competencia_id}::${cenA.cargo}`;
      if (jaTemB.has(key)) { skipJaTemB++; continue; }

      const comp = compMap[cenA.competencia_id];
      if (!comp) { skipSemComp++; continue; }

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

      if (!cenarioData?.titulo) continue;

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
      if (insErr) { console.error('[cenarioB insert]', insErr.message); continue; }
      gerados++;

      // Check inline se modelo foi informado
      if (checkModel && inserted) {
        try {
          const chk = await runCheckOnCenB(sbRaw, inserted, comp, descritoresTexto, pppResumoCheck, checkModel, cenA);
          if (chk.success) {
            if (chk.status === 'aprovado') aprovados++; else revisar++;
          }
        } catch (e) { console.error('[cenarioB check]', e.message); }
      }
    }

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
  const sbRaw = createSupabaseAdmin();
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

    const r = await runCheckOnCenB(sbRaw, cen, comp, descritoresTexto, pppResumo, modelo, cenA || undefined);
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
  const sbRaw = createSupabaseAdmin();
  try {
    // banco_cenarios é misto → raw por id
    const { data: cen } = await sbRaw.from('banco_cenarios')
      .select('id, empresa_id, competencia_id, cargo, titulo, descricao, justificativa_check, sugestao_check')
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

    const { error: updErr } = await sbRaw.from('banco_cenarios').update({
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
      nota_check: null,
      status_check: null,
      dimensoes_check: null,
      justificativa_check: null,
      sugestao_check: null,
      alertas_check: null,
      checked_at: null,
    }).eq('id', cenarioId);

    if (updErr) return { success: false, error: updErr.message };
    return { success: true, message: `Cenário B regenerado: ${comp.nome}` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 2. INICIAR REAVALIAÇÃO EM LOTE
// 1 sessão por colaborador. Mesma lógica do PDI (montarTrilhasLote):
//   - Usa competência foco do cargo SE o colab tem gap nela
//   - Senão usa a competência com maior gap (gap = 4 - nivel_ia4)
// ══════════════════════════════════════════════════════════════════════════════

export async function iniciarReavaliacaoLote(empresaId: string, aiConfig: AIConfig = {}) {
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const tdb = tenantDb(empresaId);
  try {
    const { data: colaboradores } = await tdb.from('colaboradores')
      .select('id, nome_completo, cargo, email, perfil_dominante, d_natural, i_natural, s_natural, c_natural');
    if (!colaboradores?.length) return { success: false, error: 'Nenhum colaborador encontrado' };

    // Cenários B (chave: competencia_id::cargo)
    const { data: cenariosB } = await tdb.from('banco_cenarios')
      .select('id, competencia_id, cargo').eq('tipo_cenario', 'cenario_b');
    if (!cenariosB?.length) return { success: false, error: 'Nenhum cenário B. Gere cenários B primeiro.' };
    const cenarioMap = {};
    cenariosB.forEach(c => { cenarioMap[`${c.competencia_id}::${c.cargo}`] = c.id; });

    // Respostas iniciais (baseline + cálculo de gap)
    const { data: respostas } = await tdb.from('respostas')
      .select('colaborador_id, competencia_id, nivel_ia4, avaliacao_ia')
      .not('avaliacao_ia', 'is', null);
    if (!respostas?.length) return { success: false, error: 'Nenhuma avaliação IA4 encontrada. Rode IA4 primeiro.' };
    const baselineMap = {};
    (respostas || []).forEach(r => {
      baselineMap[`${r.colaborador_id}::${r.competencia_id}`] = {
        nivel: r.nivel_ia4,
        avaliacao: r.avaliacao_ia,
      };
    });

    // Competência foco por cargo (definida pelo RH)
    const { data: cargosEmpresa } = await tdb.from('cargos_empresa')
      .select('nome, competencia_foco');
    const focoMap = {};
    (cargosEmpresa || []).forEach(c => { if (c.competencia_foco) focoMap[c.nome] = c.competencia_foco; });

    // Competências (parent rows, cod_desc IS NULL)
    const { data: competencias, error: compErr } = await tdb.from('competencias')
      .select('id, nome, cargo, cod_comp')
      .is('cod_desc', null);
    if (compErr) return { success: false, error: `competencias: ${compErr.message}` };
    const compByIdMap = {};
    const compByNomeCargoMap = {};
    (competencias || []).forEach(c => {
      compByIdMap[c.id] = c;
      compByNomeCargoMap[`${c.nome}::${c.cargo}`] = c;
    });

    // Descritores por cod_comp (linhas filhas em competencias)
    const descritoresCache = {};
    for (const comp of competencias || []) {
      const { data: descs } = await tdb.from('competencias')
        .select('cod_desc, nome_curto, descritor_completo')
        .eq('cod_comp', comp.cod_comp)
        .not('cod_desc', 'is', null);
      descritoresCache[comp.id] = (descs || []).map((d, i) => ({
        codigo: d.cod_desc || `D${i + 1}`,
        nome: d.nome_curto || d.descritor_completo || `Descritor ${i + 1}`,
      }));
    }

    // Agrupar gaps por colaborador (gap = 4 - nivel)
    const gapsPorColab = {};
    respostas.forEach(r => {
      const comp = compByIdMap[r.competencia_id];
      if (!comp) return;
      if (!gapsPorColab[r.colaborador_id]) gapsPorColab[r.colaborador_id] = [];
      const nivel = r.nivel_ia4 || 0;
      gapsPorColab[r.colaborador_id].push({
        comp,
        nivel,
        gap: 4 - nivel,
      });
    });

    // Trilha progresso (temporada_semana_progresso — schema novo)
    const { data: progressos } = await tdb.from('temporada_semana_progresso')
      .select('colaborador_id, semana, conteudo_consumido');
    const progMap: Record<string, { pct_conclusao: number; semana_atual: number }> = {};
    (progressos || []).forEach(p => {
      const prev = progMap[p.colaborador_id];
      const sem = p.semana || 0;
      if (!prev || sem > prev.semana_atual) {
        progMap[p.colaborador_id] = { semana_atual: sem, pct_conclusao: Math.round((sem / 14) * 100) };
      }
    });

    // Sessões já criadas (dedupe por colab+comp)
    const { data: sessoes } = await tdb.from('reavaliacao_sessoes')
      .select('colaborador_id, competencia_id');
    const jaCriado = new Set((sessoes || []).map(s => `${s.colaborador_id}::${s.competencia_id}`));

    let criados = 0, pulados = 0;
    const motivosPulo = [];

    for (const colab of colaboradores) {
      const gaps = gapsPorColab[colab.id];
      if (!gaps?.length) { pulados++; motivosPulo.push(`${colab.nome_completo}: sem avaliações`); continue; }

      // 1) Tentar competência foco do cargo
      let compAlvo = null;
      const foco = focoMap[colab.cargo];
      if (foco) {
        const compFoco = gaps.find(g => {
          const fL = foco.toLowerCase();
          const cL = g.comp.nome.toLowerCase();
          return cL === fL || cL.includes(fL) || fL.includes(cL);
        });
        if (compFoco && compFoco.gap > 0) compAlvo = compFoco.comp;
      }

      // 2) Senão, maior gap
      if (!compAlvo) {
        const comGap = gaps.filter(g => g.gap > 0).sort((a, b) => b.gap - a.gap);
        if (comGap.length > 0) compAlvo = comGap[0].comp;
      }

      if (!compAlvo) { pulados++; motivosPulo.push(`${colab.nome_completo}: sem gap em nenhuma competência`); continue; }

      // 3) Precisa ter cenário B para essa comp+cargo
      const cenarioBId = cenarioMap[`${compAlvo.id}::${colab.cargo}`];
      if (!cenarioBId) {
        pulados++;
        motivosPulo.push(`${colab.nome_completo}: sem cenário B para "${compAlvo.nome}"`);
        continue;
      }

      // 4) Dedupe
      if (jaCriado.has(`${colab.id}::${compAlvo.id}`)) { pulados++; continue; }

      const baseline = baselineMap[`${colab.id}::${compAlvo.id}`] || null;
      const trilha = progMap[colab.id] || null;

      const avIni = typeof baseline?.avaliacao === 'string' ? JSON.parse(baseline.avaliacao) : baseline?.avaliacao;
      const pontosFortes = avIni?.descritores_destaque?.pontos_fortes || avIni?.pontos_fortes || [];
      const pontosAtencao = avIni?.descritores_destaque?.gaps_prioritarios || avIni?.pontos_desenvolvimento || [];

      const descritores = descritoresCache[compAlvo.id] || [];

      // empresa_id é injetado pelo tdb.insert
      const { error } = await tdb.from('reavaliacao_sessoes').insert({
        colaborador_id: colab.id,
        competencia_id: compAlvo.id,
        cenario_b_id: cenarioBId,
        baseline_nivel: baseline?.nivel || null,
        baseline_avaliacao: baseline?.avaliacao || null,
        status: 'pendente',
        historico: [],
        turno: 0,
        extracao_qualitativa: {
          _contexto_sessao: {
            pontos_fortes: pontosFortes,
            pontos_atencao: pontosAtencao,
            descritores: descritores,
            disc: { perfil: colab.perfil_dominante, D: colab.d_natural, I: colab.i_natural, S: colab.s_natural, C: colab.c_natural },
            trilha: trilha ? { pct: trilha.pct_conclusao, semana: trilha.semana_atual } : null,
          },
        },
      });

      if (error) {
        console.error('[reavaliacao_sessoes insert]', error.message);
        pulados++;
      } else {
        criados++;
      }
    }

    let msg = `${criados} sessões criadas (1 por colaborador)`;
    if (pulados > 0) msg += ` | ${pulados} pulados`;
    if (motivosPulo.length) console.log('[iniciarReavaliacao] motivos:', motivosPulo);
    return { success: true, message: msg };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 3. PROCESSAR REAVALIAÇÃO CONVERSACIONAL (1 sessão, 8 turnos)
// Prompt completo com: baseline, descritores D1-D6, trilha, DISC, exemplos
// ══════════════════════════════════════════════════════════════════════════════

function buildReavSystemPrompt(sessao: any, comp: any): string {
  const ctx = sessao.extracao_qualitativa?._contexto_sessao || {};
  const descritores = ctx.descritores || [];
  const pontosFortes = ctx.pontos_fortes || [];
  const pontosAtencao = ctx.pontos_atencao || [];
  const disc = ctx.disc || {};
  const trilha = ctx.trilha || {};
  const nomeColab = sessao.colaboradores?.nome_completo || 'o colaborador';
  const compNome = comp?.nome || sessao.competencias?.nome || '';
  const gapPrincipal = pontosAtencao[0] ? (typeof pontosAtencao[0] === 'string' ? pontosAtencao[0] : pontosAtencao[0].descritor || pontosAtencao[0].nome) : '';

  return `Você é o Mentor IA da Vertho, conduzindo uma conversa de REAVALIAÇÃO após a jornada de desenvolvimento.

═══ PAPEL ═══
Seu papel NÃO é ensinar, aconselhar ou avaliar formalmente.
Seu papel é COLETAR EVIDÊNCIAS DE MUDANÇA NA PRÁTICA.

O que importa NÃO é "o que a pessoa diz que aprendeu".
O que importa é:
- o que passou a FAZER
- como DECIDIU
- o que percebeu de DIFERENTE
- o que ainda continua DIFÍCIL
- qual consciência tem do próprio avanço ou limitação

═══ TOM E ESTILO ═══
- Acolhedor, humano, curioso, respeitoso, não julgador
- Linguagem natural em português do Brasil
- Trate como "você" (2a pessoa)
- Máximo 1 frase de transição/acolhimento + 1 pergunta

Microacolhimento PERMITIDO: "Entendi.", "Faz sentido.", "Que bom que você percebeu isso."
PROIBIDO: elogiar, validar mérito, interpretar, aconselhar, avaliar

═══ REGRAS INEGOCIÁVEIS ═══
1. Você NÃO está avaliando formalmente
2. NUNCA revele nível, nota inicial ou baseline
3. NUNCA cite descritores por código (D1, D2) — use linguagem natural
4. NUNCA transforme a conversa em mentoria, aula ou aconselhamento
5. NUNCA aceite teoria ou opinião como evidência suficiente
6. Sempre puxe para prática, exemplo, ação, consequência ou autopercepção
7. Explore também o que NÃO mudou ou o que continua difícil
8. NUNCA invente fatos não mencionados pelo colaborador

═══ TIPOS DE EVIDÊNCIA A BUSCAR ═══
- situacao_real — contexto concreto de mudança
- acao_concreta — o que passou a fazer diferente
- raciocinio — critério ou lógica por trás da mudança
- consequencia — resultado percebido
- autossensibilidade — consciência do avanço ou limitação
- dificuldade_persistente — o que continua difícil apesar da jornada
- intencao_sem_execucao — quer mudar mas ainda não mudou na prática

Classificação de força:
- FRACA: genérica, abstrata, hipotética, sem exemplo
- MODERADA: concreta mas incompleta ou sem consequência
- FORTE: concreta + contexto + resultado ou consequência clara

═══ PROTOCOLO DE REDIRECIONAMENTO ═══
Se o colaborador pedir avaliação, conselho ou resposta pronta:
- "Antes de entrar nisso, quero entender melhor como isso apareceu na sua prática."
- "Me ajuda com um exemplo concreto."
- "O que você fez de diferente nessa situação?"
- "O que ainda segue difícil mesmo depois da jornada?"

═══ ROTEIRO DA CONVERSA (6 etapas) ═══
1. ACOLHIMENTO — "Que bom que chegou até aqui! Foram ${trilha.semana || 14} semanas..."
2. MUDANÇA GERAL — O que mudou na prática? (aberto, sem direcionar)
3. EVIDÊNCIA CONCRETA — Uma situação específica em que agiu diferente
4. APROFUNDAMENTO EM GAP — ${gapPrincipal ? `Foco em: ${gapPrincipal}` : 'Abordar o gap principal'}
5. DIFICULDADE PERSISTENTE — O que ainda é mais desafiador
6. ENCERRAMENTO — "Muito obrigado! Na próxima etapa você vai responder ao cenário B."

═══ REGRAS DE ENCERRAMENTO ═══
- Máximo ${MAX_TURNOS} turnos
- NÃO encerrar cedo por resposta bonita
- Só encerrar quando houver material minimamente útil sobre:
  - mudança percebida (pelo menos 1 evidência moderada+)
  - evidência concreta (pelo menos 1 fato real)
  - dificuldade persistente OU limite atual (pelo menos 1 menção)

═══ CONTEXTO DO COLABORADOR (INTERNO) ═══
Competência: ${compNome}
Nível baseline: N${sessao.baseline_nivel || '?'}
Cargo: ${sessao.colaboradores?.cargo || 'N/D'}
${disc.perfil ? `DISC: ${disc.perfil} (D=${disc.D||0} I=${disc.I||0} S=${disc.S||0} C=${disc.C||0})` : ''}
Trilha: ${trilha.pct || 0}% concluída
${pontosFortes.length ? `Pontos fortes: ${pontosFortes.map((p: any) => typeof p === 'string' ? p : p.descritor || p.nome).join('; ')}` : ''}
${pontosAtencao.length ? `Gaps prioritários: ${pontosAtencao.map((p: any) => typeof p === 'string' ? p : p.descritor || p.nome).join('; ')}` : ''}
${descritores.length ? `Descritores (NUNCA citar código): ${descritores.map((d: any) => d.nome).join('; ')}` : ''}

═══ BLOCO [META] — OBRIGATÓRIO EM TODA RESPOSTA ═══

[META]
{
  "turno": ${sessao.turno + 1},
  "etapa_atual": "acolhimento|mudanca_geral|evidencia_concreta|aprofundamento_gap|dificuldade_persistente|encerramento",
  "proximo_foco": "o que precisa ser explorado a seguir",
  "evidencias_coletadas": [
    {
      "tipo": "situacao_real|acao_concreta|raciocinio|consequencia|autossensibilidade|dificuldade_persistente|intencao_sem_execucao",
      "trecho": "trecho literal ou paráfrase fiel",
      "forca": "fraca|moderada|forte"
    }
  ],
  "lacunas_abertas": ["dimensões ou aspectos ainda não explorados"],
  "risco_de_encerramento_prematuro": true,
  "encerrar": false
}
[/META]

A mensagem visível ao colaborador deve vir ANTES do [META].`;
}

export async function processarReavaliacao(sessaoId: string, mensagem: string, aiConfig: AIConfig = {}) {
  const sbRaw = createSupabaseAdmin();
  try {
    // Descobre tenant via sessão (raw — query inicial)
    const { data: sessao, error: sessaoErr } = await sbRaw.from('reavaliacao_sessoes')
      .select('*, competencias!inner(nome), colaboradores!inner(nome_completo, cargo)')
      .eq('id', sessaoId).single();

    if (sessaoErr) return { success: false, error: sessaoErr.message };
    if (!sessao) return { success: false, error: 'Sessão não encontrada' };
    if (sessao.status === 'concluida') return { success: false, error: 'Sessão já concluída' };

    const tdb = tenantDb(sessao.empresa_id);

    const historico = sessao.historico || [];
    historico.push({ role: 'user', content: mensagem });

    const systemPrompt = buildReavSystemPrompt(sessao, sessao.competencias);
    const resposta = await callAIChat(systemPrompt, historico, aiConfig, 4096, { temperature: TEMP });

    historico.push({ role: 'assistant', content: resposta });
    const novoTurno = sessao.turno + 1;

    // Verificar [META] enriquecido
    const metaMatch = resposta.match(/\[META\](.*?)\[\/META\]/s);
    let meta: any = {};
    try { meta = metaMatch ? JSON.parse(metaMatch[1]) : {}; } catch {}

    // Lógica de encerramento enriquecida
    const evidencias = meta.evidencias_coletadas || [];
    const fortes = evidencias.filter((e: any) => e.forca === 'forte').length;
    const moderadas = evidencias.filter((e: any) => e.forca === 'moderada').length;
    const temDificuldade = evidencias.some((e: any) => e.tipo === 'dificuldade_persistente');
    const riscoPrematuro = meta.risco_de_encerramento_prematuro === true;

    const criteriosEncerrar = (fortes + moderadas >= 2) && temDificuldade && !riscoPrematuro;
    const encerrar = meta.encerrar || (criteriosEncerrar && meta.etapa_atual === 'encerramento') || novoTurno >= MAX_TURNOS;

    await tdb.from('reavaliacao_sessoes').update({
      historico,
      turno: novoTurno,
      ...(encerrar ? { status: 'concluida' } : {}),
    }).eq('id', sessaoId);

    // Se encerrou, extrair dados qualitativos
    if (encerrar) {
      await extrairDadosReavaliacao(sessaoId, aiConfig);
    }

    return { success: true, reply: resposta.replace(/\[META\].*?\[\/META\]/s, '').trim(), encerrada: encerrar };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 4. EXTRAÇÃO QUALITATIVA DA REAVALIAÇÃO
// Transforma conversa em artefato estruturado por descritor, útil pra fusão 5.5
// ══════════════════════════════════════════════════════════════════════════════

async function extrairDadosReavaliacao(sessaoId: any, aiConfig: any = {}) {
  const sbRaw = createSupabaseAdmin();
  const { data: sessao } = await sbRaw.from('reavaliacao_sessoes')
    .select('*, competencias!inner(nome), colaboradores!inner(nome_completo, cargo)')
    .eq('id', sessaoId).single();
  if (!sessao) return;
  const tdb = tenantDb(sessao.empresa_id);

  const ctx = sessao.extracao_qualitativa?._contexto_sessao || {};
  const descritores = (ctx.descritores || []).map((d: any, i: number) =>
    `${d.codigo || `D${i + 1}`}: ${d.nome || ''}`
  );

  // Extrair sinais do [META] acumulado na conversa (se disponíveis)
  const metaSinais: any[] = [];
  for (const h of (sessao.historico || [])) {
    if (h.role === 'assistant') {
      const m = h.content.match(/\[META\](.*?)\[\/META\]/s);
      if (m) {
        try {
          const parsed = JSON.parse(m[1]);
          if (Array.isArray(parsed.evidencias_coletadas)) {
            metaSinais.push(...parsed.evidencias_coletadas);
          }
        } catch {}
      }
    }
  }

  const system = `Você é um extrator de evidências qualitativas da Vertho.

Sua tarefa é analisar a conversa de reavaliação de um colaborador e extrair dados qualitativos por descritor, de forma fiel, prudente e útil para análise posterior.

ATENÇÃO:
Você NÃO está fazendo a avaliação final da competência.
Você NÃO está escrevendo um feedback bonito.
Você NÃO está completando lacunas.
Você está EXTRAINDO o que a conversa realmente sustenta.

PRINCÍPIOS INEGOCIÁVEIS:
1. Extraia apenas o que foi dito ou claramente sustentado.
2. Fala teórica não vale como evidência forte.
3. Exemplo concreto vale mais do que opinião.
4. Se não houver base suficiente, reduza a confiança.
5. Não force um descritor a ter evidência se a conversa não o cobrir.
6. nivel_percebido é leitura qualitativa provisória, não avaliação final.
7. DISC/CIS é contexto, não destino.
8. Toda evidência relevante deve ter citação curta de sustentação.

FORÇA DA EVIDÊNCIA:
- fraca: abstrata, genérica, teórica, sem ação observável
- moderada: concreta mas incompleta ou sem consequência clara
- forte: concreta + coerente + com ação e consequência/critério

RETORNE APENAS JSON VÁLIDO, sem markdown, sem texto antes ou depois.`;

  const blocks: string[] = [];
  blocks.push(`═══ COMPETÊNCIA ═══\n${sessao.competencias.nome}`);
  blocks.push(`═══ COLABORADOR ═══\n${sessao.colaboradores.nome_completo} (${sessao.colaboradores.cargo})\nNível baseline: N${sessao.baseline_nivel || '?'}`);
  if (ctx.disc?.perfil) blocks.push(`═══ PERFIL DISC ═══\n${ctx.disc.perfil} (D=${ctx.disc.D||0} I=${ctx.disc.I||0} S=${ctx.disc.S||0} C=${ctx.disc.C||0})\nNOTA: NÃO use DISC pra nota, apenas pra leitura contextual.`);
  blocks.push(`═══ DESCRITORES ═══\n${descritores.join('\n')}`);

  if (metaSinais.length > 0) {
    blocks.push(`═══ SINAIS DO [META] (coletados durante a conversa) ═══\n${JSON.stringify(metaSinais.slice(0, 20), null, 2)}`);
  }

  blocks.push(`═══ CONVERSA COMPLETA ═══\n${sessao.historico.map((h: any) =>
    `${h.role === 'user' ? 'COLABORADOR' : 'MENTOR'}: ${h.content.replace(/\[META\].*?\[\/META\]/s, '').trim()}`
  ).join('\n\n')}`);

  blocks.push(`FORMATO DE SAÍDA (JSON):
{
  "resumo_qualitativo": {
    "leitura_geral": "síntese curta e fiel da conversa",
    "sinal_mais_forte": "principal evidência qualitativa observada",
    "limite_mais_relevante": "principal limite qualitativo observado"
  },
  "evidencias_por_descritor": [
    {
      "descritor": "D1",
      "nome_descritor": "nome",
      "evidencia_relatada": "síntese curta e fiel do que o colaborador relatou",
      "nivel_percebido": 2,
      "confianca": 0.75,
      "forca_da_evidencia": "forte|moderada|fraca",
      "citacao_literal": "trecho curto da fala que sustenta",
      "limite_da_evidencia": "o que faltou para sustentar melhor"
    }
  ],
  "gaps_persistentes": [
    {"gap": "nome curto", "sinal": "como aparece na conversa"}
  ],
  "ganhos_qualitativos": ["ganho 1"],
  "consciencia_do_gap": {
    "nivel": "alta|media|baixa",
    "justificativa": "por que essa leitura"
  },
  "conexao_cis": {
    "leitura": "leitura breve e prudente conectando conversa ao perfil",
    "cuidados_de_interpretacao": ["cuidado 1"]
  },
  "recomendacao_ciclo2": {
    "descritores_foco": ["D1", "D3"],
    "justificativa": "por que esses descritores",
    "tipo_de_trabalho_sugerido": ["pratica", "feedback"]
  },
  "alertas_metodologicos": ["alerta 1"]
}

REGRAS:
- confianca: 0.0 a 1.0
- nivel_percebido: escala 1 a 4, pode usar decimal
- citacao_literal: curta e fiel
- gaps_persistentes devem sair da conversa, não de inferência
- se um descritor não tiver base suficiente, confiança baixa e forca fraca
- sem linguagem genérica`);

  const user = blocks.join('\n\n');
  const resultado = await callAI(system, user, aiConfig, 8192, { temperature: TEMP });
  let extracao = await extractJSON(resultado);

  // Validação leve
  if (extracao) {
    // Confiança entre 0 e 1
    if (Array.isArray(extracao.evidencias_por_descritor)) {
      for (const d of extracao.evidencias_por_descritor) {
        if (typeof d.confianca === 'number') d.confianca = Math.max(0, Math.min(1, d.confianca));
        // Compatibilidade: confiança como string → converter
        if (typeof d.confianca === 'string') {
          d.confianca = d.confianca === 'alta' ? 0.85 : d.confianca === 'media' ? 0.55 : 0.25;
        }
      }
    }
    // Preservar _contexto_sessao
    await tdb.from('reavaliacao_sessoes')
      .update({ extracao_qualitativa: { ...extracao, _contexto_sessao: ctx } })
      .eq('id', sessaoId);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 5. EVOLUÇÃO COM FUSÃO DE 3 FONTES
// Cenário A + Cenário B + Conversa Sem15
// Convergência: CONFIRMADA, PARCIAL, SEM_EVOLUCAO, INVISIVEL
// Inclui: ganhos_qualitativos, trilha detalhada, conexao_cis em recomendação
// ══════════════════════════════════════════════════════════════════════════════

export async function gerarEvolucaoFusao(empresaId: string, aiConfig: AIConfig = {}) {
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const sbRaw = createSupabaseAdmin();
  const tdb = tenantDb(empresaId);
  try {
    const { data: empresa } = await sbRaw.from('empresas')
      .select('nome, segmento').eq('id', empresaId).single();

    const { data: colaboradores } = await tdb.from('colaboradores')
      .select('id, nome_completo, cargo, perfil_dominante, d_natural, i_natural, s_natural, c_natural');
    if (!colaboradores?.length) return { success: false, error: 'Nenhum colaborador encontrado' };

    // Fonte 1: Respostas iniciais (Cenário A)
    const { data: respostasA } = await tdb.from('respostas')
      .select('colaborador_id, competencia_id, nivel_ia4, avaliacao_ia, r1, r2, r3, r4')
      .not('avaliacao_ia', 'is', null).is('tipo_resposta', null);

    // Fonte 2: Respostas reavaliação (Cenário B)
    const { data: respostasB } = await tdb.from('respostas')
      .select('colaborador_id, competencia_id, nivel_ia4, avaliacao_ia, r1, r2, r3, r4')
      .eq('tipo_resposta', 'cenario_b').not('avaliacao_ia', 'is', null);

    // Fonte 3: Conversa Semana 15
    const { data: sessoes } = await tdb.from('reavaliacao_sessoes')
      .select('colaborador_id, competencia_id, extracao_qualitativa, baseline_nivel')
      .eq('status', 'concluida');

    // Competências (parent rows, cod_desc IS NULL). Sem coluna gabarito.
    const { data: competencias, error: compErr } = await tdb.from('competencias')
      .select('id, nome, cod_comp').is('cod_desc', null);
    if (compErr) return { success: false, error: `competencias: ${compErr.message}` };
    const compMap = {};
    (competencias || []).forEach(c => { compMap[c.id] = c; });

    // Descritores por competencia via cod_comp (mesmo padrão de iniciarReavaliacaoLote)
    const descritoresMap = {};
    for (const comp of competencias || []) {
      const { data: descs } = await tdb.from('competencias')
        .select('cod_desc, nome_curto, descritor_completo')
        .eq('cod_comp', comp.cod_comp)
        .not('cod_desc', 'is', null);
      descritoresMap[comp.id] = (descs || []).map((d, i) =>
        `${d.cod_desc || `D${i + 1}`}: ${d.nome_curto || d.descritor_completo || ''}`
      );
    }

    // Trilha progresso (temporada_semana_progresso — schema novo)
    const { data: progressos } = await tdb.from('temporada_semana_progresso')
      .select('colaborador_id, semana, conteudo_consumido');
    const progMap: Record<string, { pct_conclusao: number; semana_atual: number; cursos_progresso: any[] }> = {};
    (progressos || []).forEach(p => {
      const prev = progMap[p.colaborador_id];
      const sem = p.semana || 0;
      const conteudo = Array.isArray(p.conteudo_consumido) ? p.conteudo_consumido : [];
      if (!prev || sem > prev.semana_atual) {
        progMap[p.colaborador_id] = {
          semana_atual: sem,
          pct_conclusao: Math.round((sem / 14) * 100),
          cursos_progresso: conteudo,
        };
      }
    });

    // Mapas
    const resAMap = {};
    (respostasA || []).forEach(r => { resAMap[`${r.colaborador_id}::${r.competencia_id}`] = r; });
    const resBMap = {};
    (respostasB || []).forEach(r => { resBMap[`${r.colaborador_id}::${r.competencia_id}`] = r; });
    const sessaoMap = {};
    (sessoes || []).forEach(s => { sessaoMap[`${s.colaborador_id}::${s.competencia_id}`] = s; });

    const system = `Você é o Motor de Evolução da Vertho.

═══ TAREFA ═══
Analisar a EVOLUÇÃO de um colaborador comparando avaliação inicial e
reavaliação, usando até 3 fontes de dados com pesos e naturezas diferentes.

═══ FONTES DE DADOS ═══

1. CENÁRIO A — diagnóstico inicial (linha de base)
   Mostra o nível inicial por descritor.

2. CENÁRIO B — reavaliação situacional estruturada
   Mostra evidência DEMONSTRADA em contexto comparável.
   Tende a ter mais peso que relato subjetivo.

3. CONVERSA DE REAVALIAÇÃO QUALITATIVA
   Mostra evidência RELATADA, consciência do gap, percepção de mudança
   e dificuldade persistente. Complementa a leitura, mas NÃO substitui
   evidência demonstrada.

═══ PRINCÍPIOS ═══
1. Evidência demonstrada pesa mais que relato
2. Relato qualitativo forte pode complementar ou revelar "evolução invisível"
3. Fala bonita mas abstrata NÃO confirma evolução
4. Ausência de delta não impede leitura qualitativa (com prudência)
5. NÃO invente mudança, impacto ou comportamento
6. DISC/CIS NÃO altera nota — serve apenas como leitura contextual
7. Se as fontes conflitam, explicite o conflito e reduza a confiança

═══ ANÁLISE POR DESCRITOR ═══
Para cada descritor:
1. Nível inicial (Cenário A)
2. Nível cenário B
3. Delta numérico
4. Evidência DEMONSTRADA no Cenário B + força
5. Evidência RELATADA na conversa + força
6. Citação do colaborador, quando relevante
7. Dificuldade persistente, se houver
8. Convergência entre as fontes
9. Conexão CIS contextual
10. Confiança da leitura + limites

═══ CLASSIFICAÇÃO DE CONVERGÊNCIA ═══
- EVOLUCAO_CONFIRMADA: delta positivo + evidência demonstrada + relato convergente
- EVOLUCAO_PARCIAL: delta parcial OU evidência fraca/moderada OU relato sem sustentação total
- SEM_EVOLUCAO: sem delta + sem evidência demonstrada + sem relato consistente
- EVOLUCAO_INVISIVEL: sem delta numérico MAS evidência qualitativa forte

═══ CONSCIÊNCIA DO GAP ═══
- alta: reconhece explicitamente, cita ações de melhoria
- media: reconhece parcialmente ou de forma genérica
- baixa: não reconhece ou atribui a fatores externos

Retorne APENAS JSON válido.`;


    let gerados = 0;
    for (const colab of colaboradores) {
      const compIds = [...new Set([
        ...(respostasA || []).filter(r => r.colaborador_id === colab.id).map(r => r.competencia_id),
        ...(sessoes || []).filter(s => s.colaborador_id === colab.id).map(s => s.competencia_id),
      ])];

      for (const compId of compIds) {
        const key = `${colab.id}::${compId}`;
        const fonteA = resAMap[key];
        const fonteB = resBMap[key];
        const fonteSem15 = sessaoMap[key];
        const comp = compMap[compId];
        if (!comp || !fonteA) continue;
        if (!fonteB && !fonteSem15) continue;

        const trilha = progMap[colab.id];
        const cursosInfo = Array.isArray(trilha?.cursos_progresso)
          ? trilha.cursos_progresso
          : [];
        const cursosConcluidos = cursosInfo.filter(c => c.concluido).length;

        // Descritores (buscados antes por cod_comp)
        const descritores = descritoresMap[compId] || [];

        // Extração da conversa (sem _contexto_sessao)
        const extSem15 = fonteSem15?.extracao_qualitativa || {};
        const extLimpo = { ...extSem15 };
        delete extLimpo._contexto_sessao;

        const userBlocks: string[] = [];

        userBlocks.push(`═══ EMPRESA ═══\n${empresa.nome} (${empresa.segmento})`);
        userBlocks.push(`═══ COLABORADOR ═══\n${colab.nome_completo} · ${colab.cargo}\nDISC: ${colab.perfil_dominante || 'N/D'} (D=${colab.d_natural||0} I=${colab.i_natural||0} S=${colab.s_natural||0} C=${colab.c_natural||0})\nNOTA: DISC NÃO altera nota — serve apenas como leitura contextual.`);
        userBlocks.push(`═══ COMPETÊNCIA ═══\n${comp.nome}\n\nDescritores:\n${descritores.join('\n')}`);
        userBlocks.push(`═══ FONTE 1 — CENÁRIO A (diagnóstico inicial) ═══\nNível: N${fonteA.nivel_ia4}\nAvaliação:\n${JSON.stringify(fonteA.avaliacao_ia)}`);
        userBlocks.push(`═══ FONTE 2 — CENÁRIO B (reavaliação situacional) ═══\n${fonteB ? `Nível: N${fonteB.nivel_ia4}\nAvaliação:\n${JSON.stringify(fonteB.avaliacao_ia)}` : 'Não disponível'}`);
        userBlocks.push(`═══ FONTE 3 — CONVERSA QUALITATIVA (reavaliação pós-jornada) ═══\n${Object.keys(extLimpo).length ? JSON.stringify(extLimpo, null, 2) : 'Não disponível'}`);
        userBlocks.push(`═══ TRILHA DE CAPACITAÇÃO ═══\nProgresso: ${trilha?.pct_conclusao || 0}%\nSemana: ${trilha?.semana_atual || '?'}/14\nCursos concluídos: ${cursosConcluidos} de ${cursosInfo.length}`);

        userBlocks.push(`═══ FORMATO DE SAÍDA (JSON) ═══
{
  "resumo_executivo": "síntese curta, fiel e orientada a evolução (3-4 frases)",
  "evolucao_por_descritor": [
    {
      "descritor": "D1",
      "nome": "nome",
      "nivel_a": 2.0,
      "nivel_b": 2.8,
      "delta": 0.8,
      "evidencia_cenario_b": "síntese da evidência demonstrada",
      "forca_evidencia_cenario_b": "fraca|moderada|forte",
      "evidencia_conversa": "síntese da evidência relatada",
      "forca_evidencia_conversa": "fraca|moderada|forte",
      "citacao_colaborador": "trecho curto se houver",
      "dificuldade_persistente": "o que continua difícil, se houver",
      "convergencia": "EVOLUCAO_CONFIRMADA|EVOLUCAO_PARCIAL|SEM_EVOLUCAO|EVOLUCAO_INVISIVEL",
      "conexao_cis": "leitura contextual breve",
      "confianca": 0.75,
      "limites_da_leitura": ["limite 1"]
    }
  ],
  "ganhos_qualitativos": ["ganho 1", "ganho 2"],
  "gaps_persistentes": [
    {"gap": "nome curto", "sinal": "como aparece nas fontes", "fonte_principal": "cenario_b|conversa|ambos"}
  ],
  "consciencia_do_gap": {
    "nivel": "alta|media|baixa",
    "justificativa": "frase curta"
  },
  "trilha_efetividade": {
    "semanas_concluidas": ${trilha?.semana_atual || 0},
    "cursos_concluidos": ${cursosConcluidos},
    "correlacao": "forte|moderada|fraca|inconclusiva",
    "justificativa": "frase curta"
  },
  "recomendacao_ciclo2": {
    "descritores_foco": ["D1", "D3"],
    "justificativa": "frase curta",
    "formato_sugerido": "pratica|conteudo|mentoria|misto",
    "conexao_cis": "como adaptar ao perfil DISC ${colab.perfil_dominante || 'do colaborador'}"
  },
  "feedback_colaborador": {
    "mensagem_positiva": "o avanço mais consistente",
    "mensagem_construtiva": "o principal ponto em aberto",
    "proximo_passo": "ação sugerida pro próximo ciclo"
  },
  "alertas_metodologicos": ["alerta se houver"]
}

REGRAS:
- confianca: 0.0 a 1.0
- ganhos_qualitativos e gaps_persistentes: arrays
- feedback_colaborador: objeto estruturado (não string)
- se fontes conflitam, explicite e reduza confiança`);

        const user = userBlocks.join('\n\n');

        const resultado = await callAI(system, user, aiConfig, 8192, { temperature: TEMP });
        const fusao = await extractJSON(resultado);
        if (!fusao) continue;

        // Validação leve
        if (Array.isArray(fusao.evolucao_por_descritor)) {
          for (const d of fusao.evolucao_por_descritor) {
            if (typeof d.confianca === 'number') d.confianca = Math.max(0, Math.min(1, d.confianca));
            if (typeof d.confianca === 'string') {
              d.confianca = d.confianca === 'alta' ? 0.85 : d.confianca === 'media' ? 0.55 : 0.25;
            }
          }
        }
        // Feedback como string (compatibilidade com consumers)
        if (typeof fusao.feedback_colaborador === 'object') {
          const fb = fusao.feedback_colaborador;
          fusao.feedback_colaborador_text = [fb.mensagem_positiva, fb.mensagem_construtiva, fb.proximo_passo].filter(Boolean).join('\n');
        }

        await tdb.from('relatorios').upsert({
          colaborador_id: colab.id,
          tipo: 'evolucao',
          conteudo: { competencia: comp.nome, competencia_id: compId, ...fusao },
          gerado_em: new Date().toISOString(),
        }, { onConflict: 'empresa_id,colaborador_id,tipo' });
        gerados++;
      }
    }

    return { success: true, message: `${gerados} relatórios de evolução (fusão 3 fontes) gerados` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 6. PLENÁRIA DE EVOLUÇÃO INSTITUCIONAL
// Relatório agregado anônimo: por cargo, competência, convergência, gaps, Ciclo 2
// Tom: celebre avanços ANTES de apontar gaps
// ══════════════════════════════════════════════════════════════════════════════

export async function gerarPlenariaEvolucao(empresaId: string, aiConfig: AIConfig = {}) {
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const sbRaw = createSupabaseAdmin();
  const tdb = tenantDb(empresaId);
  try {
    const { data: empresa } = await sbRaw.from('empresas')
      .select('nome, segmento').eq('id', empresaId).single();

    const { data: relatorios } = await tdb.from('relatorios')
      .select('conteudo, colaboradores!inner(nome_completo, cargo)')
      .eq('tipo', 'evolucao');

    if (!relatorios?.length) return { success: false, error: 'Nenhum relatório de evolução. Gere a evolução primeiro.' };

    // Agregar (ANÔNIMO)
    type AggBucket = { deltas: number[]; descUp: number; descTotal: number; count: number };
    const porCargo: Record<string, AggBucket> = {}, porComp: Record<string, AggBucket> = {};
    let totalDelta = 0, totalDescUp = 0, totalDesc = 0;
    const convergencias = { EVOLUCAO_CONFIRMADA: 0, EVOLUCAO_PARCIAL: 0, SEM_EVOLUCAO: 0, EVOLUCAO_INVISIVEL: 0 };
    const gapsPersistentes: Record<string, number> = {};

    for (const rel of relatorios) {
      const c = rel.conteudo;
      const cargo = rel.colaboradores.cargo;
      const compNome = c.competencia || 'N/D';
      if (!porCargo[cargo]) porCargo[cargo] = { deltas: [], descUp: 0, descTotal: 0, count: 0 };
      if (!porComp[compNome]) porComp[compNome] = { deltas: [], descUp: 0, descTotal: 0, count: 0 };

      const re = c.resumo_executivo || {};
      const delta = re.delta || 0;
      totalDelta += delta;
      totalDescUp += re.descritores_que_subiram || 0;
      totalDesc += re.descritores_total || 0;
      porCargo[cargo].deltas.push(delta); porCargo[cargo].descUp += re.descritores_que_subiram || 0; porCargo[cargo].descTotal += re.descritores_total || 0; porCargo[cargo].count++;
      porComp[compNome].deltas.push(delta); porComp[compNome].descUp += re.descritores_que_subiram || 0; porComp[compNome].descTotal += re.descritores_total || 0; porComp[compNome].count++;

      (c.evolucao_por_descritor || []).forEach(d => {
        if (convergencias[d.convergencia] !== undefined) convergencias[d.convergencia]++;
        if (d.convergencia === 'SEM_EVOLUCAO') gapsPersistentes[d.descritor] = (gapsPersistentes[d.descritor] || 0) + 1;
      });
    }

    const avg = arr => arr.length ? (arr.reduce((s, v) => s + v, 0) / arr.length).toFixed(2) : '0';
    const totalConv = Object.values(convergencias).reduce((s, v) => s + v, 0) || 1;

    const system = `Você é o Motor de Plenária de Evolução Institucional da Vertho.

═══ TAREFA ═══
Analisar dados AGREGADOS e ANÔNIMOS de evolução de um grupo após a
jornada de desenvolvimento. Produzir leitura institucional orientada
a padrões e decisões.

═══ PRINCÍPIOS ═══
1. Dados são ANÔNIMOS — NUNCA cite nomes ou casos identificáveis
2. Use estatísticas, percentuais, tendências e padrões
3. CELEBRE avanços ANTES de apontar gaps
4. Seja construtivo, claro e orientado a ação
5. Não superinterprete sinais fracos — diga quando é tendência, não certeza
6. Evite frases genéricas que serviriam para qualquer empresa
7. Explicite limites da leitura (amostra pequena, pouca diferença, etc.)

═══ 6 SEÇÕES OBRIGATÓRIAS ═══

1. VISAO_GERAL — delta médio, % convergências, descritores com maior avanço
2. ANALISE_POR_CARGO — padrões, avanços e gaps por cargo
3. ANALISE_POR_COMPETENCIA — competências com mais tração vs mais dificuldade
4. CONVERGENCIA_DE_EVIDENCIAS — consistência do processo (confirmada/parcial/sem/invisível)
5. GAPS_PERSISTENTES — alerta institucional + riscos se nada mudar
6. RECOMENDACOES_CICLO_2 — prioridades + formatos + ações concretas

Retorne APENAS JSON válido.`;

    const userBlocks: string[] = [];
    userBlocks.push(`═══ EMPRESA ═══\n${empresa.nome} (${empresa.segmento})`);
    userBlocks.push(`═══ DADOS AGREGADOS ═══
Total: ${relatorios.length} colaboradores analisados
Delta médio: ${avg(relatorios.map((r: any) => r.conteudo?.resumo_executivo?.delta || 0))}
Descritores que subiram: ${totalDescUp} de ${totalDesc} (${totalDesc ? Math.round(totalDescUp/totalDesc*100) : 0}%)`);

    userBlocks.push(`═══ CONVERGÊNCIAS ═══
- CONFIRMADA: ${convergencias.EVOLUCAO_CONFIRMADA} (${Math.round(convergencias.EVOLUCAO_CONFIRMADA/totalConv*100)}%)
- PARCIAL: ${convergencias.EVOLUCAO_PARCIAL} (${Math.round(convergencias.EVOLUCAO_PARCIAL/totalConv*100)}%)
- SEM EVOLUÇÃO: ${convergencias.SEM_EVOLUCAO} (${Math.round(convergencias.SEM_EVOLUCAO/totalConv*100)}%)
- INVISÍVEL: ${convergencias.EVOLUCAO_INVISIVEL} (${Math.round(convergencias.EVOLUCAO_INVISIVEL/totalConv*100)}%)`);

    userBlocks.push(`═══ POR CARGO ═══\n${Object.entries(porCargo).map(([cargo, d]) => `${cargo}: delta ${avg(d.deltas)}, ${d.descUp}/${d.descTotal} descritores, ${d.count} colabs`).join('\n')}`);
    userBlocks.push(`═══ POR COMPETÊNCIA ═══\n${Object.entries(porComp).map(([comp, d]) => `${comp}: delta ${avg(d.deltas)}, ${d.descUp}/${d.descTotal} descritores`).join('\n')}`);
    userBlocks.push(`═══ GAPS PERSISTENTES (top 10) ═══\n${Object.entries(gapsPersistentes).sort((a: any,b: any) => b[1]-a[1]).slice(0,10).map(([d, n]) => `${d}: ${n} ocorrências`).join('\n')}`);

    userBlocks.push(`═══ FORMATO DE SAÍDA (JSON) ═══
{
  "visao_geral_da_evolucao": {
    "resumo_executivo": "síntese institucional curta",
    "delta_medio": 0.0,
    "percentuais_convergencia": {
      "evolucao_confirmada": 0, "evolucao_parcial": 0,
      "sem_evolucao": 0, "evolucao_invisivel": 0
    },
    "descritores_com_maior_evolucao": ["desc 1", "desc 2"],
    "leitura_geral": "texto curto"
  },
  "analise_por_cargo": [
    {"cargo": "nome", "principais_avancos": ["avanço 1"], "gaps_mais_frequentes": ["gap 1"], "leitura": "síntese prudente"}
  ],
  "analise_por_competencia": [
    {"competencia": "nome", "sinais_de_avanco": ["sinal 1"], "pontos_de_atencao": ["ponto 1"], "leitura": "síntese curta"}
  ],
  "convergencia_de_evidencias": {
    "leitura": "consistência das evidências",
    "pontos_fortes_do_processo": ["ponto 1"],
    "limites_do_processo": ["limite 1"]
  },
  "gaps_persistentes_alerta_institucional": {
    "top_gaps": ["gap 1", "gap 2"],
    "leitura": "por que isso importa",
    "riscos_se_nada_mudar": ["risco 1"]
  },
  "recomendacoes_para_ciclo_2": {
    "prioridades_por_competencia": ["prioridade 1"],
    "prioridades_por_cargo": ["prioridade 1"],
    "formatos_sugeridos": ["pratica", "mentoria"],
    "acoes_recomendadas": ["ação 1", "ação 2"]
  },
  "alertas_metodologicos": ["alerta 1"],
  "limites_da_leitura": ["limite 1"]
}`);

    const user = userBlocks.join('\n\n');
    const resultado = await callAI(system, user, aiConfig, 8192, { temperature: TEMP });
    const plenaria = await extractJSON(resultado);

    if (plenaria) {
      await upsertRelatorioAgregado(tdb, 'plenaria_evolucao', plenaria);
    }

    return { success: true, message: 'Plenária de evolução institucional gerada' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 7. FUNÇÕES AUXILIARES (compatibilidade)
// ══════════════════════════════════════════════════════════════════════════════

export async function gerarRelatoriosEvolucaoLote(empresaId: string, aiConfig: AIConfig = {}) {
  return gerarEvolucaoFusao(empresaId, aiConfig);
}

export async function gerarRelatorioRHManual(empresaId: string, aiConfig: AIConfig = {}) {
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const sbRaw = createSupabaseAdmin();
  const tdb = tenantDb(empresaId);
  try {
    const { data: empresa } = await sbRaw.from('empresas').select('nome, segmento').eq('id', empresaId).single();
    const { data: relEvolucao } = await tdb.from('relatorios').select('*, colaboradores(nome_completo, cargo)').eq('tipo', 'evolucao');
    const { data: relRHAnterior } = await tdb.from('relatorios').select('conteudo').eq('tipo', 'rh').maybeSingle();
    const { data: relPlenaria } = await tdb.from('relatorios').select('conteudo').eq('tipo', 'plenaria_evolucao').maybeSingle();

    const system = `Você é um consultor estratégico de RH da plataforma Vertho.

Sua tarefa é gerar um RELATÓRIO DE RH PÓS-CICLO, com base em:
- um relatório anterior de RH
- e os dados agregados de evolução após o ciclo de desenvolvimento

ATENÇÃO:
Este relatório não é um resumo institucional genérico.
Não é um texto de comemoração.
Não é uma peça de marketing.
Ele deve ser um relatório executivo, analítico e útil para decisão de RH.

OBJETIVO CENTRAL:
Comparar o diagnóstico anterior com a evolução observada e produzir leitura estratégica sobre:
- o que mudou
- o que permaneceu
- o que vale sustentar
- o que precisa entrar no próximo ciclo
- que tipo de retorno organizacional o desenvolvimento parece ter gerado

PRINCÍPIOS INEGOCIÁVEIS:
1. Seja estratégico e orientado a decisão.
2. Compare sempre "antes x depois".
3. Não force impacto onde a base for fraca.
4. Celebre avanços reais, sem inflar conclusões.
5. Diferencie claramente gap resolvido, mitigado e persistente.
6. Use linguagem executiva, clara e útil.
7. Toda recomendação relevante deve ter conexão com os dados.
8. Quando houver limitação metodológica, explicite.

RETORNE APENAS JSON VÁLIDO, sem markdown, sem texto antes ou depois.`;

    const userBlocks: string[] = [];
    userBlocks.push(`═══ EMPRESA ═══\n${empresa.nome} (${empresa.segmento})`);

    if (relRHAnterior?.conteudo) {
      userBlocks.push(`═══ RELATÓRIO RH ANTERIOR (baseline) ═══\n${JSON.stringify(relRHAnterior.conteudo, null, 2).slice(0, 3000)}`);
    }

    if (relPlenaria?.conteudo) {
      userBlocks.push(`═══ PLENÁRIA DE EVOLUÇÃO ═══\n${JSON.stringify(relPlenaria.conteudo, null, 2).slice(0, 3000)}`);
    }

    // Dados de evolução (anônimos — só cargo + conteúdo)
    const evolucaoAnonima = (relEvolucao || []).map((r: any) => ({
      cargo: r.colaboradores?.cargo,
      competencia: r.conteudo?.competencia,
      resumo: r.conteudo?.resumo_executivo?.leitura_geral || r.conteudo?.resumo_executivo?.sintese || '',
      convergencias: (r.conteudo?.evolucao_por_descritor || []).map((d: any) => d.convergencia),
      gaps: r.conteudo?.gaps_persistentes || [],
      ganhos: r.conteudo?.ganhos_qualitativos || [],
    }));
    userBlocks.push(`═══ EVOLUÇÃO AGREGADA (${evolucaoAnonima.length} colaboradores — anônimo) ═══\n${JSON.stringify(evolucaoAnonima, null, 2)}`);

    userBlocks.push(`FORMATO DE SAÍDA (JSON):
{
  "resumo_executivo": {
    "leitura_geral": "síntese executiva do que o ciclo entregou",
    "principal_ganho": "texto curto",
    "principal_lacuna_remanescente": "texto curto"
  },
  "roi_desenvolvimento": {
    "leitura": "interpretação prudente do retorno do ciclo",
    "sinais_de_retorno": ["sinal 1", "sinal 2"],
    "limites_da_inferencia": ["limite 1"]
  },
  "evolucao_organizacional": {
    "sintese": "texto curto",
    "ganhos_mais_consistentes": ["ganho 1"],
    "evidencias_agregadas": ["evidência 1"]
  },
  "gaps_resolvidos": [
    {"gap": "nome", "o_que_mudou": "síntese da evolução", "grau_resolucao": "resolvido|mitigado"}
  ],
  "gaps_persistentes": [
    {"gap": "nome", "por_que_permanece": "síntese curta", "risco_organizacional": "texto curto"}
  ],
  "recomendacoes_estrategicas": [
    {"recomendacao": "ação estratégica", "horizonte": "curto|medio|longo", "justificativa": "por que agora"}
  ],
  "proximos_ciclos": {
    "focos_prioritarios": ["foco 1"],
    "publicos_prioritarios": ["público 1"],
    "formatos_recomendados": ["formato 1"],
    "criterio_de_priorizacao": "lógica usada"
  },
  "alertas_metodologicos": ["alerta 1"]
}

REGRAS:
- comparar diagnóstico anterior x evolução atual
- evitar afirmações causais absolutas
- roi_desenvolvimento prudente e útil
- máximo 5 recomendações estratégicas
- máximo 5 focos prioritários
- sem linguagem genérica que serviria para qualquer empresa`);

    const user = userBlocks.join('\n\n');
    const resultado = await callAI(system, user, aiConfig, 8192, { temperature: TEMP });
    const relatorio = await extractJSON(resultado);
    if (relatorio) {
      await upsertRelatorioAgregado(tdb, 'rh_manual', relatorio);
    }
    return { success: true, message: 'Relatório RH manual gerado' };
  } catch (err) { return { success: false, error: err.message }; }
}

export async function gerarRelatorioPlenaria(empresaId: string, aiConfig: AIConfig = {}) {
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const sbRaw = createSupabaseAdmin();
  const tdb = tenantDb(empresaId);
  try {
    const { data: plenaria } = await tdb.from('relatorios').select('conteudo').eq('tipo', 'plenaria_evolucao').maybeSingle();
    if (!plenaria) return { success: false, error: 'Plenária de evolução não encontrada.' };
    const { data: empresa } = await sbRaw.from('empresas').select('nome, segmento').eq('id', empresaId).single();
    const { data: relRH } = await tdb.from('relatorios').select('conteudo').eq('tipo', 'rh_manual').maybeSingle();

    const system = `Você é um redator executivo institucional da Vertho.

Sua tarefa é transformar os dados consolidados de uma plenária de evolução em um RELATÓRIO FORMAL DE PLENÁRIA, claro, organizado e útil para registro institucional e tomada de decisão.

ATENÇÃO:
Este relatório não é uma ata literal.
Não é uma transcrição de reunião.
Não é um texto genérico de consultoria.
Ele deve ser um documento formal, executivo e acionável.

PRINCÍPIOS INEGOCIÁVEIS:
1. Mantenha anonimato dos participantes e dados individuais.
2. Diferencie claramente dado apresentado de decisão tomada.
3. Não invente consenso, fala ou encaminhamento.
4. Organize o relatório com clareza institucional.
5. Seja formal, mas sem burocracia excessiva.
6. O relatório deve ser útil para leitura posterior e memória do ciclo.
7. Valorize avanços reais sem esconder gaps importantes.

RETORNE APENAS JSON VÁLIDO, sem markdown, sem texto antes ou depois.`;

    const userBlocks: string[] = [];
    userBlocks.push(`═══ EMPRESA ═══\n${empresa.nome} (${empresa.segmento})\nData: ${new Date().toISOString().split('T')[0]}`);
    userBlocks.push(`═══ DADOS DA PLENÁRIA DE EVOLUÇÃO ═══\n${JSON.stringify(plenaria.conteudo, null, 2).slice(0, 5000)}`);
    if (relRH?.conteudo) {
      userBlocks.push(`═══ RELATÓRIO RH (contexto estratégico) ═══\n${JSON.stringify(relRH.conteudo, null, 2).slice(0, 2000)}`);
    }

    userBlocks.push(`FORMATO DE SAÍDA (JSON):
{
  "identificacao": {
    "titulo": "Relatório de Plenária de Evolução",
    "empresa": "${empresa.nome}",
    "competencia_ou_escopo": "competência, programa ou escopo da plenária",
    "periodo_referente": "texto curto",
    "data_relatorio": "${new Date().toISOString().split('T')[0]}"
  },
  "pauta": {
    "objetivo_da_plenaria": "texto curto",
    "topicos_principais": ["tópico 1", "tópico 2"]
  },
  "resultados_apresentados": {
    "visao_geral": "síntese executiva dos resultados apresentados",
    "destaques_positivos": ["destaque 1"],
    "pontos_de_atencao": ["ponto 1"]
  },
  "leitura_institucional": {
    "interpretacao_geral": "texto curto",
    "tensoes_relevantes": ["tensão 1"],
    "implicacoes_para_o_negocio_ou_operacao": ["implicação 1"]
  },
  "deliberacoes": [
    {"deliberacao": "decisão ou consenso assumido", "justificativa": "por que fez sentido"}
  ],
  "encaminhamentos": [
    {"encaminhamento": "ação definida", "responsavel_tipo": "RH|lideranca|gestor|empresa", "horizonte": "imediato|curto|medio", "objetivo": "o que busca produzir"}
  ],
  "fechamento_executivo": {
    "sintese_final": "síntese curta e formal",
    "proximo_marco_sugerido": "texto curto"
  },
  "alertas_metodologicos": ["alerta 1"]
}

REGRAS:
- manter linguagem formal e clara
- não citar nomes de participantes
- resultados_apresentados deve refletir o que foi mostrado
- deliberacoes só devem aparecer quando defensáveis
- encaminhamentos claros e acionáveis
- máximo 6 deliberações, máximo 8 encaminhamentos
- sem linguagem genérica que serviria para qualquer plenária`);

    const user = userBlocks.join('\n\n');
    const resultado = await callAI(system, user, aiConfig, 8192, { temperature: TEMP });
    const relatorio = await extractJSON(resultado);
    if (relatorio) {
      await upsertRelatorioAgregado(tdb, 'plenaria_relatorio', relatorio);
    }
    return { success: true, message: 'Relatório formal da plenária gerado' };
  } catch (err: any) { return { success: false, error: err.message }; }
}

export async function enviarLinksPerfil(empresaId: string) {
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const sbRaw = createSupabaseAdmin();
  const tdb = tenantDb(empresaId);
  try {
    const { data: empresa } = await sbRaw.from('empresas').select('nome, slug').eq('id', empresaId).single();
    const { data: colaboradores } = await tdb.from('colaboradores').select('id, nome_completo, email');
    if (!colaboradores?.length) return { success: false, error: 'Nenhum colaborador encontrado' };
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    let enviados = 0;
    for (const colab of colaboradores) {
      try {
        await resend.emails.send({
          from: tenantEmailFrom(empresa.slug, 'Vertho Mentor'),
          to: colab.email,
          subject: `[${empresa.nome}] Seu Perfil de Evolução`,
          html: `<p>Olá ${colab.nome_completo}!</p><p>Seu perfil está disponível.</p><p><a href="${tenantUrl(empresa.slug, '/dashboard/evolucao')}" style="background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;">Acessar Perfil</a></p>`,
        });
        enviados++;
      } catch {}
    }
    return { success: true, message: `${enviados} links enviados` };
  } catch (err) { return { success: false, error: err.message }; }
}

export async function gerarDossieGestor(empresaId: string, aiConfig: AIConfig = {}) {
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const sbRaw = createSupabaseAdmin();
  const tdb = tenantDb(empresaId);
  try {
    const { data: empresa } = await sbRaw.from('empresas').select('nome, segmento').eq('id', empresaId).single();
    const { data: todos } = await tdb.from('relatorios').select('tipo, conteudo, colaboradores(nome_completo, cargo)');
    const { data: relPlenaria } = await tdb.from('relatorios').select('conteudo').eq('tipo', 'plenaria_evolucao').maybeSingle();
    const { data: relRH } = await tdb.from('relatorios').select('conteudo').eq('tipo', 'rh_manual').maybeSingle();

    const porTipo: Record<string, any[]> = {};
    for (const r of todos || []) {
      if (!porTipo[r.tipo]) porTipo[r.tipo] = [];
      porTipo[r.tipo].push({ colaborador: r.colaboradores?.nome_completo, cargo: r.colaboradores?.cargo, resumo: r.conteudo?.resumo_executivo || r.conteudo?.evolucao_geral });
    }

    const system = `Você é um consultor executivo de desenvolvimento de equipes da Vertho.

Sua tarefa é gerar um DOSSIÊ DO GESTOR, com base no diagnóstico inicial da equipe, na evolução observada ao longo do ciclo e nas implicações práticas para a gestão.

ATENÇÃO:
Este dossiê não é um resumo bonito do projeto.
Não é uma peça de marketing.
Não é um relatório individual.
Ele deve ser um documento executivo, claro e útil para o gestor entender o time e agir melhor sobre ele.

PRINCÍPIOS INEGOCIÁVEIS:
1. Seja executivo, claro e acionável.
2. Compare diagnóstico inicial e evolução observada.
3. Não force conclusões positivas.
4. Diferencie avanço consistente de ganho parcial.
5. O ROI deve ser prudente e gerencial, não fictício.
6. Toda recomendação relevante deve ter conexão com os dados.
7. O dossiê deve ajudar o gestor a agir, não apenas a entender.
8. Sem linguagem genérica que serviria para qualquer equipe.

RETORNE APENAS JSON VÁLIDO, sem markdown, sem texto antes ou depois.`;

    const userBlocks: string[] = [];
    userBlocks.push(`EMPRESA: ${empresa.nome} (${empresa.segmento})`);
    if (relPlenaria?.conteudo) userBlocks.push(`PLENÁRIA DE EVOLUÇÃO:\n${JSON.stringify(relPlenaria.conteudo, null, 2).slice(0, 3000)}`);
    if (relRH?.conteudo) userBlocks.push(`RELATÓRIO RH:\n${JSON.stringify(relRH.conteudo, null, 2).slice(0, 2000)}`);
    userBlocks.push(`RELATÓRIOS POR TIPO:\n${JSON.stringify(porTipo, null, 2).slice(0, 4000)}`);

    userBlocks.push(`FORMATO DE SAÍDA (JSON):
{
  "titulo": "Dossiê Executivo do Gestor",
  "sumario_executivo": {
    "leitura_geral": "síntese executiva curta",
    "principal_ganho_do_ciclo": "texto curto",
    "principal_alerta_para_gestao": "texto curto"
  },
  "diagnostico_inicial": {
    "fotografia_da_equipe": "síntese do ponto de partida",
    "forcas_iniciais": ["força 1"],
    "riscos_iniciais": ["risco 1"],
    "implicacao_gerencial_inicial": "o que isso significava para o gestor"
  },
  "evolucao": {
    "sintese": "texto curto",
    "avancos_consistentes": [
      {"tema": "nome do avanço", "evidencia": "síntese curta"}
    ],
    "ganhos_parciais": [
      {"tema": "ganho parcial", "limite": "o que faltou consolidar"}
    ],
    "gaps_que_permanecem": [
      {"gap": "nome", "risco_para_gestao": "por que importa"}
    ]
  },
  "roi": {
    "leitura": "retorno gerencial prudente do ciclo",
    "ganhos_para_a_gestao": ["ganho 1"],
    "limites_do_retorno": ["limite 1"]
  },
  "recomendacoes": [
    {"recomendacao": "ação sugerida", "horizonte": "imediato|curto|medio", "objetivo": "o que pretende", "justificativa": "por que faz sentido"}
  ],
  "conclusao": {
    "fechamento": "síntese final executiva",
    "proximo_passo_recomendado": "texto curto"
  },
  "alertas_metodologicos": ["alerta 1"]
}

REGRAS:
- integrar diagnóstico + evolução + implicação gerencial
- roi prudente e útil
- máximo 6 recomendações
- diferenciar avanço consistente, ganho parcial e gap persistente
- sem linguagem vaga ou genérica`);

    const user = userBlocks.join('\n\n');
    const resultado = await callAI(system, user, aiConfig, 8192, { temperature: TEMP });
    const dossie = await extractJSON(resultado);
    if (dossie) {
      await upsertRelatorioAgregado(tdb, 'dossie_gestor', dossie);
    }
    return { success: true, message: 'Dossiê do gestor gerado' };
  } catch (err: any) { return { success: false, error: err.message }; }
}

export async function checkCenarios(empresaId: string, aiConfig: AIConfig = {}) {
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const tdb = tenantDb(empresaId);
  try {
    const { data: cenarios } = await tdb.from('banco_cenarios')
      .select('id, titulo, descricao, cargo, alternativas, competencia_id')
      .or('tipo_cenario.is.null,tipo_cenario.neq.cenario_b')
      .order('cargo');
    if (!cenarios?.length) return { success: false, error: 'Nenhum cenário encontrado' };

    // Buscar nomes de competências
    const compIds = [...new Set(cenarios.map((c: any) => c.competencia_id).filter(Boolean))] as string[];
    const compMap: Record<string, string> = {};
    for (const cid of compIds) {
      const { data: comp } = await tdb.from('competencias').select('nome').eq('id', cid).maybeSingle();
      if (comp) compMap[cid] = comp.nome;
    }

    // Montar resumo por cenário (até 20)
    const lote = cenarios.slice(0, 20).map((c: any) => {
      const alt = typeof c.alternativas === 'object' && !Array.isArray(c.alternativas) ? c.alternativas : {};
      return {
        id: c.id,
        titulo: c.titulo,
        cargo: c.cargo,
        competencia: compMap[c.competencia_id] || '—',
        contexto_resumido: (c.descricao || '').slice(0, 300),
        faceta: alt.faceta_testada_principal || alt.faceta_avaliada || '',
        tradeoff: alt.tradeoff_testado || '',
        armadilha: alt.armadilha_de_resposta_generica || '',
        perguntas: [alt.p1, alt.p2, alt.p3, alt.p4].filter(Boolean).length,
      };
    });

    const system = `Você é um auditor de qualidade de cenários da Vertho.

Sua tarefa é analisar um LOTE de cenários e verificar se têm qualidade metodológica e editorial suficiente para uso na plataforma.

ATENÇÃO:
Você NÃO está apenas revisando texto.
Você NÃO está procurando "cenários bonitos".
Você está auditando se cada cenário realmente funciona como instrumento prático e discriminante de avaliação ou desenvolvimento.

PRINCÍPIOS INEGOCIÁVEIS:
1. Realismo contextual importa.
2. Dilema concreto importa.
3. Poder discriminante importa.
4. Perguntas genéricas enfraquecem o cenário.
5. Texto bonito não compensa fraqueza metodológica.
6. Cenário com baixa utilidade prática não deve ser aprovado.
7. Toda ressalva ou reprovação deve gerar orientação clara de correção.

SINAIS DE PROBLEMA:
- situação abstrata demais
- contexto pouco plausível
- conflito fraco
- pergunta óbvia ou moralizante
- resposta "conversaria com todos" resolve fácil
- baixa diferença entre respostas fortes e fracas
- descritor mal testado
- excesso de didatismo
- cenário muito parecido com outros do lote

RETORNE APENAS JSON VÁLIDO, sem markdown, sem texto antes ou depois.`;

    const user = `LOTE DE ${lote.length} CENÁRIOS:

${JSON.stringify(lote, null, 2)}

FORMATO DE SAÍDA (JSON):
{
  "total": ${lote.length},
  "aprovados": 0,
  "com_ressalvas": 0,
  "reprovados": 0,
  "detalhes": [
    {
      "cenario_id": "id",
      "titulo": "titulo",
      "status": "aprovado|com_ressalvas|reprovado",
      "nota_geral": 0,
      "dimensoes": {
        "aderencia_competencia": 0,
        "realismo_contextual": 0,
        "dilema_e_tensao": 0,
        "poder_discriminante": 0,
        "qualidade_perguntas": 0,
        "risco_de_generico": 0,
        "prontidao_para_uso": 0
      },
      "forcas": ["força 1"],
      "problemas": ["problema 1"],
      "ajustes_sugeridos": ["ajuste 1"],
      "justificativa_curta": "síntese objetiva do veredito"
    }
  ],
  "leitura_do_lote": {
    "padroes_positivos": ["padrão 1"],
    "padroes_de_risco": ["risco 1"],
    "recomendacao_editorial": "síntese do que fazer com o lote"
  },
  "alertas_metodologicos": ["alerta 1"]
}

REGRAS:
- nota_geral e dimensões em escala 0-10
- aprovado ≥ 7, com_ressalvas 5-6.9, reprovado < 5
- risco_de_generico é invertida: quanto maior, pior
- justificativa_curta clara e específica
- ajustes_sugeridos acionáveis
- não aprovar por benevolência
- leitura_do_lote obrigatória com padrões agregados`;

    const resultado = await callAI(system, user, { model: aiConfig?.model || 'gemini-3-flash-preview' }, 8192, { temperature: TEMP });
    const verificacao = await extractJSON(resultado);
    return {
      success: true,
      message: `Verificação: ${verificacao?.aprovados || 0} aprovados, ${verificacao?.com_ressalvas || 0} com ressalvas, ${verificacao?.reprovados || 0} reprovados`,
      verificacao,
    };
  } catch (err: any) { return { success: false, error: err.message }; }
}

// ══════════════════════════════════════════════════════════════════════════════
// 9. CARREGAR CENÁRIOS B (para tela de visualização)
// ══════════════════════════════════════════════════════════════════════════════

export async function loadCenariosB(empresaId: string) {
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
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const sbRaw = createSupabaseAdmin();
  const tdb = tenantDb(empresaId);
  try {
    const { data: cenarios } = await tdb.from('banco_cenarios')
      .select('id, empresa_id, titulo, descricao, cargo, competencia_id, alternativas, nota_check')
      .eq('tipo_cenario', 'cenario_b');

    if (!cenarios?.length) return { success: false, error: 'Nenhum cenário B encontrado. Gere cenários B primeiro.' };

    const pendentes = cenarios.filter(c => c.nota_check == null);
    if (!pendentes.length) return { success: true, message: `Todos os ${cenarios.length} cenários B já foram checados` };

    const modelo = aiConfig?.checkModel || aiConfig?.model || 'gemini-3-flash-preview';
    const pppResumo = await fetchPppResumo(tdb);
    const compCache = {}, descCache = {};
    let ok = 0, erros = 0;

    for (const cen of pendentes) {
      try {
        let comp = compCache[cen.competencia_id];
        if (!comp) {
          const { data } = await tdb.from('competencias')
            .select('id, nome, cod_comp').eq('id', cen.competencia_id).maybeSingle();
          comp = compCache[cen.competencia_id] = data || null;
        }
        let descritoresTexto = descCache[cen.competencia_id];
        if (descritoresTexto === undefined) {
          descritoresTexto = descCache[cen.competencia_id] = comp ? await fetchDescritoresTexto(tdb, comp.cod_comp) : '';
        }
        const r = await runCheckOnCenB(sbRaw, cen, comp, descritoresTexto, pppResumo, modelo);
        if (r.success) ok++; else erros++;
      } catch { erros++; }
    }

    return { success: true, message: `Check cenários B: ${ok} checados${erros ? `, ${erros} erros` : ''} (${cenarios.length - pendentes.length} já checados antes)` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 11. REGENERAR + RECHECAR EM LOTE (todos os cenários B com nota < 90)
// ══════════════════════════════════════════════════════════════════════════════

export async function regenerarERecheckarCenariosBLote(empresaId: string, aiConfig: Fase5Config = {}) {
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const tdb = tenantDb(empresaId);
  try {
    let query = tdb.from('banco_cenarios')
      .select('id, nota_check, titulo')
      .eq('tipo_cenario', 'cenario_b');
    if (!aiConfig?.incluirAprovados) query = query.lt('nota_check', 90);
    const { data: cenarios } = await query;

    if (!cenarios?.length) return { success: true, message: 'Nenhum cenário B para regenerar' };

    const checkModel = aiConfig?.checkModel || 'gemini-3-flash-preview';
    let regenerados = 0, aprovados = 0, revisar = 0, erros = 0;

    for (const c of cenarios) {
      try {
        const r1 = await regenerarCenarioB(c.id, { model: aiConfig?.model });
        if (!r1.success) { erros++; continue; }
        regenerados++;
        const r2 = await checkCenarioBUm(c.id, checkModel);
        if (r2.success) {
          if (r2.status === 'aprovado') aprovados++; else revisar++;
        }
      } catch { erros++; }
    }

    return { success: true, message: `${regenerados} regenerados | ${aprovados} aprovados, ${revisar} ainda para revisar${erros ? `, ${erros} erros` : ''}` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
