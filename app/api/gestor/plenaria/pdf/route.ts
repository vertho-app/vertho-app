import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { requireRole } from '@/lib/auth/request-context';
import { listarEquipeEvolucao } from '@/app/dashboard/gestor/equipe-evolucao/actions';
import { renderPlenariaEquipePDF } from '@/lib/plenaria-equipe-pdf';

/**
 * GET /api/gestor/plenaria/pdf
 * Gera PDF de plenária da equipe pro gestor/RH autenticado.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireRole(request, ['gestor', 'rh', 'admin']);
    if (auth instanceof Response) return auth;

    const email = auth.email;

    const r = await listarEquipeEvolucao();
    if (r.error) return NextResponse.json({ error: r.error }, { status: 403 });

    // Dados do gestor pro cabeçalho
    const sb = createSupabaseAdmin();
    const { data: gestor } = await sb.from('colaboradores')
      .select('nome_completo, empresas!inner(nome)').eq('email', email).maybeSingle();
    const g: any = gestor;

    const buffer = await renderPlenariaEquipePDF({
      gestorNome: g?.nome_completo,
      empresa: g?.empresas?.nome,
      resumo: r.resumo,
      rows: r.rows,
    });

    return new NextResponse(buffer as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="plenaria-equipe.pdf"`,
      },
    });
  } catch (err: any) {
    console.error('[gestor/plenaria/pdf]', err);
    return NextResponse.json({ error: err?.message || 'Erro' }, { status: 500 });
  }
}
