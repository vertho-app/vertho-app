import { requireAdminRequestSupabase } from '@/lib/admin-supabase';
import { tenantDb } from '@/lib/tenant-db';
import { csrfCheck } from '@/lib/csrf';
import { configSchema } from '@/lib/simulador-vendas/schema';
import { falha, json } from '@/lib/simulador-vendas/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  try {
    const ctx = await requireAdminRequestSupabase(req, 'companies.view'); if (ctx instanceof Response) return ctx;
    const empresas: Array<{ id: string; nome: string; slug: string }> = [];
    for (let page = 0; ; page++) {
      const { data, error } = await ctx.sb.from('empresas').select('id,nome,slug').order('id').range(page * 1000, page * 1000 + 999);
      if (error) return json({ error: 'Não foi possível consultar as empresas.' }, 503);
      empresas.push(...data); if (data.length < 1000) break;
    }
    return json({ empresas: empresas.sort((a, b) => a.nome.localeCompare(b.nome)) });
  } catch (e) { return falha(e); }
}
export async function PUT(req: Request) {
  try {
    const csrf = csrfCheck(req); if (csrf) return csrf;
    const ctx = await requireAdminRequestSupabase(req, 'settings.company.manage'); if (ctx instanceof Response) return ctx;
    const raw = await req.text(); if (raw.length > 30000) return json({ error: 'Briefing muito longo.' }, 413);
    const body = configSchema.parse(JSON.parse(raw));
    const tdb = tenantDb(body.empresaId);
    const { error } = await tdb.from('sim_vendas_config').upsert({ habilitado: body.habilitado, briefing: body.briefing,
      limite_sessoes: body.limiteSessoes, updated_by: ctx.auth.email, updated_at: new Date().toISOString() });
    if (error) return json({ error: 'Não foi possível salvar a configuração.' }, 503);
    return json({ ok: true });
  } catch (e) { return falha(e); }
}
