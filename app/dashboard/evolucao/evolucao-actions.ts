'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { findColabByEmail } from '@/lib/authz';

export async function loadEvolucao() {
  const { getAuthenticatedEmailFromAction } = await import('@/lib/auth/action-context');
  const email = await getAuthenticatedEmailFromAction();
  if (!email) return { error: 'Não autenticado' };

  const colab = await findColabByEmail(email, 'id, nome_completo, empresa_id');
  if (!colab) return { error: 'Colaborador não encontrado' };

  const sb = createSupabaseAdmin();

  // Buscar sessões concluídas (avaliação inicial)
  const { data: sessoes } = await sb.from('sessoes_avaliacao')
    .select('id, competencia_id, competencia_nome, nivel, nota_decimal, lacuna, avaliacao_final, created_at')
    .eq('colaborador_id', colab.id)
    .eq('status', 'concluido')
    .order('created_at');

  // Buscar evolução por descritor (se existir)
  const { data: descritores } = await sb.from('evolucao_descritores')
    .select('*')
    .eq('colaborador_id', colab.id)
    .order('created_at');

  // Buscar evolução consolidada (se existir)
  const { data: evolucao } = await sb.from('evolucao')
    .select('*')
    .eq('colaborador_id', colab.id)
    .order('created_at');

  // Agrupar sessões por competência (pode ter inicial + reavaliação)
  const porCompetencia: Record<string, any> = {};
  (sessoes || []).forEach((s: any) => {
    const key = s.competencia_id;
    if (!porCompetencia[key]) {
      porCompetencia[key] = { nome: s.competencia_nome, inicial: null, reavaliacao: null };
    }
    if (!porCompetencia[key].inicial) {
      porCompetencia[key].inicial = s;
    } else {
      porCompetencia[key].reavaliacao = s;
    }
  });

  // Calcular métricas
  const competencias: any[] = Object.values(porCompetencia);
  const totalAvaliadas = competencias.length;
  const comReavaliacao = competencias.filter((c: any) => c.reavaliacao).length;
  const notaMedia = totalAvaliadas > 0
    ? competencias.reduce((sum: number, c: any) => sum + (c.reavaliacao?.nota_decimal || c.inicial?.nota_decimal || 0), 0) / totalAvaliadas
    : 0;
  const deltaMedia = comReavaliacao > 0
    ? competencias.filter((c: any) => c.reavaliacao).reduce((sum: number, c: any) => sum + ((c.reavaliacao.nota_decimal || 0) - (c.inicial.nota_decimal || 0)), 0) / comReavaliacao
    : 0;

  return {
    colaborador: colab,
    competencias,
    descritores: descritores || [],
    evolucao: evolucao || [],
    metricas: {
      totalAvaliadas,
      comReavaliacao,
      notaMedia: Math.round(notaMedia * 10) / 10,
      deltaMedia: Math.round(deltaMedia * 10) / 10,
    },
  };
}
