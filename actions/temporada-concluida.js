'use server';

import { createSupabaseAdmin } from '@/lib/supabase';

/**
 * Carrega dados pra tela "Temporada Concluída" do colaborador.
 * Consolida: evolution_report + momentos literais das 14 semanas +
 * cenário B + resposta + devolutiva.
 */
export async function loadTemporadaConcluida(email) {
  if (!email) return { error: 'Não autenticado' };

  const sb = createSupabaseAdmin();

  const { data: colab } = await sb.from('colaboradores')
    .select('id, nome_completo, cargo, perfil_dominante')
    .eq('email', email).maybeSingle();
  if (!colab) return { error: 'Colaborador não encontrado' };

  const { data: trilha } = await sb.from('trilhas')
    .select('id, competencia_foco, numero_temporada, status, evolution_report, descritores_selecionados')
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

  const descritorPorSem = {}; // map: semana -> descritor (pra conteudo)
  // Como temporada_plano está em trilhas, preciso puxar separado
  const { data: planRow } = await sb.from('trilhas').select('temporada_plano').eq('id', trilha.id).maybeSingle();
  const plano = Array.isArray(planRow?.temporada_plano) ? planRow.temporada_plano : [];
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

  // Sem 14 — cenário + resposta + devolutiva
  const prog14 = (progressos || []).find(p => p.semana === 14);
  const sem14 = prog14?.feedback ? {
    cenario: prog14.feedback.cenario || null,
    resposta: prog14.feedback.cenario_resposta || null,
    resumo_avaliacao: prog14.feedback.resumo_avaliacao || null,
    avaliacao_por_descritor: prog14.feedback.avaliacao_por_descritor || [],
    nota_media_pos: prog14.feedback.nota_media_pos || null,
  } : null;

  // Sem 13 — insight geral + próximo passo (do evolution_report já consolidado)
  return {
    ok: true,
    colab: { nome: colab.nome_completo, cargo: colab.cargo, perfilDominante: colab.perfil_dominante },
    trilha: {
      id: trilha.id,
      competencia: trilha.competencia_foco,
      numeroTemporada: trilha.numero_temporada,
    },
    evolutionReport: trilha.evolution_report,
    momentos,
    missoes,
    sem14,
  };
}
