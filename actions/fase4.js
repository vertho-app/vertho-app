'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { callAI } from './ai-client';
import { extractJSON } from './utils';

// ── Gerar PDIs (Planos de Desenvolvimento Individual) ───────────────────────

export async function gerarPDIs(empresaId, aiConfig = {}) {
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

export async function gerarPDIsDescritores(empresaId) {
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
          obj.descritores_nivel_atual = comp.gabarito.find(n => n.nivel === obj.nivel_atual);
          obj.descritores_nivel_meta = comp.gabarito.find(n => n.nivel === obj.nivel_meta);
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

export async function salvarCompetenciaFoco(empresaId, cargo, competenciaFoco) {
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

export async function loadCompetenciasFoco(empresaId) {
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

export async function montarTrilhasLote(empresaId) {
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
    const colabMap = {};
    (colabs || []).forEach(c => { colabMap[c.id] = c; });

    // Buscar competências (nomes + gabarito para saber nível esperado)
    const compIds = [...new Set(respostas.map(r => r.competencia_id).filter(Boolean))];
    const compMap = {};
    if (compIds.length) {
      const { data: comps } = await sb.from('competencias').select('id, nome').in('id', compIds);
      (comps || []).forEach(c => { compMap[c.id] = c.nome; });
    }

    // Buscar competência foco por cargo
    const { data: cargosEmpresa } = await sb.from('cargos_empresa')
      .select('nome, competencia_foco')
      .eq('empresa_id', empresaId);
    const focoMap = {};
    (cargosEmpresa || []).forEach(c => { if (c.competencia_foco) focoMap[c.nome] = c.competencia_foco; });

    // Buscar catálogo enriquecido do Moodle
    const { data: catalogo } = await sb.from('catalogo_enriquecido')
      .select('course_id, cargo, competencia, nivel_ideal')
      .eq('empresa_id', empresaId);

    // Buscar nomes dos cursos
    const { data: cursosCat } = await sb.from('moodle_catalogo')
      .select('course_id, curso_nome, curso_url')
      .eq('empresa_id', empresaId);
    const cursoNomeMap = {};
    (cursosCat || []).forEach(c => { cursoNomeMap[c.course_id] = c; });

    // Agrupar respostas por colaborador com gap (nível esperado 4 - nível avaliado)
    const porColab = {};
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

      // Match cursos do catálogo apenas para a competência alvo
      const cursosMatch = (catalogo || []).filter(c => {
        if (c.cargo && c.cargo !== colab.cargo) return false;
        if (!c.competencia) return false;
        const compLower = c.competencia.toLowerCase();
        const alvoLower = compAlvo.toLowerCase();
        return compLower === alvoLower || compLower.includes(alvoLower) || alvoLower.includes(compLower);
      });

      // Só incluir cursos que existem de fato no catálogo Moodle
      const cursosRecomendados = cursosMatch
        .filter(c => cursoNomeMap[c.course_id]?.curso_nome)
        .map(c => ({
          course_id: c.course_id,
          nome: cursoNomeMap[c.course_id].curso_nome,
          url: cursoNomeMap[c.course_id].curso_url || '',
          competencia: c.competencia,
          nivel: c.nivel_ideal,
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

export async function criarEstruturaFase4(empresaId) {
  const sb = createSupabaseAdmin();
  try {
    const { data: colaboradores } = await sb.from('colaboradores')
      .select('id')
      .eq('empresa_id', empresaId);

    if (!colaboradores?.length) return { success: false, error: 'Nenhum colaborador encontrado' };

    let criados = 0;
    for (const colab of colaboradores) {
      const { error } = await sb.from('fase4_progresso').upsert({
        empresa_id: empresaId,
        colaborador_id: colab.id,
        semana_atual: 1,
        status: 'aguardando_inicio',
        checkins: [],
        criado_em: new Date().toISOString(),
      }, { onConflict: 'empresa_id,colaborador_id' });

      if (!error) criados++;
    }

    return { success: true, message: `Estrutura Fase 4 criada para ${criados} colaboradores` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Iniciar Fase 4 para todos ───────────────────────────────────────────────

export async function iniciarFase4ParaTodos(empresaId) {
  const sb = createSupabaseAdmin();
  try {
    const { data, error } = await sb.from('fase4_progresso')
      .update({ status: 'em_andamento', iniciado_em: new Date().toISOString() })
      .eq('empresa_id', empresaId)
      .eq('status', 'aguardando_inicio')
      .select('id');

    if (error) return { success: false, error: error.message };
    return { success: true, message: `Fase 4 iniciada para ${data?.length || 0} colaboradores` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Trigger 2a semana ───────────────────────────────────────────────────────

export async function triggerSegundaFase4(empresaId) {
  const sb = createSupabaseAdmin();
  try {
    const { data, error } = await sb.from('fase4_progresso')
      .update({ semana_atual: 2 })
      .eq('empresa_id', empresaId)
      .eq('status', 'em_andamento')
      .lt('semana_atual', 2)
      .select('id');

    if (error) return { success: false, error: error.message };
    return { success: true, message: `${data?.length || 0} colaboradores avançaram para semana 2` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Trigger 5a semana ───────────────────────────────────────────────────────

export async function triggerQuintaFase4(empresaId) {
  const sb = createSupabaseAdmin();
  try {
    const { data, error } = await sb.from('fase4_progresso')
      .update({ semana_atual: 5 })
      .eq('empresa_id', empresaId)
      .eq('status', 'em_andamento')
      .lt('semana_atual', 5)
      .select('id');

    if (error) return { success: false, error: error.message };
    return { success: true, message: `${data?.length || 0} colaboradores avançaram para semana 5` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Status Fase 4 ───────────────────────────────────────────────────────────

export async function getStatusFase4(empresaId) {
  const sb = createSupabaseAdmin();
  try {
    const { data: progressos } = await sb.from('fase4_progresso')
      .select('*, colaboradores!inner(nome_completo)')
      .eq('empresa_id', empresaId);

    if (!progressos?.length) return { success: true, message: 'Nenhum progresso Fase 4 encontrado', dados: [] };

    const resumo = {
      total: progressos.length,
      aguardando: progressos.filter(p => p.status === 'aguardando_inicio').length,
      em_andamento: progressos.filter(p => p.status === 'em_andamento').length,
      concluido: progressos.filter(p => p.status === 'concluido').length,
      semana_media: Math.round(progressos.reduce((s, p) => s + (p.semana_atual || 0), 0) / progressos.length),
    };

    return {
      success: true,
      message: `Fase 4: ${resumo.em_andamento} em andamento, ${resumo.concluido} concluídos, semana média: ${resumo.semana_media}`,
      resumo,
      dados: progressos,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
