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

    const r = await listarEquipeEvolucao();
    if (r.error) return NextResponse.json({ error: r.error }, { status: 403 });

    // Cabeçalho pela SESSÃO, não pelo e-mail (22/09/2026). O mesmo e-mail existe
    // em várias empresas nesta base, e a leitura antiga (`colaboradores` só por
    // e-mail, `maybeSingle`) falhava com 2+ linhas e saía sem nome e sem empresa;
    // com 1 linha, podia ser a da empresa errada.
    let empresaNome: string | null = null;
    if (auth.empresaId) {
      const sb = createSupabaseAdmin();
      const { data: emp, error: empErr } = await sb.from('empresas')
        .select('nome').eq('id', auth.empresaId).maybeSingle();
      if (empErr) throw new Error(`empresa: ${empErr.message}`);
      empresaNome = emp?.nome ?? null;
    }

    // Quem baixa decide o rótulo: o RH baixava com "Gestor: <nome do RH>".
    // Sem acento, como os outros rótulos deste PDF ("Sumario", "Evolucao").
    const responsavelLabel = auth.role === 'rh' ? 'RH' : auth.role === 'gestor' ? 'Gestor' : 'Responsavel';

    const buffer = await renderPlenariaEquipePDF({
      gestorNome: auth.colaborador?.nome_completo ?? null,
      empresa: empresaNome,
      resumo: r.resumo,
      rows: r.rows,
      responsavelLabel,
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
