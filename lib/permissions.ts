import { createSupabaseAdmin } from '@/lib/supabase';
import type { Role, UserContext } from '@/types';

export type SystemRole = 'platform_admin' | 'socio' | Role;

export type PermissionKey =
  | 'admin.access'
  | 'permissions.view'
  | 'permissions.manage'
  | 'platform_admins.manage'
  | 'audit.view'
  | 'companies.view'
  | 'companies.manage'
  | 'users.view'
  | 'users.manage'
  | 'settings.company.manage'
  | 'settings.locale.manage'
  | 'assessments.dispatch'
  | 'assessments.answer'
  | 'reports.aggregate.view'
  | 'reports.individual.view'
  | 'journey.own.view'
  | 'journey.team.view'
  | 'content.manage'
  | 'simulador.casos.manage'
  | 'simulador.casos.view'
  | 'simulador.sessoes.manage'
  | 'knowledge_base.manage'
  | 'ai.audit.regenerate'
  | 'ai.costs.view'
  | 'radar.admin.access'
  | 'radar_empresas.access'
  | 'sales_channel.view'
  | 'sales_channel.manage'
  | 'exports.run'
  | 'trash.manage'
  | 'program.configure'
  | 'dre.view'
  | 'dre.manage';

export type PermissionRisk = 'low' | 'medium' | 'high' | 'critical';

export type PermissionDefinition = {
  key: PermissionKey;
  domain: string;
  label: string;
  description: string;
  risk: PermissionRisk;
};

export const SYSTEM_ROLES: { key: SystemRole; label: string; description: string }[] = [
  { key: 'platform_admin', label: 'Admin Master', description: 'Acesso global Vertho e operações internas.' },
  { key: 'socio', label: 'Admin Sócio', description: 'Admin com visão ampla; sem ações destrutivas ou geradoras. Única exceção de escrita: lançar custos, contratos e recebimentos na DRE (dre.manage), por decisão do dono em 05/10/2026.' },
  { key: 'rh', label: 'Admin da empresa', description: 'Admin/RH do tenant, com visão ampla da empresa.' },
  { key: 'gestor', label: 'Gestor', description: 'Liderança com acesso à própria equipe/área.' },
  { key: 'colaborador', label: 'Usuário', description: 'Acesso individual à própria jornada.' },
];

export const PERMISSIONS: PermissionDefinition[] = [
  { key: 'admin.access', domain: 'Admin', label: 'Acessar admin', description: 'Entrar no painel administrativo.', risk: 'critical' },
  { key: 'permissions.view', domain: 'Governança', label: 'Ver papéis e permissões', description: 'Visualizar matriz e diagnóstico de permissões.', risk: 'high' },
  { key: 'permissions.manage', domain: 'Governança', label: 'Editar permissões', description: 'Criar overrides allow/deny para papéis e usuários.', risk: 'critical' },
  { key: 'platform_admins.manage', domain: 'Governança', label: 'Gerenciar admins master', description: 'Adicionar ou remover platform admins.', risk: 'critical' },
  { key: 'audit.view', domain: 'Governança', label: 'Ver auditoria', description: 'Consultar rastros de ações administrativas.', risk: 'high' },
  { key: 'companies.view', domain: 'Empresas', label: 'Ver empresas', description: 'Listar empresas e dados cadastrais.', risk: 'medium' },
  { key: 'companies.manage', domain: 'Empresas', label: 'Gerenciar empresas', description: 'Criar, editar, configurar ou excluir tenants.', risk: 'critical' },
  { key: 'users.view', domain: 'Usuários', label: 'Ver usuários', description: 'Listar colaboradores da empresa.', risk: 'medium' },
  { key: 'users.manage', domain: 'Usuários', label: 'Gerenciar usuários', description: 'Criar, editar, importar, exportar ou excluir colaboradores.', risk: 'high' },
  { key: 'settings.company.manage', domain: 'Configurações', label: 'Configurar empresa', description: 'Editar preferências, branding e ajustes do tenant.', risk: 'high' },
  { key: 'settings.locale.manage', domain: 'Configurações', label: 'Configurar idioma', description: 'Alterar idioma padrão da empresa ou preferência do usuário.', risk: 'medium' },
  { key: 'assessments.dispatch', domain: 'Avaliações', label: 'Disparar avaliações', description: 'Enviar convites, ciclos, pulse e comunicações em lote.', risk: 'high' },
  { key: 'assessments.answer', domain: 'Avaliações', label: 'Responder avaliações', description: 'Responder avaliações e interações da própria jornada.', risk: 'low' },
  { key: 'reports.aggregate.view', domain: 'Relatórios', label: 'Ver relatórios agregados', description: 'Visualizar indicadores de empresa/equipe.', risk: 'medium' },
  { key: 'reports.individual.view', domain: 'Relatórios', label: 'Ver relatórios individuais', description: 'Acessar relatórios e avaliações de colaboradores.', risk: 'high' },
  { key: 'journey.own.view', domain: 'Jornada', label: 'Ver própria jornada', description: 'Acessar dashboard, PDI e trilha próprios.', risk: 'low' },
  { key: 'journey.team.view', domain: 'Jornada', label: 'Ver jornada da equipe', description: 'Acompanhar progresso da própria equipe.', risk: 'medium' },
  { key: 'content.manage', domain: 'Conteúdo', label: 'Gerenciar conteúdos', description: 'Editar competências, trilhas, vídeos e base de aprendizagem.', risk: 'high' },
  // Existe para tirar `content.manage` do RH sem tirar dele a tela que usa
  // (`/dashboard/treino-atendimento`, abas Cenários e Competências). Com a chave
  // larga, o RH alcançava pelo action id cerca de 80 exports de operação da
  // Vertho (conteúdo, kits, turmas, vídeo, geração por IA) dentro da empresa.
  // Esta só abre os casos do simulador de atendimento da PRÓPRIA empresa e a
  // leitura da biblioteca de competências; o Catálogo Vertho e a biblioteca
  // continuam escritos só pela plataforma (`isPlatformAdmin`, nos consumidores).
  { key: 'simulador.casos.view', domain: 'Simuladores', label: 'Ver casos do simulador de atendimento', description: 'Ler a biblioteca de casos e a de competências do treino de atendimento, sem criar, editar, publicar nem arquivar.', risk: 'low' },
  { key: 'simulador.casos.manage', domain: 'Simuladores', label: 'Gerenciar casos do simulador de atendimento', description: 'Criar, editar, publicar e rascunhar com IA os casos da própria empresa no treino de atendimento; ler a biblioteca de competências.', risk: 'medium' },
  // R-96 (04/10/2026): encerrar, SEM devolutiva e SEM chamada de IA, o treino de
  // uma pessoa que ficou preso em andamento (vendas e atendimento). É operação
  // da Vertho sobre o dado de um cliente, por isso nasce exclusiva do master:
  // o Sócio lê a lista, não opera, e o RH não chega (`requireAdminAction` exige
  // platform admin antes de olhar a permissão). Os papéis só têm o que está
  // listado em `BASE_ROLE_PERMISSIONS`; `platform_admin` recebe todas.
  { key: 'simulador.sessoes.manage', domain: 'Simuladores', label: 'Encerrar treinos parados dos simuladores', description: 'Encerrar sem devolutiva, com motivo registrado e sem chamada de IA, o treino em andamento de uma pessoa nos simuladores de vendas e de atendimento, para liberar um novo treino.', risk: 'medium' },
  { key: 'knowledge_base.manage', domain: 'Conteúdo', label: 'Gerenciar knowledge base', description: 'Editar base RAG por tenant.', risk: 'high' },
  { key: 'ai.audit.regenerate', domain: 'IA', label: 'Regenerar auditorias IA', description: 'Reprocessar avaliações, checks e scorings com IA.', risk: 'critical' },
  { key: 'ai.costs.view', domain: 'IA', label: 'Ver custos de IA', description: 'Acessar ledger, projeções de custo e catálogo de chamadas.', risk: 'high' },
  { key: 'radar.admin.access', domain: 'Radar', label: 'Acessar Radar admin', description: 'Gerenciar ingestão, qualidade e dados do Radar.', risk: 'critical' },
  { key: 'radar_empresas.access', domain: 'Radar Empresas', label: 'Acessar Radar Empresas', description: 'Usar inteligência comercial B2B interna.', risk: 'high' },
  { key: 'sales_channel.view', domain: 'Canal Comercial', label: 'Ver canal de representantes', description: 'Visualizar pipeline, precificação, propostas e comissões dos RCs.', risk: 'medium' },
  { key: 'sales_channel.manage', domain: 'Canal Comercial', label: 'Gerenciar canal de representantes', description: 'Aprovar propostas, gerenciar RCs, materiais e eventos de comissão.', risk: 'critical' },
  { key: 'exports.run', domain: 'Dados', label: 'Exportar dados', description: 'Gerar planilhas, PDFs e saídas em lote.', risk: 'high' },
  { key: 'trash.manage', domain: 'Dados', label: 'Gerenciar lixeira', description: 'Visualizar e restaurar/remover registros excluídos.', risk: 'critical' },
  // 🔑 A ÚNICA CHAVE QUE EXCLUI O SÓCIO **E** O RH — e é por isso que ela existe.
  //
  // `settings.company.manage` exclui o sócio mas INCLUI o rh; `admin.access`
  // exclui o rh mas INCLUI o sócio (`socio` o tem, e `autorizarEmpresa` libera
  // qualquer `isPlatformAdmin`). Nenhuma das duas fecha sozinha contratar
  // módulo pago / reescrever o programa de um cliente — e o desenho do papel
  // Sócio declara "NENHUMA ação destrutiva ou geradora" (ver abaixo).
  // Como `platform_admin` recebe `PERMISSIONS.map(p => p.key)` e os outros
  // papéis só têm o que está listado, a chave nasce exclusiva do master.
  { key: 'program.configure', domain: 'Configurações', label: 'Contratar módulo e configurar programa', description: 'Ligar/desligar módulos pagos e definir o programa de um cliente (cargo-alvo, população, corte).', risk: 'critical' },
  // DRE por tenant (05/10/2026). Receita, margem e custo por cliente são dado
  // comercial sensível: nunca chegam ao `rh` (e `requirePlataformaSupabase` exige
  // platform admin antes de olhar a chave). Por decisão do dono, TODOS os sócios
  // veem (`dre.view`) e lançam (`dre.manage`: contratos, recebimentos, horas e
  // custos manuais). É a única escrita do papel Sócio; a contrapartida é o rastro:
  // toda escrita grava antes e depois em `admin_audit_log` (`dre.*`).
  { key: 'dre.view', domain: 'Financeiro', label: 'Ver DRE por tenant', description: 'Ver receita por caixa, custos e margem de cada cliente (/admin/vertho/dre).', risk: 'high' },
  { key: 'dre.manage', domain: 'Financeiro', label: 'Lançar na DRE', description: 'Cadastrar contratos e parcelas, registrar recebimentos, lançar horas e custos manuais, definir câmbio e recalcular semanas.', risk: 'critical' },
];

export const BASE_ROLE_PERMISSIONS: Record<SystemRole, PermissionKey[]> = {
  platform_admin: PERMISSIONS.map((p) => p.key),
  // Admin Sócio: vê tudo (acesso + *.view + auditoria + custos IA), pode exportar,
  // ver Radar Empresas e configurar idioma — mas NENHUMA ação destrutiva ou
  // geradora (sem *.manage de governança/empresa/usuário/conteúdo, sem disparar
  // avaliações, regenerar IA, admin do Radar ou mexer na lixeira).
  // ÚNICA exceção de escrita: `dre.manage` (05/10/2026, decisão do dono: os
  // sócios lançam custos, horas e recebimentos na DRE). É escrita de dinheiro e
  // não de dado de cliente, e fica toda auditada (`dre.*` em admin_audit_log).
  socio: [
    'admin.access',
    'permissions.view',
    'audit.view',
    'companies.view',
    'users.view',
    'reports.aggregate.view',
    'reports.individual.view',
    'journey.own.view',
    'journey.team.view',
    'ai.costs.view',
    'exports.run',
    'radar_empresas.access',
    'sales_channel.view',
    'settings.locale.manage',
    // Lê os casos do treino de atendimento; editar exige `simulador.casos.manage`
    // (pedido do dono em 03/10/2026, depois que a chave de edição saiu do RH).
    'simulador.casos.view',
    'dre.view',
    'dre.manage',
  ],
  // Admin da empresa (cliente). Decisão do dono de 24/08/2026: "a Vertho opera,
  // o cliente consome". R-73 (revisão de 02/10/2026): saíram as permissões que
  // nenhuma tela do RH usa e que abriam, pelo action id, operação da Vertho:
  // `users.manage` (importar, editar papel e programa de colaborador),
  // `settings.company.manage` (o formulário de configurações da empresa),
  // `knowledge_base.manage` (nenhum código a consulta), `exports.run` (só o
  // export de colaboradores do admin; os do RH são gatados por papel) e
  // `assessments.dispatch` (envio de links, PDFs em lote e WhatsApp: nenhum
  // consumidor do RH; os três exports da allowlist do `gate-permissao-guard`
  // deixam de ser achado e a entrada sai de config/ no mesmo pacote).
  // Em 03/10/2026 saiu também `content.manage` (decisão do dono). Ela abria, pelo
  // action id e dentro da própria empresa, gerar conteúdo e kits com IA paga,
  // Cenários B, upload e exclusão de conteúdo, manuscrito, PPP e competências.
  // O único consumidor legítimo do RH era a tela `/dashboard/treino-atendimento`
  // (abas Cenários e Competências: `/api/recepcao/gestao`, `podeCenarios`,
  // `lib/recepcao/competencias.ts`), que passou para `simulador.casos.manage`.
  rh: [
    'users.view',
    'settings.locale.manage',
    'assessments.answer',
    'reports.aggregate.view',
    'reports.individual.view',
    'journey.own.view',
    'journey.team.view',
    'simulador.casos.manage',
  ],
  gestor: [
    'assessments.answer',
    'reports.aggregate.view',
    'reports.individual.view',
    'journey.own.view',
    'journey.team.view',
  ],
  colaborador: [
    'assessments.answer',
    'journey.own.view',
    'settings.locale.manage',
  ],
};

export type PermissionOverride = {
  id?: string;
  scope_type: 'role' | 'user';
  scope_key: string;
  permission_key: PermissionKey;
  effect: 'allow' | 'deny';
  reason?: string | null;
  created_by_email?: string | null;
  created_at?: string | null;
};

export function getSystemRole(ctx: Pick<UserContext, 'role' | 'isPlatformAdmin' | 'platformAdminRole'> | null | undefined): SystemRole {
  if (ctx?.isPlatformAdmin) return ctx?.platformAdminRole === 'socio' ? 'socio' : 'platform_admin';
  return (ctx?.role || 'colaborador') as SystemRole;
}

export function hasBasePermission(role: SystemRole, permission: PermissionKey): boolean {
  return BASE_ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function canBase(ctx: Pick<UserContext, 'role' | 'isPlatformAdmin'> | null | undefined, permission: PermissionKey): boolean {
  return hasBasePermission(getSystemRole(ctx), permission);
}

export async function loadPermissionOverrides(scopeKeys: string[]): Promise<PermissionOverride[]> {
  const keys = scopeKeys.filter(Boolean);
  if (keys.length === 0) return [];

  const sb = createSupabaseAdmin();
  const { data, error } = await sb
    .from('permission_overrides')
    .select('id, scope_type, scope_key, permission_key, effect, reason, created_by_email, created_at')
    .in('scope_key', keys);

  if (error) {
    const msg = String(error.message || '');
    if (msg.includes('permission_overrides') || msg.includes('does not exist')) return [];
    throw error;
  }

  return (data || []) as PermissionOverride[];
}

export async function getEffectivePermissionKeys(
  ctx: (Pick<UserContext, 'role' | 'isPlatformAdmin'> & { email?: string | null }) | null | undefined,
): Promise<Set<PermissionKey>> {
  const role = getSystemRole(ctx);
  const allowed = new Set<PermissionKey>(BASE_ROLE_PERMISSIONS[role] || []);
  const overrides = await loadPermissionOverrides([`role:${role}`, ctx?.email ? `user:${ctx.email.toLowerCase()}` : '']);

  for (const override of overrides) {
    if (override.effect === 'allow') allowed.add(override.permission_key);
    if (override.effect === 'deny') allowed.delete(override.permission_key);
  }

  return allowed;
}

export async function can(
  ctx: (Pick<UserContext, 'role' | 'isPlatformAdmin'> & { email?: string | null }) | null | undefined,
  permission: PermissionKey,
): Promise<boolean> {
  return (await getEffectivePermissionKeys(ctx)).has(permission);
}

export function groupPermissionsByDomain() {
  return PERMISSIONS.reduce<Record<string, PermissionDefinition[]>>((acc, permission) => {
    if (!acc[permission.domain]) acc[permission.domain] = [];
    acc[permission.domain].push(permission);
    return acc;
  }, {});
}
