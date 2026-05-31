import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { gerarConteudoFinalPersonalizado } from '@/actions/conteudos';

export const dynamic = 'force-dynamic';

/**
 * Entrega LAZY do PDF de conteúdo final PERSONALIZADO (DISC + PPP) ao colaborador.
 * Resolve o email da sessão, gera-ou-serve-do-cache o PDF personalizado e
 * redireciona (302) para a URL pública. Qualquer falha cai na URL genérica.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const store = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => store.getAll(),
          setAll: (c) => { for (const { name, value, options } of c) { try { store.set(name, value, options); } catch {} } },
        },
      },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

    const res = await gerarConteudoFinalPersonalizado({ contentId: id });
    if (!res.url) return NextResponse.json({ error: res.error || 'conteúdo indisponível' }, { status: 404 });
    return NextResponse.redirect(res.url, 302);
  } catch (err: any) {
    console.error('[/api/conteudo/[id]/pdf]', err);
    return NextResponse.json({ error: 'erro ao gerar PDF' }, { status: 500 });
  }
}
