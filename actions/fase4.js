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

// ── Montar trilhas em lote ──────────────────────────────────────────────────
// Usa PDI (relatórios individuais) + catálogo enriquecido do Moodle

export async function montarTrilhasLote(empresaId) {
  const sb = createSupabaseAdmin();
  try {
    // Buscar PDIs (relatórios individuais)
    const { data: relatorios } = await sb.from('relatorios')
      .select('id, colaborador_id, conteudo')
      .eq('empresa_id', empresaId)
      .eq('tipo', 'individual');

    if (!relatorios?.length) return { success: false, error: 'Nenhum PDI/relatório individual encontrado. Gere PDIs primeiro.' };

    // Buscar colaboradores
    const colabIds = [...new Set(relatorios.map(r => r.colaborador_id).filter(Boolean))];
    const { data: colabs } = await sb.from('colaboradores').select('id, nome_completo, cargo').in('id', colabIds);
    const colabMap = {};
    (colabs || []).forEach(c => { colabMap[c.id] = c; });

    // Buscar catálogo enriquecido do Moodle
    const { data: catalogo } = await sb.from('catalogo_enriquecido')
      .select('course_id, cargo, competencia, nivel_ideal')
      .eq('empresa_id', empresaId);

    // Buscar nomes dos cursos
    const { data: cursosCat } = await sb.from('moodle_catalogo')
      .select('course_id, curso_nome, curso_url')
      .eq('empresa_id', empresaId);
    const cursoMap = {};
    (cursosCat || []).forEach(c => { cursoMap[c.course_id] = c; });

    let trilhasCriadas = 0;

    for (const rel of relatorios) {
      const colab = colabMap[rel.colaborador_id] || {};
      const conteudo = typeof rel.conteudo === 'string' ? JSON.parse(rel.conteudo) : rel.conteudo;

      // Extrair competências com gap do PDI
      const compsGap = (conteudo?.competencias || [])
        .filter(c => (c.nivel || c.nivel_atual || 0) < 3)
        .map(c => c.nome);

      // Se não tem gaps, pegar todas as competências
      const compsAlvo = compsGap.length > 0 ? compsGap : (conteudo?.competencias || []).map(c => c.nome);

      // Match cursos do catálogo enriquecido por competência + cargo
      const cursosMatch = (catalogo || []).filter(c =>
        compsAlvo.some(comp => c.competencia === comp) &&
        (!c.cargo || c.cargo === colab.cargo)
      );

      const cursosRecomendados = cursosMatch.map(c => ({
        course_id: c.course_id,
        nome: cursoMap[c.course_id]?.curso_nome || `Curso ${c.course_id}`,
        url: cursoMap[c.course_id]?.curso_url || '',
        competencia: c.competencia,
        nivel: c.nivel_ideal,
      }));

      // Salvar trilha
      const { error } = await sb.from('trilhas').upsert({
        empresa_id: empresaId,
        colaborador_id: rel.colaborador_id,
        pdi_id: rel.id,
        cursos: cursosRecomendados,
        status: 'pendente',
        criado_em: new Date().toISOString(),
      }, { onConflict: 'empresa_id,colaborador_id' });

      if (!error) trilhasCriadas++;
    }

    return { success: true, message: `${trilhasCriadas} trilhas montadas (${relatorios.length} PDIs)` };
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
