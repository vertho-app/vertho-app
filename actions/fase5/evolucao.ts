'use server';

import { tenantDb } from '@/lib/tenant-db';
import { callAI, type AIConfig } from '../ai-client';
import { extractJSON } from '../utils';
import { formatPerfilContext } from '@/lib/perfil-comportamental';
import { requireAdminSupabase } from '@/lib/admin-supabase';
import { TEMP, upsertRelatorioAgregado } from './_shared';

// ══════════════════════════════════════════════════════════════════════════════
// 5. EVOLUÇÃO COM FUSÃO DE 3 FONTES
// Cenário A + Cenário B + Conversa Sem15
// Convergência: CONFIRMADA, PARCIAL, SEM_EVOLUCAO, INVISIVEL
// Inclui: ganhos_qualitativos, trilha detalhada, conexao_cis em recomendação
// ══════════════════════════════════════════════════════════════════════════════

export async function gerarEvolucaoFusao(empresaId: string, aiConfig: AIConfig = {}) {
  const sbRaw = await requireAdminSupabase('ai.audit.regenerate');
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const tdb = tenantDb(empresaId);
  try {
    const { data: empresa } = await sbRaw.from('empresas')
      .select('nome, segmento').eq('id', empresaId).single();

    const { data: colaboradores } = await tdb.from('colaboradores')
      .select('id, nome_completo, cargo, perfil_dominante, d_natural, i_natural, s_natural, c_natural, perfil_externo_fonte, perfil_externo_dados');
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
        userBlocks.push(`═══ COLABORADOR ═══\n${colab.nome_completo} · ${colab.cargo}\n${formatPerfilContext(colab)}\nNOTA: o perfil comportamental NÃO altera nota — serve apenas como leitura contextual.`);
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
  const sbRaw = await requireAdminSupabase('ai.audit.regenerate');
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
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
