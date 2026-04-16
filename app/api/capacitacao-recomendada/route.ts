import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { requireUser, assertTenantAccess } from '@/lib/auth/request-context';

/**
 * Capacitação recomendada na home do colaborador.
 * Multi-formato (video, texto, audio, case) — fonte: micro_conteudos.
 *
 * Query params:
 *   - competencia (obrigatório): competência foco do colaborador
 *   - empresa_id (opcional): inclui conteúdo da empresa + global (NULL)
 *   - limit (opcional, default 12)
 *
 * Retorno: { items: [{ id, titulo, formato, descritor, descricao, ... }] }
 */
export async function GET(request: Request) {
  try {
    const auth = await requireUser(request);
    if (auth instanceof Response) return auth;

    const { searchParams } = new URL(request.url);
    const competencia = searchParams.get('competencia');
    const empresaId = searchParams.get('empresa_id');
    const limit = Math.min(Number(searchParams.get('limit') || 12), 30);

    if (!competencia) return NextResponse.json({ items: [] });

    // Se empresa_id foi passado, validar tenant access
    if (empresaId) {
      const guard = assertTenantAccess(auth, empresaId);
      if (guard) return guard;
    }

    const sb = createSupabaseAdmin();
    let q = sb.from('micro_conteudos')
      .select('id, titulo, descricao, formato, descritor, bunny_video_id, url, conteudo_inline, duracao_min, tipo_conteudo, created_at')
      .eq('competencia', competencia)
      .eq('ativo', true)
      .order('tipo_conteudo', { ascending: true }) // 'core' antes de 'complementar'
      .order('created_at', { ascending: false })
      .limit(limit);

    if (empresaId) {
      q = q.or(`empresa_id.eq.${empresaId},empresa_id.is.null`);
    }

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ items: data || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Erro' }, { status: 500 });
  }
}
