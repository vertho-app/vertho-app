import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/request-context';
import { can } from '@/lib/permissions';
import { createSupabaseAdmin } from '@/lib/supabase';
import { csrfCheck } from '@/lib/csrf';
import { configSchema } from '@/lib/recepcao/schema';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  const auth = await requireAdmin(req); if (auth instanceof Response) return auth;
  const sb = createSupabaseAdmin();
  const [empresas, configs] = await Promise.all([
    sb.from('empresas').select('id,nome').order('nome'),
    sb.from('recepcao_config').select('empresa_id,habilitado'),
  ]);
  if (empresas.error || configs.error) return NextResponse.json({ error: 'Não foi possível consultar as clínicas.' }, { status: 503 });
  return NextResponse.json({ empresas: empresas.data.map(e => ({ ...e, habilitado: configs.data.some(c => c.empresa_id === e.id && c.habilitado) })),
    podeConfigurar: await can(auth, 'settings.company.manage') }, { headers: { 'Cache-Control': 'no-store' } });
}
export async function PUT(req: Request) {
  const csrf = csrfCheck(req); if (csrf) return csrf;
  const auth = await requireAdmin(req); if (auth instanceof Response) return auth;
  if (!(await can(auth, 'settings.company.manage'))) return NextResponse.json({ error: 'Sem permissão para habilitar clínicas.' }, { status: 403 });
  let body;
  try { body = configSchema.parse(await req.json()); } catch { return NextResponse.json({ error: 'Configuração inválida.' }, { status: 400 }); }
  const sb = createSupabaseAdmin();
  const { error } = await sb.from('recepcao_config').upsert({ empresa_id: body.empresaId, habilitado: body.habilitado, updated_by: auth.email, updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: 'Não foi possível salvar a configuração.' }, { status: 503 });
  return NextResponse.json({ ok: true });
}
