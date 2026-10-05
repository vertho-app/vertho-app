/**
 * Câmbio semanal da DRE: garante UMA cotação USD→BRL por semana em
 * `dre_cambio_semanal`, com a política de falha explícita.
 *
 * Ordem de preferência (a coluna `fonte` guarda qual valeu):
 *   1. `manual`     um sócio definiu: NUNCA é sobrescrito, nem pelo cron;
 *   2. `ptax_bcb`   média da PTAX de venda dos dias úteis da semana;
 *   3. `herdado`    o BCB não respondeu: repete a semana anterior;
 *   4. `orcamento`  o BCB não respondeu e não há semana anterior: usa a cotação
 *                   do orçamento (`ORCAMENTO_DEFAULTS.cotacao`).
 *
 * `herdado` e `orcamento` são PROVISÓRIOS: toda rodada seguinte tenta o BCB de
 * novo e, se achar, troca por `ptax_bcb`. Cada queda registra a degradação
 * (fallback pode existir, nunca invisível): o número em BRL daquela semana é
 * aproximado, e a tela mostra de onde veio.
 *
 * Recebe o client por parâmetro: o cron injeta o dele e os testes injetam o
 * mock. Nenhum `createSupabaseAdmin()` aqui (a contagem do `service-role-guard`
 * é exata).
 */

import { DEGRADACAO, registrarDegradacao } from '@/lib/degradacao';
import { ORCAMENTO_DEFAULTS } from '@/lib/orcamento/precificacao';
import { buscarPtaxDaSemana } from './cambio-ptax';
import type { DataISO } from './semana';
import type { CambioDRE, FonteCambio } from './tipos';

type Sb = any;

export interface OpcoesCambio {
  /** Injetável nos testes; o padrão é a busca real no BCB. */
  buscar?: typeof buscarPtaxDaSemana;
}

function paraCambio(l: any): CambioDRE {
  return { semanaInicio: String(l.semana_inicio), usdBrl: Number(l.usd_brl), fonte: l.fonte as FonteCambio };
}

/** Lê o câmbio de uma semana. `null` = não existe linha. Lança se a leitura falhar. */
export async function lerCambio(sb: Sb, segunda: DataISO): Promise<CambioDRE | null> {
  const { data, error } = await sb
    .from('dre_cambio_semanal')
    .select('semana_inicio, usd_brl, fonte')
    .eq('semana_inicio', segunda)
    .maybeSingle();
  if (error) throw new Error(`dre_cambio_semanal: leitura falhou: ${error.message}`);
  return data ? paraCambio(data) : null;
}

/** O câmbio mais recente ANTES de `segunda` (para herdar ou estimar). */
export async function cambioAnterior(sb: Sb, segunda: DataISO): Promise<CambioDRE | null> {
  const { data, error } = await sb
    .from('dre_cambio_semanal')
    .select('semana_inicio, usd_brl, fonte')
    .lt('semana_inicio', segunda)
    .order('semana_inicio', { ascending: false })
    .limit(1);
  if (error) throw new Error(`dre_cambio_semanal: leitura do anterior falhou: ${error.message}`);
  return data?.length ? paraCambio(data[0]) : null;
}

async function gravar(sb: Sb, c: CambioDRE, definidoPor: string | null): Promise<void> {
  const { error } = await sb.from('dre_cambio_semanal').upsert(
    {
      semana_inicio: c.semanaInicio,
      usd_brl: c.usdBrl,
      fonte: c.fonte,
      obtido_em: new Date().toISOString(),
      definido_por: definidoPor,
    },
    { onConflict: 'semana_inicio' },
  );
  if (error) throw new Error(`dre_cambio_semanal: gravação falhou: ${error.message}`);
}

/**
 * Garante o câmbio da semana e devolve o que ficou valendo. Lança só se o BANCO
 * falhar: o BCB fora do ar é um caminho previsto (herda e registra).
 */
export async function garantirCambio(
  sb: Sb,
  segunda: DataISO,
  opts: OpcoesCambio = {},
): Promise<CambioDRE & { alterado: boolean }> {
  const atual = await lerCambio(sb, segunda);
  // Definido por um sócio, ou já vindo do BCB: não se mexe.
  if (atual && (atual.fonte === 'manual' || atual.fonte === 'ptax_bcb')) return { ...atual, alterado: false };

  const buscar = opts.buscar ?? buscarPtaxDaSemana;
  let motivo = 'semana sem dia útil publicado no BCB';
  try {
    const ptax = await buscar(segunda);
    if (ptax) {
      const novo: CambioDRE = { semanaInicio: segunda, usdBrl: ptax.usdBrl, fonte: 'ptax_bcb' };
      await gravar(sb, novo, null);
      return { ...novo, alterado: true };
    }
  } catch (err: any) {
    motivo = String(err?.message || err);
  }

  // O BCB não deu a cotação. Se já havia um provisório, ele continua valendo.
  if (atual) {
    await registrarDegradacao(
      { fluxo: 'dre', tipo: DEGRADACAO.DRE_CAMBIO_SEM_PTAX, chave: segunda, severidade: 'aviso', detalhe: { motivo, fonte: atual.fonte } },
      sb,
    );
    return { ...atual, alterado: false };
  }

  const anterior = await cambioAnterior(sb, segunda);
  const novo: CambioDRE = anterior
    ? { semanaInicio: segunda, usdBrl: anterior.usdBrl, fonte: 'herdado' }
    : { semanaInicio: segunda, usdBrl: ORCAMENTO_DEFAULTS.cotacao, fonte: 'orcamento' };
  await gravar(sb, novo, null);
  await registrarDegradacao(
    { fluxo: 'dre', tipo: DEGRADACAO.DRE_CAMBIO_SEM_PTAX, chave: segunda, severidade: 'aviso', detalhe: { motivo, fonte: novo.fonte } },
    sb,
  );
  return { ...novo, alterado: true };
}

/**
 * Câmbio para CONVERTER uma semana ainda não fechada (a em curso, ou uma que o
 * fechamento não alcançou): o da semana, se existir; senão o mais recente antes
 * dela; senão a cotação do orçamento. `estimado` diz que não é o da semana.
 */
export async function cambioParaConverter(
  sb: Sb,
  segunda: DataISO,
): Promise<{ usdBrl: number; fonte: FonteCambio; estimado: boolean }> {
  const da = await lerCambio(sb, segunda);
  if (da) return { usdBrl: da.usdBrl, fonte: da.fonte, estimado: false };
  const anterior = await cambioAnterior(sb, segunda);
  if (anterior) return { usdBrl: anterior.usdBrl, fonte: anterior.fonte, estimado: true };
  return { usdBrl: ORCAMENTO_DEFAULTS.cotacao, fonte: 'orcamento', estimado: true };
}
