import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { loadTemporadaConcluida } from '@/actions/temporada-concluida';
import { renderTemporadaConcluidaPDF } from '@/lib/temporada-concluida-pdf';

/**
 * GET /api/temporada/concluida/pdf
 * Retorna PDF da tela "Temporada Concluida" do colab autenticado.
 * OU ?email=<colab> (platform admin / gestor acessando relatório de outro).
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const sb = createSupabaseAdmin();

    // Autenticação via cookie (Supabase) — lê do header
    const auth = request.headers.get('authorization');
    const emailParam = searchParams.get('email');
    let email = emailParam;
    if (!email && auth?.startsWith('Bearer ')) {
      const token = auth.slice(7);
      const { data } = await sb.auth.getUser(token);
      email = data?.user?.email;
    }
    if (!email) return NextResponse.json({ error: 'email obrigatório (param ou token)' }, { status: 401 });

    const dados = await loadTemporadaConcluida(email);
    if (dados.error) return NextResponse.json({ error: dados.error }, { status: 404 });

    const buffer = await renderTemporadaConcluidaPDF(dados);
    const fileName = `temporada-${dados.trilha.numeroTemporada}-${(dados.colab.nome || 'colab').replace(/\s+/g, '-')}.pdf`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
  } catch (err) {
    console.error('[temporada/concluida/pdf]', err);
    return NextResponse.json({ error: err?.message || 'Erro' }, { status: 500 });
  }
}
