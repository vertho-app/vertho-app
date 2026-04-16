'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { findColabByEmail } from '@/lib/authz';

/**
 * Carrega a trilha do colaborador (Fase 4 — Capacitação).
 *
 * Fonte dos dados:
 * - trilhas         → competencia_foco, cursos (array), status (pendente/ativo/concluido)
 * - temporada_semana_progresso → semana, conteudo_consumido (se a capacitação já foi iniciada)
 *
 * Estados possíveis:
 * - semAtiva = false              → não tem trilha nenhuma
 * - trilha.status = 'pendente'    → trilha criada, aguardando o RH iniciar a capacitação
 * - progresso existe              → capacitação em andamento, mostra semana atual e cursos
 */
export async function loadTrilhaAtual(email) {
  if (!email) return { error: 'Não autenticado' };

  const colab = await findColabByEmail(email, 'id, nome_completo, email, cargo, area_depto, empresa_id');
  if (!colab) return { error: 'Colaborador não encontrado' };

  const sb = createSupabaseAdmin();

  // 1) Trilha criada na Fase 2 (montar trilhas)
  const { data: trilha } = await sb.from('trilhas')
    .select('id, competencia_foco, cursos, status, criado_em')
    .eq('colaborador_id', colab.id)
    .eq('empresa_id', colab.empresa_id)
    .order('criado_em', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!trilha) {
    return { colaborador: colab, semAtiva: false };
  }

  const cursos = Array.isArray(trilha.cursos) ? trilha.cursos : [];

  // 2) Progresso da capacitação (temporada_semana_progresso — schema novo)
  const { data: progressoRows } = await sb.from('temporada_semana_progresso')
    .select('semana, conteudo_consumido, created_at')
    .eq('colaborador_id', colab.id)
    .eq('empresa_id', colab.empresa_id)
    .order('semana', { ascending: false });

  const ultimoProgresso = progressoRows?.[0] || null;
  const semanaAtual = ultimoProgresso?.semana || 0;
  const totalSemanas = 14;
  const ehImplementacao = [4, 8, 12].includes(semanaAtual);

  // Estado "pendente" — trilha preparada mas ainda não iniciada
  if (!ultimoProgresso || trilha.status === 'pendente') {
    return {
      colaborador: colab,
      semAtiva: true,
      status: 'preparada',
      competenciaFoco: trilha.competencia_foco,
      cursos,
    };
  }

  // Em andamento
  const cursosProgresso = Array.isArray(ultimoProgresso.conteudo_consumido) ? ultimoProgresso.conteudo_consumido : [];
  const semanasCompletas = cursosProgresso.filter(c => c.concluido).map(c => c.semana).filter(Boolean);
  const trilhaSemanas = [];
  for (let s = 1; s <= totalSemanas; s++) {
    trilhaSemanas.push({
      semana: s,
      completada: semanasCompletas.includes(s),
      ehImplementacao: [4, 8, 12].includes(s),
      atual: s === semanaAtual,
    });
  }

  return {
    colaborador: colab,
    semAtiva: true,
    status: 'ativa',
    semanaAtual,
    totalSemanas,
    pctConclusao: Math.round((semanaAtual / totalSemanas) * 100),
    competenciaFoco: trilha.competencia_foco,
    cursos,
    cursosProgresso,
    ehImplementacao,
    trilha: trilhaSemanas,
    iniciadoEm: ultimoProgresso.created_at,
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

  let recordId: string | null = null;
  try {
    const { data, error } = await sb.from('capacitacao').insert({
      empresa_id: empresaId,
      colaborador_id: colaboradorId,
      semana,
      tipo: 'evidencia',
      evidencia_texto: texto.trim(),
      pilula_ok: false,
      pontos: 0,
    }).select('id').single();

    if (error) {
      console.warn('[registrarEvidencia] capacitacao insert falhou (tabela pode não existir):', error.message);
    } else {
      recordId = data.id;
    }
  } catch (e) {
    console.warn('[registrarEvidencia] capacitacao insert falhou (tabela pode não existir):', e?.message);
  }

  try {
    const { avaliarEvidencia } = await import('@/actions/tutor-evidencia');
    const avaliacao = await avaliarEvidencia(colaboradorId, empresaId, semana, texto.trim());
    return { ok: true, id: recordId, feedback: avaliacao.feedback, pontos: avaliacao.pontos, avaliacao: avaliacao.avaliacao };
  } catch {
    if (recordId) {
      try {
        await sb.from('capacitacao').update({ pontos: 5, pilula_ok: true }).eq('id', recordId);
      } catch { /* tabela pode não existir */ }
    }
    return { ok: true, id: recordId, feedback: 'Obrigado pela sua evidência! Continue praticando.', pontos: 5 };
  }
}
