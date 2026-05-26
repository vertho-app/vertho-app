import {
  Building2, Activity, Vote, Brain, Zap, FileText, ClipboardCheck, ShieldCheck,
  BookMarked, BookOpen, Video, Database, GraduationCap as GradIcon, BarChart2,
  Calculator, LayoutDashboard, TrendingUp, Target, Globe, Shield, LockKeyhole,
  ScrollText, Trash2,
} from 'lucide-react';

// ── nav items (sidebar) ─────────────────────────────────────────────────────
// Cada item declara em que contexto aparece:
//   showWhenAll      → quando "Todas as empresas" está selecionado (admin-wide)
//   showWhenEmpresa  → quando uma empresa específica está selecionada (tenant-aware)
// Default: ambos true.
//
// `hrefFn(empresaId)` constrói a URL — recebe o ID quando há empresa selecionada,
// undefined quando "Todas".
export type NavItem = {
  key: string;
  labelKey: string;
  subKey: string;
  icon: any;
  hrefFn: (empresaId?: string) => string;
  showWhenAll?: boolean;
  showWhenEmpresa?: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  // Sempre visíveis
  { key: 'dashboard',  labelKey: 'dashboard',      subKey: 'overview',           icon: LayoutDashboard, hrefFn: () => '/admin/dashboard' },
  { key: 'empresas',   labelKey: 'companies',       subKey: 'tenantsPipeline',    icon: Building2,       hrefFn: (id) => id ? `/admin/empresas/${id}` : '/admin/empresas/gerenciar' },

  // Tenant-aware (mostra "Todas" → admin global / com empresa → pipeline daquela)
  { key: 'pipeline',         labelKey: 'companyPipeline', subKey: 'phase0to5',           icon: Activity,        hrefFn: (id) => `/admin/empresas/${id}`,                       showWhenAll: false },
  { key: 'votacao',          labelKey: 'voting',             subKey: 'top5Collaborators',   icon: Vote,            hrefFn: (id) => `/admin/empresas/${id}/votacao`,               showWhenAll: false },
  { key: 'perfis-disc',      labelKey: 'behavioralProfiles', subKey: 'discCollaborators',         icon: Brain,           hrefFn: (id) => `/admin/empresas/${id}/perfis-comportamentais`, showWhenAll: false },
  { key: 'simulador',        labelKey: 'simulator',           subKey: 'flowTest',            icon: Zap,             hrefFn: () => '/admin/simulador',                              showWhenAll: false },
  { key: 'evidencias',       labelKey: 'evidence',          subKey: 'socraticSessions',        icon: FileText,        hrefFn: (id) => `/admin/vertho/evidencias?empresa=${id}`,       showWhenAll: false },
  { key: 'acumulada',        labelKey: 'accumulatedAssessment',       subKey: 'week13Audit',          icon: ClipboardCheck,  hrefFn: (id) => `/admin/vertho/avaliacao-acumulada?empresa=${id}`, showWhenAll: false },
  { key: 'sem14',            labelKey: 'week14',              subKey: 'finalAudit',           icon: ShieldCheck,     hrefFn: (id) => `/admin/vertho/auditoria-sem14?empresa=${id}`,  showWhenAll: false },

  // Sempre visíveis (admin operacional)
  { key: 'competencias',     labelKey: 'competencies',        subKey: 'baseByRole',           icon: BookMarked,     hrefFn: (id) => id ? `/admin/competencias?empresa=${id}` : '/admin/competencias' },
  { key: 'conteudos',        labelKey: 'contents',           subKey: 'learningBank',      icon: BookOpen,       hrefFn: (id) => id ? `/admin/conteudos?empresa=${id}` : '/admin/conteudos' },
  { key: 'videos',           labelKey: 'videos',              subKey: 'bunnyLibrary',           icon: Video,          hrefFn: (id) => id ? `/admin/videos?empresa=${id}` : '/admin/videos' },
  { key: 'knowledge-base',   labelKey: 'knowledgeBase',      subKey: 'ragTenant',             icon: Database,       hrefFn: (id) => id ? `/admin/vertho/knowledge-base?empresa=${id}` : '/admin/vertho/knowledge-base' },
  { key: 'preferencias',     labelKey: 'preferences',        subKey: 'learning',               icon: GradIcon,       hrefFn: () => '/admin/preferencias-aprendizagem' },

  // Admin-wide (só "Todas")
  { key: 'radar',            labelKey: 'radarIngestion',    subKey: 'saebIcaCensus',         icon: BarChart2,      hrefFn: () => '/admin/radar',                              showWhenEmpresa: false },
  { key: 'qualidade-dados',  labelKey: 'dataQuality',     subKey: 'radarQuality',              icon: Database,       hrefFn: () => '/admin/radar/qualidade-dados',              showWhenEmpresa: false },
  { key: 'custo-ia',         labelKey: 'aiCost',            subKey: 'callCatalog',       icon: BarChart2,      hrefFn: () => '/admin/vertho/simulador-custo' },
  { key: 'orcamento',        labelKey: 'budget',           subKey: 'costTableFinal',     icon: Calculator,     hrefFn: () => '/admin/vertho/orcamento' },
  { key: 'mercado',          labelKey: 'potentialMarket',   subKey: 'citiesNetworksSchools', icon: TrendingUp,   hrefFn: () => '/admin/vertho/mercado-potencial',          showWhenEmpresa: false },
  { key: 'radar-empresas',   labelKey: 'companyRadar',      subKey: 'b2bIntelligence', icon: Target,         hrefFn: () => '/admin/vertho/radarempresas',              showWhenEmpresa: false },
  { key: 'potencial-cidades', labelKey: 'cityPotential', subKey: 'companiesSchoolsUnified', icon: Globe,         hrefFn: () => '/admin/vertho/potencial-cidades',          showWhenEmpresa: false },
  { key: 'admins',           labelKey: 'admins',              subKey: 'platformAdmins',            icon: Shield,         hrefFn: () => '/admin/platform-admins',                    showWhenEmpresa: false },
  { key: 'permissoes',       labelKey: 'permissions',         subKey: 'rolesPermissions',          icon: LockKeyhole,    hrefFn: () => '/admin/permissoes',                         showWhenEmpresa: false },
  { key: 'auditoria',        labelKey: 'audit',               subKey: 'adminTraces',          icon: ScrollText,     hrefFn: () => '/admin/auditoria',                          showWhenEmpresa: false },
  { key: 'lixeira',          labelKey: 'trash',             subKey: 'deletedRecords',        icon: Trash2,         hrefFn: () => '/admin/lixeira',                            showWhenEmpresa: false },
];

export function empresaGlyph(nome: string) {
  return (nome || '?').trim()[0]?.toUpperCase() ?? '?';
}

export function fmtNum(n: number | null | undefined, locale: string) {
  return (n ?? 0).toLocaleString(locale);
}

export const serifStyle: React.CSSProperties = {
  fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
  fontStyle: 'italic',
  fontWeight: 400,
};

export const monoStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono, ui-monospace, monospace)',
};

/**
 * Item de nav ativo a partir do pathname (substitui o hardcoded do dashboard).
 * Compara o path-base de cada href (sem querystring) e escolhe o match mais
 * específico (prefixo mais longo). Retorna a `key` do item ativo ou null.
 */
export function activeNavKey(pathname: string, empresaId: string | undefined): string | null {
  let best: { key: string; len: number } | null = null;
  for (const item of NAV_ITEMS) {
    const base = item.hrefFn(empresaId).split('?')[0];
    const match = base === '/admin/dashboard'
      ? pathname === '/admin/dashboard'
      : pathname === base || pathname.startsWith(base + '/');
    if (match && (!best || base.length > best.len)) {
      best = { key: item.key, len: base.length };
    }
  }
  return best?.key ?? null;
}
