/**
 * Câmbio semanal a partir da PTAX do Banco Central.
 *
 * Fonte: serviço OData Olinda, `CotacaoDolarPeriodo`. Medido em 05/10/2026: devolve
 * UM registro por dia útil (`cotacaoVenda`, `dataHoraCotacao`), e uma semana em
 * curso sem nenhum dia útil publicado devolve `value: []`.
 *
 * Por que a MÉDIA da semana e não a sexta: o custo de IA é incorrido ao longo da
 * semana inteira, então a taxa que o representa é a média dos dias úteis, não a
 * do último dia. Média simples da PTAX de venda.
 *
 * Esta camada só BUSCA e calcula. Decidir o que fazer quando o BCB não responde
 * (herdar a semana anterior, registrar a degradação) é de `fechamento.ts`.
 */

import { somarDias, type DataISO } from './semana';

const BASE = 'https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata';

export interface CotacaoPtax {
  data: DataISO;
  venda: number;
}

/** O OData do BCB quer MM-DD-YYYY entre aspas simples. */
function dataBcb(d: DataISO): string {
  return `${d.slice(5, 7)}-${d.slice(8, 10)}-${d.slice(0, 4)}`;
}

/** URL da consulta da semana (segunda a domingo). */
export function urlPtax(segunda: DataISO): string {
  const ini = dataBcb(segunda);
  const fim = dataBcb(somarDias(segunda, 6));
  return (
    `${BASE}/CotacaoDolarPeriodo(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)` +
    `?@dataInicial='${ini}'&@dataFinalCotacao='${fim}'&$format=json&$select=cotacaoVenda,dataHoraCotacao`
  );
}

/**
 * Interpreta o corpo do BCB. Registro malformado (sem data ou sem número
 * positivo) é DESCARTADO, não vira zero: um zero entraria na média e
 * arrastaria o câmbio da semana para baixo.
 */
export function interpretarPtax(corpo: unknown): CotacaoPtax[] {
  const lista = (corpo as { value?: unknown })?.value;
  if (!Array.isArray(lista)) return [];
  const out: CotacaoPtax[] = [];
  for (const r of lista) {
    const venda = Number((r as { cotacaoVenda?: unknown })?.cotacaoVenda);
    const dh = String((r as { dataHoraCotacao?: unknown })?.dataHoraCotacao ?? '');
    const data = dh.slice(0, 10);
    if (Number.isFinite(venda) && venda > 0 && /^\d{4}-\d{2}-\d{2}$/.test(data)) out.push({ data, venda });
  }
  return out;
}

/**
 * Média das cotações que caem na semana que começa em `segunda`, a 4 casas
 * (a precisão da coluna). `null` = nenhum dia útil na semana.
 */
export function mediaPtaxDaSemana(cotacoes: readonly CotacaoPtax[], segunda: DataISO): { usdBrl: number; dias: number } | null {
  const fim = somarDias(segunda, 6);
  const dentro = cotacoes.filter((c) => c.data >= segunda && c.data <= fim);
  if (!dentro.length) return null;
  const soma = dentro.reduce((s, c) => s + c.venda, 0);
  return { usdBrl: Math.round((soma / dentro.length) * 10_000) / 10_000, dias: dentro.length };
}

/**
 * Busca a média da semana no BCB. LANÇA em erro de rede/HTTP/JSON (o chamador
 * decide a política); devolve `null` quando a resposta é válida mas a semana
 * ainda não tem dia útil publicado.
 */
export async function buscarPtaxDaSemana(
  segunda: DataISO,
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<{ usdBrl: number; dias: number } | null> {
  const f = opts.fetchImpl ?? fetch;
  const resp = await f(urlPtax(segunda), { signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000), cache: 'no-store' });
  if (!resp.ok) throw new Error(`BCB PTAX respondeu HTTP ${resp.status}`);
  return mediaPtaxDaSemana(interpretarPtax(await resp.json()), segunda);
}
