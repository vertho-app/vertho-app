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

/**
 * Telefone para LEITURA. O banco guarda E.164 sem "+" (lib/phone), que é o que
 * monta o link do WhatsApp — quem exibe formata na hora, ninguém grava
 * formatado. Número fora do padrão brasileiro volta como veio: melhor um
 * formato estranho na tela do que um número recortado errado.
 */
export function fmtTelefone(v: string | null | undefined): string {
  const d = String(v ?? '').replace(/\D/g, '');
  if (d.length === 13 && d.startsWith('55')) {
    return `+55 (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  }
  if (d.length === 12 && d.startsWith('55')) {
    return `+55 (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  }
  return String(v ?? '').trim();
}

/** Link wa.me a partir do telefone guardado; null se não houver dígitos. */
export function linkWhatsApp(v: string | null | undefined, texto?: string): string | null {
  const d = String(v ?? '').replace(/\D/g, '');
  if (d.length < 10) return null;
  const q = texto ? `?text=${encodeURIComponent(texto)}` : '';
  return `https://wa.me/${d}${q}`;
}

export function fmtPercent(v: number | null | undefined, digits = 0): string {
  if (v == null || !isFinite(Number(v))) return '—';
  return `${(Number(v) * 100).toFixed(digits)}%`;
}
