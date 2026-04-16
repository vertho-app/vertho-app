import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { requireUser, requireRole, assertTenantAccess, assertColabAccess } from '@/lib/auth/request-context';

// GET lista colabs por empresa. Exige gestor/rh/admin da MESMA empresa.
export async function GET(req: Request) {
  const auth = await requireRole(req, ['gestor', 'rh', 'admin']);
  if (auth instanceof Response) return auth;

  const { searchParams } = new URL(req.url);
  const empresaId = searchParams.get('empresa_id');
  const guard = assertTenantAccess(auth, empresaId);
  if (guard) return guard;

  const sb = createSupabaseAdmin();
  const { data, error } = await sb.from('colaboradores')
    .select('*')
    .eq('empresa_id', empresaId!)
    .order('nome_completo');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST cria colab. Exige rh/admin da MESMA empresa do body.
export async function POST(req: Request) {
  const auth = await requireRole(req, ['rh', 'admin']);
  if (auth instanceof Response) return auth;

  const body = await req.json();
  const guard = assertTenantAccess(auth, body?.empresa_id);
  if (guard) return guard;

  const sb = createSupabaseAdmin();
  const { data, error } = await sb.from('colaboradores').insert(body).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// PUT atualiza colab. Exige rh/admin da empresa do colab (consulta antes).
export async function PUT(req: Request) {
  const auth = await requireRole(req, ['rh', 'admin']);
  if (auth instanceof Response) return auth;

  const body = await req.json();
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });

  const sb = createSupabaseAdmin();
  const { data: existente } = await sb.from('colaboradores').select('empresa_id').eq('id', id).maybeSingle();
  if (!existente) return NextResponse.json({ error: 'colab não encontrado' }, { status: 404 });
  const guard = assertTenantAccess(auth, existente.empresa_id);
  if (guard) return guard;

  // Bloqueia mudança de empresa_id via PUT (não faz parte do fluxo admin)
  if (updates.empresa_id && updates.empresa_id !== existente.empresa_id) {
    return NextResponse.json({ error: 'não é permitido mover colab entre empresas via API' }, { status: 400 });
  }

  const { data, error } = await sb.from('colaboradores').update(updates).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE colab. Exige rh/admin da empresa do colab.
export async function DELETE(req: Request) {
  const auth = await requireRole(req, ['rh', 'admin']);
  if (auth instanceof Response) return auth;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });

  const sb = createSupabaseAdmin();
  const { data: existente } = await sb.from('colaboradores').select('empresa_id').eq('id', id).maybeSingle();
  if (!existente) return NextResponse.json({ error: 'colab não encontrado' }, { status: 404 });
  const guard = assertTenantAccess(auth, existente.empresa_id);
  if (guard) return guard;

  const { error } = await sb.from('colaboradores').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
