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
import { parseConfigSnapshot, parseProgramaCustom, derivarConfigCustom } from './programa-custom';
import { semanaLiberadaPorData, formatarLiberacao } from './week-gating';
import { PROGRESSO } from '@/lib/status';

interface TrilhaRuntime {
  id: string;
  empresa_id: string;
  programa_modo?: string | null;
  programa_config?: any;
  data_inicio?: string | null;
  temporada_plano?: any;
}

/**
 * Config da trilha: snapshot congelado na geração (modo custom, mig 182) →
 * carimbo (mig 154) → fallback sys_config (legado). O snapshot tem precedência
 * MÁXIMA: é o que garante que editar o builder não muda trilha em andamento.
 */
export async function resolverConfigDaTrilha(
  sb: any,
  trilha: Pick<TrilhaRuntime, 'programa_modo' | 'empresa_id'> & Partial<Pick<TrilhaRuntime, 'id' | 'programa_config'>>,
): Promise<ProgramaConfig> {
  const snap = parseConfigSnapshot(trilha.programa_config);
  if (snap) return snap;
  if (trilha.programa_modo === 'custom') {
    // Caller não selecionou programa_config → busca pelo id (custa 1 query, SÓ
    // em trilha custom; os presets nunca entram aqui).
    if (trilha.id) {
      const { data } = await sb.from('trilhas')
        .select('programa_config').eq('id', trilha.id).maybeSingle();
      const doBanco = parseConfigSnapshot(data?.programa_config);
      if (doBanco) return doBanco;
    }
    // Último recurso: re-deriva do sys_config atual da empresa. Loga ALTO — a
    // config pode ter mudado desde a geração. NUNCA cair calado no DUO de 14
    // semanas (seria o modo errado com cara de sucesso).
    const { data: empresa } = await sb.from('empresas')
      .select('sys_config').eq('id', trilha.empresa_id).maybeSingle();
    const inputs = parseProgramaCustom(empresa?.sys_config?.programa_custom);
    if (inputs) {
      console.error('[resolverConfigDaTrilha] trilha custom SEM snapshot programa_config — re-derivando do sys_config da empresa (pode divergir da geração)');
      return derivarConfigCustom(inputs);
    }
    throw new Error('Trilha em modo custom sem snapshot (trilhas.programa_config) e empresa sem programa_custom válido — regere a trilha.');
  }
  if (trilha.programa_modo) return getProgramaConfigByModo(trilha.programa_modo);
  const { data: empresa } = await sb.from('empresas')
    .select('sys_config').eq('id', trilha.empresa_id).maybeSingle();
  return getProgramaConfig(empresa?.sys_config);
}

/**
 * Última semana de CALENDÁRIO do plano persistido — slots espelhados
 * (`calendario_semana`, ex.: fechamento do piloto) contam pela semana que os
 * governa. Plano vazio/ausente → fallback (colabs legados sem temporada_plano).
 * Consumidor: cron de envios (avanço de semana pára no fim REAL do plano).
 */
export function totalSemanasDoPlano(plano: any, fallback: number): number {
  if (!Array.isArray(plano) || plano.length === 0) return fallback;
  const max = Math.max(...plano.map((s: any) => Number(s?.calendario_semana ?? s?.semana) || 0));
  return max > 0 ? max : fallback;
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
    if (prev?.status !== PROGRESSO.CONCLUIDO) {
      return { error: `Conclua a semana ${Number(semana) - 1} antes.`, status: 403 };
    }
  }
  return null;
}

/**
 * Gate da acumulada do PILOTO (B2): decide se o fechamento (sem 3) pode abrir a
 * partir do status da acumulada (disparada em Trigger.dev no fim da sem 2).
 *   - status 'done'          → pronto (libera o fechamento).
 *   - senão                  → NÃO pronto (rota devolve 202 "processando").
 *   - `redisparar`=true quando está TRAVADO (nunca disparou / erro / 'processing'
 *     stale > staleMs) → o caller re-dispara (self-heal). 'processing' recente
 *     apenas aguarda (redisparar=false). Função PURA p/ testabilidade.
 */
export function gateAcumuladaPiloto(
  acumRow: { acumulada_status?: string | null; acumulada_started_at?: string | null } | null | undefined,
  nowMs: number,
  staleMs = 5 * 60_000,
): { pronto: boolean; redisparar: boolean } {
  const st = acumRow?.acumulada_status;
  if (st === 'done') return { pronto: true, redisparar: false };
  const iniciadoMs = acumRow?.acumulada_started_at ? Date.parse(acumRow.acumulada_started_at) : 0;
  const travado = !st || st === 'error' || (st === 'processing' && nowMs - iniciadoMs > staleMs);
  return { pronto: false, redisparar: travado };
}
