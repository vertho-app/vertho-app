/**
 * Semanas da DRE: segunda a domingo em Brasília.
 *
 * É a MESMA semana do e-mail de custo de IA (`janelaSemanaFechada`, em
 * `lib/custo-ia/relatorio-semanal.ts`): BRT é UTC−3 fixo desde 2019, e a janela é
 * `[segunda 00:00 BRT, segunda seguinte 00:00 BRT)`, fim EXCLUSIVO. Os dois
 * relatórios têm de cortar no mesmo instante, ou o mesmo gasto cairia em semanas
 * diferentes entre o e-mail e a DRE (há um teste que compara os dois).
 *
 * Datas de calendário (`recebido_em`, `vencimento`, `semana_inicio`) trafegam como
 * 'YYYY-MM-DD', sem fuso: a semana de uma data sai por aritmética de calendário.
 * Fuso só entra onde há INSTANTE (`created_at` do ledger), e aí por offset
 * explícito, nunca pelo fuso do host (o shell do dono roda em UTC).
 */

const DIA_MS = 86_400_000;
const OFFSET_BRT_MS = 3 * 3_600_000;

/** 'YYYY-MM-DD'. */
export type DataISO = string;

const FORMATO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Verdadeiro só para data de calendário VÁLIDA (rejeita 2026-02-30 e 2026-13-01). */
export function ehDataISO(v: unknown): v is DataISO {
  if (typeof v !== 'string') return false;
  const m = FORMATO.exec(v);
  if (!m) return false;
  const [, a, me, d] = m;
  const t = Date.UTC(Number(a), Number(me) - 1, Number(d));
  return new Date(t).toISOString().slice(0, 10) === v;
}

function utcDe(data: DataISO): number {
  const m = FORMATO.exec(data);
  if (!m) throw new Error(`data inválida: ${data}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function dataDe(utcMs: number): DataISO {
  return new Date(utcMs).toISOString().slice(0, 10);
}

export function somarDias(data: DataISO, dias: number): DataISO {
  return dataDe(utcDe(data) + dias * DIA_MS);
}

/** O dia de calendário em Brasília no instante `agora`. */
export function dataBRT(agora: Date): DataISO {
  return dataDe(agora.getTime() - OFFSET_BRT_MS);
}

/** A segunda-feira da semana que contém `data`. */
export function segundaDaSemana(data: DataISO): DataISO {
  const dow = new Date(utcDe(data)).getUTCDay(); // 0 = domingo
  return somarDias(data, -((dow + 6) % 7));
}

export function ehSegunda(data: DataISO): boolean {
  return ehDataISO(data) && new Date(utcDe(data)).getUTCDay() === 1;
}

/** A semana em curso em Brasília (ainda aberta). */
export function semanaAtualBRT(agora: Date): DataISO {
  return segundaDaSemana(dataBRT(agora));
}

/** A última semana FECHADA em Brasília: a anterior à que está em curso. */
export function ultimaSemanaFechadaBRT(agora: Date): DataISO {
  return somarDias(semanaAtualBRT(agora), -7);
}

/** Janela em instantes UTC `[ini, fim)` de uma semana que começa na `segunda`. */
export function janelaDaSemana(segunda: DataISO): { ini: Date; fim: Date } {
  const iniMs = utcDe(segunda) + OFFSET_BRT_MS;
  return { ini: new Date(iniMs), fim: new Date(iniMs + 7 * DIA_MS) };
}

/** As segundas de `primeira` a `ultima`, inclusive, em ordem crescente. */
export function semanasEntre(primeira: DataISO, ultima: DataISO): DataISO[] {
  const out: DataISO[] = [];
  for (let s = primeira; s <= ultima; s = somarDias(s, 7)) out.push(s);
  return out;
}

/** As `n` últimas semanas até `ultima` (inclusive), em ordem crescente. */
export function ultimasSemanas(ultima: DataISO, n: number): DataISO[] {
  return semanasEntre(somarDias(ultima, -7 * (Math.max(1, n) - 1)), ultima);
}

/** '28/09 a 04/10' */
export function rotuloSemana(segunda: DataISO): string {
  const fim = somarDias(segunda, 6);
  const dm = (d: DataISO) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
  return `${dm(segunda)} a ${dm(fim)}`;
}

/** Em que semana (segunda) cai uma data de calendário. */
export function semanaDaData(data: DataISO): DataISO {
  return segundaDaSemana(data);
}
