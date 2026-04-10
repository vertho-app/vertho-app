'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { findColabByEmail } from '@/lib/authz';

/**
 * Carrega a jornada do colaborador — status de cada fase.
 * Fases: Diagnóstico → Avaliação → PDI → Capacitação → Reavaliação
 */
export async function loadJornada(email) {
  if (!email) return { error: 'Nao autenticado' };

  const colab = await findColabByEmail(email, 'id, nome_completo, email, cargo, area_depto, empresa_id, perfil_dominante, created_at');
  if (!colab) return { error: 'Colaborador nao encontrado' };

  const sb = createSupabaseAdmin();

  const fases = [];

  // Fase 1 — Diagnóstico (DISC/CIS)
  const temDISC = !!colab.perfil_dominante;
  fases.push({
    fase: 1,
    titulo: 'Diagnostico',
    descricao: 'Mapeamento do perfil comportamental (DISC)',
    status: temDISC ? 'completed' : 'pending',
    data: temDISC ? null : null, // DISC date not stored separately
  });

  // Fase 2 — Avaliação (respostas de competências)
  const { count: totalComp } = await sb.from('competencias')
    .select('id', { count: 'exact', head: true })
    .eq('empresa_id', colab.empresa_id);

  const { count: respondidas } = await sb.from('respostas')
    .select('id', { count: 'exact', head: true })
    .eq('colaborador_id', colab.id)
    .not('nivel_ia4', 'is', null);

  const avaliacaoCompleta = totalComp > 0 && respondidas >= totalComp;
  const avaliacaoIniciada = respondidas > 0;
  fases.push({
    fase: 2,
    titulo: 'Avaliacao',
    descricao: `Competencias avaliadas: ${respondidas || 0}/${totalComp || 0}`,
    status: avaliacaoCompleta ? 'completed' : avaliacaoIniciada ? 'in-progress' : 'pending',
    data: null,
  });

  // Fase 3 — PDI
  const { data: pdi } = await sb.from('pdis')
    .select('id, status, created_at')
    .eq('colaborador_id', colab.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  fases.push({
    fase: 3,
    titulo: 'PDI',
    descricao: 'Plano de Desenvolvimento Individual',
    status: pdi ? 'completed' : 'pending',
    data: pdi?.created_at || null,
  });

  // Fase 4 — Capacitação (trilha ativa)
  const { data: envio } = await sb.from('fase4_envios')
    .select('id, semana_atual, status, created_at')
    .eq('colaborador_id', colab.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  const capacitacaoStatus = envio
    ? (envio.status === 'concluido' ? 'completed' : 'in-progress')
    : 'pending';

  fases.push({
    fase: 4,
    titulo: 'Capacitacao',
    descricao: envio ? `Semana ${envio.semana_atual || 1} de 14` : 'Trilha de aprendizado semanal',
    status: capacitacaoStatus,
    data: envio?.created_at || null,
  });

  // Fase 5 — Reavaliação
  // Check if there's a second round of respostas or a reavaliacao flag
  const { count: reavaliacoes } = await sb.from('respostas')
    .select('id', { count: 'exact', head: true })
    .eq('colaborador_id', colab.id)
    .eq('rodada', 2);

  fases.push({
    fase: 5,
    titulo: 'Reavaliacao',
    descricao: 'Medicao de evolucao pos-capacitacao',
    status: reavaliacoes > 0 ? 'completed' : 'pending',
    data: null,
  });

  return {
    colaborador: colab,
    fases,
  };
}
