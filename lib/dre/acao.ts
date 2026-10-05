/**
 * Envelope das actions da DRE: gate, validação e retorno padronizado.
 *
 * Todo export de `actions/dre/*.ts` é endpoint HTTP, então cada um passa por
 * aqui ANTES de qualquer leitura ou escrita:
 *   1. gate de PLATAFORMA + a permissão pedida (`dre.view` / `dre.manage`),
 *      pela porta `requirePlataformaComContexto` (platform admin + `can`);
 *   2. validação zod do que o cliente mandou (nada que decide dinheiro vem sem
 *      validar: o cliente escolhe todos os parâmetros);
 *   3. retorno `{ success, data | error, code }`, sem stack nem mensagem crua do
 *      banco: erro ESPERADO é `ErroDre` (texto próprio, vai à tela); qualquer
 *      outro é logado e vira uma mensagem genérica.
 *
 * O ator (`email`) sai da SESSÃO, nunca do corpo do pedido.
 */

import type { z } from 'zod';
import { requirePlataformaComContexto } from '@/lib/admin-supabase';
import type { ActionResult } from '@/lib/auth/protected-action';
import type { PermissionKey } from '@/lib/permissions';

/** Erro de regra de negócio com texto seguro para mostrar. */
export class ErroDre extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroDre';
  }
}

export interface ContextoDre {
  sb: any;
  /** E-mail de quem agiu, normalizado (minúsculas). */
  email: string;
}

function codigoDoGate(e: unknown): string {
  const m = String((e as any)?.message ?? '');
  if (m.startsWith('FORBIDDEN')) return 'FORBIDDEN';
  if (m.startsWith('UNAUTHORIZED')) return 'AUTH';
  return 'AUTH';
}

function textoDoGate(e: unknown): string {
  return String((e as any)?.message ?? 'Sem permissão').replace(/^(UNAUTHORIZED|FORBIDDEN|BAD_REQUEST):\s*/, '');
}

export async function executarAcaoDre<I, O>(
  permissao: Extract<PermissionKey, 'dre.view' | 'dre.manage'>,
  schema: z.ZodType<I>,
  bruto: unknown,
  fn: (ctx: ContextoDre, input: I) => Promise<O>,
): Promise<ActionResult<O>> {
  let sb: any;
  let email: string;
  try {
    const r = await requirePlataformaComContexto(permissao);
    sb = r.sb;
    email = String(r.ctx.email || '').trim().toLowerCase();
  } catch (e) {
    return { success: false, error: textoDoGate(e), code: codigoDoGate(e) };
  }

  const parsed = schema.safeParse(bruto);
  if (!parsed.success) {
    // A 1ª mensagem do zod já é escrita para a pessoa (cada schema define a dele).
    return { success: false, error: parsed.error.issues[0]?.message || 'Dados inválidos', code: 'VALIDATION' };
  }

  try {
    return { success: true, data: await fn({ sb, email }, parsed.data) };
  } catch (e) {
    if (e instanceof ErroDre) return { success: false, error: e.message, code: 'DOMAIN' };
    console.error('[dre] ação falhou:', e);
    return { success: false, error: 'Não foi possível concluir. Tente de novo; se persistir, avise a Vertho.', code: 'INTERNAL' };
  }
}
