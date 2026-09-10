import 'server-only';
import { tenantDb } from '@/lib/tenant-db';
import { PROGRESSO } from '@/lib/status';
import { buildEngagementEvolutionDashboard, type EngagementEvolutionDashboard } from '@/lib/engagement-evolution';

/** Leitura compartilhada por tela e PDF. O chamador autentica e autoriza a empresa. */
export async function carregarEvolucaoEngajamento(
  empresaId: string,
  area?: string | null,
): Promise<
  | { ok: true; data: EngagementEvolutionDashboard }
  | { ok: false; error: string }
> {
  if (!empresaId) return { ok: false, error: 'Selecione uma empresa' };

  const tdb = tenantDb(empresaId);
  const [
    { data: envios, error: enviosError },
    { data: eventos, error: eventosError },
    { data: videos, error: videosError },
    { data: progresso, error: progressoError },
    { data: tutorRows, error: tutorError },
  ] = await Promise.all([
    tdb.from('fase4_envios')
      .select('colaborador_id, semana_atual, colaboradores!inner(nome_completo, cargo, area_depto)'),
    tdb.from('trilha_eventos')
      .select('colaborador_id, semana, tipo'),
    tdb.from('videos_watched')
      .select('colaborador_id, semana, event_type')
      .in('event_type', ['play_started', 'play_progress', 'play_finished']),
    tdb.from('temporada_semana_progresso')
      .select('colaborador_id, semana, tipo, status, conteudo_consumido'),
    tdb.from('temporada_semana_progresso')
      .select('colaborador_id, semana')
      .not('tira_duvidas', 'is', null),
  ]);

  const queryError = enviosError || eventosError || videosError || progressoError || tutorError;
  if (queryError) return { ok: false, error: queryError.message };

  const dashboard = buildEngagementEvolutionDashboard({
    enrollments: (envios || []).map((row: any) => ({
      colaboradorId: row.colaborador_id,
      nome: row.colaboradores?.nome_completo || '—',
      cargo: row.colaboradores?.cargo || '',
      area: row.colaboradores?.area_depto || 'Sem área',
      semanaAtual: Number(row.semana_atual) || 1,
    })),
    events: (eventos || []).map((row: any) => ({
      colaboradorId: row.colaborador_id,
      semana: row.semana,
      tipo: row.tipo,
    })),
    videos: (videos || []).map((row: any) => ({
      colaboradorId: row.colaborador_id,
      semana: row.semana,
      eventType: row.event_type,
    })),
    progress: (progresso || []).map((row: any) => ({
      colaboradorId: row.colaborador_id,
      semana: row.semana,
      tipo: row.tipo,
      status: row.status,
      conteudoConsumido: row.conteudo_consumido,
    })),
    tutorUses: (tutorRows || []).map((row: any) => ({
      colaboradorId: row.colaborador_id,
      semana: row.semana,
    })),
    completedStatus: PROGRESSO.CONCLUIDO,
    area,
  });

  return { ok: true, data: dashboard };
}
