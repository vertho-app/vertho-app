'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { callAI, type AIConfig } from './ai-client';
import { extractJSON } from './utils';

// ── Gerar PDIs (Planos de Desenvolvimento Individual) ───────────────────────

export async function gerarPDIs(empresaId: string, aiConfig: AIConfig = {}) {
  const sb = createSupabaseAdmin();
  try {
    const { data: empresa } = await sb.from('empresas')
      .select('nome, segmento')
      .eq('id', empresaId).single();

    const { data: relatorios } = await sb.from('relatorios')
      .select('*, colaboradores!inner(id, nome_completo, cargo)')
      .eq('empresa_id', empresaId)
      .eq('tipo', 'individual');

    if (!relatorios?.length) return { success: false, error: 'Nenhum relatório individual. Gere relatórios na Fase 3 primeiro.' };

    const system = `Você é um especialista em desenvolvimento de pessoas e PDI.
Crie um plano de desenvolvimento individual prático e acionável.
Responda APENAS com JSON válido.`;

    let gerados = 0;

    for (const rel of relatorios) {
      const user = `Empresa: ${empresa.nome} (${empresa.segmento})
Colaborador: ${rel.colaboradores.nome_completo} | Cargo: ${rel.colaboradores.cargo}
Relatório de competências:
${JSON.stringify(rel.conteudo, null, 2)}

Gere o PDI:
{
  "colaborador": "${rel.colaboradores.nome_completo}",
  "objetivos": [
    {
      "competencia": "...",
      "nivel_atual": 1-5,
      "nivel_meta": 1-5,
      "acoes": [{"acao": "...", "prazo": "...", "tipo": "curso|leitura|pratica|mentoria"}],
      "indicadores_sucesso": ["..."]
    }
  ],
  "cronograma_semanas": 12,
  "checkpoints": [{"semana": 4, "meta": "..."}, {"semana": 8, "meta": "..."}, {"semana": 12, "meta": "..."}]
}`;

      const resultado = await callAI(system, user, aiConfig, 6000);
      const pdi = await extractJSON(resultado);

      if (pdi) {
        await sb.from('pdis').upsert({
          empresa_id: empresaId,
          colaborador_id: rel.colaboradores.id,
          conteudo: pdi,
          status: 'ativo',
          gerado_em: new Date().toISOString(),
        }, { onConflict: 'empresa_id,colaborador_id' });
        gerados++;
      }
    }

    return { success: true, message: `${gerados} PDIs gerados` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Gerar PDIs com descritores ──────────────────────────────────────────────

export async function gerarPDIsDescritores(empresaId: string) {
  const sb = createSupabaseAdmin();
  try {
    const { data: pdis } = await sb.from('pdis')
      .select('*, colaboradores!inner(nome_completo, cargo)')
      .eq('empresa_id', empresaId)
      .eq('status', 'ativo');

    if (!pdis?.length) return { success: false, error: 'Nenhum PDI ativo encontrado' };

    let atualizados = 0;

    for (const pdi of pdis) {
      const objetivos = pdi.conteudo?.objetivos || [];
      for (const obj of objetivos) {
        // Enrich with descriptors from competencias gabarito
        const { data: comp } = await sb.from('competencias')
          .select('gabarito')
          .eq('empresa_id', empresaId)
          .eq('nome', obj.competencia)
          .single();

        if (comp?.gabarito) {
          obj.descritores_nivel_atual = (comp.gabarito as any[]).find((n: any) => n.nivel === obj.nivel_atual);
          obj.descritores_nivel_meta = (comp.gabarito as any[]).find((n: any) => n.nivel === obj.nivel_meta);
        }
      }

      await sb.from('pdis')
        .update({ conteudo: { ...pdi.conteudo, objetivos } })
        .eq('id', pdi.id);
      atualizados++;
    }

    return { success: true, message: `${atualizados} PDIs enriquecidos com descritores` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Salvar competência foco por cargo ───────────────────────────────────────

export async function salvarCompetenciaFoco(empresaId: string, cargo: string, competenciaFoco: string) {
  const sb = createSupabaseAdmin();
  try {
    const { error } = await sb.from('cargos_empresa')
      .update({ competencia_foco: competenciaFoco })
      .eq('empresa_id', empresaId)
      .eq('nome', cargo);
    if (error) return { success: false, error: error.message };
    return { success: true, message: `Competência foco "${competenciaFoco}" salva para ${cargo}` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Carregar competências foco por cargo ────────────────────────────────────

export async function loadCompetenciasFoco(empresaId: string) {
  const sb = createSupabaseAdmin();
  try {
    const { data: cargos } = await sb.from('cargos_empresa')
      .select('nome, competencia_foco, top5_workshop')
      .eq('empresa_id', empresaId);

    // Top 5 por cargo (competências disponíveis para seleção)
    const result = (cargos || []).map(c => ({
      cargo: c.nome,
      competencia_foco: c.competencia_foco || null,
      top5: c.top5_workshop || [],
    }));

    return { success: true, data: result };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Montar trilhas em lote ──────────────────────────────────────────────────
// 1 competência por colaborador: competência foco (se tiver gap) > maior gap

/**
 * Lista colabs elegíveis para gerar temporada (têm cargo + competência foco).
 * Usado pelo client pra orquestrar geração 1 por 1 (evita timeout serverless).
 */
export async function listarColabsParaTrilha(empresaId: string) {
  const sb = createSupabaseAdmin();
  const { data: colabs } = await sb.from('colaboradores')
    .select('id, nome_completo, cargo')
    .eq('empresa_id', empresaId)
    .order('nome_completo');
  return { success: true, colabs: colabs || [] };
}

/**
 * @deprecated Use listarColabsParaTrilha + gerarTemporada (1 por colab) no client.
 * Mantido pra compatibilidade.
 */
export async function montarTrilhasLote(empresaId: string) {
  const { gerarTemporadasLote } = await import('@/actions/temporadas');
  return gerarTemporadasLote(empresaId);
}

// Função antiga preservada como fallback caso queira a lógica simples
// de dump-tudo (sem alocação por slot/descritor).
export async function _montarTrilhasLote_legacy(empresaId: string) {
  const sb = createSupabaseAdmin();
  try {
    // Buscar respostas avaliadas (gaps identificados pela IA4)
    const { data: respostas } = await sb.from('respostas')
      .select('colaborador_id, competencia_id, nivel_ia4')
      .eq('empresa_id', empresaId)
      .not('avaliacao_ia', 'is', null);

    if (!respostas?.length) return { success: false, error: 'Nenhuma avaliação encontrada. Rode IA4 primeiro.' };

    // Buscar colaboradores
    const colabIds = [...new Set(respostas.map(r => r.colaborador_id).filter(Boolean))];
    const { data: colabs } = await sb.from('colaboradores').select('id, nome_completo, cargo').in('id', colabIds);
    const colabMap: Record<string, any> = {};
    (colabs || []).forEach(c => { colabMap[c.id] = c; });

    // Buscar competências (nomes + gabarito para saber nível esperado)
    const compIds = [...new Set(respostas.map(r => r.competencia_id).filter(Boolean))];
    const compMap: Record<string, string> = {};
    if (compIds.length) {
      const { data: comps } = await sb.from('competencias').select('id, nome').in('id', compIds);
      (comps || []).forEach(c => { compMap[c.id] = c.nome; });
    }

    // Buscar competência foco por cargo
    const { data: cargosEmpresa } = await sb.from('cargos_empresa')
      .select('nome, competencia_foco')
      .eq('empresa_id', empresaId);
    const focoMap: Record<string, string> = {};
    (cargosEmpresa || []).forEach(c => { if (c.competencia_foco) focoMap[c.nome] = c.competencia_foco; });

    // Buscar catálogo unificado de micro_conteudos (vídeos, textos, áudios, cases)
    // Inclui da empresa específica + globais
    const { data: catalogo } = await sb.from('micro_conteudos')
      .select('id, titulo, formato, url, competencia, descritor, nivel_min, nivel_max, cargo, contexto, taxa_conclusao')
      .eq('ativo', true)
      .or(`empresa_id.eq.${empresaId},empresa_id.is.null`);

    // Agrupar respostas por colaborador com gap (nível esperado 4 - nível avaliado)
    const porColab: Record<string, Array<{ competencia: string; nivel: number; gap: number }>> = {};
    respostas.forEach(r => {
      if (!porColab[r.colaborador_id]) porColab[r.colaborador_id] = [];
      const compNome = compMap[r.competencia_id];
      if (compNome) {
        const nivel = r.nivel_ia4 || 0;
        const gap = 4 - nivel; // gap = nível esperado (4) - nível avaliado
        porColab[r.colaborador_id].push({ competencia: compNome, nivel, gap });
      }
    });

    let trilhasCriadas = 0, totalCursos = 0, semFoco = 0, ultimoErro = '';

    for (const [colabId, comps] of Object.entries(porColab)) {
      const colab = colabMap[colabId] || {};
      const foco = focoMap[colab.cargo];

      // Determinar a competência da trilha (1 única)
      let compAlvo = null;

      if (foco) {
        // Verificar se colaborador tem gap na competência foco
        const compFoco = comps.find(c => {
          const fL = foco.toLowerCase();
          const cL = c.competencia.toLowerCase();
          return cL === fL || cL.includes(fL) || fL.includes(cL);
        });
        if (compFoco && compFoco.gap > 0) {
          compAlvo = compFoco.competencia;
        }
      }

      // Se não tem foco ou não tem gap no foco: usar maior gap
      if (!compAlvo) {
        const comGap = comps.filter(c => c.gap > 0).sort((a, b) => b.gap - a.gap);
        if (comGap.length > 0) compAlvo = comGap[0].competencia;
        if (foco && !compAlvo) semFoco++;
      }

      if (!compAlvo) continue; // sem gap em nenhuma competência

      // Match conteúdos do catálogo unificado para a competência alvo
      // Aceita conteúdo do cargo do colab OU genérico ('todos')
      const cursosMatch = (catalogo || []).filter(c => {
        if (!c.competencia) return false;
        if (c.cargo && c.cargo !== 'todos' && c.cargo !== colab.cargo) return false;
        const compLower = c.competencia.toLowerCase();
        const alvoLower = compAlvo.toLowerCase();
        return compLower === alvoLower || compLower.includes(alvoLower) || alvoLower.includes(compLower);
      });

      // Ordena por taxa_conclusao DESC (melhor conteúdo primeiro)
      cursosMatch.sort((a, b) => (b.taxa_conclusao ?? 0) - (a.taxa_conclusao ?? 0));

      const cursosRecomendados = cursosMatch.map(c => ({
        course_id: c.id,
        nome: c.titulo,
        url: c.url || '',
        competencia: c.competencia,
        descritor: c.descritor,
        formato: c.formato, // video|audio|texto|case|pdf
        nivel: Math.round(((c.nivel_min || 1) + (c.nivel_max || 4)) / 2),
      }));

      totalCursos += cursosRecomendados.length;

      // Deletar trilha anterior e inserir nova (mesmo sem cursos, registra a competência alvo)
      await sb.from('trilhas').delete().eq('empresa_id', empresaId).eq('colaborador_id', colabId);

      const { error } = await sb.from('trilhas').insert({
        empresa_id: empresaId,
        colaborador_id: colabId,
        competencia_foco: compAlvo,
        cursos: cursosRecomendados,
        status: 'pendente',
        criado_em: new Date().toISOString(),
      });

      if (!error) trilhasCriadas++;
      else ultimoErro = error.message;
    }

    const msg = `${trilhasCriadas} trilhas (1 competência cada) para ${Object.keys(porColab).length} colaboradores (${totalCursos} cursos)`;
    return { success: true, message: msg + (ultimoErro ? ' — ' + ultimoErro : '') };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Criar estrutura da Fase 4 ───────────────────────────────────────────────

export async function criarEstruturaFase4(_empresaId: string) {
  return { success: false, error: 'Fluxo legado desativado — use Temporadas' };
}

// ── Iniciar Fase 4 para todos ───────────────────────────────────────────────

export async function iniciarFase4ParaTodos(_empresaId: string) {
  return { success: false, error: 'Fluxo legado desativado — use Temporadas' };
}

// ── Trigger 2a semana ───────────────────────────────────────────────────────

export async function triggerSegundaFase4(_empresaId: string) {
  return { success: false, error: 'Fluxo legado desativado — use Temporadas' };
}

// ── Trigger 5a semana ───────────────────────────────────────────────────────

export async function triggerQuintaFase4(_empresaId: string) {
  return { success: false, error: 'Fluxo legado desativado — use Temporadas' };
}

// ── Status Fase 4 ───────────────────────────────────────────────────────────

export async function getStatusFase4(_empresaId: string) {
  return { success: false, error: 'Fluxo legado desativado — use Temporadas' };
}
