import { NextResponse } from 'next/server';
import { loadCertificadoData } from '@/actions/certificado';
import { renderCertificadoPDF } from '@/lib/certificado-pdf';
import { requireUser, assertEmailAccess } from '@/lib/auth/request-context';

/**
 * GET /api/temporada/certificado/pdf
 *
 * Modo SELF (sem params): baixa o certificado do colab autenticado.
 * Modo ASSISTIDO (?email=<colab>): apenas gestor/rh da mesma empresa OU platform admin.
 *
 * O email do usuário autenticado SEMPRE vem do token/cookie — nunca do query string.
 *
 * Bloqueios → 409 com `{ error, motivo, participacao? }`:
 *   - motivo 'piloto'       → degustação não emite certificado;
 *   - motivo 'participacao' → participação < 75% (UI explica o critério).
 */
export async function GET(request: Request) {
  try {
    const auth = await requireUser(request);
    if (auth instanceof Response) return auth;

    const { searchParams } = new URL(request.url);
    const emailParam = searchParams.get('email');

    let emailAlvo = auth.email;
    if (emailParam && emailParam.trim() && emailParam.trim().toLowerCase() !== auth.email) {
      // Quer certificado de outro → precisa ter role elevado ou ser platform admin
      const guard = await assertEmailAccess(auth, emailParam);
      if (guard) return guard;
      emailAlvo = emailParam.trim().toLowerCase();
    }

    const dados = await loadCertificadoData(emailAlvo);
    if ((dados as any).error) {
      const d = dados as any;
      const status = d.motivo === 'piloto' || d.motivo === 'participacao' ? 409 : 404;
      return NextResponse.json(
        { error: d.error, motivo: d.motivo, participacao: d.participacao },
        { status },
      );
    }

    const ok = dados as any;
    const buffer = await renderCertificadoPDF(ok);
    const fileName = `certificado-temporada-${ok.trilha.numeroTemporada}-${(ok.colab.nome || 'colab').replace(/\s+/g, '-')}.pdf`;

    return new NextResponse(buffer as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
  } catch (err: any) {
    console.error('[temporada/certificado/pdf]', err);
    return NextResponse.json({ error: err?.message || 'Erro' }, { status: 500 });
  }
}
