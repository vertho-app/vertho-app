import type { SupabaseClient } from '@supabase/supabase-js';
import { construirEvolucao, construirFechamento } from '@/lib/demo/evolucao-nucleo';
import { REGUA_ACME } from '@/lib/demo/acme-evolucao-fixture';
import { PERSONAS } from '@/lib/demo/rosters/comercial';
import { PROGRESSO, TRILHA } from '@/lib/status';

export const BRUNA_DEMO_EMAIL = 'bruna.demo@vertho.ai';

const UMA_SEMANA_MS = 7 * 24 * 60 * 60 * 1000;
const SEMANAS_DA_JORNADA = 7;

type TrilhaAtualBruna = {
  id: string;
  numero_temporada: number | null;
  status: string | null;
  competencia_foco: string | null;
  competencias_foco: string[] | null;
  temporada_plano: any;
  descritores_selecionados: any;
  programa_modo: string | null;
  programa_config: any;
};

function deslocarData(data: Date, semanas: number): Date {
  return new Date(data.getTime() + semanas * UMA_SEMANA_MS);
}

function clonarJson<T>(valor: T): T {
  return JSON.parse(JSON.stringify(valor));
}

/**
 * Monta a jornada anterior da persona sem depender de IA nem de dados vivos de
 * outro colaborador. O plano é uma fotografia do plano atual da própria Bruna,
 * preservando os conteúdos que a tela histórica precisa reabrir.
 */
export function montarHistoricoBruna(
  trilhaAtual: TrilhaAtualBruna,
  agora = new Date(),
) {
  const bruna = PERSONAS.find((persona) => persona.email === BRUNA_DEMO_EMAIL);
  if (!bruna) throw new Error('Persona Bruna não declarada no roster comercial');

  const plano = Array.isArray(trilhaAtual.temporada_plano)
    ? clonarJson(trilhaAtual.temporada_plano)
    : [];
  if (plano.length !== SEMANAS_DA_JORNADA) {
    throw new Error(`Histórico da Bruna esperava ${SEMANAS_DA_JORNADA} semanas e encontrou ${plano.length}`);
  }

  const competencia = trilhaAtual.competencia_foco || trilhaAtual.competencias_foco?.[0];
  if (!competencia) throw new Error('Jornada atual da Bruna sem competência foco');

  // A régua e os textos são os canônicos da ACME; só fixamos a competência na
  // mesma que o conteúdo histórico apresenta, para relatório e semanas não se
  // contradizerem.
  const evolucao = construirEvolucao(bruna, 'confirmada', {
    ...REGUA_ACME,
    competenciasPorCargo: () => [competencia],
  });

  const concluidoEm = deslocarData(agora, -5);
  const iniciadoEm = deslocarData(concluidoEm, -(SEMANAS_DA_JORNADA - 1));
  const fechamento = construirFechamento(evolucao, concluidoEm.toISOString(), {
    qualitativa: 6,
    cenario: 7,
  });
  const fechamentoPorSemana = new Map(fechamento.map((linha) => [linha.semana, linha]));

  const progresso = plano.map((slot: any) => {
    const semana = Number(slot.semana);
    const dataDaSemana = deslocarData(iniciadoEm, semana - 1).toISOString();
    const descritor = slot.descritor || slot.descritores_cobertos?.[0] || competencia;
    const linhaFechamento = fechamentoPorSemana.get(semana);
    const reflexaoConteudo = slot.tipo === 'conteudo' ? {
      insight_principal: `Passei a aplicar ${String(descritor).toLocaleLowerCase('pt-BR')} com mais método nas negociações do dia a dia.`,
      qualidade_reflexao: 'alta',
      desafio_realizado: `Aplicação prática de ${descritor}`,
      demo_fixture: true,
    } : null;

    return {
      semana,
      tipo: slot.tipo || 'conteudo',
      status: PROGRESSO.CONCLUIDO,
      conteudo_consumido: true,
      iniciado_em: dataDaSemana,
      concluido_em: dataDaSemana,
      reflexao: linhaFechamento?.reflexao
        ? { ...reflexaoConteudo, ...linhaFechamento.reflexao }
        : reflexaoConteudo,
      feedback: linhaFechamento?.feedback
        ? {
            ...linhaFechamento.feedback,
            cenario: 'Uma negociação estratégica chegou à etapa final com pressão por desconto e prazo curto para decisão.',
            cenario_resposta: 'Organizei os interesses das partes, sustentei o valor da proposta e combinei um próximo passo objetivo sem criar urgência artificial.',
          }
        : null,
      tira_duvidas: null,
    };
  });

  return {
    trilha: {
      pdi_id: null,
      cursos: [],
      status: TRILHA.CONCLUIDA,
      criado_em: iniciadoEm.toISOString(),
      data_inicio: iniciadoEm.toISOString().slice(0, 10),
      competencia_foco: competencia,
      competencias_foco: [competencia],
      temporada_plano: plano,
      descritores_selecionados: evolucao.descritores.map((descritor) => ({
        descritor: descritor.descritor,
        competencia,
        nota_atual: descritor.nota_pre,
      })),
      numero_temporada: 1,
      evolution_report: evolucao.evolution_report,
      evolution_generated_at: concluidoEm.toISOString(),
      programa_modo: trilhaAtual.programa_modo,
      programa_config: trilhaAtual.programa_config,
    },
    progresso,
  };
}

/**
 * Garante o histórico demonstrativo da Bruna no tenant ACME Demo.
 *
 * É idempotente e estritamente escopado ao tenant fictício. A jornada ativa
 * vira temporada 2; a temporada 1 concluída é inserida com o mesmo plano rico.
 */
export async function ensureBrunaAcmeDemoHistory(
  sb: SupabaseClient,
  empresaId: string,
  agora = new Date(),
) {
  const { data: empresa, error: empresaError } = await sb.from('empresas')
    .select('id, slug, is_demo')
    .eq('id', empresaId)
    .maybeSingle();
  if (empresaError) throw new Error(`Histórico da Bruna: empresa: ${empresaError.message}`);
  if (!empresa || empresa.slug !== 'acme-demo' || !empresa.is_demo) {
    throw new Error('Histórico da Bruna só pode ser criado no tenant fictício acme-demo');
  }

  const { data: colaborador, error: colaboradorError } = await sb.from('colaboradores')
    .select('id, email')
    .eq('empresa_id', empresaId)
    .eq('email', BRUNA_DEMO_EMAIL)
    .maybeSingle();
  if (colaboradorError) throw new Error(`Histórico da Bruna: colaboradora: ${colaboradorError.message}`);
  if (!colaborador) throw new Error('Histórico da Bruna: colaboradora não encontrada');

  const { data: trilhas, error: trilhasError } = await sb.from('trilhas')
    .select('id, numero_temporada, status, competencia_foco, competencias_foco, temporada_plano, descritores_selecionados, programa_modo, programa_config')
    .eq('empresa_id', empresaId)
    .eq('colaborador_id', colaborador.id)
    .order('numero_temporada', { ascending: true });
  if (trilhasError) throw new Error(`Histórico da Bruna: jornadas: ${trilhasError.message}`);

  const historicoExistente = (trilhas || []).find((trilha: any) =>
    trilha.numero_temporada === 1 && trilha.status === TRILHA.CONCLUIDA,
  );
  const trilhaAtual = [...(trilhas || [])]
    .reverse()
    .find((trilha: any) => trilha.status !== TRILHA.CONCLUIDA) as TrilhaAtualBruna | undefined;

  if (historicoExistente) {
    return { ok: true, created: false, historicoId: historicoExistente.id, trilhaAtualId: trilhaAtual?.id || null };
  }
  if (!trilhaAtual) throw new Error('Histórico da Bruna: jornada ativa não encontrada');
  if (![1, 2].includes(Number(trilhaAtual.numero_temporada))) {
    throw new Error(`Histórico da Bruna: temporada ativa inesperada (${trilhaAtual.numero_temporada})`);
  }

  const snapshot = montarHistoricoBruna(trilhaAtual, agora);
  let renumerouAtual = false;
  if (Number(trilhaAtual.numero_temporada) === 1) {
    const { error } = await sb.from('trilhas')
      .update({ numero_temporada: 2 })
      .eq('id', trilhaAtual.id)
      .eq('empresa_id', empresaId)
      .eq('colaborador_id', colaborador.id);
    if (error) throw new Error(`Histórico da Bruna: renumerar jornada atual: ${error.message}`);
    renumerouAtual = true;
  }

  const { data: historico, error: historicoError } = await sb.from('trilhas')
    .insert({
      ...snapshot.trilha,
      empresa_id: empresaId,
      colaborador_id: colaborador.id,
    })
    .select('id')
    .single();
  if (historicoError || !historico?.id) {
    if (renumerouAtual) {
      await sb.from('trilhas').update({ numero_temporada: 1 })
        .eq('id', trilhaAtual.id).eq('empresa_id', empresaId).eq('colaborador_id', colaborador.id);
    }
    throw new Error(`Histórico da Bruna: criar jornada: ${historicoError?.message || 'id ausente'}`);
  }

  const { error: progressoError } = await sb.from('temporada_semana_progresso').insert(
    snapshot.progresso.map((linha) => ({
      ...linha,
      empresa_id: empresaId,
      colaborador_id: colaborador.id,
      trilha_id: historico.id,
    })),
  );
  if (progressoError) {
    await sb.from('trilhas').delete()
      .eq('id', historico.id).eq('empresa_id', empresaId).eq('colaborador_id', colaborador.id);
    if (renumerouAtual) {
      await sb.from('trilhas').update({ numero_temporada: 1 })
        .eq('id', trilhaAtual.id).eq('empresa_id', empresaId).eq('colaborador_id', colaborador.id);
    }
    throw new Error(`Histórico da Bruna: criar progresso: ${progressoError.message}`);
  }

  return { ok: true, created: true, historicoId: historico.id, trilhaAtualId: trilhaAtual.id };
}
