import { z } from 'zod';
import { requireAdminRequestSupabase } from '@/lib/admin-supabase';
import { tenantDb } from '@/lib/tenant-db';
import { falha, json } from '@/lib/simulador-vendas/http';
import { visaoPublica } from '@/lib/simulador-vendas/core';
import type { Estado } from '@/lib/simulador-vendas/schema';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  try {
    const ctx = await requireAdminRequestSupabase(req, 'reports.individual.view'); if (ctx instanceof Response) return ctx;
    const q = new URL(req.url).searchParams;
    const empresaId = z.string().uuid().parse(q.get('empresaId'));
    const pagina = z.coerce.number().int().min(0).max(100000).parse(q.get('pagina') || 0);
    const tdb = tenantDb(empresaId);
    const result = await tdb.from('sim_vendas_sessoes').select('id,estado,created_at,colaborador_id', { count: 'exact' })
      .order('created_at', { ascending: false }).order('id').range(pagina * 50, pagina * 50 + 49);
    if (result.error) return json({ error: 'Não foi possível consultar o histórico da empresa.' }, 503);
    return json({ total: result.count, pagina, treinos: result.data.map((r: { estado: Estado; colaborador_id: string | null }) => ({
      ...visaoPublica(r.estado), nomeVendedor: r.estado.nomeVendedor, testeAdmin: !r.colaborador_id,
    })) });
  } catch (e) { return falha(e); }
}
