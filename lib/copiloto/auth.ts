import { NextResponse } from 'next/server';
import { getUserContext } from '@/lib/authz';
import { getAuthenticatedEmail } from '@/lib/auth/request-context';
import { createSupabaseAdmin } from '@/lib/supabase';
import type { SalesRepresentative } from '@/lib/sales/types';

export type CopilotAccess =
  | { kind: 'representative'; email: string; rep: SalesRepresentative }
  | { kind: 'admin'; email: string };

/** Resolve o acesso pelo e-mail sem depender do tipo de transporte (page ou API). */
export async function resolveCopilotAccess(email: string | null): Promise<CopilotAccess | null> {
  if (!email) return null;
  const normalized = email.trim().toLowerCase();
  const sb = createSupabaseAdmin();
  const { data: rep, error } = await sb
    .from('sales_representatives')
    .select('*')
    .eq('email', normalized)
    .maybeSingle();
  // Gate de acesso: falha de leitura não pode virar "sem acesso" (403 para
  // quem tem) — nem pular para o ramo de admin com o lookup morto (E11).
  if (error) throw new Error('falha ao resolver representante: ' + error.message);

  if (rep?.status === 'active') {
    return { kind: 'representative', email: normalized, rep: rep as SalesRepresentative };
  }

  const user = await getUserContext(normalized);
  if (user?.isPlatformAdmin) return { kind: 'admin', email: normalized };
  return null;
}

/** Gate para rotas do copiloto; o nome mantém a guarda estrutural de APIs enxergando a autenticação. */
export async function requireRepresentativeOrAdminRequest(req: Request): Promise<CopilotAccess | Response> {
  const email = await getAuthenticatedEmail(req);
  if (!email) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  const access = await resolveCopilotAccess(email);
  if (!access) return NextResponse.json({ error: 'sem acesso ao copiloto comercial' }, { status: 403 });
  return access;
}
