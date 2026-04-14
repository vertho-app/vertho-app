/**
 * Monta o plano de 14 semanas a partir dos descritores selecionados,
 * resolvendo o conteúdo (formato_core conforme prioridade do colaborador)
 * e gerando desafios + cenários via Claude.
 */

import { createSupabaseAdmin } from '@/lib/supabase';
import { callAI } from '@/actions/ai-client';
import { promptDesafio } from '@/lib/season-engine/prompts/challenge';
import { promptCenario } from '@/lib/season-engine/prompts/scenario';

/**
 * @param {Object} params
 * @param {Array} params.descritoresSelecionados - output de selectDescriptors
 * @param {string} params.competencia
 * @param {string} params.cargo
 * @param {string} params.contexto - educacional|corporativo|generico
 * @param {string[]} params.prioridadeFormatos - ex: ['video','audio','texto','case']
 * @param {string} params.empresaId - opcional, pra busca multi-tenant
 * @param {Object} params.aiConfig - opcional, { model }
 */
export async function buildSeason({
  descritoresSelecionados,
  competencia,
  cargo,
  contexto = 'generico',
  prioridadeFormatos = ['video', 'texto', 'audio', 'case'],
  empresaId = null,
  aiConfig = {},
}) {
  const semanas = [];

  // Mapeia semana → descritor (a partir de descritoresSelecionados)
  const semanaParaDescritor = {};
  for (const d of descritoresSelecionados) {
    for (const s of d.semanas_ids) {
      semanaParaDescritor[s] = d;
    }
  }

  for (let semana = 1; semana <= 14; semana++) {
    let plan;
    if ([4, 8, 12].includes(semana)) {
      plan = await montarSemanaAplicacao(semana, descritoresSelecionados, competencia, cargo, contexto, aiConfig);
    } else if ([13, 14].includes(semana)) {
      plan = { semana, tipo: 'avaliacao', descritor: null, descritores_cobertos: descritoresSelecionados.map(d => d.descritor), status: 'bloqueada' };
    } else {
      const d = semanaParaDescritor[semana];
      if (!d) {
        plan = { semana, tipo: 'conteudo', descritor: null, descritores_cobertos: [], status: 'bloqueada' };
      } else {
        plan = await montarSemanaConteudo(semana, d, competencia, cargo, contexto, prioridadeFormatos, empresaId, aiConfig);
      }
    }
    plan.status = semana === 1 ? 'disponivel' : 'bloqueada';
    semanas.push(plan);
  }

  return semanas;
}

async function montarSemanaConteudo(semana, descritorSel, competencia, cargo, contexto, prioridadeFormatos, empresaId, aiConfig) {
  const sb = createSupabaseAdmin();
  const nivelMedio = (descritorSel.nota_atual + 3.0) / 2;

  // Busca conteúdos pra esse descritor (com fallback gradual via or)
  let q = sb.from('micro_conteudos').select('*')
    .eq('ativo', true)
    .eq('competencia', competencia)
    .lte('nivel_min', nivelMedio)
    .gte('nivel_max', nivelMedio);

  if (empresaId) q = q.or(`empresa_id.eq.${empresaId},empresa_id.is.null`);
  else q = q.is('empresa_id', null);

  const { data: candidatos } = await q;
  // Filtra por descritor (preferencial), senão aceita qualquer da competência
  const matchDescritor = (candidatos || []).filter(c => c.descritor === descritorSel.descritor);
  const pool = matchDescritor.length > 0 ? matchDescritor : (candidatos || []);

  // Dentro de cada formato, escolhe o conteúdo com maior taxa_conclusao
  // (fallback: versão mais recente). Fecha o loop do A/B testing.
  const formatosDisponiveis = {};
  const ordenadoPorQualidade = [...pool].sort((a, b) => {
    const ta = a.taxa_conclusao ?? -1;
    const tb = b.taxa_conclusao ?? -1;
    if (tb !== ta) return tb - ta;
    return (b.versao || 0) - (a.versao || 0);
  });
  for (const c of ordenadoPorQualidade) {
    if (!formatosDisponiveis[c.formato]) formatosDisponiveis[c.formato] = c;
  }

  // formato_core = primeiro da prioridade que existe
  let formatoCore = prioridadeFormatos.find(f => formatosDisponiveis[f]) || null;
  let coreContent = formatoCore ? formatosDisponiveis[formatoCore] : null;

  // Fallback: se nenhum formato existe, marca pra gerar texto sob demanda
  if (!coreContent) {
    formatoCore = 'texto';
  }

  // Gera desafio via Claude
  let desafioTexto = '';
  try {
    const { system, user } = promptDesafio({
      competencia,
      descritor: descritorSel.descritor,
      nivel: descritorSel.nota_atual,
      cargo,
      contexto,
      semana,
    });
    desafioTexto = await callAI(system, user, aiConfig, 300);
    desafioTexto = desafioTexto.trim();
  } catch (err) {
    console.warn(`[buildSeason] desafio sem 1: ${err.message}`);
    desafioTexto = `Aplique ${descritorSel.descritor} em uma situação real esta semana e observe o resultado.`;
  }

  return {
    semana,
    tipo: 'conteudo',
    descritor: descritorSel.descritor,
    descritores_cobertos: [descritorSel.descritor],
    nivel_alvo: 3.0,
    nivel_atual: descritorSel.nota_atual,
    conteudo: {
      formato_core: formatoCore,
      core_id: coreContent?.id || null,
      core_titulo: coreContent?.titulo || `Episódio ${semana}: ${descritorSel.descritor}`,
      core_url: coreContent?.url || null,
      desafio_texto: desafioTexto,
      formatos_disponiveis: Object.fromEntries(
        Object.entries(formatosDisponiveis).map(([f, c]) => [f, { id: c.id, url: c.url, titulo: c.titulo }])
      ),
      fallback_gerado: !coreContent,
    },
    status: 'bloqueada',
  };
}

async function montarSemanaAplicacao(semana, descritores, competencia, cargo, contexto, aiConfig) {
  // Bloco 1 = sem 4 (cobre descritores 1-3), bloco 2 = sem 8 (1-6), bloco 3 = sem 12 (todos)
  const blocosCobertos = {
    4: descritores.slice(0, 3).map(d => d.descritor),
    8: descritores.slice(0, 6).map(d => d.descritor),
    12: descritores.map(d => d.descritor),
  };
  const complexidade = { 4: 'simples', 8: 'intermediario', 12: 'completo' }[semana];
  const cobertos = blocosCobertos[semana] || [];

  let cenarioTexto = '';
  try {
    const { system, user } = promptCenario({
      competencia,
      descritores: cobertos,
      cargo,
      contexto,
      complexidade,
    });
    cenarioTexto = await callAI(system, user, aiConfig, 800);
    cenarioTexto = cenarioTexto.trim();
  } catch (err) {
    console.warn(`[buildSeason] cenario sem ${semana}: ${err.message}`);
    cenarioTexto = `Cenário pendente. Descreva como você aplicaria os descritores ${cobertos.join(', ')} em uma situação típica do seu cargo.`;
  }

  return {
    semana,
    tipo: 'aplicacao',
    descritor: null,
    descritores_cobertos: cobertos,
    cenario: { texto: cenarioTexto, complexidade },
    status: 'bloqueada',
  };
}
