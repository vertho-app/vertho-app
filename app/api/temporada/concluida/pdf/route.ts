import { NextResponse } from 'next/server';
import { loadTemporadaConcluida } from '@/actions/temporada-concluida';
import { renderTemporadaConcluidaPDF } from '@/lib/temporada-concluida-pdf';
import { requireUser, assertEmailAccess } from '@/lib/auth/request-context';

/**
 * GET /api/temporada/concluida/pdf
 *
 * Modo SELF (sem params): baixa PDF do colab autenticado (usuário logado).
 * Modo ASSISTIDO (?email=<colab>): apenas gestor/rh da mesma empresa OU platform admin.
 *
 * O email do usuário autenticado SEMPRE vem do token/cookie — nunca do query string.
 */
export async function GET(request: Request) {
  try {
    const auth = await requireUser(request);
    if (auth instanceof Response) return auth;

    const { searchParams } = new URL(request.url);
    const emailParam = searchParams.get('email');

    let emailAlvo = auth.email;
    if (emailParam && emailParam.trim() && emailParam.trim().toLowerCase() !== auth.email) {
      // Quer ver relatório de outro → precisa ter role elevado ou ser platform admin
      const guard = await assertEmailAccess(auth, emailParam);
      if (guard) return guard;
      emailAlvo = emailParam.trim().toLowerCase();
    }

    const dados = await loadTemporadaConcluida(emailAlvo);
    if (dados.error) return NextResponse.json({ error: dados.error }, { status: 404 });

    const buffer = await renderTemporadaConcluidaPDF(dados);
    const fileName = `temporada-${dados.trilha.numeroTemporada}-${(dados.colab.nome || 'colab').replace(/\s+/g, '-')}.pdf`;

    return new NextResponse(buffer as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
  } catch (err: any) {
    console.error('[temporada/concluida/pdf]', err);
    return NextResponse.json({ error: err?.message || 'Erro' }, { status: 500 });
  }
}
