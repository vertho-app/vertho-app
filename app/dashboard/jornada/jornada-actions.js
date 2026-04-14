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
    titulo: 'Diagnóstico',
    descricao: 'Mapeamento do perfil comportamental (DISC)',
    status: temDISC ? 'completed' : 'pending',
    data: temDISC ? null : null, // DISC date not stored separately
  });

  // Fase 2 — Avaliação (respostas de competências do fluxo do dashboard)
  // Total = quantas competências o cargo tem no top5_workshop
  const { data: cargoEmp } = await sb.from('cargos_empresa')
    .select('top5_workshop').eq('empresa_id', colab.empresa_id).eq('nome', colab.cargo).maybeSingle();
  const totalComp = (cargoEmp?.top5_workshop || []).length;

  // Respondidas = contagem de respostas do colab (qualquer canal, sem filtro de IA4)
  const { count: respondidas } = await sb.from('respostas')
    .select('id', { count: 'exact', head: true })
    .eq('colaborador_id', colab.id)
    .eq('empresa_id', colab.empresa_id);

  const respondidasCount = respondidas || 0;
  const avaliacaoCompleta = totalComp > 0 && respondidasCount >= totalComp;
  const avaliacaoIniciada = respondidasCount > 0;
  fases.push({
    fase: 2,
    titulo: 'Avaliação',
    descricao: `Competências avaliadas: ${respondidasCount}/${totalComp}`,
    status: avaliacaoCompleta ? 'completed' : avaliacaoIniciada ? 'current' : 'pending',
    data: null,
  });

  // Trilha (necessária pra liberar Fase 3) — Motor de Temporadas
  const { data: trilha } = await sb.from('trilhas')
    .select('id, status, temporada_plano, competencia_foco, criado_em')
    .eq('colaborador_id', colab.id)
    .order('criado_em', { ascending: false })
    .limit(1)
    .maybeSingle();

  const temPlano = trilha?.temporada_plano && Array.isArray(trilha.temporada_plano) && trilha.temporada_plano.length > 0;

  // Fase 3 — PDI (só disponível depois que a trilha estiver criada pelo gestor)
  const { data: pdi } = await sb.from('relatorios')
    .select('id, gerado_em')
    .eq('colaborador_id', colab.id)
    .eq('empresa_id', colab.empresa_id)
    .eq('tipo', 'individual')
    .order('gerado_em', { ascending: false })
    .limit(1)
    .maybeSingle();

  let pdiStatus, pdiDesc;
  if (!temPlano) {
    pdiStatus = 'pending';
    pdiDesc = 'Aguardando o gestor criar sua trilha de desenvolvimento';
  } else if (pdi) {
    pdiStatus = 'completed';
    pdiDesc = 'Plano de Desenvolvimento Individual';
  } else {
    pdiStatus = 'pending';
    pdiDesc = 'Aguardando geração do PDI';
  }

  fases.push({
    fase: 3,
    titulo: 'PDI',
    descricao: pdiDesc,
    status: pdiStatus,
    data: pdi?.gerado_em || null,
    bloqueado: !temPlano,
  });

  // Fase 4 — Temporada (já carregada acima)
  let semanaAtual = 1;
  if (temPlano) {
    const { data: progresso } = await sb.from('temporada_semana_progresso')
      .select('semana, status').eq('trilha_id', trilha.id).order('semana');
    const concluidas = (progresso || []).filter(p => p.status === 'concluido').length;
    semanaAtual = Math.min(14, concluidas + 1);
  }

  const temporadaStatus = trilha?.status === 'concluida' ? 'completed'
    : (temPlano && trilha.status === 'ativa') ? 'current'
    : 'pending';

  fases.push({
    fase: 4,
    titulo: 'Temporada',
    descricao: temPlano
      ? `Semana ${semanaAtual} de 14 · ${trilha.competencia_foco || ''}`
      : 'Aguardando geração da trilha personalizada',
    status: temporadaStatus,
    data: trilha?.criado_em || null,
  });

  // Fase 5 — Reavaliação
  // Check if there's a second round of respostas or a reavaliacao flag
  const { count: reavaliacoes } = await sb.from('respostas')
    .select('id', { count: 'exact', head: true })
    .eq('colaborador_id', colab.id)
    .eq('rodada', 2);

  fases.push({
    fase: 5,
    titulo: 'Reavaliação',
    descricao: 'Medição de evolução pós-capacitação',
    status: reavaliacoes > 0 ? 'completed' : 'pending',
    data: null,
  });

  return {
    colaborador: colab,
    fases,
  };
}
