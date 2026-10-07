import 'server-only';
import { tenantDb } from '@/lib/tenant-db';
import { PROGRESSO } from '@/lib/status';
import { AREA_SEM_NOME, buildEngagementEvolutionDashboard, type EngagementEvolutionDashboard } from '@/lib/engagement-evolution';
import { historicoIlustrativoDemo } from '@/lib/demo/engajamento-historico';
import type { FalhaEvolucao } from '@/lib/engajamento/surface';
import { aplicarEscopoDeTurma, manterDaTrilhaAlvo } from '@/lib/engajamento/escopo-turma';
import type { EscopoDeLeitura } from '@/lib/turmas/escopo-leitura';

/** Leitura compartilhada por tela e PDF. O chamador autentica e autoriza a empresa. */
export async function carregarEvolucaoEngajamento(
  empresaId: string,
  area?: string | null,
  /** Escopo de TURMA (`lib/turmas/escopo-leitura.ts`). Ausente = a empresa inteira, como sempre foi. */
  escopoTurma?: EscopoDeLeitura | null,
): Promise<
  | { ok: true; data: EngagementEvolutionDashboard }
  | { ok: false; error: string; codigo: FalhaEvolucao }
> {
  // `error` é a causa técnica (log, PDF); a tela lê `codigo` e traduz (R-67).
  if (!empresaId) return { ok: false, error: 'empresa_ausente', codigo: 'empresa_ausente' };

  const tdb = tenantDb(empresaId);
  // Com turma, toda consulta de pessoa é recortada pelos membros dela (ativos e
  // encerrados) e carrega o que falta para escolher a trilha da participação.
  const ids = escopoTurma?.colaboradorIds ?? null;
  const recortar = <Q>(q: Q): Q => (ids ? (q as any).in('colaborador_id', ids) : q);
  const [
    { data: empresa },
    { data: envios, error: enviosError },
    { data: eventos, error: eventosError },
    { data: videos, error: videosError },
    { data: progresso, error: progressoError },
    { data: tutorRows, error: tutorError },
    { data: trilhasDaTurma, error: trilhasError },
  ] = await Promise.all([
    tdb.raw.from('empresas').select('slug,is_demo').eq('id', empresaId).maybeSingle(),
    recortar(tdb.from('fase4_envios')
      .select('colaborador_id, semana_atual, status, data_inicio, ultima_evidencia_em, ultima_pilula1_em, ultima_pilula2_em, colaboradores!inner(nome_completo, cargo, area_depto)')),
    recortar(tdb.from('trilha_eventos')
      .select('colaborador_id, trilha_id, semana, tipo, criado_em')),
    recortar(tdb.from('videos_watched')
      .select('colaborador_id, semana, event_type, created_at')
      .in('event_type', ['play_started', 'play_progress', 'play_finished'])),
    recortar(tdb.from('temporada_semana_progresso')
      .select('colaborador_id, trilha_id, semana, tipo, status, conteudo_consumido')),
    recortar(tdb.from('temporada_semana_progresso')
      .select('colaborador_id, trilha_id, semana')
      .not('tira_duvidas', 'is', null)),
    // Só a turma precisa das trilhas; sem ela a consulta nem sai.
    ids
      ? tdb.from('trilhas')
        .select('id, colaborador_id, numero_temporada, data_inicio, turma_membro_id, criado_em')
        .in('colaborador_id', ids)
        .order('numero_temporada', { ascending: false })
      : Promise.resolve({ data: [] as any[], error: null }),
  ]);

  const queryError = enviosError || eventosError || videosError || progressoError || tutorError || trilhasError;
  if (queryError) {
    console.error('[engajamento] evolução:', queryError.message);
    return { ok: false, error: queryError.message, codigo: 'leitura_falhou' };
  }

  // Com turma: a população e cada linha de sinal passam a ser da trilha-alvo da pessoa.
  let enviosDaTela: any[] = envios || [];
  let eventosDaTela: any[] = eventos || [];
  let videosDaTela: any[] = videos || [];
  let progressoDaTela: any[] = progresso || [];
  let tutorDaTela: any[] = tutorRows || [];
  if (escopoTurma) {
    const escopado = aplicarEscopoDeTurma({ envios: enviosDaTela, trilhas: (trilhasDaTurma || []) as any[], escopo: escopoTurma });
    const janelaPorColab = new Map([...escopoTurma.participacaoPorColab].map(([colab, p]) => [colab, p.janela]));
    enviosDaTela = escopado.envios;
    eventosDaTela = manterDaTrilhaAlvo(eventosDaTela, escopado.trilhaPorColab, janelaPorColab, (r) => r.criado_em);
    videosDaTela = manterDaTrilhaAlvo(videosDaTela, escopado.trilhaPorColab, janelaPorColab, (r) => r.created_at);
    progressoDaTela = manterDaTrilhaAlvo(progressoDaTela, escopado.trilhaPorColab, janelaPorColab, () => null);
    tutorDaTela = manterDaTrilhaAlvo(tutorDaTela, escopado.trilhaPorColab, janelaPorColab, () => null);
  }

  const dashboard = buildEngagementEvolutionDashboard({
    enrollments: enviosDaTela.map((row: any) => ({
      colaboradorId: row.colaborador_id,
      nome: row.colaboradores?.nome_completo || '—',
      cargo: row.colaboradores?.cargo || '',
      area: row.colaboradores?.area_depto || AREA_SEM_NOME,
      semanaAtual: Number(row.semana_atual) || 1,
    })),
    events: eventosDaTela.map((row: any) => ({
      colaboradorId: row.colaborador_id,
      semana: row.semana,
      tipo: row.tipo,
    })),
    videos: videosDaTela.map((row: any) => ({
      colaboradorId: row.colaborador_id,
      semana: row.semana,
      eventType: row.event_type,
    })),
    progress: progressoDaTela.map((row: any) => ({
      colaboradorId: row.colaborador_id,
      semana: row.semana,
      tipo: row.tipo,
      status: row.status,
      conteudoConsumido: row.conteudo_consumido,
    })),
    tutorUses: tutorDaTela.map((row: any) => ({
      colaboradorId: row.colaborador_id,
      semana: row.semana,
    })),
    completedStatus: PROGRESSO.CONCLUIDO,
    area,
  });

  // A série só aparece na visão geral dos ambientes fictícios. Recortes de
  // área continuam mostrando exclusivamente os números medidos desse grupo.
  if (!dashboard.areaSelecionada) {
    dashboard.historicoIlustrativo = historicoIlustrativoDemo(empresa, dashboard.semanas);
  }
  return { ok: true, data: dashboard };
}
