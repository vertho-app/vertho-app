'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { tenantDb } from '@/lib/tenant-db';
import { calcularFit, converterGabaritoParaPerfil, extrairPerfilReal } from '@/lib/fit-v2/engine';
import { gerarRanking, gerarDistribuicao } from '@/lib/fit-v2/ranking';
import { buildFitExecutivePrompt } from '@/lib/prompts/fit-executive-prompt';
import { callAI } from '@/actions/ai-client';

const LEITURA_AI_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias

// Helper interno: descobre empresa_id de um cargo pra escopar tdb.
async function tenantDoCargo(cargoId) {
  const sb = createSupabaseAdmin();
  const { data } = await sb.from('cargos_empresa').select('empresa_id').eq('id', cargoId).maybeSingle();
  return data?.empresa_id || null;
}

// ── Salvar/carregar perfil ideal ────────────────────────────────────────────

export async function salvarPerfilIdeal(cargoId, perfilIdeal) {
  const empresaId = await tenantDoCargo(cargoId);
  if (!empresaId) return { success: false, error: 'Cargo não encontrado' };
  const tdb = tenantDb(empresaId);
  const { error } = await tdb.from('cargos_empresa')
    .update({ fit_perfil_ideal: perfilIdeal, fit_versao: '2.0' })
    .eq('id', cargoId)
    .select('id');
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function loadPerfilIdeal(cargoId) {
  const empresaId = await tenantDoCargo(cargoId);
  if (!empresaId) return null;
  const tdb = tenantDb(empresaId);
  const { data } = await tdb.from('cargos_empresa')
    .select('id, nome, gabarito, fit_perfil_ideal, fit_versao')
    .eq('id', cargoId).single();
  return data;
}

// ── Calcular Fit individual ─────────────────────────────────────────────────

export async function calcularFitIndividual(empresaId, cargoNome, colaboradorId) {
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const tdb = tenantDb(empresaId);

  // Buscar cargo e perfil ideal
  const { data: cargo } = await tdb.from('cargos_empresa')
    .select('id, nome, gabarito, fit_perfil_ideal, eh_lideranca')
    .eq('nome', cargoNome)
    .maybeSingle();

  if (!cargo) return { success: false, error: 'Cargo não encontrado' };

  // Perfil ideal: usar fit_perfil_ideal customizado, ou converter do gabarito CIS
  let perfilIdeal = cargo.fit_perfil_ideal;
  if (!perfilIdeal && cargo.gabarito) {
    const gab = typeof cargo.gabarito === 'string' ? JSON.parse(cargo.gabarito) : cargo.gabarito;
    perfilIdeal = converterGabaritoParaPerfil(gab, cargoNome);
  }
  if (!perfilIdeal) return { success: false, error: 'Perfil ideal não definido. Rode IA2 ou configure manualmente.' };

  // Cargo não-líder: zera dados de liderança ideal pra excluir o bloco do Fit
  // (engine reweighta automaticamente quando o score do bloco é undefined)
  if (cargo.eh_lideranca === false) {
    perfilIdeal = { ...perfilIdeal, lideranca_ideal: null };
  }

  // Buscar colaborador
  const { data: colab } = await tdb.from('colaboradores')
    .select('*')
    .eq('id', colaboradorId).single();
  if (!colab) return { success: false, error: 'Colaborador não encontrado' };
  if (!colab.mapeamento_em) return { success: false, error: `${colab.nome_completo || colab.email}: sem mapeamento comportamental` };

  // Extrair perfil real
  const perfilReal = extrairPerfilReal(colab);

  // Tags de mapeamento (tela1 do colaborador, se existir)
  if (colab.disc_resultados?.tags) {
    perfilReal.tags = colab.disc_resultados.tags;
  } else if (colab.perfil_dominante) {
    perfilReal.tags = [colab.perfil_dominante];
  }

  // Calcular
  const resultado = calcularFit(perfilIdeal, perfilReal, colab);
  if (!resultado.success) return resultado;

  // Persistir
  const { error: saveErr } = await tdb.from('fit_resultados').upsert({
    colaborador_id: colaboradorId,
    cargo_id: cargo.id,
    cargo_nome: cargoNome,
    versao_modelo: '2.0',
    fit_final: resultado.fit_final,
    classificacao: resultado.classificacao,
    recomendacao: resultado.recomendacao,
    score_base: resultado.score_base,
    fator_critico: resultado.fatores.fator_critico,
    fator_excesso: resultado.fatores.fator_excesso,
    score_mapeamento: resultado.blocos.mapeamento.score,
    score_competencias: resultado.blocos.competencias.score,
    score_lideranca: resultado.blocos.lideranca?.score ?? null,
    score_disc: resultado.blocos.disc.score,
    resultado_json: resultado,
    leitura_executiva: resultado.leitura_executiva,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'empresa_id,colaborador_id' }).select('id');

  if (saveErr) return { success: false, error: saveErr.message };

  return { success: true, data: resultado };
}

// ── Calcular Fit em lote (todos do cargo) ───────────────────────────────────

export async function calcularFitLote(empresaId, cargoNome, opts = {}) {
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const tdb = tenantDb(empresaId);
  const { forcar = false } = opts;

  // Buscar colaboradores do cargo com mapeamento
  const { data: colabs } = await tdb.from('colaboradores')
    .select('id, nome_completo, email, cargo')
    .eq('cargo', cargoNome)
    .not('mapeamento_em', 'is', null);

  if (!colabs?.length) return { success: false, error: 'Nenhum colaborador com mapeamento encontrado para este cargo' };

  // Se não é forçado, pula colabs que já têm fit_resultado
  let colabsPraCalcular = colabs;
  let pulados = 0;
  if (!forcar) {
    const { data: jaCalculados } = await tdb.from('fit_resultados')
      .select('colaborador_id').eq('cargo', cargoNome);
    const jaSet = new Set((jaCalculados || []).map(r => r.colaborador_id));
    colabsPraCalcular = colabs.filter(c => !jaSet.has(c.id));
    pulados = colabs.length - colabsPraCalcular.length;
  }

  if (colabsPraCalcular.length === 0) {
    return { success: true, message: `Todos os ${colabs.length} colaboradores já têm Fit calculado. Use "Recalcular" pra forçar.`, ok: 0, pulados };
  }

  let ok = 0;
  const resultados = [];
  const errosDetalhados = [];

  for (const colab of colabsPraCalcular) {
    const r = await calcularFitIndividual(empresaId, cargoNome, colab.id);
    if (r.success) {
      ok++;
      resultados.push(r.data);
    } else {
      const msg = r.error || 'erro desconhecido';
      const erroExtra = Array.isArray(r.erros) ? r.erros.join('; ') : null;
      errosDetalhados.push({
        colab_id: colab.id,
        nome: colab.nome_completo || colab.email,
        erro: erroExtra ? `${msg} (${erroExtra})` : msg,
      });
      console.warn('[calcularFitLote]', colab.nome_completo || colab.email, '→', msg, erroExtra || '');
    }
  }

  return {
    success: true,
    message: `Fit calculado: ${ok} colab${ok !== 1 ? 's' : ''}${pulados > 0 ? ` · ${pulados} já existiam` : ''}${errosDetalhados.length ? ` · ${errosDetalhados.length} erros` : ''}`,
    total: ok,
    pulados,
    erros: errosDetalhados.length,
    erros_detalhados: errosDetalhados,
  };
}

// ── Buscar ranking de um cargo ──────────────────────────────────────────────

export async function loadRankingCargo(empresaId, cargoNome) {
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const tdb = tenantDb(empresaId);

  const { data: resultados } = await tdb.from('fit_resultados')
    .select('*')
    .eq('cargo_nome', cargoNome)
    .order('fit_final', { ascending: false });

  if (!resultados?.length) return { success: true, data: [], distribuicao: {} };

  // Buscar perfil ideal para blocos críticos
  const { data: cargo } = await tdb.from('cargos_empresa')
    .select('fit_perfil_ideal, gabarito')
    .eq('nome', cargoNome)
    .maybeSingle();

  let perfilIdeal = cargo?.fit_perfil_ideal;
  if (!perfilIdeal && cargo?.gabarito) {
    const gab = typeof cargo.gabarito === 'string' ? JSON.parse(cargo.gabarito) : cargo.gabarito;
    perfilIdeal = converterGabaritoParaPerfil(gab, cargoNome);
  }

  const blocosCriticos = perfilIdeal?.blocos_criticos || [];

  // Reconstruir blocos a partir do JSON salvo
  const items = resultados.map(r => {
    const json = typeof r.resultado_json === 'string' ? JSON.parse(r.resultado_json) : r.resultado_json;
    return {
      colaborador: { id: r.colaborador_id, nome: json?.colaborador?.nome || r.colaborador_id },
      fit_final: r.fit_final,
      classificacao: r.classificacao,
      recomendacao: r.recomendacao,
      score_base: r.score_base,
      blocos: json?.blocos || {
        mapeamento: { score: r.score_mapeamento },
        competencias: { score: r.score_competencias },
        lideranca: { score: r.score_lideranca },
        disc: { score: r.score_disc },
      },
      leitura_executiva: r.leitura_executiva,
      gap_analysis: json?.gap_analysis,
    };
  });

  const ranking = gerarRanking(items, blocosCriticos);
  const distribuicao = gerarDistribuicao(ranking);

  return { success: true, data: ranking, distribuicao };
}

// ── Buscar fit individual ───────────────────────────────────────────────────

export async function loadFitIndividual(colaboradorId) {
  // Descobre tenant via colaborador (raw — colaboradores é root de tenancy)
  const sbRaw = createSupabaseAdmin();
  const { data: colab } = await sbRaw.from('colaboradores')
    .select('empresa_id').eq('id', colaboradorId).maybeSingle();
  if (!colab?.empresa_id) return null;
  const tdb = tenantDb(colab.empresa_id);
  const { data } = await tdb.from('fit_resultados')
    .select('*')
    .eq('colaborador_id', colaboradorId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  return {
    ...data,
    resultado_json: typeof data.resultado_json === 'string' ? JSON.parse(data.resultado_json) : data.resultado_json,
  };
}

// ── Leitura executiva via LLM (lazy, cache em fit_resultados) ───────────────

/**
 * Gera (ou retorna do cache) a leitura executiva via LLM do Fit de um
 * colaborador específico num cargo. Usado pelo drill-down do /admin/fit.
 *
 * opts.force = true força regeneração mesmo se houver cache válido.
 */
export async function gerarLeituraExecutivaFit(empresaId, colaboradorId, cargoNome, opts = {}) {
  try {
    if (!empresaId || !colaboradorId || !cargoNome) {
      return { success: false, error: 'Parâmetros obrigatórios ausentes' };
    }

    const tdb = tenantDb(empresaId);

    // 1) Carrega o registro do fit
    const { data: row } = await tdb.from('fit_resultados')
      .select('*')
      .eq('colaborador_id', colaboradorId)
      .eq('cargo_nome', cargoNome)
      .maybeSingle();

    if (!row) return { success: false, error: 'Fit não encontrado — calcule primeiro.' };

    // 2) Cache válido?
    if (!opts.force && row.leitura_executiva_ai && row.leitura_executiva_ai_at) {
      const age = Date.now() - new Date(row.leitura_executiva_ai_at).getTime();
      if (age < LEITURA_AI_MAX_AGE_MS) {
        return { success: true, texto: row.leitura_executiva_ai, cached: true };
      }
    }

    // 3) Monta o prompt com o resultado completo
    const resultado = typeof row.resultado_json === 'string'
      ? JSON.parse(row.resultado_json)
      : row.resultado_json;
    if (!resultado) return { success: false, error: 'Resultado do fit indisponível' };

    const prompt = buildFitExecutivePrompt({ resultado, cargoNome });
    const system = 'Você é um consultor sênior de desenvolvimento humano. Responda apenas com o texto final, sem markdown nem aspas.';

    // 4) Chama LLM
    const raw = await callAI(system, prompt, {}, 800);
    const texto = String(raw || '').trim().replace(/^["']|["']$/g, '');

    if (!texto) return { success: false, error: 'LLM retornou vazio' };

    // 5) Salva cache
    await tdb.from('fit_resultados')
      .update({
        leitura_executiva_ai: texto,
        leitura_executiva_ai_at: new Date().toISOString(),
      })
      .eq('id', row.id);

    return { success: true, texto, cached: false };
  } catch (err) {
    console.error('[gerarLeituraExecutivaFit]', err);
    return { success: false, error: err?.message || 'Erro ao gerar leitura executiva' };
  }
}

// ── Listar cargos com contagem de fits ──────────────────────────────────────

export async function loadCargosComFit(empresaId) {
  if (!empresaId) return [];
  const tdb = tenantDb(empresaId);

  const { data: cargos } = await tdb.from('cargos_empresa')
    .select('id, nome, gabarito, fit_perfil_ideal')
    .order('nome');

  if (!cargos?.length) return [];

  const { data: fits } = await tdb.from('fit_resultados')
    .select('cargo_nome, fit_final');

  const fitPorCargo = {};
  (fits || []).forEach(f => {
    if (!fitPorCargo[f.cargo_nome]) fitPorCargo[f.cargo_nome] = [];
    fitPorCargo[f.cargo_nome].push(f.fit_final);
  });

  return cargos.map(c => ({
    id: c.id,
    nome: c.nome,
    temPerfilIdeal: !!(c.fit_perfil_ideal || c.gabarito),
    totalFits: fitPorCargo[c.nome]?.length || 0,
    mediaFit: fitPorCargo[c.nome]?.length
      ? Math.round((fitPorCargo[c.nome].reduce((a, b) => a + b, 0) / fitPorCargo[c.nome].length) * 10) / 10
      : null,
  }));
}
