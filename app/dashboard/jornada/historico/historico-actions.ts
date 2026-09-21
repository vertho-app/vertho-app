'use server';

import { requireUserAction } from '@/lib/auth/action-context';
import { findColabByEmail } from '@/lib/authz';
import { tenantDb } from '@/lib/tenant-db';
import { TRILHA, PROGRESSO } from '@/lib/status';
import { descritorParaHumano } from '@/lib/descritor-humano';

type SemanaResumo = {
  semana: number;
  tipo: string;
  titulo: string;
  competencia: string | null;
  concluida: boolean;
};

function competenciasDaTrilha(trilha: any): string[] {
  const varias = Array.isArray(trilha?.competencias_foco)
    ? trilha.competencias_foco.filter(Boolean)
    : [];
  return varias.length ? varias : [trilha?.competencia_foco].filter(Boolean);
}

function dataDeConclusao(trilha: any, progressos: any[]): string | null {
  if (trilha?.evolution_generated_at) return trilha.evolution_generated_at;
  const datas = progressos
    .map((progresso) => progresso?.concluido_em)
    .filter(Boolean)
    .sort();
  return datas.at(-1) || null;
}

function tituloDaSemana(slot: any): string {
  if (slot?.tipo === 'aplicacao') return slot?.missao?.titulo || 'Missão prática';
  if (slot?.tipo === 'avaliacao') return 'Avaliação de fechamento';

  const descritores = Array.isArray(slot?.descritores_cobertos)
    ? slot.descritores_cobertos.filter(Boolean)
    : [];
  if (descritores.length) return descritores.map(descritorParaHumano).join(' + ');
  return descritorParaHumano(slot?.descritor) || slot?.competencia || 'Conteúdo da semana';
}

async function colaboradorAutenticado() {
  const ctx = await requireUserAction();
  const colab = await findColabByEmail(
    ctx.email,
    'id, nome_completo, empresa_id',
  ) as any;
  if (!colab?.empresa_id) throw new Error('Colaborador não encontrado');
  return { colab, tdb: tenantDb(colab.empresa_id) };
}

/**
 * Lista somente as jornadas efetivamente concluídas da pessoa autenticada.
 *
 * Não existe prazo de retenção nesta leitura: enquanto o vínculo autenticado
 * com o tenant existir, todas as trilhas concluídas continuam consultáveis.
 */
export async function loadHistoricoJornadas() {
  try {
    const { colab, tdb } = await colaboradorAutenticado();
    const { data: trilhas, error } = await tdb.from('trilhas')
      .select('id, numero_temporada, competencia_foco, competencias_foco, temporada_plano, criado_em, data_inicio, evolution_generated_at, evolution_report, programa_modo, status')
      .eq('colaborador_id', colab.id)
      .eq('status', TRILHA.CONCLUIDA)
      .order('numero_temporada', { ascending: false })
      .order('criado_em', { ascending: false });

    if (error) return { error: `Não foi possível carregar o histórico: ${error.message}` };
    if (!trilhas?.length) return { ok: true, colaborador: { nome: colab.nome_completo }, jornadas: [] };

    const ids = trilhas.map((trilha: any) => trilha.id);
    const { data: progressos, error: erroProgressos } = await tdb.from('temporada_semana_progresso')
      .select('trilha_id, semana, status, concluido_em')
      .in('trilha_id', ids);
    if (erroProgressos) return { error: `Não foi possível carregar o histórico: ${erroProgressos.message}` };

    const progressosPorTrilha = new Map<string, any[]>();
    for (const progresso of progressos || []) {
      const atuais = progressosPorTrilha.get(progresso.trilha_id) || [];
      atuais.push(progresso);
      progressosPorTrilha.set(progresso.trilha_id, atuais);
    }

    return {
      ok: true,
      colaborador: { nome: colab.nome_completo },
      jornadas: trilhas.map((trilha: any) => {
        const plano = Array.isArray(trilha.temporada_plano) ? trilha.temporada_plano : [];
        const progresso = progressosPorTrilha.get(trilha.id) || [];
        return {
          id: trilha.id,
          numero: trilha.numero_temporada,
          competencias: competenciasDaTrilha(trilha),
          totalSemanas: plano.length,
          totalConteudos: plano.filter((slot: any) => slot?.tipo === 'conteudo').length,
          dataInicio: trilha.data_inicio || trilha.criado_em,
          dataConclusao: dataDeConclusao(trilha, progresso),
          relatorioDisponivel: !!trilha.evolution_report,
          programaModo: trilha.programa_modo || null,
        };
      }),
    };
  } catch (error: any) {
    return { error: error?.message || 'Não foi possível carregar o histórico' };
  }
}

/** Detalhe leve da jornada; o conteúdo completo só é carregado ao abrir a semana. */
export async function loadJornadaHistorica(trilhaId: string) {
  try {
    if (!trilhaId) return { error: 'Jornada não informada' };
    const { colab, tdb } = await colaboradorAutenticado();

    const { data: trilha, error } = await tdb.from('trilhas')
      .select('id, numero_temporada, competencia_foco, competencias_foco, temporada_plano, criado_em, data_inicio, evolution_generated_at, evolution_report, programa_modo, status')
      .eq('id', trilhaId)
      .eq('colaborador_id', colab.id)
      .maybeSingle();
    if (error) return { error: `Não foi possível abrir a jornada: ${error.message}` };
    if (!trilha || trilha.status !== TRILHA.CONCLUIDA) return { error: 'Jornada concluída não encontrada' };

    const { data: progressos, error: erroProgressos } = await tdb.from('temporada_semana_progresso')
      .select('semana, status, concluido_em')
      .eq('trilha_id', trilha.id)
      .order('semana');
    if (erroProgressos) return { error: `Não foi possível abrir a jornada: ${erroProgressos.message}` };

    const porSemana = new Map<number, any>(
      (progressos || []).map((p: any) => [Number(p.semana), p] as [number, any]),
    );
    const plano = Array.isArray(trilha.temporada_plano) ? trilha.temporada_plano : [];
    const semanas: SemanaResumo[] = plano.map((slot: any) => ({
      semana: Number(slot.semana),
      tipo: slot.tipo || 'conteudo',
      titulo: tituloDaSemana(slot),
      competencia: slot.competencia || trilha.competencia_foco || null,
      concluida: porSemana.get(Number(slot.semana))?.status === PROGRESSO.CONCLUIDO,
    }));

    return {
      ok: true,
      jornada: {
        id: trilha.id,
        numero: trilha.numero_temporada,
        competencias: competenciasDaTrilha(trilha),
        totalSemanas: plano.length,
        dataInicio: trilha.data_inicio || trilha.criado_em,
        dataConclusao: dataDeConclusao(trilha, progressos || []),
        relatorioDisponivel: !!trilha.evolution_report,
        semanas,
      },
    };
  } catch (error: any) {
    return { error: error?.message || 'Não foi possível abrir a jornada' };
  }
}
