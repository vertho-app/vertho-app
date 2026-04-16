import { createSupabaseAdmin } from '@/lib/supabase';
import { NextResponse, type NextRequest } from 'next/server';
import { requireUser, assertTenantAccess } from '@/lib/auth/request-context';

export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;

  const { searchParams } = new URL(request.url);
  const empresaId = searchParams.get('empresa');
  if (!empresaId) return NextResponse.json([], { status: 400 });

  const guard = assertTenantAccess(auth, empresaId);
  if (guard) return guard;

  const sb = createSupabaseAdmin();
  const { data } = await sb.from('banco_cenarios')
    .select('id, empresa_id, competencia_id, cargo, titulo, descricao, alternativas, competencia:competencias(nome, cod_comp)')
    .eq('empresa_id', empresaId)
    .order('cargo')
    .order('created_at', { ascending: false });

  const result = (data || []).map((c: any) => ({
    ...c,
    competencia_nome: c.competencia?.nome || null,
    competencia_cod: c.competencia?.cod_comp || null,
  }));

  return NextResponse.json(result);
}
