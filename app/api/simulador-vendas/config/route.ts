import { requireAdminRequestSupabase } from '@/lib/admin-supabase';
import { tenantDb } from '@/lib/tenant-db';
import { csrfCheck } from '@/lib/csrf';
import { configSchema } from '@/lib/simulador-vendas/schema';
import { readLimiter } from '@/lib/rate-limit';
import { logAdminAction } from '@/lib/audit';
import { falha, json } from '@/lib/simulador-vendas/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  try {
    const ctx = await requireAdminRequestSupabase(req, 'companies.view'); if (ctx instanceof Response) return ctx;
    const limited = await readLimiter.check(req, `sim-vendas-config:${ctx.auth.email}`); if (limited) return limited;
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
    const limited = await readLimiter.check(req, `sim-vendas-config:${ctx.auth.email}`); if (limited) return limited;
    const raw = await req.text(); if (raw.length > 30000) return json({ error: 'Briefing muito longo.' }, 413);
    const body = configSchema.parse(JSON.parse(raw));
    const tdb = tenantDb(body.empresaId);
    const { data,error } = await tdb.rpc('sim_vendas_configurar', { p_empresa:body.empresaId,p_revisao:body.revisao,p_habilitado:body.habilitado,p_briefing:body.briefing,p_inicio:body.periodoInicio,p_fim:body.periodoFim,p_autor:ctx.auth.email });
    if (error?.message?.includes('SIM_EMPRESA')) return json({error:'Empresa não encontrada.'},404);
    if (error?.message?.includes('SIM_REVISAO')) return json({error:'Outra pessoa alterou esta configuração. Atualize antes de salvar novamente.'},409);
    if (error) return json({ error: 'Não foi possível salvar a configuração.' }, 503);
    await logAdminAction({ adminEmail:ctx.auth.email,empresaId:body.empresaId,acao:'sim_vendas.configurar',detalhes:{revisao:data,habilitado:body.habilitado,periodoInicio:body.periodoInicio,periodoFim:body.periodoFim} });
    return json({ ok: true,revisao:data });
  } catch (e) { return falha(e); }
}
