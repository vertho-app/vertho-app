import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { requireUser } from '@/lib/auth/request-context';
import { csrfCheck } from '@/lib/csrf';

function selecionarCenariosElegiveis(cenariosRaw: any[] | null | undefined, escolaId: string | null) {
  const porComp: Record<string, any[]> = {};
  (cenariosRaw || []).forEach((c: any) => {
    (porComp[c.competencia_id] = porComp[c.competencia_id] || []).push(c);
  });
  return Object.values(porComp).map((rows: any[]) =>
    (escolaId && rows.find((r) => r.escola_id === escolaId)) || rows.find((r) => !r.escola_id) || rows[0]);
}

function validarResposta(valor: any): string | null {
  if (typeof valor !== 'string') return null;
  const v = valor.trim();
  return v.length > 0 && v.length <= 5000 ? v : null;
}

export async function GET(req: Request) {
  try {
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;

    const email = auth.email;
    const sb = createSupabaseAdmin();

    const { data: colab } = await sb.from('colaboradores')
      .select('id, nome_completo, cargo, empresa_id, perfil_dominante, escola_id')
      .eq('email', email).single();
    if (!colab) return NextResponse.json({ error: 'Colaborador não encontrado' }, { status: 404 });

    const { data: cenariosRaw } = await sb.from('banco_cenarios')
      .select('id, competencia_id, escola_id, titulo, descricao, alternativas, p1, p2, p3, p4')
      .eq('empresa_id', colab.empresa_id)
      .order('created_at');

    // Roteia por escola do colaborador: 1 cenário por competência —
    // escola do colab > rede (escola_id null) > mais recente.
    const escolaId = (colab as any).escola_id || null;
    const cenarios = selecionarCenariosElegiveis(cenariosRaw, escolaId);

    const { data: respostas } = await sb.from('respostas')
      .select('competencia_id')
      .eq('colaborador_id', colab.id)
      .not('r1', 'is', null);

    const respondidas = new Set((respostas || []).map((r: any) => r.competencia_id));
    const pendentes = (cenarios || []).filter((c: any) => !respondidas.has(c.competencia_id));

    return NextResponse.json({ colaborador: colab, pendentes, total: cenarios?.length || 0, respondidas: respondidas.size });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const csrf = csrfCheck(req);
    if (csrf) return csrf;

    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;

    const body = await req.json();
    const { cenario_id, competencia_id, r1, r2, r3, r4 } = body;
    if (!cenario_id || !competencia_id) {
      return NextResponse.json({ error: 'cenario_id+competencia_id obrigatórios' }, { status: 400 });
    }

    const sb = createSupabaseAdmin();
    const { data: colab } = await sb.from('colaboradores')
      .select('id, empresa_id, escola_id').eq('email', auth.email).single();
    if (!colab) return NextResponse.json({ error: 'Colaborador não encontrado' }, { status: 404 });

    const { data: cenariosRaw } = await sb.from('banco_cenarios')
      .select('id, competencia_id, escola_id')
      .eq('empresa_id', colab.empresa_id)
      .order('created_at');

    const elegiveis = selecionarCenariosElegiveis(cenariosRaw, (colab as any).escola_id || null);
    const cenario = elegiveis.find((c: any) => c.id === cenario_id);
    if (!cenario || cenario.competencia_id !== competencia_id) {
      return NextResponse.json({ error: 'Cenário não elegível para este colaborador' }, { status: 403 });
    }

    const { data: existente } = await sb.from('respostas')
      .select('id')
      .eq('colaborador_id', colab.id)
      .eq('competencia_id', competencia_id)
      .not('r1', 'is', null)
      .limit(1)
      .maybeSingle();
    if (existente) {
      return NextResponse.json({ error: 'Competência já respondida' }, { status: 409 });
    }

    const respostas = [r1, r2, r3, r4].map(validarResposta);
    if (respostas.some((r) => !r)) {
      return NextResponse.json({ error: 'Respostas obrigatórias e limitadas a 5000 caracteres' }, { status: 400 });
    }

    const { error } = await sb.from('respostas').insert({
      empresa_id: colab.empresa_id,
      colaborador_id: colab.id,
      competencia_id,
      cenario_id,
      r1: respostas[0],
      r2: respostas[1],
      r3: respostas[2],
      r4: respostas[3],
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
