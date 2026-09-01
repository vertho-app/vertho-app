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
import { avaliarAcessoSemana } from './week-gating';

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
 * Semana de implementação = semana de missão prática, sem pílula nova.
 *
 * FONTE ÚNICA desta pergunta. Ela estava respondida por `[4, 8, 12]` escrito à
 * mão em quatro arquivos (cron, trigger diário, home, praticar) — uma lista que
 * só vale no formato de 14 semanas. Na jornada de 7 (05/08/2026) não existe
 * semana de missão: a semana 4 é de conteúdo, e a lista antiga a deixaria sem
 * pílula, calada, para todos os colaboradores desse modo.
 *
 * O PLANO da trilha é a resposta certa porque foi carimbado na geração — vale
 * para qualquer modo, inclusive os que ainda não existem. Sem plano (colab
 * legado), cai no fallback recebido, que é o comportamento de antes.
 */
export function ehSemanaDeImplementacao(
  plano: any,
  semana: number,
  fallback: number[] = [4, 8, 12],
): boolean {
  if (Array.isArray(plano) && plano.length) {
    const slot = plano.find((s: any) => Number(s?.semana) === Number(semana));
    if (slot?.tipo) return slot.tipo === 'aplicacao';
  }
  return fallback.includes(Number(semana));
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
 * Semanas de AVALIAÇÃO do plano persistido, em ordem crescente.
 *
 * Regular/DUO = [13, 14] · piloto = [3] · jornada = [7] · custom = [semanas+1].
 * Plano ausente/vazio → lista vazia (o caller decide o fallback).
 */
export function semanasAvaliacaoDoPlano(plano: any): number[] {
  if (!Array.isArray(plano)) return [];
  return plano
    .filter((s: any) => s?.tipo === 'avaliacao')
    .map((s: any) => Number(s?.semana))
    // `>= 1`, e não `isFinite`: `Number(null)` é **0**, então um slot de
    // avaliação sem número entrava na lista como semana 0 e virava uma
    // "qualitativa" fantasma. Semana começa em 1.
    .filter((n: number) => Number.isFinite(n) && n >= 1)
    .sort((a, b) => a - b);
}

/**
 * A semana do CENÁRIO B (o fechamento) = a ÚLTIMA avaliação do plano.
 *
 * 🔴 POR QUE ELA EXISTE (medido 01/09/2026). O número vivia escrito à mão em
 * `app/dashboard/temporada/semana/[week]/page.tsx`: `semanaNum === 14`
 * redirecionava para o wizard e `=== 13` / `=== 14` escolhiam qual card
 * explicativo mostrar. Isso vale só no formato de 14 semanas — e são DOIS os
 * formatos que já não cabem nele: `PROGRAMA_JORNADA` põe o fechamento na semana
 * **7** (38 trilhas de Macaé, nenhuma chegou lá ainda) e o encerramento de
 * Ibipeba o põe na **9**. Nos dois casos a pessoa abriria o link da cadência e
 * cairia numa tela SEM o wizard e SEM nenhum dos cards: nada quebra, nada
 * avisa, a semana só aparece vazia.
 *
 * A lista de semanas (`app/dashboard/temporada/page.tsx`) e o wizard
 * (`sem14/page.tsx`) já derivavam do plano cada um com sua cópia da conta. Esta
 * é a mesma régua, num lugar só — a divergência entre portas é exatamente o que
 * a F-I21 documenta.
 */
export function semanaCenarioBDoPlano(plano: any, fallback = 14): number {
  const avaliacoes = semanasAvaliacaoDoPlano(plano);
  return avaliacoes.length ? avaliacoes[avaliacoes.length - 1] : fallback;
}

/**
 * Esta semana de avaliação é a CONVERSA QUALITATIVA (a "sem 13"), e não o
 * fechamento? Verdade só quando o plano tem 2+ slots de avaliação e este não é
 * o último.
 *
 * Nos modos sem conversa qualitativa separada (piloto, jornada, custom) o único
 * slot de avaliação É o fechamento, então isto devolve `false` para ele — que é
 * o comportamento certo: lá a acumulada roda em background sobre a última
 * semana de CONTEÚDO, sem tela própria.
 *
 * ⚠️ O `length < 2` abaixo é EXPLICITAÇÃO, não necessidade: a prova de mutação
 * (01/09) removeu a linha e os 17 casos seguiram verdes, porque com um slot só
 * ele já é o último e a segunda condição sozinha decide. Fica porque nomeia a
 * regra de produto ("qualitativa exige duas avaliações"), mas não conte com ela
 * como proteção — quem protege é a comparação com o ÚLTIMO, e essa a mutação
 * mata na hora.
 */
export function ehSemanaQualitativa(plano: any, semana: number | string): boolean {
  const avaliacoes = semanasAvaliacaoDoPlano(plano);
  if (avaliacoes.length < 2) return false;
  const n = Number(semana);
  return avaliacoes.includes(n) && n !== avaliacoes[avaliacoes.length - 1];
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
  // A régua mora em `avaliarAcessoSemana` (week-gating), que a TELA também usa
  // para explicar o bloqueio. Duas cópias da mesma regra é como a lista passou a
  // liberar o que a rota nega — ver o comentário da função lá.
  const { data: prev } = Number(semana) > 1
    ? await sb.from('temporada_semana_progresso')
        .select('semana, status').eq('trilha_id', trilha.id).eq('semana', Number(semana) - 1).maybeSingle()
    : { data: null };

  const acesso = avaliarAcessoSemana({
    dataInicio: trilha.data_inicio,
    plano: Array.isArray(trilha.temporada_plano) ? trilha.temporada_plano : [],
    progresso: prev ? [prev] : [],
    semana,
  });
  if (acesso.liberada) return null;

  if (acesso.motivo === 'data') {
    return {
      error: `Semana ${semana} ainda bloqueada. Libera ${acesso.liberaEm}.`,
      status: 403,
    };
  }
  return { error: `Conclua a semana ${acesso.semanaPendente} antes.`, status: 403 };
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
