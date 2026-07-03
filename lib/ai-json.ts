/**
 * Parse ESTRITO de resposta JSON de IA — o padrão hand-rolled que estava
 * copiado em dezenas de call sites ("strip de code fence + JSON.parse"):
 *
 *   let cleaned = r.trim();
 *   if (cleaned.startsWith('```')) cleaned = cleaned.replace(...).replace(...);
 *   JSON.parse(cleaned);
 *
 * Semântica IDÊNTICA à dos call sites originais (estrito: lança em JSON
 * inválido — o caller decide retry/fallback). Para parsing LENIENTE com
 * heurísticas de recuperação, use `extractJSON` de actions/utils.
 */
export function parseJsonIA<T = any>(raw: string): T {
  let cleaned = String(raw ?? '').trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '');
  }
  return JSON.parse(cleaned);
}
