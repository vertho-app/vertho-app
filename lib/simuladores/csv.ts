/**
 * CSV dos três simuladores. Escapa separador e aspas e neutraliza fórmulas,
 * inclusive depois de espaços invisíveis (a célula que começa com `=`, `+`,
 * `@` ou `-` vira texto). Nasceu no vendas; atendimento e liderança exportam
 * pelo mesmo caminho.
 */
export function celulaCsv(valor: unknown): string {
  const texto = String(valor ?? '');
  const perigoso = /^[\s﻿]*[=+@\-]/.test(texto) || /^[\t\r\n]/.test(texto);
  return `"${perigoso ? "'" : ''}${texto.replace(/"/g, '""')}"`;
}
export function montarCsv(linhas: unknown[][]): string {
  return linhas.map((row) => row.map(celulaCsv).join(';')).join('\r\n');
}

const PARTES = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/**
 * 'AAAA-MM-DD HH:mm' no horário de Brasília; vazio sem data ou com data
 * inválida. As datas dos CSVs saem SEMPRE por aqui (R-97, 03/10/2026): o
 * vendas e o atendimento cortavam o ISO em UTC (`iso.slice(0, 10)`), e um
 * treino depois das 21h de Brasília saía com o dia seguinte. A liderança já
 * exportava assim desde 27/09; a função veio de lá para os três.
 */
export function dataHoraBrasilia(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = Object.fromEntries(PARTES.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

/** O dia de hoje em Brasília (nome do arquivo). */
export const diaBrasilia = (agora: Date) => dataHoraBrasilia(agora.toISOString()).slice(0, 10);
