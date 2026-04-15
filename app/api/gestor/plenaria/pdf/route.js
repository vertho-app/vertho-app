import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { listarEquipeEvolucao } from '@/app/dashboard/gestor/equipe-evolucao/actions';
import { renderPlenariaEquipePDF } from '@/lib/plenaria-equipe-pdf';

/**
 * GET /api/gestor/plenaria/pdf
 * Gera PDF de plenária da equipe pro gestor/RH autenticado.
 */
export async function GET(request) {
  try {
    const auth = request.headers.get('authorization');
    if (!auth?.startsWith('Bearer ')) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

    const sb = createSupabaseAdmin();
    const { data: userData } = await sb.auth.getUser(auth.slice(7));
    const email = userData?.user?.email;
    if (!email) return NextResponse.json({ error: 'Token inválido' }, { status: 401 });

    const r = await listarEquipeEvolucao(email);
    if (r.error) return NextResponse.json({ error: r.error }, { status: 403 });

    // Dados do gestor pro cabeçalho
    const { data: gestor } = await sb.from('colaboradores')
      .select('nome_completo, empresas!inner(nome)').eq('email', email).maybeSingle();

    const buffer = await renderPlenariaEquipePDF({
      gestorNome: gestor?.nome_completo,
      empresa: gestor?.empresas?.nome,
      resumo: r.resumo,
      rows: r.rows,
    });

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="plenaria-equipe.pdf"`,
      },
    });
  } catch (err) {
    console.error('[gestor/plenaria/pdf]', err);
    return NextResponse.json({ error: err?.message || 'Erro' }, { status: 500 });
  }
}
