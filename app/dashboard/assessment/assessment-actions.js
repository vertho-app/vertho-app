'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { findColabByEmail } from '@/lib/authz';

/**
 * Retorna o diagnóstico do dia do colaborador autenticado.
 * Regra: 1 competência por dia, seguindo a ordem do Top 5 do cargo.
 * Dedupe diário: se já respondeu hoje, bloqueia até amanhã.
 */
export async function getDiagnosticoDoDia(email) {
  if (!email) return { error: 'Não autenticado' };

  const colab = await findColabByEmail(email, 'id, nome_completo, cargo, empresa_id');
  if (!colab) return { error: 'Colaborador não encontrado' };

  const sb = createSupabaseAdmin();

  // Top 5 do cargo
  const { data: cargoEmp } = await sb.from('cargos_empresa')
    .select('top5_workshop')
    .eq('empresa_id', colab.empresa_id)
    .eq('nome', colab.cargo)
    .maybeSingle();
  const top5 = cargoEmp?.top5_workshop || [];
  if (!top5.length) return { error: 'Nenhuma competência configurada para seu cargo' };

  // Respostas já dadas pelo colaborador
  const { data: respostas } = await sb.from('respostas')
    .select('competencia_id, competencia_nome, created_at')
    .eq('colaborador_id', colab.id)
    .eq('empresa_id', colab.empresa_id);
  const jaRespondidasNomes = new Set((respostas || []).map(r => r.competencia_nome?.toLowerCase()).filter(Boolean));

  // Respondidas hoje? (regra: 1 por dia)
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const respondeuHoje = (respostas || []).some(r => {
    const ts = r.created_at ? new Date(r.created_at) : null;
    return ts && ts >= hoje;
  });

  // Pega o primeiro do top5 que ainda não foi respondido
  const pendentes = top5.filter(n => !jaRespondidasNomes.has((n || '').toLowerCase()));
  const respondidas = top5.length - pendentes.length;
  const pct = top5.length > 0 ? Math.round((respondidas / top5.length) * 100) : 0;

  const progresso = { pct, total: top5.length, respondidas };
  const colaboradorPayload = { nome: colab.nome_completo, cargo: colab.cargo };

  // Concluiu todas
  if (!pendentes.length) {
    return {
      colaborador: colaboradorPayload,
      progresso,
      concluiuTudo: true,
      cenarioDoDia: null,
      respondeuHoje: false,
    };
  }

  const proximaCompNome = pendentes[0];

  // Já respondeu hoje → bloqueia até amanhã
  if (respondeuHoje) {
    return {
      colaborador: colaboradorPayload,
      progresso,
      concluiuTudo: false,
      respondeuHoje: true,
      proximaCompetencia: proximaCompNome,
      cenarioDoDia: null,
    };
  }

  // Busca competência pelo nome + cargo
  const { data: comp } = await sb.from('competencias')
    .select('id, nome, cod_comp')
    .eq('empresa_id', colab.empresa_id)
    .eq('cargo', colab.cargo)
    .ilike('nome', proximaCompNome)
    .is('cod_desc', null)
    .maybeSingle();
  if (!comp) return { error: `Competência "${proximaCompNome}" não encontrada` };

  // Busca cenário A da comp+cargo
  const { data: cen } = await sb.from('banco_cenarios')
    .select('id, titulo, descricao, alternativas')
    .eq('empresa_id', colab.empresa_id)
    .eq('competencia_id', comp.id)
    .eq('cargo', colab.cargo)
    .or('tipo_cenario.is.null,tipo_cenario.neq.cenario_b')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!cen) return { error: `Cenário para "${proximaCompNome}" ainda não foi gerado` };

  const alt = typeof cen.alternativas === 'string' ? JSON.parse(cen.alternativas) : (cen.alternativas || []);
  const perguntas = Array.isArray(alt)
    ? alt.sort((a, b) => (a.numero || 0) - (b.numero || 0)).map(p => p.texto || '')
    : [];

  return {
    colaborador: colaboradorPayload,
    progresso,
    concluiuTudo: false,
    respondeuHoje: false,
    proximaCompetencia: proximaCompNome,
    cenarioDoDia: {
      cenarioId: cen.id,
      compId: comp.id,
      compNome: comp.nome,
      titulo: cen.titulo || '',
      contexto: cen.descricao || '',
      p1: perguntas[0] || 'Descreva a situação.',
      p2: perguntas[1] || 'Que ação você tomaria?',
      p3: perguntas[2] || 'Qual o raciocínio por trás?',
      p4: perguntas[3] || 'Como você analisa o resultado?',
    },
  };
}

/**
 * Salva a resposta do diagnóstico do dia.
 * Calcula a próxima competência pendente e retorna.
 */
export async function salvarRespostaDiagnostico(email, cenarioId, compId, compNome, payload) {
  if (!email) return { error: 'Não autenticado' };
  if (!compId || !compNome) return { error: 'Competência inválida' };
  const { r1, r2, r3, r4, repr } = payload || {};
  if (!r1 || r1.length < 20 || !r2 || r2.length < 20 || !r3 || r3.length < 20 || !r4 || r4.length < 20) {
    return { error: 'Todas as respostas precisam ter ao menos 20 caracteres' };
  }
  if (!repr || repr < 1 || repr > 10) {
    return { error: 'Representatividade inválida' };
  }

  const colab = await findColabByEmail(email, 'id, nome_completo, cargo, email, empresa_id');
  if (!colab) return { error: 'Colaborador não encontrado' };

  const sb = createSupabaseAdmin();

  // Validação extra: bloqueia se já respondeu hoje
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const { data: jaHoje } = await sb.from('respostas')
    .select('id')
    .eq('colaborador_id', colab.id)
    .eq('empresa_id', colab.empresa_id)
    .gte('created_at', hoje.toISOString())
    .limit(1);
  if (jaHoje?.length) return { error: 'Você já respondeu a avaliação de hoje. Volte amanhã.' };

  // Insere
  const { error: insErr } = await sb.from('respostas').insert({
    empresa_id: colab.empresa_id,
    colaborador_id: colab.id,
    email_colaborador: colab.email,
    nome_colaborador: colab.nome_completo,
    cargo: colab.cargo,
    cenario_id: cenarioId || null,
    competencia_id: compId,
    competencia_nome: compNome,
    r1, r2, r3, r4,
    representatividade: repr,
    canal: 'dashboard',
    tipo_resposta: 'cenario_a',
    timestamp_resposta: new Date().toISOString(),
  });
  if (insErr) return { error: insErr.message };

  // Recalcula próxima
  const { data: cargoEmp } = await sb.from('cargos_empresa')
    .select('top5_workshop').eq('empresa_id', colab.empresa_id).eq('nome', colab.cargo).maybeSingle();
  const top5 = cargoEmp?.top5_workshop || [];
  const { data: respostas } = await sb.from('respostas')
    .select('competencia_nome').eq('colaborador_id', colab.id).eq('empresa_id', colab.empresa_id);
  const jaSet = new Set((respostas || []).map(r => r.competencia_nome?.toLowerCase()).filter(Boolean));
  const pendentes = top5.filter(n => !jaSet.has((n || '').toLowerCase()));

  return {
    success: true,
    concluiuTudo: pendentes.length === 0,
    proximaCompetencia: pendentes[0] || null,
  };
}

/**
 * Mantida para compatibilidade com código antigo — retorna os mesmos dados do
 * loadDiagnosticoDoDia em um formato próximo ao antigo (não é mais usado pelo novo UI).
 */
export async function loadAssessmentData(email) {
  return await getDiagnosticoDoDia(email);
}
