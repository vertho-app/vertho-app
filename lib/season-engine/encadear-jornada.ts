/**
 * Encadeamento das jornadas (05/08/2026).
 *
 * O DUO deixou de ser "duas competências em paralelo por 14 semanas" e passou a
 * ser DUAS JORNADAS EM SEQUÊNCIA: 7 semanas na competência A (6 de conteúdo +
 * avaliação), fechamento completo — Cenário B, arguição, Evolution Report,
 * certificado — e só então 7 semanas na competência B.
 *
 * Cada jornada é uma TRILHA própria (`numero_temporada` 1 e 2, mig 199). Isso é
 * o que dá dois fechamentos independentes: o relatório da primeira não é
 * reescrito quando a segunda termina, e a pessoa fica com dois documentos.
 *
 * O Personalizado com 2 competências (03/10/2026) usa o MESMO mecanismo, com
 * duas diferenças: a próxima competência não é "a primeira do cargo que a
 * pessoa ainda não fez", e sim a SEGUNDA da sequência decidida e validada na
 * geração da primeira trilha (`sequenciaPersonalizado` no snapshot); e as
 * regras da segunda (duração, fechamento) são as do snapshot da primeira, não
 * as da tela no dia. Terminada a segunda, o programa acaba.
 *
 * Quem chama: o fechamento, depois de marcar a trilha como concluída
 * (`evolution-report-core`), e o encerramento do Personalizado SEM fechamento
 * (rota /reflection). Best-effort: se a geração falhar, a trilha concluída
 * CONTINUA concluída e a degradação fica registrada.
 *
 * Três garantias de 03/10/2026, valendo para os dois modos:
 *  - IDEMPOTENTE (R-137): se a pessoa já tem uma trilha DEPOIS desta, nada é
 *    gerado. O relatório pode ser refeito (retomada da tela, auditoria do
 *    admin), e cada refação chamava o encadeamento de novo: a jornada 1
 *    refeita com a 2 já em curso geraria uma 3ª, na competência seguinte.
 *  - A CADÊNCIA ACOMPANHA (R-15): a trilha nova reativa a linha da pessoa em
 *    `fase4_envios`, com o relógio na semana 1.
 *  - SÓ COMPETÊNCIA COM MAPEAMENTO (R-90, Jornada): a próxima é a primeira do
 *    cargo, ainda não feita, em que a pessoa TEM avaliação; a que não tem é
 *    pulada (e registrada), em vez de a geração falhar nela e o encadeamento
 *    desistir.
 */
import { registrarDegradacao, DEGRADACAO } from '@/lib/degradacao';
import { reativarCadencia } from '@/lib/envios/inscricao-core';
import { getProgramaConfigDaTrilha, type ProgramaConfig } from './programa-config';
import { configDaProximaCompetencia, parseConfigSnapshot } from './programa-custom';

export interface ResultadoEncadeamento {
  /** false quando não havia o que encadear (não é erro). */
  encadeou: boolean;
  motivo?: 'modo-nao-encadeia' | 'sem-proxima-competencia' | 'sem-mapeamento' | 'ja-encadeada' | 'falhou';
  competencia?: string;
  trilhaId?: string;
  numeroTemporada?: number;
  /** Competências do cargo puladas por falta de mapeamento da pessoa (Jornada). */
  puladas?: string[];
  /**
   * A linha da pessoa em `fase4_envios` depois do encadeamento: `reativada`,
   * `sem-inscricao` (a pessoa nunca esteve na cadência; nada é criado) ou
   * `falhou` (registrado como degradação crítica).
   */
  cadencia?: 'reativada' | 'sem-inscricao' | 'falhou';
}

/** Argumentos que o encadeamento passa ao gerador (`gerarTemporadaCoreHeadless`). */
export interface ArgsGeracaoEncadeada {
  colaboradorId: string;
  competencia: string;
  novaJornada: boolean;
  empresaIdEsperado?: string;
  /** Personalizado: a config da próxima competência, congelada da anterior. */
  configPersonalizado?: ProgramaConfig;
}

interface TrilhaEncadeavel {
  colaborador_id: string;
  empresa_id: string;
  numero_temporada?: number | null;
}

/**
 * Competências do cargo, na ordem de prioridade em que devem ser percorridas.
 * `competencias_foco` (array, mig 091) é a fonte; `competencia_foco` é o
 * fallback de compatibilidade para cargos que só têm a âncora.
 */
function competenciasDoCargo(cargo: { competencias_foco?: string[] | null; competencia_foco?: string | null } | null): string[] {
  if (!cargo) return [];
  const lista = Array.isArray(cargo.competencias_foco) ? cargo.competencias_foco.filter(Boolean) : [];
  if (lista.length) return lista;
  return cargo.competencia_foco ? [cargo.competencia_foco] : [];
}

/**
 * As competências do cargo que a pessoa ainda não percorreu, na ordem do cargo.
 * Comparação por texto normalizado porque `competencia_foco` é texto livre
 * gravado em dois lugares (cargo e trilha): diferença de caixa ou espaço faria
 * a mesma competência ser servida duas vezes.
 */
export function competenciasPendentes(doCargo: string[], jaFeitas: string[]): string[] {
  const norm = (s: string) => s.trim().toLowerCase();
  const feitas = new Set(jaFeitas.filter(Boolean).map(norm));
  return doCargo.filter((c) => !feitas.has(norm(c)));
}

/** A primeira do cargo que a pessoa ainda não percorreu (sem olhar mapeamento). */
export function proximaCompetencia(doCargo: string[], jaFeitas: string[]): string | null {
  return competenciasPendentes(doCargo, jaFeitas)[0] ?? null;
}

const chaveDaProxima = (trilha: TrilhaEncadeavel) => `${trilha.colaborador_id}:${(trilha.numero_temporada || 1) + 1}`;

/** Encadeamento que não aconteceu por falha: fica registrado, nunca lança. */
async function falhou(
  trilha: TrilhaEncadeavel,
  detalhe: Record<string, unknown>,
  extras: Partial<ResultadoEncadeamento> = {},
): Promise<ResultadoEncadeamento> {
  await registrarDegradacao({
    fluxo: 'build',
    tipo: DEGRADACAO.JORNADA_ENCADEAMENTO_FALHOU,
    chave: chaveDaProxima(trilha),
    empresaId: trilha.empresa_id,
    detalhe,
  });
  return { encadeou: false, motivo: 'falhou', ...extras };
}

/**
 * A trilha nova vale também para a cadência semanal (R-15). Falha aqui não
 * desfaz a trilha gerada: vira degradação crítica, porque a jornada nova sem
 * envio semanal é exatamente o defeito que esta etapa existe para impedir.
 */
async function reativarCadenciaDaPessoa(
  tdb: any,
  trilha: TrilhaEncadeavel,
  dataInicio: string | null,
): Promise<'reativada' | 'sem-inscricao' | 'falhou'> {
  try {
    const r = await reativarCadencia(tdb, trilha.colaborador_id, { dataInicio });
    if ('erro' in r) throw new Error(r.erro);
    return r.linhas > 0 ? 'reativada' : 'sem-inscricao';
  } catch (e: any) {
    await registrarDegradacao({
      fluxo: 'envio',
      tipo: DEGRADACAO.JORNADA_CADENCIA_NAO_REATIVADA,
      chave: chaveDaProxima(trilha),
      empresaId: trilha.empresa_id,
      colaboradorId: trilha.colaborador_id,
      severidade: 'critico',
      detalhe: { erro: e?.message || String(e) },
    });
    return 'falhou';
  }
}

/**
 * Gera a próxima trilha e devolve o resultado; falha vira degradação
 * registrada, nunca exceção (a trilha concluída não se desfaz).
 */
async function gerarProxima(
  tdb: any,
  trilha: TrilhaEncadeavel,
  competencia: string,
  gerar: (args: ArgsGeracaoEncadeada) => Promise<any>,
  extras: { configPersonalizado?: ProgramaConfig; puladas?: string[] } = {},
): Promise<ResultadoEncadeamento> {
  const puladas = extras.puladas?.length ? { puladas: extras.puladas } : {};
  let r: any;
  try {
    r = await gerar({
      colaboradorId: trilha.colaborador_id,
      competencia,
      novaJornada: true,
      empresaIdEsperado: trilha.empresa_id,
      ...(extras.configPersonalizado ? { configPersonalizado: extras.configPersonalizado } : {}),
    });
    if (r?.error) throw new Error(r.error);
  } catch (e: any) {
    // A trilha concluída SEGUE concluída: o encadeamento é um extra que
    // falhou, não um passo que desfaz o fechamento. Fica registrado para o
    // health e para o admin.
    return falhou(trilha, {
      competencia,
      erro: e?.message || String(e),
      ...(extras.configPersonalizado ? { modo: 'custom' } : {}),
    }, { competencia, ...puladas });
  }

  const cadencia = await reativarCadenciaDaPessoa(tdb, trilha, r?.dataInicio ?? null);
  return {
    encadeou: true,
    competencia,
    trilhaId: r?.trilhaId,
    numeroTemporada: (trilha.numero_temporada || 1) + 1,
    cadencia,
    ...puladas,
  };
}

/**
 * @param gerar injeção do gerador (`gerarTemporadaCoreHeadless`): evita ciclo
 *        de import com `trilha-core`, que importa este módulo indiretamente.
 */
export async function encadearProximaJornada(
  sbRaw: any,
  tdb: any,
  trilhaId: string,
  gerar: (args: ArgsGeracaoEncadeada) => Promise<any>,
): Promise<ResultadoEncadeamento> {
  const { data: trilha, error: errTrilha } = await tdb.from('trilhas')
    .select('id, colaborador_id, empresa_id, programa_modo, competencia_foco, numero_temporada')
    .eq('id', trilhaId).maybeSingle();
  if (errTrilha) {
    console.error('[encadeamento] leitura da trilha falhou:', trilhaId, errTrilha.message);
    return { encadeou: false, motivo: 'falhou' };
  }
  if (!trilha) return { encadeou: false, motivo: 'falhou' };

  // IDEMPOTÊNCIA: já existe trilha DEPOIS desta → o encadeamento já aconteceu.
  // Antes da leitura do modo de propósito: vale para a Jornada e para o
  // Personalizado, e o relatório pode ser refeito a qualquer momento.
  const { data: posterior, error: errPosterior } = await tdb.from('trilhas')
    .select('id')
    .eq('colaborador_id', trilha.colaborador_id)
    .gt('numero_temporada', trilha.numero_temporada || 1)
    .limit(1).maybeSingle();
  if (errPosterior) return falhou(trilha, { erro: `trilha seguinte (leitura): ${errPosterior.message}` });
  if (posterior) return { encadeou: false, motivo: 'ja-encadeada', trilhaId: posterior.id };

  // Personalizado: a sequência vem do snapshot, decidida na 1ª trilha. Leitura
  // à parte (e com o `{ error }` lido) só para este modo: a jornada não precisa
  // do snapshot, e falha aqui não pode virar "programa de uma competência só".
  if (trilha.programa_modo === 'custom') {
    const { data: comSnapshot, error: errSnapshot } = await tdb.from('trilhas')
      .select('programa_config').eq('id', trilhaId).maybeSingle();
    if (errSnapshot) {
      return falhou(trilha, { modo: 'custom', erro: `snapshot da trilha: ${errSnapshot.message}` });
    }
    const snapshot = parseConfigSnapshot(comSnapshot?.programa_config);
    if (!snapshot?.sequenciaPersonalizado) return { encadeou: false, motivo: 'modo-nao-encadeia' };
    const proxima = configDaProximaCompetencia(snapshot);
    if (!proxima?.sequenciaPersonalizado) return { encadeou: false, motivo: 'sem-proxima-competencia' };
    const { competencias, posicao } = proxima.sequenciaPersonalizado;
    return gerarProxima(tdb, trilha, competencias[posicao - 1], gerar, { configPersonalizado: proxima });
  }

  // Só a jornada encadeia. Nos modos de 14 semanas, concluir é o fim do ciclo.
  const config = getProgramaConfigDaTrilha(trilha);
  if (trilha.programa_modo !== 'jornada' || config.semanas !== 7) {
    return { encadeou: false, motivo: 'modo-nao-encadeia' };
  }

  // `.eq('empresa_id', ...)` na MESMA cadeia: o app roda service-role, que
  // bypassa RLS — sem o filtro, um colaborador_id de outro tenant devolveria a
  // pessoa errada e a jornada seguinte nasceria no cargo dela. O empresa_id vem
  // da trilha que acabou de fechar, não do input.
  const { data: colab, error: errColab } = await sbRaw.from('colaboradores')
    .select('id, cargo, empresa_id')
    .eq('id', trilha.colaborador_id)
    .eq('empresa_id', trilha.empresa_id)
    .maybeSingle();
  if (errColab) return falhou(trilha, { erro: `colaborador (leitura): ${errColab.message}` });
  if (!colab) return falhou(trilha, { erro: 'colaborador não encontrado neste tenant' });

  const { data: cargo, error: errCargo } = await tdb.from('cargos_empresa')
    .select('competencia_foco, competencias_foco').eq('nome', colab.cargo || '').maybeSingle();
  if (errCargo) return falhou(trilha, { erro: `cargo (leitura): ${errCargo.message}` });

  // TODAS as trilhas da pessoa — inclusive as de outros modos: se ela já
  // trabalhou a competência num formato antigo, repetir seria entregar o mesmo
  // conteúdo com outro rótulo.
  // 🔴 Com o `{ error }` lido: falha aqui virava "nada feito", e a primeira do
  // cargo (a que ACABOU de fechar) seria servida de novo.
  const { data: anteriores, error: errAnteriores } = await tdb.from('trilhas')
    .select('competencia_foco').eq('colaborador_id', trilha.colaborador_id);
  if (errAnteriores) return falhou(trilha, { erro: `trilhas anteriores (leitura): ${errAnteriores.message}` });

  const pendentes = competenciasPendentes(
    competenciasDoCargo(cargo),
    (anteriores || []).map((t: any) => t?.competencia_foco).filter(Boolean),
  );
  if (!pendentes.length) return { encadeou: false, motivo: 'sem-proxima-competencia' };

  // MAPEAMENTO (R-90): o gerador exige `descriptor_assessments` da competência
  // (anti-viés, sem default 1,5) e, sem ele, a geração falhava e o encadeamento
  // desistia. Igualdade EXATA de texto, a mesma do gerador (`.eq('competencia')`):
  // casar por texto normalizado aqui escolheria uma competência que a geração
  // depois não acharia. Uma pessoa tem poucas dezenas de linhas, longe do teto
  // de 1.000 do PostgREST.
  const { data: avaliadas, error: errAvaliadas } = await tdb.from('descriptor_assessments')
    .select('competencia')
    .eq('colaborador_id', trilha.colaborador_id)
    .in('competencia', pendentes);
  if (errAvaliadas) return falhou(trilha, { erro: `mapeamento (leitura): ${errAvaliadas.message}` });
  const comMapeamento = new Set((avaliadas || []).map((a: any) => a?.competencia).filter(Boolean));

  const proxima = pendentes.find((c) => comMapeamento.has(c)) ?? null;
  if (!proxima) {
    // Há competência por fazer e nenhuma tem mapeamento: o admin precisa saber,
    // porque não existe um passo seguinte da pessoa que tente de novo.
    return falhou(trilha, { motivo: 'sem-mapeamento', pendentes }, { motivo: 'sem-mapeamento', puladas: pendentes });
  }

  const puladas = pendentes.slice(0, pendentes.indexOf(proxima));
  if (puladas.length) {
    await registrarDegradacao({
      fluxo: 'build',
      tipo: DEGRADACAO.JORNADA_COMPETENCIA_PULADA,
      chave: chaveDaProxima(trilha),
      empresaId: trilha.empresa_id,
      colaboradorId: trilha.colaborador_id,
      severidade: 'aviso',
      detalhe: { puladas, escolhida: proxima },
    });
  }

  return gerarProxima(tdb, trilha, proxima, gerar, { puladas });
}

/**
 * Fim de trilha = começo da próxima, quando o modo encadeia (Jornada e
 * Personalizado com 2 competências). Roda DEPOIS de a trilha estar marcada
 * como concluída e nunca lança: falha vira degradação registrada
 * (`jornada-encadeamento-falhou`). Nos outros modos é um no-op.
 *
 * O import do gerador é dinâmico porque `trilha-core` importa, em cadeia, quem
 * importa este arquivo; estático fecharia o ciclo.
 */
export async function encadearAposConclusao(sbRaw: any, tdb: any, trilhaId: string): Promise<ResultadoEncadeamento | null> {
  try {
    const { gerarTemporadaCoreHeadless } = await import('./trilha-core');
    const r = await encadearProximaJornada(sbRaw, tdb, trilhaId, (args) =>
      gerarTemporadaCoreHeadless(sbRaw, args),
    );
    if (r.encadeou) {
      console.log(`[encadeamento] trilha ${trilhaId} concluída → trilha ${r.numeroTemporada} em "${r.competencia}" (${r.trilhaId}), cadência ${r.cadencia}`);
    }
    return r;
  } catch (e: any) {
    console.error('[encadeamento] falhou:', e?.message || e);
    return null;
  }
}
