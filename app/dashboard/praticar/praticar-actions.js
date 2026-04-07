'use server';

import { createSupabaseAdmin } from '@/lib/supabase';

/**
 * Carrega a trilha ativa do colaborador (Fase 4 — Capacitação).
 * Busca a semana atual, conteúdo da pílula e histórico de semanas.
 */
export async function loadTrilhaAtual(email) {
  if (!email) return { error: 'Nao autenticado' };

  const sb = createSupabaseAdmin();
  const normalizedEmail = email.trim().toLowerCase();

  // Buscar colaborador
  const { data: colab } = await sb.from('colaboradores')
    .select('id, nome_completo, email, cargo, area_depto, empresa_id')
    .eq('email', normalizedEmail)
    .single();

  if (!colab) return { error: 'Colaborador nao encontrado' };

  // Buscar envio ativo (Fase 4)
  const { data: envio } = await sb.from('fase4_envios')
    .select('id, trilha_id, semana_atual, status, created_at')
    .eq('colaborador_id', colab.id)
    .eq('status', 'ativo')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!envio) {
    return { colaborador: colab, semAtiva: false };
  }

  const totalSemanas = 14;
  const semanaAtual = envio.semana_atual || 1;
  const ehImplementacao = [4, 8, 12].includes(semanaAtual);

  // Buscar conteúdo da trilha para a semana atual
  const { data: trilhaItem } = await sb.from('trilhas')
    .select('id, semana, titulo, resumo, url')
    .eq('id', envio.trilha_id)
    .single();

  // Buscar pílula da semana (trilhas pode ter múltiplas semanas)
  const { data: pilula } = await sb.from('trilhas')
    .select('semana, titulo, resumo, url')
    .eq('id', envio.trilha_id)
    .eq('semana', semanaAtual)
    .single();

  // Buscar semanas já completadas (evidências registradas)
  const { data: evidencias } = await sb.from('capacitacao')
    .select('semana')
    .eq('colaborador_id', colab.id)
    .eq('empresa_id', colab.empresa_id)
    .eq('tipo', 'evidencia')
    .eq('pilula_ok', true);

  const semanasCompletas = (evidencias || []).map(e => e.semana);

  // Montar lista de semanas com status
  const trilha = [];
  for (let s = 1; s <= totalSemanas; s++) {
    trilha.push({
      semana: s,
      completada: semanasCompletas.includes(s),
      ehImplementacao: [4, 8, 12].includes(s),
      atual: s === semanaAtual,
    });
  }

  return {
    colaborador: colab,
    semAtiva: true,
    semanaAtual,
    totalSemanas,
    pilula: pilula || trilhaItem || null,
    ehImplementacao,
    semanasCompletas,
    trilha,
    envioId: envio.id,
  };
}

/**
 * Registra evidência de prática semanal (Fase 4).
 */
export async function registrarEvidencia(colaboradorId, empresaId, semana, texto) {
  if (!colaboradorId || !empresaId || !semana || !texto?.trim()) {
    return { error: 'Dados incompletos' };
  }

  const sb = createSupabaseAdmin();

  const { data, error } = await sb.from('capacitacao').insert({
    empresa_id: empresaId,
    colaborador_id: colaboradorId,
    semana,
    tipo: 'evidencia',
    evidencia_texto: texto.trim(),
    pilula_ok: true,
    pontos: 5,
  }).select('id').single();

  if (error) return { error: error.message };
  return { ok: true, id: data.id };
}
