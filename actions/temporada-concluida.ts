'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { requireUserAction } from '@/lib/auth/action-context';
import { findColabByEmail, canViewColabJourney } from '@/lib/authz';
import { calcularParticipacao } from '@/lib/season-engine/participacao';

/**
 * Carrega dados pra tela "Temporada Concluída" do colaborador.
 * Consolida: evolution_report + momentos literais de TODAS as semanas +
 * cenário B (semana final de avaliação) + resposta + devolutiva.
 */
export async function loadTemporadaConcluida(email: string) {
  const ctx = await requireUserAction();
  if (!email) return { error: 'Não autenticado' };

  const sb = createSupabaseAdmin();

  // findColabByEmail resolve o TENANT (cookie/header do host) — a query
  // direta com .maybeSingle() quebrava pra usuário presente em 2+ empresas
  // (multi-tenant → múltiplas rows → null → "Colaborador não encontrado").
  const colab = await findColabByEmail(email, 'id, nome_completo, cargo, area_depto, gestor_email, perfil_dominante, empresa_id') as any;
  if (!colab) return { error: 'Colaborador não encontrado' };

  // Gate de POSSE (auditoria 23/07, grupo C): o email vem do CLIENTE — qualquer
  // autenticado lia a temporada concluída de qualquer pessoa. Passam: o próprio
  // colab, gestor da mesma área, RH/tutor do tenant e platform admin.
  if (!canViewColabJourney(ctx, colab)) return { error: 'Sem permissão' };

  const { data: trilha } = await sb.from('trilhas')
    .select('id, competencia_foco, competencias_foco, numero_temporada, status, evolution_report, descritores_selecionados, temporada_plano')
    .eq('colaborador_id', colab.id)
    .order('criado_em', { ascending: false })
    .limit(1).maybeSingle();
  if (!trilha) return { error: 'Nenhuma trilha encontrada' };
  if (trilha.status !== 'concluida') return { error: 'Temporada ainda não concluída' };

  // Puxa momentos literais (top insights) das 14 semanas
  const { data: progressos } = await sb.from('temporada_semana_progresso')
    .select('semana, tipo, reflexao, feedback')
    .eq('trilha_id', trilha.id)
    .order('semana');

  const descritorPorSem: Record<string, string> = {}; // map: semana -> descritor (pra conteudo)
  const plano = Array.isArray(trilha.temporada_plano) ? trilha.temporada_plano : [];
  for (const s of plano) descritorPorSem[s.semana] = s.descritor;

  // Momentos = 3-5 insights das sems 1-12 priorizados por qualidade_reflexao=alta
  const momentosRaw = (progressos || [])
    .filter(p => p.tipo === 'conteudo' && p.reflexao?.insight_principal)
    .map(p => ({
      semana: p.semana,
      descritor: descritorPorSem[p.semana],
      insight: p.reflexao.insight_principal,
      qualidade: p.reflexao.qualidade_reflexao,
      desafio: p.reflexao.desafio_realizado,
    }));

  const momentos = [
    ...momentosRaw.filter(m => m.qualidade === 'alta'),
    ...momentosRaw.filter(m => m.qualidade === 'media'),
    ...momentosRaw.filter(m => m.qualidade === 'baixa' || !m.qualidade),
  ].slice(0, 5);

  // Missões práticas (sems 4/8/12) — compromisso + síntese
  const missoes = (progressos || [])
    .filter(p => p.tipo === 'aplicacao' && p.feedback)
    .map(p => ({
      semana: p.semana,
      modo: p.feedback.modo || 'cenario',
      compromisso: p.feedback.compromisso || null,
      sintese: p.feedback.sintese_bloco || null,
    }));

  // Semana do cenário B = última semana com tipo:'avaliacao' no plano
  const semsAval = plano.filter((s: any) => s?.tipo === 'avaliacao').map((s: any) => s.semana);
  const semCenarioB = semsAval.length ? Math.max(...semsAval) : 14;
  const progCenarioB = (progressos || []).find(p => p.semana === semCenarioB);
  const sem14 = progCenarioB?.feedback ? {
    cenario: progCenarioB.feedback.cenario || null,
    resposta: progCenarioB.feedback.cenario_resposta || null,
    resumo_avaliacao: progCenarioB.feedback.resumo_avaliacao || null,
    avaliacao_por_descritor: progCenarioB.feedback.avaliacao_por_descritor || [],
    nota_media_pos: progCenarioB.feedback.nota_media_pos || null,
  } : null;

  // Insight geral + próximo passo (do evolution_report já consolidado)
  // Elegibilidade do certificado (≥75% das semanas com entrega) — a emissão
  // em si fica na rota /api/temporada/certificado/pdf, que revalida tudo.
  const participacao = calcularParticipacao(plano, progressos || []);
  return {
    ok: true,
    colab: { nome: colab.nome_completo, cargo: colab.cargo, perfilDominante: colab.perfil_dominante },
    trilha: {
      id: trilha.id,
      competencia: Array.isArray(trilha.competencias_foco) && trilha.competencias_foco.length > 1
        ? trilha.competencias_foco.join(' + ')
        : trilha.competencia_foco,
      numeroTemporada: trilha.numero_temporada,
      totalSemanas: plano.length || 14,
    },
    evolutionReport: trilha.evolution_report,
    certificado: { elegivel: participacao.elegivel, pct: Math.round(participacao.pct * 100) },
    momentos,
    missoes,
    sem14,
  };
}
