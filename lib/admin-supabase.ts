import { requirePermissionAction, requireUserAction } from '@/lib/auth/action-context';
import { createSupabaseAdmin } from '@/lib/supabase';
import { can, type PermissionKey } from '@/lib/permissions';
import { logAdminAction } from '@/lib/audit';

/**
 * Helper para actions administrativas: autoriza o caller (permissão granular)
 * antes de devolver um client com service_role.
 *
 * Default = 'admin.access' (qualquer admin, master ou sócio — usado em LEITURAS).
 * Para AÇÕES DE ESCRITA/DESTRUTIVAS, passe a permissão específica do domínio
 * (ex.: 'content.manage', 'trash.manage', 'users.manage') — assim o Admin Sócio,
 * que não tem essas permissões, é bloqueado, enquanto o master segue liberado.
 */
export async function requireAdminSupabase(permission: PermissionKey = 'admin.access') {
  await requirePermissionAction(permission);
  return createSupabaseAdmin();
}

/**
 * Gate TENANT-SCOPED: autoriza platform_admin (qualquer empresa) OU o RH da PRÓPRIA
 * empresa — **e, nos dois casos, exige a `permission`**. Permite que o admin de um
 * cliente (ex.: a prefeitura, via projetomacae.vertho.ai) opere ações da sua empresa
 * sem acesso ao painel da plataforma.
 *
 * SEGURANÇA (duas dimensões, ambas obrigatórias):
 *  1. PERMISSÃO — `can(ctx, permission)` para QUALQUER papel;
 *  2. TENANT — para quem não é platform admin, `ctx.empresaId === empresaId`.
 * Como o `empresaId` sempre é confrontado com o contexto autenticado, adulterá-lo no
 * cliente não vaza dado de outra empresa (cai em FORBIDDEN).
 *
 * 🔴 **H0 (auditoria 22/08, Sprint 1) — o que mudou e por quê.** Até 23/08 o parâmetro
 * `permission` valia SÓ no ramo platform_admin; para `rh` ele era IGNORADO — bastava ser
 * RH da empresa certa. Eram duas réguas numa assinatura só, a mesma classe do
 * `ADMIN_EMAILS`, e tinha duas consequências: `permission_overrides` não conseguia
 * restringir RH nenhum por aqui, e quem lesse a chamada
 * `requireEmpresaSupabase(id, 'ai.audit.regenerate')` concluiria — errado — que o RH
 * estava barrado.
 *
 * Raio de alcance medido antes de virar a chave: dos **28 call-sites, 15 passam
 * permissão que `rh` NÃO tem** (`admin.access` ×8, `ai.audit.regenerate` ×7). Os 15 são
 * consumidos **apenas de `/admin`**, que exige `isPlatformAdmin` ou `ADMIN_EMAILS`
 * (`lib/authz-plataforma.ts::checarAcessoPlataforma`) — logo nenhum RH os alcançava pela
 * UI, e o aperto não quebra fluxo legítimo. O que ele fecha é a chamada DIRETA ao action
 * id, que é a escalada.
 *
 * `acao` é o rótulo da action para a vigília — ver `registrarGateNegado`.
 */
export async function requireEmpresaSupabase(
  empresaId: string,
  permission: PermissionKey = 'admin.access',
  acao = 'nao_rotulada',
) {
  const ctx = await requireUserAction();

  // 1. Permissão — para TODO papel, inclusive rh.
  if (!(await can(ctx, permission))) {
    await registrarGateNegado(ctx, acao, empresaId, permission, 'permissao');
    throw new Error(`FORBIDDEN: permissão necessária ${permission}`);
  }

  // 2. Tenant — platform admin vê tudo; os demais só a própria empresa.
  if (ctx.isPlatformAdmin) return createSupabaseAdmin();
  if (ctx.role === 'rh' && empresaId && ctx.empresaId === empresaId) return createSupabaseAdmin();

  await registrarGateNegado(ctx, acao, empresaId, permission, 'tenant');
  throw new Error('FORBIDDEN: acesso restrito a esta empresa');
}

/**
 * Vigília do fechamento de gate (auditoria 22/08, Sprint 0).
 *
 * Fechar um furo transforma chamada que passava em erro. Se algum fluxo LEGÍTIMO
 * vivia em cima do furo, o certo é descobrir pelo log, não por ticket. Sem isto,
 * "monitorar o FORBIDDEN por alguns dias" não é verificável.
 *
 * Os dois motivos NÃO são a mesma notícia — é essa distinção que torna a vigília
 * acionável:
 *   · `tenant`    → alguém pediu OUTRA empresa. É o fix funcionando. Esperado.
 *   · `permissao` → o papel não tem a permissão. Se `mesmo_tenant` for true, é
 *                   candidato a fluxo legítimo quebrado — olhe.
 *
 * Vai para `admin_audit_log` (e não para `degradacao_log`) de propósito: recusa de
 * autorização é evento de auditoria, não degradação de pipeline, e a R10 do health
 * varre o log de degradação toda madrugada — poluí-lo criaria alarme falso.
 * `logAdminAction` é best-effort e nunca lança: a vigília não pode quebrar o gate.
 */
async function registrarGateNegado(
  ctx: { email: string; role?: string | null; empresaId?: string | null; isPlatformAdmin?: boolean },
  acao: string,
  empresaIdPedido: string,
  permission: PermissionKey,
  motivo: 'permissao' | 'tenant',
) {
  await logAdminAction({
    // ⚠️ `empresa_id` da tabela tem FK para `empresas(id)` (ON DELETE SET NULL). O id
    // PEDIDO é escolhido pelo cliente e pode ser forjado ou nem existir — justamente o
    // caso de sondagem cross-tenant. Gravá-lo aqui violaria a FK, e `logAdminAction`
    // engole o erro: a vigília nasceria CEGA no caso que mais importa. Então a coluna
    // recebe o tenant de QUEM CHAMOU (real, vindo do contexto autenticado) e o pedido
    // vai em `detalhes`, que é jsonb e não tem FK nem cast.
    adminEmail: ctx.email,
    acao: 'gate.forbidden',
    empresaId: ctx.empresaId ?? null,
    alvo: acao,
    resultado: 'erro',
    detalhes: {
      motivo,
      permissao: permission,
      empresa_id_pedido: empresaIdPedido,
      role: ctx.role ?? null,
      is_platform_admin: ctx.isPlatformAdmin ?? false,
      mesmo_tenant: ctx.empresaId === empresaIdPedido,
    },
  });
}
