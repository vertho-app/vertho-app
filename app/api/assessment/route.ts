import { NextResponse } from 'next/server';
import { createSupabaseClient, createSupabaseAdmin } from '@/lib/supabase';

export async function GET(req) {
  try {
    const supabase = createSupabaseClient(req);
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

    const email = user.email;
    const sb = createSupabaseAdmin();

    const { data: colab } = await sb.from('colaboradores')
      .select('id, nome_completo, cargo, empresa_id, perfil_dominante')
      .eq('email', email).single();
    if (!colab) return NextResponse.json({ error: 'Colaborador não encontrado' }, { status: 404 });

    const { data: cenarios } = await sb.from('banco_cenarios')
      .select('id, competencia_id, cenario, p1, p2, p3, p4')
      .eq('empresa_id', colab.empresa_id)
      .eq('email_colaborador', email)
      .order('created_at');

    const { data: respostas } = await sb.from('respostas')
      .select('competencia_id')
      .eq('colaborador_id', colab.id)
      .not('r1', 'is', null);

    const respondidas = new Set((respostas || []).map(r => r.competencia_id));
    const pendentes = (cenarios || []).filter(c => !respondidas.has(c.competencia_id));

    return NextResponse.json({ colaborador: colab, pendentes, total: cenarios?.length || 0, respondidas: respondidas.size });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const supabase = createSupabaseClient(req);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

    const body = await req.json();
    const { cenario_id, competencia_id, r1, r2, r3, r4 } = body;

    const sb = createSupabaseAdmin();
    const { data: colab } = await sb.from('colaboradores')
      .select('id, empresa_id').eq('email', user.email).single();
    if (!colab) return NextResponse.json({ error: 'Colaborador não encontrado' }, { status: 404 });

    const { error } = await sb.from('respostas').insert({
      empresa_id: colab.empresa_id,
      colaborador_id: colab.id,
      competencia_id,
      cenario_id,
      r1, r2, r3, r4,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
