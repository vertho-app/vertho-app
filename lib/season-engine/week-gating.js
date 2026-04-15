/**
 * Gating temporal das semanas da temporada.
 * Cada semana N libera em data_inicio + (N-1)*7 dias às 03:00 America/Sao_Paulo.
 * SP é UTC-3 sem DST → 03:00 BRT == 06:00 UTC.
 */

const SP_OFFSET_HOURS = 3; // BRT = UTC-3
const UNLOCK_HOUR_BRT = 3; // 03:00 BRT
const UNLOCK_HOUR_UTC = UNLOCK_HOUR_BRT + SP_OFFSET_HOURS; // 06:00 UTC

/**
 * Retorna a próxima segunda-feira (em SP) estritamente após `now`, formato 'YYYY-MM-DD'.
 * Se hoje é segunda, retorna a segunda da semana seguinte.
 */
export function nextMondayISO(now = new Date()) {
  // Converte "agora" pra data SP (subtrai 3h)
  const sp = new Date(now.getTime() - SP_OFFSET_HOURS * 3600 * 1000);
  const dow = sp.getUTCDay(); // 0=dom,1=seg,...
  const daysUntilNextMonday = ((1 - dow + 7) % 7) || 7; // sempre >=1
  const monday = new Date(Date.UTC(sp.getUTCFullYear(), sp.getUTCMonth(), sp.getUTCDate() + daysUntilNextMonday));
  return monday.toISOString().slice(0, 10);
}

/**
 * Momento de liberação da semana N (Date UTC).
 * @param {string} dataInicio 'YYYY-MM-DD' (a segunda da semana 1, em SP)
 * @param {number} n semana (1..14)
 */
export function semanaLiberadaEm(dataInicio, n) {
  if (!dataInicio) return null;
  const [y, m, d] = String(dataInicio).slice(0, 10).split('-').map(Number);
  const base = Date.UTC(y, m - 1, d, UNLOCK_HOUR_UTC, 0, 0);
  return new Date(base + (Number(n) - 1) * 7 * 24 * 3600 * 1000);
}

/**
 * @returns {boolean} true se a semana já liberou (data atual >= unlock).
 */
export function semanaLiberadaPorData(dataInicio, n, now = new Date()) {
  const unlock = semanaLiberadaEm(dataInicio, n);
  if (!unlock) return false;
  return now.getTime() >= unlock.getTime();
}

/**
 * Formata a data de liberação para exibição (ex.: "seg 12/05").
 * Horário (03:00) não é exibido — é detalhe de implementação.
 */
export function formatarLiberacao(dataInicio, n) {
  const unlock = semanaLiberadaEm(dataInicio, n);
  if (!unlock) return '';
  const sp = new Date(unlock.getTime() - SP_OFFSET_HOURS * 3600 * 1000);
  const dd = String(sp.getUTCDate()).padStart(2, '0');
  const mm = String(sp.getUTCMonth() + 1).padStart(2, '0');
  return `seg ${dd}/${mm}`;
}
