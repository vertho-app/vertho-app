import type { EngagementEvolutionDashboard } from '@/lib/engagement-evolution';

export type EngagementSurface = 'admin' | 'rh';
export type EngagementEvolutionLoader = (area?: string | null) => Promise<
  { ok: true; data: EngagementEvolutionDashboard } | { ok: false; error: string }
>;

/** Each portal supplies authorized readers; presentation never chooses the tenant. */
export type EngagementPanelProps = {
  empresaId: string | null;
  empresaNome: string;
  surface: EngagementSurface;
  loadRollup: (semana?: number | null, cargo?: string | null) => Promise<any>;
  loadEvolution: EngagementEvolutionLoader;
};

export function engagementLinks(empresaId: string | null, surface: EngagementSurface) {
  const query = empresaId ? `?empresa=${encodeURIComponent(empresaId)}` : '';
  const base = surface === 'admin' ? '/admin/engajamento' : '/dashboard/gestor/engajamento';
  return {
    dashboard: base + (surface === 'admin' ? query : ''),
    report: `${base}/relatorio${surface === 'admin' ? query : ''}`,
    pdf: `/api/relatorios/engajamento/pdf${surface === 'admin' ? query : ''}`,
    reviewEnvios: surface === 'admin' && empresaId ? `/admin/whatsapp${query}` : null,
  };
}

export function appendEngagementQuery(href: string, key: string, value: string) {
  return `${href}${href.includes('?') ? '&' : '?'}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}
