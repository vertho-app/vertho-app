'use server';

import { after } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { tenantDb } from '@/lib/tenant-db';
import { findColabByEmail } from '@/lib/authz';
import { canAccessMapeamentoCenarios } from '@/lib/access-gates';
import { configEfetivaDoColaborador } from '@/lib/turmas';
import { assessmentCompetencyWasAnswered, findAssessmentAnswer } from '@/lib/assessment/completion';
import { competenciasDaDegustacao, isAssessmentDeDegustacao } from '@/lib/demo/convidado-demo';
import { resolverTrilhoLideranca, respondeuHojeNoTrilho, trilhoDe, type Trilho } from '@/lib/prontidao-lideranca/trilho';

/**
 * Lista de competências que ESTA pessoa responde — fonte única.
 *
 * Existe porque duas actions decidem sobre a mesma coisa: `getDiagnosticoDoDia`
 * monta o progresso e a tela de resultado, `salvarRespostaDiagnostico` calcula
 * a próxima pendente. Com o corte da degustação em só uma delas, a tela diria
 * "1 de 1 concluído" enquanto a outra devolvia uma próxima competência — a
 * pessoa terminaria e continuaria sendo empurrada para o cenário seguinte.
 */
async function competenciasDoColaborador(
  sb: any,
  colab: { id: string; empresa_id: string; cargo: string; email?: string | null; escola_id?: string | null },
  empresaIsDemo: boolean,
) {
  const { data: cargoEmp } = await sb.from('cargos_empresa')
    .select('top5_workshop')
    .eq('empresa_id', colab.empresa_id)
    .eq('nome', colab.cargo)
    .maybeSingle();
  const top5: string[] = cargoEmp?.top5_workshop || [];
  const comCenario = await resolverTop5ComCenario(
    sb, colab.empresa_id, colab.cargo, top5, colab.escola_id || null,
  );
  const degustacao = isAssessmentDeDegustacao(empresaIsDemo, colab.email);
  return { competencias: competenciasDaDegustacao(comCenario, degustacao), degustacao };
}

/**
 * As competências do TRILHO pedido — fonte única das duas actions.
 *
 * `cargo`: o Top 5 do cargo da pessoa (com o corte da degustação), exatamente
 * como sempre foi. `lideranca`: o Top 5 do CARGO-ALVO do programa de prontidão
 * (`lib/prontidao-lideranca/trilho.ts`), com os cenários gerados para ESSE
 * cargo — é o segundo mapeamento, separado do mapeamento do cargo. A
 * degustação não tem trilho de liderança.
 */
type TrilhoResolvido =
  | { ok: true; trilho: 'cargo'; competencias: any[]; degustacao: boolean; cargoCenario: string; umPorDia: false; cargoAlvo: null }
  | { ok: true; trilho: 'lideranca'; competencias: any[]; degustacao: false; cargoCenario: string; umPorDia: boolean; cargoAlvo: string }
  | { ok: false; error: string; code: string };

async function competenciasDoTrilho(
  sb: any,
  colab: { id: string; empresa_id: string; cargo: string; email?: string | null; escola_id?: string | null },
  empresa: { is_demo?: boolean | null; sys_config?: unknown } | null,
  trilho: Trilho,
): Promise<TrilhoResolvido> {
  if (trilho === 'lideranca') {
    const r = await resolverTrilhoLideranca(sb, colab, empresa?.sys_config);
    // `'code' in r`, não `!r.ok`: com strict:false a união não estreita por booleano.
    if ('code' in r) return { ok: false, error: r.message, code: r.code };
    const competencias = await resolverTop5ComCenario(
      sb, colab.empresa_id, r.cargoAlvo, r.competencias, colab.escola_id || null,
    );
    return { ok: true, trilho, competencias, degustacao: false, cargoCenario: r.cargoAlvo, umPorDia: r.cfg.um_por_dia, cargoAlvo: r.cargoAlvo };
  }
  const { competencias, degustacao } = await competenciasDoColaborador(sb, colab, empresa?.is_demo === true);
  return { ok: true, trilho: 'cargo', competencias, degustacao, cargoCenario: colab.cargo, umPorDia: false, cargoAlvo: null };
}

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
 * Nome da competência exibido no cabeçalho do chat do assessment.
 *
 * Existe porque a tela lia `competencias` DIRETO do browser, e a policy que
 * permitia isso (`authenticated ... USING(true)`) devolvia as 935 competências
 * das 10 empresas para qualquer sessão autenticada — inclusive de tenant com
 * cadastro aberto. A leitura veio para cá para a policy poder cair.
 *
 * ⚠️ O `competenciaId` continua vindo da URL (`?competencia=`), ou seja, é
 * escolhido pelo CLIENTE. Quem decide o tenant é a SESSÃO: `tenantDb` injeta
 * `empresa_id` no filtro. Sem esse par, a migração só teria movido o IDOR do
 * browser para dentro de uma server action — que é a mesma classe de bug.
 */
export async function getNomeCompetencia(competenciaId: string) {
  try {
    if (!competenciaId) return { error: 'Competência inválida' };

    const { getAuthenticatedEmailFromAction } = await import('@/lib/auth/action-context');
    const email = await getAuthenticatedEmailFromAction();
    if (!email) return { error: 'Não autenticado' };

    const colab = await findColabByEmail(email, 'id, empresa_id');
    if (!colab) return { error: 'Colaborador não encontrado' };

    // Id inválido chegaria ao Postgres como `invalid input syntax for type uuid`
    // (22P02) — barrar aqui evita transformar lixo da URL em erro de banco.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(competenciaId)) {
      return { error: 'Competência inválida' };
    }

    const tdb = tenantDb(colab.empresa_id);
    const { data, error } = await tdb.from('competencias')
      .select('nome')
      .eq('id', competenciaId)
      .maybeSingle();
    if (error) return { error: error.message };
    if (!data) return { error: 'Competência não encontrada' };

    return { nome: data.nome as string };
  } catch (err) {
    console.error('[getNomeCompetencia]', err);
    return { error: err?.message || 'Erro ao carregar competência' };
  }
}

/**
 * Retorna o diagnóstico do dia do colaborador autenticado.
 * Regra: 1 competência por dia, seguindo a ordem do Top 5 do cargo.
 * Dedupe diário: se já respondeu hoje, bloqueia até amanhã.
 */
export async function getDiagnosticoDoDia(trilho: Trilho = 'cargo') {
  try {
    return await _getDiagnosticoDoDia(trilhoDe(trilho));
  } catch (err) {
    console.error('[getDiagnosticoDoDia]', err);
    return { error: err?.message || 'Erro ao carregar diagnóstico' };
  }
}

async function _getDiagnosticoDoDia(trilho: Trilho) {
  const { getAuthenticatedEmailFromAction } = await import('@/lib/auth/action-context');
  const email = await getAuthenticatedEmailFromAction();
  if (!email) return { error: 'Não autenticado' };

  const colab = await findColabByEmail(email, 'id, nome_completo, cargo, email, empresa_id, escola_id, role');
  if (!colab) return { error: 'Colaborador não encontrado' };

  const sb = createSupabaseAdmin();

  // Config EFETIVA (empresa → turma → participação): mig 210.
  const cfg = await configEfetivaDoColaborador(sb, colab.empresa_id, (colab as any).id);
  const gate = canAccessMapeamentoCenarios(cfg);
  if (!gate.allowed) {
    return { error: gate.message, code: gate.code, remediation: gate.remediation };
  }

  const { data: empresaRow, error: empresaErr } = await sb.from('empresas')
    .select('is_demo, sys_config')
    .eq('id', colab.empresa_id)
    .maybeSingle();
  if (empresaErr) return { error: empresaErr.message };

  // Competências do TRILHO pedido (cargo = Top 5 da pessoa, com o corte da
  // degustação; liderança = Top 5 do cargo-alvo do programa de prontidão).
  const resolvido = await competenciasDoTrilho(sb, colab as any, empresaRow, trilho);
  if ('error' in resolvido) return { error: resolvido.error, code: resolvido.code };
  const { competencias: top5ComCenario, degustacao, cargoCenario, umPorDia, cargoAlvo } = resolvido;
  if (!top5ComCenario.length) {
    return { error: trilho === 'lideranca' ? 'Nenhuma competência configurada para o cargo-alvo' : 'Nenhuma competência configurada para seu cargo' };
  }
  const top5 = top5ComCenario;

  // O trilho do cargo avisa a tela que existe o de liderança (e quanto falta),
  // para a pessoa encontrar o segundo mapeamento sem link novo. Custa uma
  // leitura de cargo — e nada quando o módulo não está contratado.
  let trilhoLideranca: { disponivel: boolean; respondidas: number; total: number } | null = null;

  // Respostas já dadas pelo colaborador (filtra por competencia_id — mais confiável)
  const { data: respostas, error: respostasError } = await sb.from('respostas')
    .select('competencia_id, competencia_nome, nivel_ia4, nota_ia4, pontos_fortes, pontos_atencao, feedback_ia4, avaliacao_ia, timestamp_resposta')
    .eq('colaborador_id', colab.id)
    .eq('empresa_id', colab.empresa_id);
  if (respostasError) return { error: respostasError.message };

  if (trilho === 'cargo') {
    const lid = await competenciasDoTrilho(sb, colab as any, empresaRow, 'lideranca');
    if (lid.ok && lid.competencias.length) {
      const respondidasLid = lid.competencias.filter((c: any) => assessmentCompetencyWasAnswered(c, respostas || [])).length;
      trilhoLideranca = { disponivel: true, respondidas: respondidasLid, total: lid.competencias.length };
    }
  }
  // Pega o primeiro do Top 5 que ainda não foi respondido. O ID é a chave
  // preferencial, mas o catálogo pode ser recomposto e receber novos UUIDs
  // preservando o nome. Nesse caso a resposta anterior continua válida.
  // Sem limite diário — o colaborador pode responder quantas competências quiser no mesmo dia
  const pendentes = top5ComCenario.filter((competencia) =>
    !assessmentCompetencyWasAnswered(competencia, respostas || []),
  );
  const respondidas = top5.length - pendentes.length;
  const pct = top5.length > 0 ? Math.round((respondidas / top5.length) * 100) : 0;

  const progresso = { pct, total: top5.length, respondidas };
  const extrasTrilho = { trilho, cargoAlvo, trilhoLideranca };

  // Um cenário por dia SÓ no trilho de liderança (decisão do programa). O
  // trilho do cargo segue sem limite, como sempre foi. A tela já tem o estado
  // "já respondeu hoje"; aqui ele volta a ter um caso que o produz.
  if (trilho === 'lideranca' && umPorDia && pendentes.length && respondeuHojeNoTrilho(respostas || [], top5ComCenario)) {
    return {
      colaborador: { id: colab.id, nome: colab.nome_completo, cargo: colab.cargo },
      progresso,
      degustacao,
      concluiuTudo: false,
      respondeuHoje: true,
      cenarioDoDia: null,
      ...extrasTrilho,
    };
  }
  // A tela precisa saber que é degustação para encerrar mandando à etapa 02 e
  // explicar que a análise amadurece durante o percurso.

  const colaboradorPayload = { id: colab.id, nome: colab.nome_completo, cargo: colab.cargo };


  // Concluiu todas (só se havia competências pra responder e todas foram respondidas)
  if (!pendentes.length) {
    const resultados = top5ComCenario.map((competencia) => {
      const row: any = findAssessmentAnswer(competencia, respostas || []);
      const avaliacao = typeof row?.avaliacao_ia === 'string'
        ? (() => { try { return JSON.parse(row.avaliacao_ia); } catch { return null; } })()
        : row?.avaliacao_ia;
      const consolidacao = avaliacao?.consolidacao || {};
      const nivelRaw = row?.nivel_ia4 ?? consolidacao.nivel_geral ?? consolidacao.nivel;
      const notaRaw = row?.nota_ia4 ?? consolidacao.nota_geral ?? consolidacao.nota_decimal;
      const nivel = Number(nivelRaw);
      const nota = Number(notaRaw);
      const lista = (value: any): string[] => Array.isArray(value)
        ? value.map((item) => String(item || '').trim()).filter(Boolean)
        : (typeof value === 'string' && value.trim() ? [value.trim()] : []);
      const pontosFortes = lista(row?.pontos_fortes ?? avaliacao?.pontos_fortes);
      const pontosAtencao = lista(row?.pontos_atencao ?? avaliacao?.pontos_atencao ?? avaliacao?.pontos_melhoria);
      const feedback = String(
        row?.feedback_ia4
        || avaliacao?.resumo_geral
        || avaliacao?.feedback?.resumo
        || consolidacao?.resumo
        || '',
      ).trim();
      return {
        competencia: competencia.nome,
        avaliada: Number.isFinite(nivel) || Number.isFinite(nota) || Boolean(feedback),
        nivel: Number.isFinite(nivel) ? nivel : null,
        nota: Number.isFinite(nota) ? nota : null,
        pontosFortes,
        pontosAtencao,
        feedback,
      };
    });
    const { count: pdiCount, error: pdiError } = await sb.from('relatorios')
      .select('id', { count: 'exact', head: true })
      .eq('empresa_id', colab.empresa_id)
      .eq('colaborador_id', colab.id)
      .eq('tipo', 'individual');
    if (pdiError) return { error: pdiError.message };
    return {
      colaborador: colaboradorPayload,
      progresso,
      degustacao,
      concluiuTudo: true,
      resultados,
      // O PDI é do mapeamento do CARGO; no trilho de liderança o botão não faz sentido.
      temPdi: trilho === 'cargo' && (pdiCount || 0) > 0,
      cenarioDoDia: null,
      respondeuHoje: false,
      ...extrasTrilho,
    };
  }

  const proxima = pendentes[0];

  // Busca o cenário A daquela competência/cargo.
  let query = sb.from('banco_cenarios')
    .select('id, titulo, descricao, alternativas')
    .eq('empresa_id', colab.empresa_id)
    .eq('cargo', cargoCenario)
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
    degustacao,
    concluiuTudo: false,
    respondeuHoje: false,
    ...extrasTrilho,
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
export async function salvarRespostaDiagnostico(cenarioId, compId, compNome, payload, trilho: Trilho = 'cargo') {
  try {
    return await _salvarRespostaDiagnostico(cenarioId, compId, compNome, payload, trilhoDe(trilho));
  } catch (err) {
    console.error('[salvarRespostaDiagnostico]', err);
    return { error: err?.message || 'Erro ao salvar resposta' };
  }
}

async function _salvarRespostaDiagnostico(cenarioId, compId, compNome, payload, trilho: Trilho) {
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

  const colab = await findColabByEmail(email, 'id, nome_completo, cargo, email, empresa_id, escola_id, role');
  if (!colab) return { error: 'Colaborador não encontrado' };

  const sb = createSupabaseAdmin();

  const { data: empresaRow, error: empresaErr } = await sb.from('empresas')
    .select('is_demo, sys_config')
    .eq('id', colab.empresa_id)
    .maybeSingle();
  if (empresaErr) return { error: empresaErr.message };

  // A MESMA lista que a tela usa (por id, não por nome) — resolvida ANTES do
  // upsert porque, no trilho de liderança, ela é o gate: o compId vem do
  // browser e precisa pertencer ao trilho; e "um por dia" é regra do servidor,
  // não da tela.
  const resolvido = await competenciasDoTrilho(sb, colab as any, empresaRow, trilho);
  if ('error' in resolvido) return { error: resolvido.error, code: resolvido.code };
  const { competencias: top5ComCenario, degustacao, umPorDia } = resolvido;

  if (trilho === 'lideranca') {
    if (!top5ComCenario.some((c: any) => c.id === compId)) {
      return { error: 'Esta competência não faz parte do seu mapeamento de liderança.', code: 'COMPETENCIA_FORA_DO_TRILHO' };
    }
    if (umPorDia) {
      const { data: doDia, error: doDiaErr } = await sb.from('respostas')
        .select('competencia_id, competencia_nome, timestamp_resposta')
        .eq('colaborador_id', colab.id)
        .eq('empresa_id', colab.empresa_id);
      if (doDiaErr) return { error: doDiaErr.message };
      // Reenviar a MESMA competência de hoje é edição, não um segundo cenário.
      const outras = (doDia || []).filter((r: any) => r.competencia_id !== compId);
      if (respondeuHojeNoTrilho(outras, top5ComCenario)) {
        return { error: 'Você já respondeu o cenário de liderança de hoje. O próximo abre amanhã.', code: 'JA_RESPONDEU_HOJE' };
      }
    }
  }
  // Trilho do cargo: sem limite diário — o colaborador pode responder quantas competências quiser no mesmo dia

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

  // Recalcula a próxima pela lista já resolvida acima (a mesma da tela).
  const { data: respostas, error: respostasRecalcError } = await sb.from('respostas')
    .select('competencia_id,competencia_nome').eq('colaborador_id', colab.id).eq('empresa_id', colab.empresa_id);
  if (respostasRecalcError) return { error: respostasRecalcError.message };

  const pendentes = top5ComCenario
    .filter((competencia: any) => !assessmentCompetencyWasAnswered(competencia, respostas || []))
    .map((c: any) => c.nome);
  const concluiuTudo = top5ComCenario.length > 0 && pendentes.length === 0;

  // Degustação: ninguém vai apertar "IA4 — Avaliar" por este convidado, então a
  // avaliação sai daqui. Em `after()` porque leva ~1min48 de mediana: a pessoa
  // segue para a etapa 02 e a devolutiva dela amadurece durante o percurso.
  if (degustacao && concluiuTudo) {
    const empresaId = colab.empresa_id;
    const alvo = { colaboradorId: colab.id, competenciaId: compId };
    after(async () => {
      try {
        const { avaliarRespostaDaDegustacao } = await import('@/lib/demo/degustacao-avaliacao');
        const r = await avaliarRespostaDaDegustacao(empresaId, alvo);
        if (!r.success) console.warn('[degustacao] avaliar resposta:', r.error);
      } catch (e: any) {
        console.warn('[degustacao] avaliar resposta threw:', e?.message || e);
      }
    });
  }

  return {
    success: true,
    concluiuTudo,
    degustacao,
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
