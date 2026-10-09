'use server';

import { after } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { tenantDb } from '@/lib/tenant-db';
import { findColabByEmail } from '@/lib/authz';
import {
  canAccessMapeamentoCenarios,
  gateDiagnosticoDaPessoa,
  precisaPreferenciasAprendizagem,
  usaMapeamentoComportamentalNativo,
} from '@/lib/access-gates';
import { configEfetivaDoColaborador } from '@/lib/turmas';
import { assessmentCompetencyWasAnswered, findAssessmentAnswer } from '@/lib/assessment/completion';
import { respostaDiagnosticoTemTexto } from '@/lib/assessment/resposta-texto';
import { competenciasDaDegustacao, isAssessmentDeDegustacao } from '@/lib/demo/convidado-demo';
import { resolverTrilhoLideranca, respondeuHojeNoTrilho, trilhoDe, type Trilho } from '@/lib/prontidao-lideranca/trilho';
import { escolherCenarioDaCompetencia, cenarioAtendeNotaMinima, notaMinimaDaEmpresa } from '@/lib/assessment/cenario-elegivel';
import { registrarDegradacao, DEGRADACAO } from '@/lib/degradacao';

/** Teto por resposta (P1 a P4). A tela limita o campo no mesmo número. */
const MAX_CARACTERES_RESPOSTA = 5000;

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
 * (`lib/prontidao-lideranca/trilho.ts`): é o segundo mapeamento, separado do
 * mapeamento do cargo. A degustação não tem trilho de liderança.
 *
 * ⚠️ O `cargo` que busca os cenários do trilho de liderança é o da VARIANTE da
 * matriz ("Gestor Comercial" / "Futuro Líder"), não o cargo-alvo da empresa: é
 * sob a variante que as competências e os cenários da matriz global ficam
 * gravados (`lib/simuladores/lideranca/instalar.ts`). Passar o cargo-alvo aqui
 * devolveria lista VAZIA, sem erro nenhum.
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
      sb, colab.empresa_id, r.cargoDaMatriz, r.competencias, colab.escola_id || null,
    );
    return { ok: true, trilho, competencias, degustacao: false, cargoCenario: r.cargoDaMatriz, umPorDia: r.cfg.um_por_dia, cargoAlvo: r.cargoAlvo };
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
  // Nota mínima do cenário (opt-in por empresa; `lib/assessment/cenario-elegivel.ts`). Falha de leitura NÃO
  // desliga o corte em silêncio: lança, e o wrapper da action devolve o erro.
  const nm = await notaMinimaDaEmpresa(sb, empresaId);
  if (nm.error) throw new Error(nm.error);
  if (compIds.length > 0) {
    const { data: cenarios, error: errCenarios } = await sb.from('banco_cenarios')
      .select('id, competencia_id, ppp_escola_id, created_at, nota_check')
      .eq('empresa_id', empresaId)
      .eq('cargo', cargo)
      .in('competencia_id', compIds)
      .or('tipo_cenario.is.null,tipo_cenario.neq.cenario_b')
      .order('created_at', { ascending: false });
    // Falha de leitura NÃO vira "competência sem cenário" (mensagem enganosa) nem desliga o corte: lança.
    if (errCenarios) throw new Error(`Falha ao ler os cenários: ${errCenarios.message}`);
    // Agrupa por competência: PPP do colaborador > cenário de rede > mais recente.
    const porComp: Record<string, any[]> = {};
    (cenarios || []).forEach((c: any) => { (porComp[c.competencia_id] = porComp[c.competencia_id] || []).push(c); });
    for (const [cid, rows] of Object.entries(porComp)) {
      const comp = compPorId[cid];
      const key = (comp?.nome || '').toLowerCase();
      if (!key || cenarioPorNome[key]) continue;
      // Mesma régua do chat: PPP > rede > mais recente, SÓ entre os aptos.
      const escolhido = escolherCenarioDaCompetencia(rows, pppEscolaId, nm.notaMinima);
      if (!escolhido) continue; // corte ligado e nenhum cenário apto: a competência fica sem cenário
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
 * A próxima competência a SERVIR: a primeira pendente, na ordem do Top 5, que tem
 * cenário servível. Fonte única para a tela (`getDiagnosticoDoDia`) e para o
 * "próxima competência" que o salvamento devolve; com duas regras a tela
 * ofereceria um botão que levaria a um bloqueio.
 */
function proximaComCenario<T extends { cenarioId?: string | null }>(pendentes: T[]): T | null {
  return pendentes.find((c) => !!c.cenarioId) || null;
}

// ── Rascunho das respostas (mig 283) ─────────────────────────────────────────
//
// A tela guardava P1-P4 só na memória do navegador até o envio final: em
// 08/10/2026 uma pessoa de Ibipeba respondeu três perguntas, a sessão caiu, e
// nada tinha chegado ao banco. O rascunho é gravado a cada pergunta e enquanto
// ela digita, volta quando ela reabre o MESMO cenário e some no envio.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RascunhoDiagnostico {
  r1: string;
  r2: string;
  r3: string;
  r4: string;
  pergunta: number;
}

/** O rascunho deste cenário, ou `null`. Leitura que falha vira `null` com aviso no log (não trava o mapeamento). */
async function lerRascunho(
  colab: { id: string; empresa_id: string },
  trilho: Trilho,
  compId: string | null,
  cenarioId: string,
): Promise<RascunhoDiagnostico | null> {
  if (!compId) return null;
  const { data, error } = await tenantDb(colab.empresa_id).from('assessment_rascunhos')
    .select('cenario_id, r1, r2, r3, r4, pergunta_atual')
    .eq('colaborador_id', colab.id)
    .eq('trilho', trilho)
    .eq('competencia_id', compId)
    .maybeSingle();
  if (error) {
    console.warn('[assessment] rascunho (leitura):', error.message);
    return null;
  }
  // Escrito para OUTRO cenário (regerado): o texto responderia a outra situação.
  if (!data || data.cenario_id !== cenarioId) return null;
  const r = { r1: data.r1 || '', r2: data.r2 || '', r3: data.r3 || '', r4: data.r4 || '' };
  if (![r.r1, r.r2, r.r3, r.r4].some((t) => t.trim())) return null;
  return { ...r, pergunta: Math.min(3, Math.max(0, Number(data.pergunta_atual) || 0)) };
}

/**
 * Grava o que a pessoa já escreveu (chamada a cada pergunta e com debounce
 * enquanto ela digita). É endpoint HTTP: a identidade vem da SESSÃO, o tenant do
 * `findColabByEmail`, e o cenário tem de existir NO TENANT e ser desta
 * competência. As portas de etapa (Top 5, cenário elegível, ordem Perfil →
 * Diagnóstico) ficam no envio definitivo, que é o que conta: um rascunho só volta
 * para a própria pessoa, no cenário em que foi escrito.
 */
export async function salvarRascunhoDiagnostico(
  cenarioId: string,
  compId: string,
  rascunho: RascunhoDiagnostico,
  trilho: Trilho = 'cargo',
) {
  try {
    const { getAuthenticatedEmailFromAction } = await import('@/lib/auth/action-context');
    const email = await getAuthenticatedEmailFromAction();
    if (!email) return { error: 'Não autenticado' };
    if (!UUID_RE.test(String(cenarioId || '')) || !UUID_RE.test(String(compId || ''))) {
      return { error: 'Cenário inválido' };
    }
    const textos = [rascunho?.r1, rascunho?.r2, rascunho?.r3, rascunho?.r4].map((t) => (typeof t === 'string' ? t : ''));
    if (textos.some((t) => t.length > MAX_CARACTERES_RESPOSTA)) {
      return { error: `Cada resposta pode ter até ${MAX_CARACTERES_RESPOSTA} caracteres`, code: 'RESPOSTA_LONGA' };
    }
    const pergunta = Math.min(3, Math.max(0, Math.trunc(Number(rascunho?.pergunta) || 0)));

    const colab = await findColabByEmail(email, 'id, empresa_id');
    if (!colab) return { error: 'Colaborador não encontrado' };
    const tdb = tenantDb(colab.empresa_id);

    const { data: cen, error: cenErr } = await tdb.from('banco_cenarios')
      .select('id, competencia_id')
      .eq('id', cenarioId)
      .maybeSingle();
    if (cenErr) return { error: cenErr.message };
    if (!cen || cen.competencia_id !== compId) return { error: 'Cenário inválido' };

    const { error: upErr } = await tdb.from('assessment_rascunhos').upsert({
      colaborador_id: colab.id,
      trilho: trilhoDe(trilho),
      competencia_id: compId,
      cenario_id: cenarioId,
      r1: textos[0], r2: textos[1], r3: textos[2], r4: textos[3],
      pergunta_atual: pergunta,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'empresa_id,colaborador_id,trilho,competencia_id' });
    if (upErr) return { error: upErr.message };
    return { success: true };
  } catch (err) {
    console.error('[salvarRascunhoDiagnostico]', err);
    return { error: err?.message || 'Erro ao salvar rascunho' };
  }
}

/** Registra (sem lançar) cada competência pendente sem cenário que a tela pulou. */
async function registrarCompetenciasSemCenario(
  colab: { id: string; empresa_id: string },
  cargo: string,
  semCenario: Array<{ nome: string; id?: string | null }>,
) {
  await Promise.all(semCenario.map((c) => registrarDegradacao({
    fluxo: 'assessment',
    tipo: DEGRADACAO.COMPETENCIA_SEM_CENARIO,
    chave: `${colab.empresa_id}:${cargo}:${c.nome}`,
    empresaId: colab.empresa_id,
    colaboradorId: colab.id,
    severidade: 'aviso',
    detalhe: { cargo, competencia: c.nome, competencia_id: c.id || null },
  })));
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
/**
 * A tela de preferências de aprendizagem entra agora? (tenant sem DISC nativo, ao
 * fim da PRIMEIRA competência respondida do primeiro mapeamento, e a pessoa ainda
 * não preencheu). Fonte única para `getDiagnosticoDoDia` e `salvarRespostaDiagnostico`
 * — duas cópias da regra divergiriam. Só lê a coluna quando a regra pode dar sim:
 * os demais tenants não pagam a query.
 */
async function avaliarPrecisaPreferencias(
  sb: any,
  colab: { id: string; empresa_id: string },
  cfg: any,
  args: { primeiroMapeamento: boolean; respondidas: number },
): Promise<{ precisa: boolean; erro?: string }> {
  if (!args.primeiroMapeamento || args.respondidas < 1) return { precisa: false };
  if (usaMapeamentoComportamentalNativo(cfg)) return { precisa: false };
  const { data, error } = await sb.from('colaboradores')
    .select('pref_video_curto')
    .eq('id', colab.id)
    .eq('empresa_id', colab.empresa_id)
    .maybeSingle();
  if (error) return { precisa: false, erro: error.message };
  return {
    precisa: precisaPreferenciasAprendizagem({
      config: cfg,
      jaPreencheu: Number((data as any)?.pref_video_curto) > 0,
      primeiraCompetenciaRespondida: true,
    }),
  };
}

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
    return {
      error: trilho === 'lideranca' ? 'Nenhuma competência configurada para o cargo-alvo' : 'Nenhuma competência configurada para seu cargo',
      code: 'SEM_COMPETENCIAS',
    };
  }
  const top5 = top5ComCenario;

  // A ordem Perfil → Diagnóstico vem DEPOIS de saber que há o que responder
  // (R-80, 03/10/2026): antes, quem não tinha Top 5 ouvia "faça o seu Perfil",
  // fazia, e só então descobria que não havia nenhuma competência para ele.
  const ordem = await gateDiagnosticoDaPessoa(sb, colab.empresa_id, (colab as any).id, cfg);
  if (!ordem.allowed) {
    return { error: ordem.message, code: ordem.code, remediation: ordem.remediation };
  }

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

  // No trilho de liderança, a tela oferece "Voltar ao mapeamento do cargo". Quem
  // só lidera (cargo com Top 5 vazio) não tem para onde voltar: o botão levaria a
  // "Nenhuma competência configurada". Lê só o Top 5 em `cargos_empresa` (a
  // régua do /api/me), sem buscar competências pelo cargo da pessoa, que é
  // exatamente o que o trilho de liderança não pode fazer.
  let trilhoCargo: { disponivel: boolean } | null = null;
  if (trilho === 'lideranca') {
    const { data: cargoDaPessoa, error: erroCargo } = await sb.from('cargos_empresa')
      .select('top5_workshop')
      .eq('empresa_id', colab.empresa_id)
      .eq('nome', colab.cargo)
      .maybeSingle();
    // Na dúvida (erro de leitura), mostra o caminho de volta, como o menu faz.
    const top5DoCargo = (cargoDaPessoa as any)?.top5_workshop;
    trilhoCargo = { disponivel: erroCargo ? true : Array.isArray(top5DoCargo) && top5DoCargo.length > 0 };
  }

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
  // Preferências de aprendizagem (tenant sem DISC nativo): pedidas ao fim da
  // primeira competência do PRIMEIRO mapeamento — o do cargo; quem só lidera
  // (cargo sem Top 5) tem o de liderança como primeiro.
  const pref = await avaliarPrecisaPreferencias(sb, colab as any, cfg, {
    primeiroMapeamento: trilho === 'cargo' || trilhoCargo?.disponivel === false,
    respondidas,
  });
  if (pref.erro) return { error: pref.erro };
  const extrasTrilho = { trilho, cargoAlvo, trilhoLideranca, trilhoCargo, precisaPreferencias: pref.precisa };

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

  // Serve a PRIMEIRA pendente que TEM cenário servível (R-82, 03/10/2026). Antes era
  // sempre `pendentes[0]`: uma competência sem cenário (não gerado, ou abaixo da nota
  // mínima) travava todas as seguintes, e a pessoa só lia "ainda não foi gerado". A que
  // ficou para trás não some: segue pendente, o mapeamento não fecha sem ela, e ela
  // volta sozinha quando o cenário existir. O pulo fica registrado (degradação), para
  // a equipe Vertho saber que falta gerar. O resolvedor (`resolverTop5ComCenario`) já
  // aplicou PPP > rede e o corte de nota ao escolher o `cenarioId`.
  const semCenario = pendentes.filter((c: any) => !c.cenarioId);
  if (semCenario.length) await registrarCompetenciasSemCenario(colab as any, cargoCenario, semCenario);
  const proxima = proximaComCenario(pendentes);
  if (!proxima) {
    return { error: 'Os cenários das suas próximas competências ainda estão em preparação.', code: 'SEM_CENARIO_DISPONIVEL' };
  }

  // Busca o cenário escolhido pelo resolvedor (por id, no tenant e no cargo do trilho).
  const nmDoDia = await notaMinimaDaEmpresa(sb, colab.empresa_id);
  if (nmDoDia.error) return { error: nmDoDia.error };
  const { data: cen, error: cenErr } = await sb.from('banco_cenarios')
    .select('id, titulo, descricao, alternativas, nota_check')
    .eq('empresa_id', colab.empresa_id)
    .eq('cargo', cargoCenario)
    .or('tipo_cenario.is.null,tipo_cenario.neq.cenario_b')
    .eq('id', proxima.cenarioId)
    .maybeSingle();
  if (cenErr) return { error: cenErr.message };
  // Sumiu entre a escolha e a leitura (regerado agora): a próxima carga escolhe de novo.
  if (!cen) return { error: 'Os cenários das suas próximas competências ainda estão em preparação.', code: 'SEM_CENARIO_DISPONIVEL' };
  // Defesa em profundidade: o resolvedor já cortou por nota; reconferir aqui custa nada e
  // impede que um caminho futuro sirva por fora do corte.
  if (!cenarioAtendeNotaMinima(cen, nmDoDia.notaMinima)) {
    return { error: 'Os cenários das suas próximas competências ainda estão em preparação.', code: 'SEM_CENARIO_DISPONIVEL' };
  }

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

  // O que a pessoa já tinha escrito neste cenário e não chegou a enviar (mig 283).
  // Falha de leitura não bloqueia o mapeamento: a tela abre sem o rascunho.
  const rascunho = await lerRascunho(colab as any, trilho, proxima.id, cen.id);

  return {
    colaborador: colaboradorPayload,
    progresso,
    degustacao,
    concluiuTudo: false,
    respondeuHoje: false,
    ...extrasTrilho,
    rascunho,
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
  if (!compId) return { error: 'Competência inválida' };
  const { r1, r2, r3, r4, repr } = payload || {};
  const textos = [r1, r2, r3, r4];
  if (textos.some((r) => typeof r !== 'string' || r.trim().length < 20)) {
    return { error: 'Todas as respostas precisam ter ao menos 20 caracteres' };
  }
  // Teto que a rota antiga aplicava: a resposta vai inteira para o prompt da IA4.
  if (textos.some((r) => r.length > MAX_CARACTERES_RESPOSTA)) {
    return { error: `Cada resposta pode ter até ${MAX_CARACTERES_RESPOSTA} caracteres`, code: 'RESPOSTA_LONGA' };
  }
  if (textos.some((r) => !respostaDiagnosticoTemTexto(r))) {
    return { error: 'Escreva sua resposta em palavras. Pontos, números ou símbolos sozinhos não são aceitos.', code: 'RESPOSTA_SEM_TEXTO' };
  }
  if (!repr || repr < 1 || repr > 10) {
    return { error: 'Representatividade inválida' };
  }

  const colab = await findColabByEmail(email, 'id, nome_completo, cargo, email, empresa_id, escola_id, role');
  if (!colab) return { error: 'Colaborador não encontrado' };

  const sb = createSupabaseAdmin();

  // Server action é endpoint: as portas da tela que SERVE o cenário valem aqui
  // também (R-81, 03/10/2026). Até então só a ordem Perfil → Diagnóstico era
  // reaplicada; uma chamada direta gravava resposta com os cenários bloqueados,
  // com a votação aberta, para competência fora do Top 5 ou em cenário que a
  // pessoa nunca receberia. A rota `/api/assessment`, que fazia essas checagens,
  // não tinha consumidor e foi aposentada: este é o único caminho de gravação.
  const cfg = await configEfetivaDoColaborador(sb, colab.empresa_id, (colab as any).id);
  const gate = canAccessMapeamentoCenarios(cfg);
  if (!gate.allowed) {
    return { error: gate.message, code: gate.code, remediation: gate.remediation };
  }
  const ordem = await gateDiagnosticoDaPessoa(sb, colab.empresa_id, (colab as any).id, cfg);
  if (!ordem.allowed) {
    return { error: ordem.message, code: ordem.code, remediation: ordem.remediation };
  }

  const { data: empresaRow, error: empresaErr } = await sb.from('empresas')
    .select('is_demo, sys_config')
    .eq('id', colab.empresa_id)
    .maybeSingle();
  if (empresaErr) return { error: empresaErr.message };

  // A MESMA lista que a tela usa (por id, não por nome) — resolvida ANTES do
  // upsert porque ela é o gate: o compId e o cenarioId vêm do browser.
  const resolvido = await competenciasDoTrilho(sb, colab as any, empresaRow, trilho);
  if ('error' in resolvido) return { error: resolvido.error, code: resolvido.code };
  const { competencias: top5ComCenario, degustacao, umPorDia } = resolvido;

  const competencia = top5ComCenario.find((c: any) => c.id && c.id === compId);
  if (!competencia) {
    return {
      error: trilho === 'lideranca'
        ? 'Esta competência não faz parte do seu mapeamento de liderança.'
        : 'Esta competência não faz parte do seu mapeamento.',
      code: 'COMPETENCIA_FORA_DO_TRILHO',
    };
  }
  // O cenário tem que ser o que a tela serviria para esta competência: o do PPP
  // da pessoa (ou o de rede), dentro do corte de nota da empresa.
  if (!cenarioId || competencia.cenarioId !== cenarioId) {
    return { error: 'Este cenário não está disponível para você. Recarregue a página.', code: 'CENARIO_NAO_ELEGIVEL' };
  }

  // Reenviar antes da IA4 é edição (o upsert sobrescreve). Depois da IA4, não:
  // o texto novo ficaria sob a avaliação do texto antigo.
  const { data: jaAvaliada, error: jaAvaliadaErr } = await sb.from('respostas')
    .select('id')
    .eq('colaborador_id', colab.id)
    .eq('empresa_id', colab.empresa_id)
    .eq('competencia_id', compId)
    .not('avaliacao_ia', 'is', null)
    .limit(1);
  if (jaAvaliadaErr) return { error: jaAvaliadaErr.message };
  if ((jaAvaliada || []).length) {
    return { error: 'Esta competência já foi respondida e avaliada.', code: 'COMPETENCIA_JA_AVALIADA' };
  }

  if (trilho === 'lideranca') {
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
    cenario_id: cenarioId,
    competencia_id: compId,
    // O nome vem da lista do servidor, não do browser.
    competencia_nome: competencia.nome,
    r1, r2, r3, r4,
    representatividade: repr,
    canal: 'dashboard',
    tipo_resposta: 'cenario_a',
    timestamp_resposta: new Date().toISOString(),
    rodada: 1,
  }, { onConflict: 'empresa_id,colaborador_id,competencia_id' });
  if (upErr) return { error: upErr.message };

  // A resposta definitiva está gravada: o rascunho dela sai. Falha aqui não
  // desfaz o envio (o rascunho só voltaria para uma competência já respondida,
  // que a tela não serve mais).
  const tdbRascunho = tenantDb(colab.empresa_id);
  const { error: rascErr } = await tdbRascunho.from('assessment_rascunhos')
    .delete()
    .eq('colaborador_id', colab.id)
    .eq('trilho', trilho)
    .eq('competencia_id', compId);
  if (rascErr) console.warn('[salvarRespostaDiagnostico] rascunho (remoção):', rascErr.message);

  // Recalcula a próxima pela lista já resolvida acima (a mesma da tela).
  const { data: respostas, error: respostasRecalcError } = await sb.from('respostas')
    .select('competencia_id,competencia_nome').eq('colaborador_id', colab.id).eq('empresa_id', colab.empresa_id);
  if (respostasRecalcError) return { error: respostasRecalcError.message };

  const pendentes = top5ComCenario
    .filter((c: any) => !assessmentCompetencyWasAnswered(c, respostas || []));
  const concluiuTudo = top5ComCenario.length > 0 && pendentes.length === 0;

  // Degustação: ninguém vai apertar "IA4 — Avaliar" por este convidado, então a
  // avaliação sai daqui. Em `after()` porque leva ~1min48 de mediana: a pessoa
  // segue para a etapa 02 e a devolutiva dela amadurece durante o percurso.
  if (degustacao && concluiuTudo) {
    const empresaId = colab.empresa_id;
    const alvo = { colaboradorId: colab.id, competenciaId: compId };
    after(async () => {
      try {
        // Com retentativa e a falha REGISTRADA (R-103): nunca lança.
        const { avaliarRespostaDaDegustacaoComRetentativa } = await import('@/lib/demo/degustacao-avaliacao');
        await avaliarRespostaDaDegustacaoComRetentativa(empresaId, alvo);
      } catch (e: any) {
        console.warn('[degustacao] avaliar resposta threw:', e?.message || e);
      }
    });
  }

  // Preferências de aprendizagem logo após a primeira resposta — a pessoa vê a tela
  // em seguida à pergunta de aderência, e não só quando fecha o mapeamento. Só no
  // trilho do cargo: o de liderança fecha por `getDiagnosticoDoDia` (que sabe se a
  // pessoa tem cargo próprio), na próxima carga da tela.
  let precisaPreferencias = false;
  if (trilho === 'cargo') {
    const pref = await avaliarPrecisaPreferencias(sb, colab as any, cfg, {
      primeiroMapeamento: true,
      respondidas: top5ComCenario.length - pendentes.length,
    });
    // A resposta JÁ foi gravada: falha de leitura aqui não pode virar erro de
    // salvamento. Cai em "não pede agora" e a próxima carga da tela decide.
    if (pref.erro) console.warn('[salvarRespostaDiagnostico] preferências:', pref.erro);
    precisaPreferencias = pref.precisa;
  }

  return {
    success: true,
    concluiuTudo,
    degustacao,
    precisaPreferencias,
    // A mesma régua da tela: a próxima COM cenário. Pendente sem cenário não vira
    // botão "Próxima competência" que leva a um bloqueio.
    proximaCompetencia: proximaComCenario(pendentes)?.nome || null,
  };
}

/**
 * Mantida para compatibilidade com código antigo — retorna os mesmos dados do
 * loadDiagnosticoDoDia em um formato próximo ao antigo (não é mais usado pelo novo UI).
 */
export async function loadAssessmentData() {
  return await getDiagnosticoDoDia();
}
