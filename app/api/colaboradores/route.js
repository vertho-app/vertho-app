import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const empresaId = searchParams.get('empresa_id');

  if (!empresaId) {
    return NextResponse.json({ error: 'empresa_id obrigatório' }, { status: 400 });
  }

  const sb = createSupabaseAdmin();
  const { data, error } = await sb.from('colaboradores')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('nome_completo');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req) {
  const body = await req.json();
  const sb = createSupabaseAdmin();
  const { data, error } = await sb.from('colaboradores').insert(body).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PUT(req) {
  const body = await req.json();
  const { id, ...updates } = body;
  const sb = createSupabaseAdmin();
  const { data, error } = await sb.from('colaboradores').update(updates).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const sb = createSupabaseAdmin();
  const { error } = await sb.from('colaboradores').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
