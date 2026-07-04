// Formatação compartilhada do portal (client-safe).

export function fmtBRL(v: number | null | undefined): string {
  if (v == null || !isFinite(Number(v))) return '—';
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

export function fmtBRLExact(v: number | null | undefined): string {
  if (v == null || !isFinite(Number(v))) return '—';
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
}

export function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  const date = new Date(`${d.slice(0, 10)}T00:00:00`);
  return isNaN(date.getTime()) ? '—' : date.toLocaleDateString('pt-BR');
}

export function fmtDateTime(d: string | null | undefined): string {
  if (!d) return '—';
  const date = new Date(d);
  return isNaN(date.getTime()) ? '—' : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function fmtPercent(v: number | null | undefined, digits = 0): string {
  if (v == null || !isFinite(Number(v))) return '—';
  return `${(Number(v) * 100).toFixed(digits)}%`;
}
