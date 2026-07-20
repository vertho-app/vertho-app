import { z } from 'zod';
import { requireAdminAction } from '@/lib/auth/action-context';
import type { PermissionKey } from '@/lib/permissions';
import type { AuthenticatedContext } from '@/lib/auth/request-context';

// Tipo PLANO (este projeto não estreita union discriminada de forma confiável).
// `code` = infraestrutura (AUTH/FORBIDDEN/VALIDATION); `codigo` = DOMÍNIO
// (ex.: 'sem_assessment'), transportado quando fn lança DomainError.
export type ActionResult<O> = { success: boolean; data?: O; error?: string; code?: string; codigo?: string };

/**
 * Erro de DOMÍNIO com código estável pra agregadores/telas distinguirem
 * falhas (ex.: sem_assessment, piloto_descritores_insuficientes). A factory
 * transporta `codigo` no ActionResult; um Error comum não carrega código.
 */
export class DomainError extends Error {
  codigo?: string;
  constructor(message: string, codigo?: string) {
    super(message);
    this.name = 'DomainError';
    this.codigo = codigo;
  }
}

function cleanMsg(e: any): string {
  return String(e?.message ?? e ?? 'Erro').replace(/^(UNAUTHORIZED|FORBIDDEN|BAD_REQUEST):\s*/, '');
}
function errCode(e: any): string | undefined {
  const m = String(e?.message ?? '');
  if (m.startsWith('FORBIDDEN')) return 'FORBIDDEN';
  if (m.startsWith('UNAUTHORIZED')) return 'AUTH';
  if (m.startsWith('BAD_REQUEST')) return 'BAD_REQUEST';
  return undefined;
}

/**
 * Factory de server action protegida (admin-scoped). Força, no topo de TODA
 * action, na ordem:
 *   1) auth + permissão de platform admin — `requireAdminAction(permission)`;
 *   2) validação do input via Zod — `schema.safeParse`;
 *   3) retorno padronizado `{success, data|error, code}` — nunca vaza stack/erro cru.
 *
 * O TENANT não é forçado aqui (depende de resolver o empresaId do recurso): use
 * `assertTenantAccessAction(ctx, empresaId)` dentro de `fn` (ou, adiante, os repos
 * tenant-safe). Isto mata o boilerplate auth+validação+try/catch e torna difícil
 * esquecer a checagem (a classe de hole do S1).
 *
 * Uso: `export const salvarX = protectedAction('perm', Schema, async (ctx, input) => {...})`.
 */
/**
 * Gate de auth para loaders admin (e actions legadas com contrato de retorno
 * próprio, onde o envelope {success,data} do protectedAction quebraria os
 * callers). Mesma porta do protectedAction, mas falha ESPERADA de auth (sem
 * sessão / sem permissão) devolve `fallback` em vez de lançar — server action
 * que lança vira erro no Sentry (on_request_error) + rejection não tratada no
 * client. O gate de página (app/admin/layout.tsx) já redireciona anônimo pro
 * login; aqui só chegam sessão expirada no meio da página e POST direto de
 * bot — ambos recebem o fallback. Erro de NEGÓCIO dentro de `fn` continua
 * lançando (bug real deve ir ao Sentry).
 */
export function protectedLoader<A extends unknown[], O>(
  fallback: O,
  fn: (ctx: AuthenticatedContext, ...args: A) => Promise<O>,
  permission?: PermissionKey,
): (...args: A) => Promise<O> {
  return async (...args: A): Promise<O> => {
    let ctx: AuthenticatedContext;
    try {
      ctx = await requireAdminAction(permission);
    } catch {
      return fallback;
    }
    return fn(ctx, ...args);
  };
}

export function protectedAction<I, O>(
  permission: PermissionKey,
  schema: z.ZodType<I>,
  fn: (ctx: AuthenticatedContext, input: I) => Promise<O>,
): (raw: unknown) => Promise<ActionResult<O>> {
  return async (raw: unknown): Promise<ActionResult<O>> => {
    let ctx: AuthenticatedContext;
    try {
      ctx = await requireAdminAction(permission);
    } catch (e) {
      return { success: false, error: cleanMsg(e), code: errCode(e) ?? 'AUTH' };
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      return { success: false, error: 'Dados inválidos', code: 'VALIDATION' };
    }
    try {
      return { success: true, data: await fn(ctx, parsed.data) };
    } catch (e) {
      const codigo = e instanceof DomainError && e.codigo ? { codigo: e.codigo } : {};
      return { success: false, error: cleanMsg(e), code: errCode(e), ...codigo };
    }
  };
}
