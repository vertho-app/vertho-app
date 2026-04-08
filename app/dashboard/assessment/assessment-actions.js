'use server';

import { createSupabaseAdmin } from '@/lib/supabase';

export async function loadAssessmentData(email) {
  if (!email) return { error: 'Email obrigatório' };

  const sb = createSupabaseAdmin();

  const { data: colab } = await sb.from('colaboradores')
    .select('id, nome_completo, empresa_id')
    .eq('email', email.toLowerCase())
    .single();

  if (!colab) return { error: 'Colaborador não encontrado' };

  // Buscar competências da empresa
  const { data: competencias } = await sb.from('competencias')
    .select('id, nome, pilar, cargo')
    .eq('empresa_id', colab.empresa_id)
    .order('nome');

  // Buscar sessões existentes do colaborador
  const { data: sessoes } = await sb.from('sessoes_avaliacao')
    .select('id, competencia_id, status, fase, nivel, nota_decimal, confianca')
    .eq('colaborador_id', colab.id)
    .order('created_at');

  return {
    colaborador: colab,
    competencias: competencias || [],
    sessoes: sessoes || [],
  };
}
