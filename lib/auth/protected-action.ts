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
