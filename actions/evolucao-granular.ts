'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { callAI, type AIConfig } from './ai-client';
import { extractJSON } from './utils';

/**
 * Gera evolucao granular por descritor, comparando avaliacao inicial vs reavaliacao.
 * Para cada descritor da competencia, calcula delta, evidencias do Cenario B,
 * convergencia com expectativas e conexao com perfil DISC (CIS).
 *
 * @param {string} empresaId - ID da empresa
 * @param {string} colaboradorId - ID do colaborador
 * @param {object} aiConfig - { model?: string }
 * @returns {{ success: boolean, descritores?: array, error?: string }}
 */
export async function gerarEvolucaoDescritores(empresaId: string, colaboradorId: string, aiConfig: AIConfig = {}) {
  const sb = createSupabaseAdmin();

  try {
    // 1. Load colaborador with DISC profile
    const { data: colaborador, error: colabErr } = await sb
      .from('colaboradores')
      .select('id, nome_completo, cargo, perfil_dominante, d_natural, i_natural, s_natural, c_natural, empresa_id')
      .eq('id', colaboradorId)
      .eq('empresa_id', empresaId)
      .single();

    if (colabErr || !colaborador) {
      return { success: false, error: `Colaborador nao encontrado: ${colabErr?.message || 'ID invalido'}` };
    }

    // 2. Load all sessoes_avaliacao for this colaborador (initial + reavaliacao)
    const { data: sessoes, error: sessErr } = await sb
      .from('sessoes_avaliacao')
      .select('id, competencia_id, avaliacao_final, tipo, created_at, cenario_id')
      .eq('colaborador_id', colaboradorId)
      .order('created_at', { ascending: true });

    if (sessErr || !sessoes?.length) {
      return { success: false, error: `Nenhuma sessao encontrada: ${sessErr?.message || 'sem dados'}` };
    }

    // Group sessions by competencia_id and find pairs (initial + reavaliacao)
    const pairsMap: Record<string, any[]> = {};
    for (const s of sessoes) {
      const key = s.competencia_id;
      if (!pairsMap[key]) pairsMap[key] = [];
      pairsMap[key].push(s);
    }

    // Filter only competencias that have at least 2 sessions (initial + reavaliacao)
    const pairs = Object.entries(pairsMap).filter(([, arr]) => arr.length >= 2);

    if (!pairs.length) {
      return { success: false, error: 'Nenhuma competencia com avaliacao inicial E reavaliacao encontrada' };
    }

    const allDescritores = [];

    for (const [competenciaId, sessoesComp] of pairs) {
      const sessaoInicial = sessoesComp[0];
      const sessaoReav = sessoesComp[sessoesComp.length - 1];

      // 3. Load competencia with gabarito
      const { data: competencia, error: compErr } = await sb
        .from('competencias')
        .select('id, nome, descricao, gabarito')
        .eq('id', competenciaId)
        .single();

      if (compErr || !competencia) continue;

      // 4. Load cenarios for context
      const cenarioIds = [sessaoInicial.cenario_id, sessaoReav.cenario_id].filter(Boolean);
      const { data: cenarios } = await sb
        .from('banco_cenarios')
        .select('id, titulo, descricao, origin')
        .in('id', cenarioIds);

      const cenarioB = cenarios?.find(c => c.origin === 'cenario_b') || cenarios?.[1] || null;

      // 5. Call Claude to compare at descriptor level
      const discProfile = {
        perfil_dominante: colaborador.perfil_dominante,
        D: colaborador.d_natural,
        I: colaborador.i_natural,
        S: colaborador.s_natural,
        C: colaborador.c_natural,
      };

      const system = `Voce e um especialista em avaliacao de competencias comportamentais com profundo conhecimento da metodologia DISC.
Sua tarefa e analisar a evolucao de um colaborador entre avaliacao inicial e reavaliacao, descritor por descritor.
Responda APENAS com JSON valido, sem texto adicional.`;

      const user = `## Competencia
Nome: ${competencia.nome}
Descricao: ${competencia.descricao}
Gabarito (descritores e niveis): ${JSON.stringify(competencia.gabarito)}

## Perfil DISC do colaborador
${JSON.stringify(discProfile)}

## Avaliacao Inicial
${JSON.stringify(sessaoInicial.avaliacao_final)}

## Reavaliacao
${JSON.stringify(sessaoReav.avaliacao_final)}

## Cenario B utilizado na reavaliacao
${cenarioB ? JSON.stringify({ titulo: cenarioB.titulo, descricao: cenarioB.descricao }) : 'Nao disponivel'}

## Instrucoes
Para CADA descritor presente no gabarito da competencia, analise a evolucao e retorne um array JSON:

[
  {
    "descritor": "Nome/identificador do descritor",
    "nivel_inicial": 1-5,
    "nivel_reavaliacao": 1-5,
    "delta": -4 a +4,
    "evidencia_cenario_B": "Que evidencia do Cenario B mostra a mudanca (ou falta dela) neste descritor",
    "convergencia": "sim|parcial|nao — a aprendizagem convergiu com o esperado?",
    "convergencia_detalhe": "Explicacao breve da convergencia",
    "conexao_CIS": "Como o perfil DISC (${colaborador.perfil_dominante}) se relaciona com a mudanca neste descritor",
    "recomendacao": "Proximos passos para desenvolvimento neste descritor"
  }
]

Seja preciso nos niveis, baseando-se nos dados da avaliacao_final.
Se a avaliacao_final nao tiver dados por descritor, estime com base no contexto geral.`;

      const resultado = await callAI(system, user, aiConfig, 32768);
      const descritores = await extractJSON(resultado);

      if (!descritores || !Array.isArray(descritores)) continue;

      // 6. UPSERT into evolucao_descritores
      for (const desc of descritores) {
        const record = {
          colaborador_id: colaboradorId,
          empresa_id: empresaId,
          competencia_id: competenciaId,
          sessao_inicial_id: sessaoInicial.id,
          sessao_reavaliacao_id: sessaoReav.id,
          descritor: desc.descritor,
          nivel_inicial: desc.nivel_inicial,
          nivel_reavaliacao: desc.nivel_reavaliacao,
          delta: desc.delta,
          evidencia_cenario_b: desc.evidencia_cenario_B,
          convergencia: desc.convergencia,
          convergencia_detalhe: desc.convergencia_detalhe,
          conexao_cis: desc.conexao_CIS,
          recomendacao: desc.recomendacao,
          updated_at: new Date().toISOString(),
        };

        const { error: upsertErr } = await sb
          .from('evolucao_descritores')
          .upsert(record, {
            onConflict: 'colaborador_id,competencia_id,descritor',
          });

        if (upsertErr) {
          console.error(`[gerarEvolucaoDescritores] Upsert error for descritor "${desc.descritor}":`, upsertErr.message);
        }

        allDescritores.push(record);
      }
    }

    return { success: true, descritores: allDescritores };
  } catch (err) {
    console.error('[gerarEvolucaoDescritores] Error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Gera analise de convergencia CIS (Competencia-Individuo-Situacao).
 * Cruza os dados de evolucao com o perfil DISC para identificar:
 * - Quais melhorias se alinham com forcas DISC
 * - Quais lacunas persistem apesar de vantagens DISC
 * - Padroes de aprendizagem ligados ao perfil
 *
 * @param {string} empresaId - ID da empresa
 * @param {string} colaboradorId - ID do colaborador
 * @returns {{ success: boolean, analise?: object, error?: string }}
 */
export async function gerarConvergenciaCIS(empresaId: string, colaboradorId: string) {
  const sb = createSupabaseAdmin();

  try {
    // 1. Load colaborador DISC scores
    const { data: colaborador, error: colabErr } = await sb
      .from('colaboradores')
      .select('id, nome_completo, perfil_dominante, d_natural, i_natural, s_natural, c_natural')
      .eq('id', colaboradorId)
      .eq('empresa_id', empresaId)
      .single();

    if (colabErr || !colaborador) {
      return { success: false, error: `Colaborador nao encontrado: ${colabErr?.message || 'ID invalido'}` };
    }

    // 2. Load evolucao_descritores data
    const { data: evolucao, error: evolErr } = await sb
      .from('evolucao_descritores')
      .select('*, competencias!inner(nome, descricao)')
      .eq('colaborador_id', colaboradorId)
      .eq('empresa_id', empresaId);

    if (evolErr || !evolucao?.length) {
      return { success: false, error: `Dados de evolucao nao encontrados: ${evolErr?.message || 'Execute gerarEvolucaoDescritores primeiro'}` };
    }

    // 3. Build DISC profile analysis
    const discScores = {
      D: colaborador.d_natural,
      I: colaborador.i_natural,
      S: colaborador.s_natural,
      C: colaborador.c_natural,
    };

    const dominante = colaborador.perfil_dominante;

    // Identify strengths and weaknesses from DISC
    const sortedDISC = Object.entries(discScores)
      .sort(([, a], [, b]) => b - a);
    const discFortes = sortedDISC.slice(0, 2).map(([k]) => k);
    const discFracos = sortedDISC.slice(2).map(([k]) => k);

    // DISC trait mapping for analysis
    const discTraits = {
      D: { forte: 'decisao rapida, assertividade, foco em resultados', fraco: 'paciencia, escuta, colaboracao' },
      I: { forte: 'comunicacao, entusiasmo, influencia', fraco: 'foco em detalhes, organizacao, follow-through' },
      S: { forte: 'estabilidade, cooperacao, persistencia', fraco: 'adaptabilidade, iniciativa, confronto' },
      C: { forte: 'precisao, analise, qualidade', fraco: 'velocidade, flexibilidade, delegacao' },
    };

    // 4. Cross-reference evolucao with DISC
    const melhorias = evolucao.filter(e => e.delta > 0);
    const estagnados = evolucao.filter(e => e.delta === 0);
    const regressoes = evolucao.filter(e => e.delta < 0);

    // Classify improvements by DISC alignment
    const melhorasAlinhadas = melhorias.filter(e =>
      e.conexao_cis?.toLowerCase().includes('alinha') ||
      e.conexao_cis?.toLowerCase().includes('forca') ||
      e.conexao_cis?.toLowerCase().includes('natural')
    );

    const melhorasSurpreendentes = melhorias.filter(e =>
      !melhorasAlinhadas.includes(e)
    );

    const lacunasPersistentes = [...estagnados, ...regressoes].filter(e =>
      e.conexao_cis?.toLowerCase().includes('desafio') ||
      e.conexao_cis?.toLowerCase().includes('dificuldade') ||
      e.conexao_cis?.toLowerCase().includes('contrario')
    );

    const lacunasInesperadas = [...estagnados, ...regressoes].filter(e =>
      !lacunasPersistentes.includes(e)
    );

    // 5. Compute aggregate metrics
    const totalDescritores = evolucao.length;
    const deltaMedia = evolucao.reduce((sum, e) => sum + (e.delta || 0), 0) / totalDescritores;
    const convergentes = evolucao.filter(e => e.convergencia === 'sim').length;
    const taxaConvergencia = totalDescritores > 0 ? (convergentes / totalDescritores) * 100 : 0;

    // Group by competencia
    const porCompetencia: Record<string, { descritores: any[]; deltaTotal: number }> = {};
    for (const e of evolucao) {
      const compNome = e.competencias?.nome || e.competencia_id;
      if (!porCompetencia[compNome]) {
        porCompetencia[compNome] = { descritores: [], deltaTotal: 0 };
      }
      porCompetencia[compNome].descritores.push(e);
      porCompetencia[compNome].deltaTotal += (e.delta || 0);
    }

    const analise = {
      colaborador: {
        nome: colaborador.nome_completo,
        perfil_dominante: dominante,
        disc_scores: discScores,
        forcas_disc: discFortes.map(k => ({ fator: k, tracos: discTraits[k]?.forte })),
        desafios_disc: discFracos.map(k => ({ fator: k, tracos: discTraits[k]?.fraco })),
      },
      metricas: {
        total_descritores: totalDescritores,
        delta_media: Math.round(deltaMedia * 100) / 100,
        taxa_convergencia: Math.round(taxaConvergencia * 10) / 10,
        melhorias: melhorias.length,
        estagnados: estagnados.length,
        regressoes: regressoes.length,
      },
      convergencia_cis: {
        melhoras_alinhadas_disc: melhorasAlinhadas.map(e => ({
          descritor: e.descritor,
          competencia: e.competencias?.nome,
          delta: e.delta,
          conexao: e.conexao_cis,
        })),
        melhoras_surpreendentes: melhorasSurpreendentes.map(e => ({
          descritor: e.descritor,
          competencia: e.competencias?.nome,
          delta: e.delta,
          conexao: e.conexao_cis,
        })),
        lacunas_persistentes_disc: lacunasPersistentes.map(e => ({
          descritor: e.descritor,
          competencia: e.competencias?.nome,
          delta: e.delta,
          conexao: e.conexao_cis,
        })),
        lacunas_inesperadas: lacunasInesperadas.map(e => ({
          descritor: e.descritor,
          competencia: e.competencias?.nome,
          delta: e.delta,
          conexao: e.conexao_cis,
        })),
      },
      por_competencia: Object.fromEntries(
        Object.entries(porCompetencia).map(([nome, data]) => [
          nome,
          {
            delta_total: data.deltaTotal,
            delta_media: Math.round((data.deltaTotal / data.descritores.length) * 100) / 100,
            descritores: data.descritores.map(e => ({
              descritor: e.descritor,
              delta: e.delta,
              convergencia: e.convergencia,
              recomendacao: e.recomendacao,
            })),
          },
        ])
      ),
      insight_geral: gerarInsightGeral(dominante, discTraits, deltaMedia, taxaConvergencia, melhorasAlinhadas.length, lacunasPersistentes.length, totalDescritores),
    };

    return { success: true, analise };
  } catch (err) {
    console.error('[gerarConvergenciaCIS] Error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Gera insight textual sobre a convergencia CIS.
 */
function gerarInsightGeral(dominante, discTraits, deltaMedia, taxaConvergencia, alinhadas, lacunas, total) {
  const forcas = discTraits[dominante]?.forte || '';
  const desafios = discTraits[dominante]?.fraco || '';

  let insight = `Perfil ${dominante}: `;

  if (deltaMedia > 1) {
    insight += `Evolucao significativa (delta medio ${deltaMedia.toFixed(2)}). `;
  } else if (deltaMedia > 0) {
    insight += `Evolucao moderada (delta medio ${deltaMedia.toFixed(2)}). `;
  } else {
    insight += `Evolucao limitada (delta medio ${deltaMedia.toFixed(2)}). `;
  }

  if (taxaConvergencia > 70) {
    insight += `Alta convergencia (${taxaConvergencia.toFixed(0)}%) indica aprendizagem previsivel e alinhada ao perfil. `;
  } else if (taxaConvergencia > 40) {
    insight += `Convergencia parcial (${taxaConvergencia.toFixed(0)}%) sugere aprendizagem mista. `;
  } else {
    insight += `Baixa convergencia (${taxaConvergencia.toFixed(0)}%) indica que a aprendizagem seguiu caminhos inesperados. `;
  }

  if (alinhadas > lacunas) {
    insight += `As forcas naturais (${forcas}) facilitaram a maioria das melhorias. `;
  } else if (lacunas > alinhadas) {
    insight += `Desafios em areas tipicas do perfil (${desafios}) persistem e merecem atencao direcionada. `;
  }

  insight += `Recomendacao: focar desenvolvimento em descritores com delta <= 0, especialmente aqueles ligados a ${desafios}.`;

  return insight;
}
