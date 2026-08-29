/**
 * Escrita do ledger de IA (`ia_usage_log`) — o INSERT em UM lugar só.
 *
 * Por que existe (29/08/2026): o ledger nasceu dentro de `actions/ai-client.ts`,
 * que é `'use server'` e cobre apenas o wrapper de LLM. O TTS (`lib/gemini-tts`)
 * não passa por lá, e o resultado foi medido: **ZERO linha** com `model ilike
 * '%tts%'` em 90 dias, contra 210 vídeos, 227 podcasts e 1.136 personalizações
 * nominais efetivamente geradas e PAGAS no mesmo período. O custo do TTS era
 * respondível só por aritmética de catálogo, que é estimativa, não medição.
 *
 * A alternativa seria duplicar o insert no TTS. Já sabemos o que duas cópias do
 * mesmo registro produzem: divergem, e a divergência só aparece quando alguém
 * compara dois números que deveriam bater. Aqui a montagem da linha é de cada
 * chamador (o que o wrapper sabe é diferente do que o TTS sabe), mas a gravação
 * e o tratamento de falha são deste módulo.
 *
 * Best-effort de propósito: falha de ledger NUNCA derruba a chamada de IA. Mas
 * é best-effort VISÍVEL — ver o `console.warn` abaixo.
 */

/**
 * Client de INFRA: o ledger não é dado de tenant (`empresa_id` ali é etiqueta de
 * atribuição, não escopo de acesso), então não passa por `tenantDb`. Em UM lugar
 * de propósito — o `service-role-guard` conta ocorrências por arquivo.
 */
async function sbInfra() {
  const { createSupabaseAdmin } = await import('@/lib/supabase');
  return createSupabaseAdmin();
}

/** Uma linha de `ia_usage_log` (mig 177 + 230 + 231). */
export interface LinhaLedgerIA {
  feature: string;
  empresa_id?: string | null;
  colaborador_id?: string | null;
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens?: number | null;
  cache_write_tokens?: number | null;
  cost_usd: number | null;
  latency_ms: number;
  status: string;
  source: string;
  runtime?: string | null;
  orcamento_ms?: number | null;
  origem_codigo?: string | null;
}

/**
 * Grava a linha. Não lança: devolve `true` se gravou.
 *
 * ⚠️ O `{ error }` do supabase-js NÃO lança, então um `try/catch` em volta do
 * insert nunca via falha de gravação — o ledger podia perder linhas em silêncio.
 * Isso não é perda de log, é perda do DADO que decide teto, modelo e custo.
 */
export async function gravarLinhaLedger(linha: LinhaLedgerIA): Promise<boolean> {
  try {
    const { error } = await (await sbInfra()).from('ia_usage_log').insert({
      feature: linha.feature,
      empresa_id: linha.empresa_id ?? null,
      colaborador_id: linha.colaborador_id ?? null,
      provider: linha.provider,
      model: linha.model,
      input_tokens: linha.input_tokens,
      output_tokens: linha.output_tokens,
      cache_read_tokens: linha.cache_read_tokens || null,
      cache_write_tokens: linha.cache_write_tokens || null,
      cost_usd: linha.cost_usd,
      latency_ms: linha.latency_ms,
      status: linha.status,
      source: linha.source,
      runtime: linha.runtime ?? null,
      orcamento_ms: linha.orcamento_ms ?? null,
      origem_codigo: linha.origem_codigo ?? null,
    });
    if (error) {
      console.warn(
        `[ia-ledger] NÃO gravou ${linha.feature} (${linha.model}): ${error.message}. `
        + 'A chamada de IA foi feita e paga — o custo dela some do ledger, e toda conta sobre esta '
        + 'feature passa a ter denominador menor que a realidade.',
      );
      return false;
    }
    return true;
  } catch (e: any) {
    console.warn('[ia-ledger] falha ao registrar uso:', e?.message);
    return false;
  }
}
