/**
 * Runtime compartilhado da trilha — FONTE ÚNICA de duas responsabilidades que
 * estavam copiadas em 4+ arquivos (rotas reflection/evaluation/tira-duvidas/
 * missao + actions de acumulada/report):
 *
 *   1. resolverConfigDaTrilha — ProgramaConfig pelo CARIMBO da geração
 *      (trilhas.programa_modo, mig 154); trilha legada sem carimbo → fallback
 *      pro sys_config da empresa (comportamento pré-154).
 *   2. checarGatesSemana — gate temporal (calendário com espelho do PLANO,
 *      `calendario_semana` do slot — piloto) + gate de progressão ("anterior
 *      concluída"). Mensagens idênticas às que as rotas sempre retornaram.
 *
 * Qualquer mudança de regra de liberação/resolução acontece AQUI, uma vez.
 */

import { getProgramaConfig, getProgramaConfigByModo, type ProgramaConfig } from './programa-config';
import { semanaLiberadaPorData, formatarLiberacao } from './week-gating';

interface TrilhaRuntime {
  id: string;
  empresa_id: string;
  programa_modo?: string | null;
  data_inicio?: string | null;
  temporada_plano?: any;
}

/** Config da trilha: carimbo (mig 154) → fallback sys_config (legado). */
export async function resolverConfigDaTrilha(
  sb: any,
  trilha: Pick<TrilhaRuntime, 'programa_modo' | 'empresa_id'>,
): Promise<ProgramaConfig> {
  if (trilha.programa_modo) return getProgramaConfigByModo(trilha.programa_modo);
  const { data: empresa } = await sb.from('empresas')
    .select('sys_config').eq('id', trilha.empresa_id).maybeSingle();
  return getProgramaConfig(empresa?.sys_config);
}

/**
 * Semana cujo CALENDÁRIO governa a liberação, lida do SNAPSHOT do plano
 * (`calendario_semana` gravado na geração — contrato da UI/rotas). Slots sem
 * espelho (todos, exceto o fechamento do piloto) → a própria semana.
 */
export function semanaCalendarioDoPlano(
  trilha: Pick<TrilhaRuntime, 'temporada_plano'>,
  semana: number | string,
): number {
  const plano = Array.isArray(trilha.temporada_plano) ? trilha.temporada_plano : [];
  const slot = plano.find((s: any) => s?.semana === Number(semana));
  return slot?.calendario_semana ?? Number(semana);
}

/**
 * Gates de acesso a uma semana (temporal + progressão). Retorna null quando
 * liberada; senão `{ error, status }` pra rota mapear em NextResponse.
 */
export async function checarGatesSemana(
  sb: any,
  trilha: TrilhaRuntime,
  semana: number | string,
): Promise<{ error: string; status: number } | null> {
  const semanaCal = semanaCalendarioDoPlano(trilha, semana);
  if (!semanaLiberadaPorData(trilha.data_inicio, semanaCal)) {
    return {
      error: `Semana ${semana} ainda bloqueada. Libera ${formatarLiberacao(trilha.data_inicio, semanaCal)}.`,
      status: 403,
    };
  }
  if (Number(semana) > 1) {
    const { data: prev } = await sb.from('temporada_semana_progresso')
      .select('status').eq('trilha_id', trilha.id).eq('semana', Number(semana) - 1).maybeSingle();
    if (prev?.status !== 'concluido') {
      return { error: `Conclua a semana ${Number(semana) - 1} antes.`, status: 403 };
    }
  }
  return null;
}
