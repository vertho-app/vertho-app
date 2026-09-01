import {
  Building2, Activity, Brain, Zap, FileText, ClipboardCheck,
  BookMarked, BookOpen, Video, Database, GraduationCap as GradIcon, BarChart2,
  Calculator, LayoutDashboard, TrendingUp, Target, Shield, LockKeyhole,
  ScrollText, Trash2, CalendarDays, Send, Package, School, Settings,
  FileBarChart, Crosshair, FlaskConical, Briefcase, MessagesSquare, DollarSign, Bot,
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
  { key: 'demo',       labelKey: 'demoEnv',   subKey: 'demoEnvSub',     group: 'overview', icon: FlaskConical,     hrefFn: () => '/admin/demo',              showWhenEmpresa: false, permission: 'companies.manage' },
  { key: 'copiloto',   labelKey: 'copilot',   subKey: 'copilotSub',     group: 'overview', icon: Bot,              hrefFn: () => '/copiloto',                showWhenEmpresa: false },

  // ── Operação (tenant) ─────────────────────────────────────────────────────
  { key: 'pipeline',   labelKey: 'companyPipeline', subKey: 'phase0to5',    group: 'operation', icon: Activity,     hrefFn: (id) => `/admin/empresas/${id}`,            showWhenAll: false },
  { key: 'temporadas', labelKey: 'seasons',          subKey: 'seasonsSub',   group: 'operation', icon: CalendarDays, hrefFn: (id) => `/admin/temporadas?empresa=${id}`,  showWhenAll: false },
  { key: 'engajamento', labelKey: 'engagement',      subKey: 'engagementSub', group: 'operation', icon: BarChart2,   hrefFn: (id) => `/admin/engajamento?empresa=${id}`, showWhenAll: false },
  { key: 'envios',     labelKey: 'dispatch',         subKey: 'dispatchSub',  group: 'operation', icon: Send,         hrefFn: (id) => `/admin/whatsapp?empresa=${id}`,    showWhenAll: false },
  // ⛔ 'pulso' saiu em 31/08/2026 — bloco OFF-LINE (lib/blocos-offline.ts). Era
  // a entrada mais exposta da lista: fixa no menu, levava a um módulo cujas 5
  // tabelas de execução nunca receberam uma linha. Apontar para uma tela que
  // responde 404 é pior do que não apontar.

  // ── Configuração (tenant) ─────────────────────────────────────────────────
  { key: 'competencias', labelKey: 'competencies',   subKey: 'baseByRole',    group: 'setup', icon: BookMarked, hrefFn: (id) => id ? `/admin/competencias?empresa=${id}` : '/admin/competencias' },
  // votação virou tab do workspace de cargos (Fase 3) — item próprio removido
  { key: 'cargos',       labelKey: 'roleCompetencies', subKey: 'roleCompSub', group: 'setup', icon: Target,     hrefFn: (id) => `/admin/cargos?empresa=${id}`,          showWhenAll: false },
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
  { key: 'evidencias', labelKey: 'evidence',  subKey: 'socraticSessions', group: 'verthoAudit', icon: FileText,       hrefFn: (id) => `/admin/vertho/evidencias?empresa=${id}`,  showWhenAll: false },
  // sem13 + sem14 fundidas no workspace de auditorias (Fase 3)
  { key: 'auditorias', labelKey: 'audits',    subKey: 'auditsSub',        group: 'verthoAudit', icon: ClipboardCheck, hrefFn: (id) => `/admin/vertho/auditorias?empresa=${id}`,  showWhenAll: false },

  // ── Dados educacionais (admin-wide) ───────────────────────────────────────
  // A FERRAMENTA (busca de escola/município). Era `radar.vertho.ai`, público e
  // sem login; virou interna em 10/08/2026 e ficou sem porta de entrada — o
  // subdomínio ERA o botão. Os dois itens abaixo são a administração dela.
  //
  // ⚠️ Sem `permission` de propósito: `radar.admin.access` é `risk: critical` e
  // cobre INGESTÃO (mexer no dado), que o Admin Sócio não tem. Consultar é
  // leitura — amarrar este item àquela permissão tiraria o Radar da Juliane e
  // do Samuel. A régua aqui é a mesma do gate de `app/radar/layout.tsx`:
  // qualquer platform admin. Mudar uma ponta sem a outra é como o menu passa a
  // mentir (item some e a URL continua entrando, ou o contrário).
  { key: 'radar-consulta',  labelKey: 'radarTool',      subKey: 'schoolCityLookup', group: 'data', icon: Crosshair, hrefFn: () => '/radar',                    showWhenEmpresa: false },
  { key: 'radar',           labelKey: 'radarIngestion', subKey: 'saebIcaCensus', group: 'data', icon: BarChart2, hrefFn: () => '/admin/radar',                 showWhenEmpresa: false, permission: 'radar.admin.access' },
  { key: 'qualidade-dados', labelKey: 'dataQuality',    subKey: 'radarQuality',  group: 'data', icon: Database,  hrefFn: () => '/admin/radar/qualidade-dados', showWhenEmpresa: false, permission: 'radar.admin.access' },

  // ── Comercial (admin-wide, interno Vertho) ────────────────────────────────
  { key: 'canal-comercial', labelKey: 'salesChannel',  subKey: 'salesChannelSub',       group: 'commercial', icon: Briefcase,  hrefFn: () => '/admin/comercial',               showWhenEmpresa: false, permission: 'sales_channel.view' },
  // ⛔ 'radar-empresas' saiu em 31/08/2026 — bloco OFF-LINE (lib/blocos-offline.ts).
  // A ingestão parou em 16/05 e o recurso de listas nunca foi usado. O acervo
  // (92 mil empresas) continua no banco; o que saiu é a interface de consulta.
  // `mercado-potencial`, logo abaixo, NÃO faz parte do bloco: apesar de vizinho
  // aqui, ele lê as views do Radar de escolas, não as tabelas radarempresas_*.
  // potencial-cidades virou tab "unificado" do mercado-potencial (Fase 3)
  { key: 'mercado',        labelKey: 'potentialMarket', subKey: 'citiesNetworksSchools', group: 'commercial', icon: TrendingUp, hrefFn: () => '/admin/vertho/mercado-potencial', showWhenEmpresa: false, permission: 'radar_empresas.access' },

  // ── Custos ────────────────────────────────────────────────────────────────
  { key: 'custo-ia',  labelKey: 'aiCost', subKey: 'callCatalog',    group: 'costs', icon: BarChart2,  hrefFn: () => '/admin/vertho/simulador-custo', permission: 'ai.costs.view' },
  // `/admin/vertho/custo-ia` ficou sem entrada de menu desde que foi criada: a
  // key acima se chama 'custo-ia' mas aponta para o SIMULADOR, então parecia
  // coberta. É a tela com o custo por jornada (Piloto/Onboarding/Mentor IA).
  { key: 'plano-custo', labelKey: 'aiCostPlan', subKey: 'costPerJourney', group: 'costs', icon: DollarSign, hrefFn: () => '/admin/vertho/custo-ia',  permission: 'ai.costs.view' },
  { key: 'orcamento', labelKey: 'budget', subKey: 'costTableFinal', group: 'costs', icon: Calculator, hrefFn: () => '/admin/vertho/orcamento',       permission: 'ai.costs.view' },

  // ── Sistema (governança + ferramentas internas) ───────────────────────────
  // Board: a execução acontece na máquina local (worker + CLIs por assinatura),
  // então o item some quando há empresa selecionada — não é ferramenta de tenant.
  { key: 'board',      labelKey: 'boardPainel', subKey: 'boardPainelSub', group: 'system', icon: MessagesSquare, hrefFn: () => '/admin/vertho/board', showWhenEmpresa: false },
  { key: 'simulador',  labelKey: 'simulator',   subKey: 'flowTest',       group: 'system', icon: Zap,          hrefFn: () => '/admin/simulador',       showWhenAll: false },
  { key: 'admins',     labelKey: 'admins',      subKey: 'platformAdmins', group: 'system', icon: Shield,       hrefFn: () => '/admin/platform-admins', showWhenEmpresa: false },
  { key: 'permissoes', labelKey: 'permissions', subKey: 'rolesPermissions', group: 'system', icon: LockKeyhole, hrefFn: () => '/admin/permissoes',     showWhenEmpresa: false },
  { key: 'auditoria',  labelKey: 'audit',       subKey: 'adminTraces',    group: 'system', icon: ScrollText,   hrefFn: () => '/admin/auditoria',       showWhenEmpresa: false },
  { key: 'lixeira',    labelKey: 'trash',       subKey: 'deletedRecords', group: 'system', icon: Trash2,       hrefFn: () => '/admin/lixeira',         showWhenEmpresa: false, permission: 'trash.manage' },
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
