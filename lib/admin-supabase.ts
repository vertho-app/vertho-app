import { requirePermissionAction, requireUserAction, requireAdminAction } from '@/lib/auth/action-context';
import { createSupabaseAdmin } from '@/lib/supabase';
import { can, type PermissionKey } from '@/lib/permissions';
import { logAdminAction } from '@/lib/audit';

/**
 * ÚNICO ponto de `createSupabaseAdmin()` deste módulo.
 *
 * A Sprint 1 (23/08) ensinou que o conserto de um gate não pode ampliar a
 * superfície que ele deveria reduzir: o "trio explícito" que o plano previa
 * chamaria `createSupabaseAdmin()` DENTRO de cada action corrigida, alargando a
 * allowlist de service-role justamente nos arquivos que estavam sendo apertados.
 * Por isso todo helper daqui DELEGA nesta função — a contagem do
 * `service-role-guard` fica em 1 por mais gates que este módulo ganhe.
 */
function clienteServiceRole() {
  return createSupabaseAdmin();
}

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
  return clienteServiceRole();
}

/**
 * Gate de PLATAFORMA: exige `isPlatformAdmin` (+ a permissão granular) e devolve
 * service-role. É `requireAdminAction` com o client junto — existe para que uma
 * action de plataforma não precise chamar `createSupabaseAdmin()` por conta
 * própria só porque o gate certo não devolvia client.
 *
 * Use quando o recurso NÃO é de tenant nenhum: catálogo global
 * (`competencias_base`, linhas com `empresa_id IS NULL`), configuração da
 * plataforma, operações que atravessam todas as empresas.
 *
 * 🔑 Decisão de produto (Sprint 2, 24/08): **catálogo global = platform_admin
 * apenas**. `content.manage` está no papel `rh`, então gatar o catálogo global
 * por permissão deixava o RH de qualquer cliente apagar/alterar uma linha que
 * serve TODOS os tenants.
 */
export async function requirePlataformaSupabase(permission: PermissionKey = 'admin.access') {
  await requireAdminAction(permission);
  return clienteServiceRole();
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
  empresaId: string | null | undefined,
  permission: PermissionKey = 'admin.access',
  acao = 'nao_rotulada',
) {
  const ctx = await requireUserAction();
  await autorizarEmpresa(ctx, empresaId, permission, acao);
  return clienteServiceRole();
}

/**
 * As DUAS dimensões, na ordem que importa: permissão primeiro (não vira oráculo
 * para quem nem tem o direito), tenant depois.
 *
 * `empresaId` nulo/vazio significa **catálogo global** e só passa para platform
 * admin — é o mesmo ramo que já barrava o RH, agora com o significado escrito.
 */
async function autorizarEmpresa(
  ctx: Awaited<ReturnType<typeof requireUserAction>>,
  empresaId: string | null | undefined,
  permission: PermissionKey,
  acao: string,
  recurso?: string,
) {
  if (!(await can(ctx, permission))) {
    await registrarGateNegado(ctx, acao, empresaId, permission, 'permissao', recurso);
    throw new Error(`FORBIDDEN: permissão necessária ${permission}`);
  }

  if (ctx.isPlatformAdmin) return;
  if (ctx.role === 'rh' && empresaId && ctx.empresaId === empresaId) return;

  await registrarGateNegado(ctx, acao, empresaId, permission, 'tenant', recurso);
  throw new Error('FORBIDDEN: acesso restrito a esta empresa');
}

/**
 * Gate para recurso cujo tenant vem da LINHA — o cliente manda o id do RECURSO,
 * não o da empresa (`atualizarConteudo(id)`, `statusKit(jobId)`, `removerTop10(id)`).
 *
 * 🔴 **A classe A5 da auditoria de 22/08 mora exatamente aqui.** O padrão antigo
 * era `requireAdminSupabase('content.manage')` + `escopoTenantDaLinha(...)`: a
 * escrita ficava presa ao tenant da linha, mas NINGUÉM perguntava se quem pediu
 * tinha direito àquela linha. `content.manage` está no papel `rh`, então o RH do
 * cliente A editava, gerava e apagava conteúdo do cliente B mandando o id.
 * "A escrita não escapa da linha" ≠ "quem pediu tinha direito à linha".
 *
 * Ordem, e por que ela é assim:
 *  1. autentica;
 *  2. confere a PERMISSÃO — antes de tocar o banco, para não virar oráculo de
 *     existência de id para quem nem passou no primeiro gate;
 *  3. lê o `empresa_id` da linha com service-role (leitura mínima, sem efeito);
 *  4. confere o TENANT contra o contexto autenticado.
 *
 * `linha === null` → o recurso não existe: devolve `{ linha: null }` para a
 * action responder "não encontrado" com a mensagem dela. ⚠️ Limite conhecido e
 * aceito: quem TEM a permissão distingue "não existe" de "é de outro tenant"
 * pelo texto do erro. Vaza a existência de um UUID para quem já é admin de
 * algum tenant — não vaza conteúdo.
 *
 * `empresa_id IS NULL` na linha = catálogo global → só platform admin (mesma
 * decisão de `requirePlataformaSupabase`).
 *
 * O client volta junto para a action não precisar de `createSupabaseAdmin()`
 * próprio, e a linha lida volta com ela para evitar o re-fetch.
 */
export async function requireLinhaSupabase<T extends Record<string, any> = Record<string, any>>(
  tabela: string,
  id: string,
  permission: PermissionKey,
  acao: string,
  colunas = 'empresa_id',
): Promise<{ sb: ReturnType<typeof createSupabaseAdmin>; linha: (T & { empresa_id: string | null }) | null }> {
  const ctx = await requireUserAction();
  const recurso = `${tabela}:${id}`;

  if (!id) throw new Error('BAD_REQUEST: id obrigatório');

  // 1. Permissão ANTES do banco.
  if (!(await can(ctx, permission))) {
    await registrarGateNegado(ctx, acao, null, permission, 'permissao', recurso);
    throw new Error(`FORBIDDEN: permissão necessária ${permission}`);
  }

  // 2. Tenant DA LINHA.
  const sb = clienteServiceRole();
  // `*` já traz `empresa_id`; qualquer outra lista ganha a coluna na frente —
  // sem ela o gate leria `undefined` e o tenant da linha viraria "global".
  const sel = /(^|,)\s*(empresa_id|\*)\s*(,|$)/.test(colunas) ? colunas : `empresa_id, ${colunas}`;
  const { data: linha, error } = await sb.from(tabela).select(sel).eq('id', id).maybeSingle();
  if (error) throw new Error(`Falha ao ler ${tabela}: ${error.message}`);
  if (!linha) return { sb, linha: null };

  const empresaIdDaLinha = (linha as any).empresa_id ?? null;
  if (!ctx.isPlatformAdmin && !(ctx.role === 'rh' && empresaIdDaLinha && ctx.empresaId === empresaIdDaLinha)) {
    await registrarGateNegado(ctx, acao, empresaIdDaLinha, permission, 'tenant', recurso);
    throw new Error('FORBIDDEN: acesso restrito a esta empresa');
  }

  return { sb, linha: linha as any };
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
  empresaIdPedido: string | null | undefined,
  permission: PermissionKey,
  motivo: 'permissao' | 'tenant',
  /** `<tabela>:<id>` quando o tenant veio da LINHA — sem isto o evento não diz
   *  QUAL recurso foi sondado, e a vigília vira contador. */
  recurso?: string,
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
      empresa_id_pedido: empresaIdPedido ?? null,
      ...(recurso ? { recurso } : {}),
      role: ctx.role ?? null,
      is_platform_admin: ctx.isPlatformAdmin ?? false,
      mesmo_tenant: ctx.empresaId === empresaIdPedido,
    },
  });
}
