import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/request-context';
import { can } from '@/lib/permissions';
import { createSupabaseAdmin } from '@/lib/supabase';
import { csrfCheck } from '@/lib/csrf';
import { configSchema } from '@/lib/recepcao/schema';
import { logAdminAction } from '@/lib/audit';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  const auth = await requireAdmin(req); if (auth instanceof Response) return auth;
  const sb = createSupabaseAdmin();
  const [empresas, configs] = await Promise.all([
    sb.from('empresas').select('id,nome').order('nome'),
    sb.from('recepcao_config').select('empresa_id,habilitado,dominio'),
  ]);
  if (empresas.error || configs.error) return NextResponse.json({ error: 'Não foi possível consultar as clínicas.' }, { status: 503 });
  return NextResponse.json({ empresas: empresas.data.map(e => ({ ...e, habilitado: configs.data.some(c => c.empresa_id === e.id && c.habilitado), dominio: configs.data.find(c => c.empresa_id === e.id)?.dominio ?? null })),
    podeConfigurar: await can(auth, 'settings.company.manage') }, { headers: { 'Cache-Control': 'no-store' } });
}
export async function PUT(req: Request) {
  const csrf = csrfCheck(req); if (csrf) return csrf;
  const auth = await requireAdmin(req); if (auth instanceof Response) return auth;
  if (!(await can(auth, 'settings.company.manage'))) return NextResponse.json({ error: 'Sem permissão para habilitar clínicas.' }, { status: 403 });
  let body;
  try { body = configSchema.parse(await req.json()); } catch { return NextResponse.json({ error: 'Configuração inválida.' }, { status: 400 }); }
  const sb = createSupabaseAdmin();
  const { data: anterior, error: erroLeitura } = await sb.from('recepcao_config').select('habilitado,dominio').eq('empresa_id', body.empresaId).maybeSingle();
  if (erroLeitura) return NextResponse.json({ error: 'Não foi possível consultar a configuração.' }, { status: 503 });
  const { error } = await sb.from('recepcao_config').upsert({ empresa_id: body.empresaId, habilitado: body.habilitado, ...(body.dominio ? { dominio: body.dominio } : {}), updated_by: auth.email, updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: 'Não foi possível salvar a configuração.' }, { status: 503 });
  // Liberar o simulador para uma equipe é decisão de produção: fica na trilha de auditoria (revisão de 18/09).
  await logAdminAction({ adminEmail: auth.email, acao: 'simulador_atendimento.configurar', empresaId: body.empresaId, alvo: body.dominio || anterior?.dominio || 'recepcao_medica', detalhes: { antes: anterior ?? null, depois: { habilitado: body.habilitado, dominio: body.dominio ?? anterior?.dominio ?? 'recepcao_medica' } } });
  return NextResponse.json({ ok: true });
}
