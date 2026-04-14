'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { findColabByEmail } from '@/lib/authz';

/**
 * Retorna o diagnóstico do dia do colaborador autenticado.
 * Regra: 1 competência por dia, seguindo a ordem do Top 5 do cargo.
 * Dedupe diário: se já respondeu hoje, bloqueia até amanhã.
 */
export async function getDiagnosticoDoDia(email) {
  try {
    return await _getDiagnosticoDoDia(email);
  } catch (err) {
    console.error('[getDiagnosticoDoDia]', err);
    return { error: err?.message || 'Erro ao carregar diagnóstico' };
  }
}

async function _getDiagnosticoDoDia(email) {
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

  // Mapeia nomes do top5 → id da competência. Quando há múltiplas linhas
  // por nome (descritores importados via CSV), pega a linha 'principal'
  // (cod_desc IS NULL) quando existe, senão o primeiro id disponível.
  const { data: compsDoCargo } = await sb.from('competencias')
    .select('id, nome, cod_desc')
    .eq('empresa_id', colab.empresa_id)
    .eq('cargo', colab.cargo);
  const nomeToId = {};
  (compsDoCargo || []).forEach(c => {
    const key = (c.nome || '').toLowerCase();
    if (!key) return;
    // Prioriza linha sem cod_desc (mais estável); senão mantém o primeiro
    if (!nomeToId[key] || !c.cod_desc) nomeToId[key] = c.id;
  });

  const top5ComId = top5.map(n => ({ nome: n, id: nomeToId[(n || '').toLowerCase()] || null }));

  // Respostas já dadas pelo colaborador (filtra por competencia_id — mais confiável)
  const { data: respostas } = await sb.from('respostas')
    .select('competencia_id')
    .eq('colaborador_id', colab.id)
    .eq('empresa_id', colab.empresa_id);
  const jaRespondidasIds = new Set((respostas || []).map(r => r.competencia_id).filter(Boolean));

  // Pega o primeiro do top5 que ainda não foi respondido (por id)
  // Sem limite diário — o colaborador pode responder quantas competências quiser no mesmo dia
  const pendentes = top5ComId.filter(c => c.id && !jaRespondidasIds.has(c.id));
  const respondidas = top5.length - pendentes.length;
  const pct = top5.length > 0 ? Math.round((respondidas / top5.length) * 100) : 0;

  const progresso = { pct, total: top5.length, respondidas };
  const colaboradorPayload = { nome: colab.nome_completo, cargo: colab.cargo };

  // Se não há Top 5 configurado, mostra aviso (não falso 'concluiu tudo')
  if (top5.length === 0) {
    return { error: 'Seu cargo ainda não tem competências Top 5 configuradas. Fale com o RH/gestor.' };
  }

  // Concluiu todas (só se havia competências pra responder e todas foram respondidas)
  if (!pendentes.length) {
    return {
      colaborador: colaboradorPayload,
      progresso,
      concluiuTudo: true,
      cenarioDoDia: null,
      respondeuHoje: false,
    };
  }

  const proxima = pendentes[0];

  // Busca cenário A da comp+cargo
  const { data: cen } = await sb.from('banco_cenarios')
    .select('id, titulo, descricao, alternativas')
    .eq('empresa_id', colab.empresa_id)
    .eq('competencia_id', proxima.id)
    .eq('cargo', colab.cargo)
    .or('tipo_cenario.is.null,tipo_cenario.neq.cenario_b')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!cen) return { error: `Cenário para "${proxima.nome}" ainda não foi gerado` };

  const alt = typeof cen.alternativas === 'string' ? JSON.parse(cen.alternativas) : (cen.alternativas || []);
  const perguntas = Array.isArray(alt)
    ? alt.sort((a, b) => (a.numero || 0) - (b.numero || 0)).map(p => p.texto || '')
    : [];

  return {
    colaborador: colaboradorPayload,
    progresso,
    concluiuTudo: false,
    respondeuHoje: false,
    proximaCompetencia: proxima.nome,
    cenarioDoDia: {
      cenarioId: cen.id,
      compId: proxima.id,
      compNome: proxima.nome,
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
  try {
    return await _salvarRespostaDiagnostico(email, cenarioId, compId, compNome, payload);
  } catch (err) {
    console.error('[salvarRespostaDiagnostico]', err);
    return { error: err?.message || 'Erro ao salvar resposta' };
  }
}

async function _salvarRespostaDiagnostico(email, cenarioId, compId, compNome, payload) {
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

  // Sem limite diário — o colaborador pode responder quantas competências quiser no mesmo dia

  // Upsert (conflito no índice único empresa_id + colaborador_id + competencia_id)
  const { error: upErr } = await sb.from('respostas').upsert({
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
    rodada: 1,
  }, { onConflict: 'empresa_id,colaborador_id,competencia_id' });
  if (upErr) return { error: upErr.message };

  // Recalcula próxima (por id, não por nome)
  const { data: cargoEmp } = await sb.from('cargos_empresa')
    .select('top5_workshop').eq('empresa_id', colab.empresa_id).eq('nome', colab.cargo).maybeSingle();
  const top5 = cargoEmp?.top5_workshop || [];

  const { data: compsDoCargo } = await sb.from('competencias')
    .select('id, nome').eq('empresa_id', colab.empresa_id).eq('cargo', colab.cargo).is('cod_desc', null);
  const nomeToId = {};
  (compsDoCargo || []).forEach(c => { nomeToId[(c.nome || '').toLowerCase()] = c.id; });

  const { data: respostas } = await sb.from('respostas')
    .select('competencia_id').eq('colaborador_id', colab.id).eq('empresa_id', colab.empresa_id);
  const jaSet = new Set((respostas || []).map(r => r.competencia_id).filter(Boolean));

  const pendentes = top5.filter(n => {
    const id = nomeToId[(n || '').toLowerCase()];
    return id && !jaSet.has(id);
  });

  return {
    success: true,
    // Só é "concluído tudo" se havia competências pra responder
    concluiuTudo: top5.length > 0 && pendentes.length === 0,
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
