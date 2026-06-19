'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { findColabByEmail } from '@/lib/authz';
import { canAccessMapeamentoCenarios } from '@/lib/access-gates';

async function resolverTop5ComCenario(sb: any, empresaId: string, cargo: string, top5: string[], escolaId: string | null = null) {
  const { data: compsDoCargo } = await sb.from('competencias')
    .select('id, nome, cod_desc')
    .eq('empresa_id', empresaId)
    .eq('cargo', cargo);

  // Roteia por PPP: a escola do colaborador define o PPP-alvo; o cenário é
  // escolhido por ppp_escola_id (escolas que compartilham o PPP usam o mesmo
  // cenário). Sem escola/PPP → cenário de rede (ppp_escola_id null).
  let pppEscolaId: string | null = null;
  if (escolaId) {
    const { data: esc } = await sb.from('escolas').select('ppp_escola_id').eq('id', escolaId).maybeSingle();
    pppEscolaId = esc?.ppp_escola_id || null;
  }

  const compIds = (compsDoCargo || []).map((c: any) => c.id).filter(Boolean);
  const compPorId: Record<string, any> = Object.fromEntries((compsDoCargo || []).map((c: any) => [c.id, c]));
  const cenarioPorNome: Record<string, any> = {};
  if (compIds.length > 0) {
    const { data: cenarios } = await sb.from('banco_cenarios')
      .select('id, competencia_id, ppp_escola_id, created_at')
      .eq('empresa_id', empresaId)
      .eq('cargo', cargo)
      .in('competencia_id', compIds)
      .or('tipo_cenario.is.null,tipo_cenario.neq.cenario_b')
      .order('created_at', { ascending: false });
    // Agrupa por competência: PPP do colaborador > cenário de rede > mais recente.
    const porComp: Record<string, any[]> = {};
    (cenarios || []).forEach((c: any) => { (porComp[c.competencia_id] = porComp[c.competencia_id] || []).push(c); });
    for (const [cid, rows] of Object.entries(porComp)) {
      const comp = compPorId[cid];
      const key = (comp?.nome || '').toLowerCase();
      if (!key || cenarioPorNome[key]) continue;
      const escolhido = (pppEscolaId && rows.find((r: any) => r.ppp_escola_id === pppEscolaId))
        || rows.find((r: any) => !r.ppp_escola_id)
        || rows[0];
      cenarioPorNome[key] = { ...escolhido, compId: comp.id };
    }
  }

  const compPrincipalPorNome: Record<string, any> = {};
  (compsDoCargo || []).forEach((comp: any) => {
    const key = (comp.nome || '').toLowerCase();
    if (!key) return;
    const atual = compPrincipalPorNome[key];
    if (!atual || (!comp.cod_desc && atual.cod_desc)) {
      compPrincipalPorNome[key] = comp;
    }
  });

  return top5.map((n: string) => {
    const key = (n || '').toLowerCase();
    const cenario = cenarioPorNome[key];
    const comp = compPrincipalPorNome[key];
    return { nome: n, id: cenario?.compId || comp?.id || null, cenarioId: cenario?.id || null };
  });
}

/**
 * Retorna o diagnóstico do dia do colaborador autenticado.
 * Regra: 1 competência por dia, seguindo a ordem do Top 5 do cargo.
 * Dedupe diário: se já respondeu hoje, bloqueia até amanhã.
 */
export async function getDiagnosticoDoDia() {
  try {
    return await _getDiagnosticoDoDia();
  } catch (err) {
    console.error('[getDiagnosticoDoDia]', err);
    return { error: err?.message || 'Erro ao carregar diagnóstico' };
  }
}

async function _getDiagnosticoDoDia() {
  const { getAuthenticatedEmailFromAction } = await import('@/lib/auth/action-context');
  const email = await getAuthenticatedEmailFromAction();
  if (!email) return { error: 'Não autenticado' };

  const colab = await findColabByEmail(email, 'id, nome_completo, cargo, empresa_id, escola_id');
  if (!colab) return { error: 'Colaborador não encontrado' };

  const sb = createSupabaseAdmin();

  const { data: empresa } = await sb.from('empresas')
    .select('sys_config')
    .eq('id', colab.empresa_id)
    .maybeSingle();
  const gate = canAccessMapeamentoCenarios(empresa?.sys_config || {});
  if (!gate.allowed) {
    return { error: gate.message, code: gate.code, remediation: gate.remediation };
  }

  // Top 5 do cargo
  const { data: cargoEmp } = await sb.from('cargos_empresa')
    .select('top5_workshop')
    .eq('empresa_id', colab.empresa_id)
    .eq('nome', colab.cargo)
    .maybeSingle();
  const top5 = cargoEmp?.top5_workshop || [];
  if (!top5.length) return { error: 'Nenhuma competência configurada para seu cargo' };

  // Regra de negócio: cada competência do Top 5 tem um cenário.
  // Como a tabela de competências pode ter linhas de descritores, resolvemos
  // o cenário pelo nome da competência e usamos o id vinculado a esse cenário.
  const top5ComCenario = await resolverTop5ComCenario(sb, colab.empresa_id, colab.cargo, top5, (colab as any).escola_id || null);

  // Respostas já dadas pelo colaborador (filtra por competencia_id — mais confiável)
  const { data: respostas } = await sb.from('respostas')
    .select('competencia_id')
    .eq('colaborador_id', colab.id)
    .eq('empresa_id', colab.empresa_id);
  const jaRespondidasIds = new Set((respostas || []).map(r => r.competencia_id).filter(Boolean));

  // Pega o primeiro do top5 que ainda não foi respondido (por id)
  // Sem limite diário — o colaborador pode responder quantas competências quiser no mesmo dia
  const pendentes = top5ComCenario.filter(c => c.id && !jaRespondidasIds.has(c.id));
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

  // Busca o cenário A daquela competência/cargo.
  let query = sb.from('banco_cenarios')
    .select('id, titulo, descricao, alternativas')
    .eq('empresa_id', colab.empresa_id)
    .eq('cargo', colab.cargo)
    .or('tipo_cenario.is.null,tipo_cenario.neq.cenario_b')
    .order('created_at', { ascending: false })
    .limit(1);
  query = proxima.cenarioId ? query.eq('id', proxima.cenarioId) : query.eq('competencia_id', proxima.id);
  const { data: cen } = await query.maybeSingle();
  if (!cen) return { error: `Cenário para "${proxima.nome}" ainda não foi gerado` };

  // `alternativas` pode vir como array legado [{numero,texto}] OU como objeto
  // do formato atual { perguntas: [{numero, texto, ...}], ... }. Sem este
  // fallback, o objeto não é array → perguntas vazias → caía no genérico
  // ("Descreva a situação."), ignorando o cenário desenhado.
  const altRaw = typeof cen.alternativas === 'string' ? JSON.parse(cen.alternativas) : (cen.alternativas || []);
  const lista = Array.isArray(altRaw) ? altRaw : (altRaw?.perguntas || []);
  const perguntas = (Array.isArray(lista) ? lista : [])
    .slice()
    .sort((a: any, b: any) => (a.numero || 0) - (b.numero || 0))
    .map((p: any) => p.texto || p.pergunta || '');

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
export async function salvarRespostaDiagnostico(cenarioId, compId, compNome, payload) {
  try {
    return await _salvarRespostaDiagnostico(cenarioId, compId, compNome, payload);
  } catch (err) {
    console.error('[salvarRespostaDiagnostico]', err);
    return { error: err?.message || 'Erro ao salvar resposta' };
  }
}

async function _salvarRespostaDiagnostico(cenarioId, compId, compNome, payload) {
  const { getAuthenticatedEmailFromAction } = await import('@/lib/auth/action-context');
  const email = await getAuthenticatedEmailFromAction();
  if (!email) return { error: 'Não autenticado' };
  if (!compId || !compNome) return { error: 'Competência inválida' };
  const { r1, r2, r3, r4, repr } = payload || {};
  if (!r1 || r1.length < 20 || !r2 || r2.length < 20 || !r3 || r3.length < 20 || !r4 || r4.length < 20) {
    return { error: 'Todas as respostas precisam ter ao menos 20 caracteres' };
  }
  if (!repr || repr < 1 || repr > 10) {
    return { error: 'Representatividade inválida' };
  }

  const colab = await findColabByEmail(email, 'id, nome_completo, cargo, email, empresa_id, escola_id');
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

  const top5ComCenario = await resolverTop5ComCenario(sb, colab.empresa_id, colab.cargo, top5, (colab as any).escola_id || null);

  const { data: respostas } = await sb.from('respostas')
    .select('competencia_id').eq('colaborador_id', colab.id).eq('empresa_id', colab.empresa_id);
  const jaSet = new Set((respostas || []).map(r => r.competencia_id).filter(Boolean));

  const pendentes = top5ComCenario
    .filter((c: any) => c.id && !jaSet.has(c.id))
    .map((c: any) => c.nome);

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
export async function loadAssessmentData() {
  return await getDiagnosticoDoDia();
}
