import {
  Building2, Activity, Vote, Brain, Zap, FileText, ClipboardCheck, ShieldCheck,
  BookMarked, BookOpen, Video, Database, GraduationCap as GradIcon, BarChart2,
  Calculator, LayoutDashboard, TrendingUp, Target, Globe, Shield, LockKeyhole,
  ScrollText, Trash2, CalendarDays, Send, Package, School, Settings,
  FileBarChart, Crosshair, FlaskConical,
} from 'lucide-react';

// ── nav items (sidebar) ─────────────────────────────────────────────────────
// Cada item declara em que contexto aparece:
//   showWhenAll      → quando "Todas as empresas" está selecionado (admin-wide)
//   showWhenEmpresa  → quando uma empresa específica está selecionada (tenant-aware)
// Default: ambos true.
//
// `group` agrupa os itens em seções na sidebar (cabeçalhos via i18n nav.groups.*).
// A ordem das seções é GROUP_ORDER; a ordem dentro da seção é a ordem do array.
//
// `permission` (opcional): permissão mínima para o item aparecer. Itens sem
// permission são visíveis a qualquer platform admin. (Aplicado na Fase 5.)
//
// `hrefFn(empresaId)` constrói a URL — recebe o ID quando há empresa selecionada,
// undefined quando "Todas".
export type NavItem = {
  key: string;
  labelKey: string;
  subKey: string;
  icon: any;
  group: string;
  hrefFn: (empresaId?: string) => string;
  showWhenAll?: boolean;
  showWhenEmpresa?: boolean;
  permission?: string;
};

export const GROUP_ORDER = [
  'overview',     // Visão geral
  'operation',    // Operação (dia a dia do tenant)
  'setup',        // Configuração (estrutura do tenant)
  'content',      // Conteúdo
  'results',      // Resultados (entregáveis)
  'verthoAudit',  // Auditoria Vertho (qualidade interna)
  'data',         // Dados educacionais (ingestão)
  'commercial',   // Comercial (inteligência B2B interna)
  'costs',        // Custos
  'system',       // Sistema (governança + ferramentas internas)
] as const;

export const NAV_ITEMS: NavItem[] = [
  // ── Visão geral ───────────────────────────────────────────────────────────
  { key: 'dashboard',  labelKey: 'dashboard', subKey: 'overview',       group: 'overview', icon: LayoutDashboard, hrefFn: () => '/admin/dashboard' },
  { key: 'empresas',   labelKey: 'companies', subKey: 'tenantsPipeline', group: 'overview', icon: Building2,       hrefFn: () => '/admin/empresas/gerenciar', showWhenEmpresa: false },

  // ── Operação (tenant) ─────────────────────────────────────────────────────
  { key: 'pipeline',   labelKey: 'companyPipeline', subKey: 'phase0to5',    group: 'operation', icon: Activity,     hrefFn: (id) => `/admin/empresas/${id}`,            showWhenAll: false },
  { key: 'temporadas', labelKey: 'seasons',          subKey: 'seasonsSub',   group: 'operation', icon: CalendarDays, hrefFn: (id) => `/admin/temporadas?empresa=${id}`,  showWhenAll: false },
  { key: 'envios',     labelKey: 'dispatch',         subKey: 'dispatchSub',  group: 'operation', icon: Send,         hrefFn: (id) => `/admin/whatsapp?empresa=${id}`,    showWhenAll: false },
  { key: 'pulso',      labelKey: 'pulse',            subKey: 'pulseSub',     group: 'operation', icon: Activity,     hrefFn: (id) => `/admin/empresas/${id}/pulso`,      showWhenAll: false },

  // ── Configuração (tenant) ─────────────────────────────────────────────────
  { key: 'competencias', labelKey: 'competencies',   subKey: 'baseByRole',    group: 'setup', icon: BookMarked, hrefFn: (id) => id ? `/admin/competencias?empresa=${id}` : '/admin/competencias' },
  { key: 'cargos',       labelKey: 'roleCompetencies', subKey: 'roleCompSub', group: 'setup', icon: Target,     hrefFn: (id) => `/admin/cargos?empresa=${id}`,          showWhenAll: false },
  { key: 'votacao',      labelKey: 'voting',          subKey: 'top5Collaborators', group: 'setup', icon: Vote,   hrefFn: (id) => `/admin/empresas/${id}/votacao`,        showWhenAll: false },
  { key: 'escolas-ppp',  labelKey: 'schoolsPpp',      subKey: 'schoolsPppSub', group: 'setup', icon: School,    hrefFn: (id) => `/admin/ppp?empresa=${id}`,             showWhenAll: false },
  { key: 'configuracoes', labelKey: 'companySettings', subKey: 'companySettingsSub', group: 'setup', icon: Settings, hrefFn: (id) => `/admin/empresas/${id}/configuracoes`, showWhenAll: false },

  // ── Conteúdo ──────────────────────────────────────────────────────────────
  { key: 'conteudos',      labelKey: 'contents',       subKey: 'learningBank', group: 'content', icon: BookOpen, hrefFn: (id) => id ? `/admin/conteudos?empresa=${id}` : '/admin/conteudos' },
  { key: 'kits',           labelKey: 'kits',           subKey: 'kitsSub',      group: 'content', icon: Package,  hrefFn: () => '/admin/conteudos/kit' },
  { key: 'videos',         labelKey: 'videos',         subKey: 'bunnyLibrary', group: 'content', icon: Video,    hrefFn: (id) => id ? `/admin/videos?empresa=${id}` : '/admin/videos' },
  { key: 'knowledge-base', labelKey: 'knowledgeBase',  subKey: 'ragTenant',    group: 'content', icon: Database, hrefFn: (id) => id ? `/admin/vertho/knowledge-base?empresa=${id}` : '/admin/vertho/knowledge-base' },
  { key: 'preferencias',   labelKey: 'preferences',    subKey: 'learning',     group: 'content', icon: GradIcon, hrefFn: () => '/admin/preferencias-aprendizagem' },
  { key: 'modulos-base',   labelKey: 'contentModules', subKey: 'masterContent', group: 'content', icon: BookOpen, hrefFn: () => '/admin/vertho/modulos-base',           showWhenEmpresa: false },

  // ── Resultados (tenant) ───────────────────────────────────────────────────
  { key: 'perfis-disc', labelKey: 'behavioralProfiles', subKey: 'discCollaborators', group: 'results', icon: Brain,       hrefFn: (id) => `/admin/empresas/${id}/perfis-comportamentais`, showWhenAll: false },
  { key: 'relatorios',  labelKey: 'reports',            subKey: 'reportsSub',        group: 'results', icon: FileBarChart, hrefFn: (id) => `/admin/empresas/${id}/relatorios`,             showWhenAll: false },
  { key: 'fit',         labelKey: 'fitAdequacy',        subKey: 'fitSub',            group: 'results', icon: Crosshair,    hrefFn: (id) => `/admin/fit?empresa=${id}`,                     showWhenAll: false },
  { key: 'evolucao',    labelKey: 'evolution',          subKey: 'evolutionSub',      group: 'results', icon: TrendingUp,   hrefFn: (id) => `/admin/evolucao?empresa=${id}`,                showWhenAll: false },

  // ── Auditoria Vertho (tenant, qualidade interna) ──────────────────────────
  { key: 'evidencias', labelKey: 'evidence',              subKey: 'socraticSessions', group: 'verthoAudit', icon: FileText,       hrefFn: (id) => `/admin/vertho/evidencias?empresa=${id}`,          showWhenAll: false },
  { key: 'acumulada',  labelKey: 'accumulatedAssessment', subKey: 'week13Audit',      group: 'verthoAudit', icon: ClipboardCheck, hrefFn: (id) => `/admin/vertho/avaliacao-acumulada?empresa=${id}`, showWhenAll: false },
  { key: 'sem14',      labelKey: 'week14',                subKey: 'finalAudit',       group: 'verthoAudit', icon: ShieldCheck,    hrefFn: (id) => `/admin/vertho/auditoria-sem14?empresa=${id}`,     showWhenAll: false },

  // ── Dados educacionais (admin-wide) ───────────────────────────────────────
  { key: 'radar',           labelKey: 'radarIngestion', subKey: 'saebIcaCensus', group: 'data', icon: BarChart2, hrefFn: () => '/admin/radar',                 showWhenEmpresa: false, permission: 'radar.admin.access' },
  { key: 'qualidade-dados', labelKey: 'dataQuality',    subKey: 'radarQuality',  group: 'data', icon: Database,  hrefFn: () => '/admin/radar/qualidade-dados', showWhenEmpresa: false, permission: 'radar.admin.access' },

  // ── Comercial (admin-wide, interno Vertho) ────────────────────────────────
  { key: 'radar-empresas',    labelKey: 'companyRadar',    subKey: 'b2bIntelligence',        group: 'commercial', icon: Target,     hrefFn: () => '/admin/vertho/radarempresas',    showWhenEmpresa: false, permission: 'radar_empresas.access' },
  { key: 'mercado',           labelKey: 'potentialMarket', subKey: 'citiesNetworksSchools',  group: 'commercial', icon: TrendingUp, hrefFn: () => '/admin/vertho/mercado-potencial', showWhenEmpresa: false, permission: 'radar_empresas.access' },
  { key: 'potencial-cidades', labelKey: 'cityPotential',   subKey: 'companiesSchoolsUnified', group: 'commercial', icon: Globe,     hrefFn: () => '/admin/vertho/potencial-cidades', showWhenEmpresa: false, permission: 'radar_empresas.access' },

  // ── Custos ────────────────────────────────────────────────────────────────
  { key: 'custo-ia',  labelKey: 'aiCost', subKey: 'callCatalog',    group: 'costs', icon: BarChart2,  hrefFn: () => '/admin/vertho/simulador-custo', permission: 'ai.costs.view' },
  { key: 'orcamento', labelKey: 'budget', subKey: 'costTableFinal', group: 'costs', icon: Calculator, hrefFn: () => '/admin/vertho/orcamento',       permission: 'ai.costs.view' },

  // ── Sistema (governança + ferramentas internas) ───────────────────────────
  { key: 'simulador',  labelKey: 'simulator',   subKey: 'flowTest',       group: 'system', icon: Zap,          hrefFn: () => '/admin/simulador',       showWhenAll: false },
  { key: 'admins',     labelKey: 'admins',      subKey: 'platformAdmins', group: 'system', icon: Shield,       hrefFn: () => '/admin/platform-admins', showWhenEmpresa: false },
  { key: 'permissoes', labelKey: 'permissions', subKey: 'rolesPermissions', group: 'system', icon: LockKeyhole, hrefFn: () => '/admin/permissoes',     showWhenEmpresa: false },
  { key: 'auditoria',  labelKey: 'audit',       subKey: 'adminTraces',    group: 'system', icon: ScrollText,   hrefFn: () => '/admin/auditoria',       showWhenEmpresa: false },
  { key: 'lixeira',    labelKey: 'trash',       subKey: 'deletedRecords', group: 'system', icon: Trash2,       hrefFn: () => '/admin/lixeira',         showWhenEmpresa: false, permission: 'trash.manage' },
  { key: 'demo',       labelKey: 'demoEnv',     subKey: 'demoEnvSub',     group: 'system', icon: FlaskConical, hrefFn: () => '/admin/demo',            showWhenEmpresa: false, permission: 'companies.manage' },
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
