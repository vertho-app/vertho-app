import type { EngagementEvolutionDashboard } from '@/lib/engagement-evolution';
import type { TurmaFiltro } from '@/lib/turmas/escopo-leitura';

export type EngagementSurface = 'admin' | 'rh';

/**
 * Por que a leitura da evolução falhou, como CÓDIGO (R-67). `error` segue com a
 * causa técnica para log e para o PDF; a tela traduz por `codigo` e nunca
 * imprime `error`: o texto vinha em português ou era a mensagem crua do banco.
 */
export type FalhaEvolucao = 'empresa_ausente' | 'leitura_falhou';
export type EngagementEvolutionLoader = (area?: string | null, turmaId?: string | null) => Promise<
  { ok: true; data: EngagementEvolutionDashboard } | { ok: false; error: string; codigo?: FalhaEvolucao }
>;

/** Each portal supplies authorized readers; presentation never chooses the tenant. */
export type EngagementPanelProps = {
  empresaId: string | null;
  empresaNome: string;
  surface: EngagementSurface;
  loadRollup: (semana?: number | null, cargo?: string | null, turmaId?: string | null) => Promise<any>;
  loadEvolution: EngagementEvolutionLoader;
  /**
   * Turmas que têm gente (ativa ou encerrada). Ausente, ou com menos de duas, o seletor de
   * turma nem aparece: empresa de uma turma só segue exatamente como antes.
   */
  loadTurmas?: () => Promise<TurmaFiltro[]>;
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
