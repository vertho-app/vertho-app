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
    const empresaParam = searchParams.get('empresa_id');
    const limit = Math.min(Number(searchParams.get('limit') || 12), 30);

    if (!competencia) return NextResponse.json({ items: [] });

    // Tenant scope: NUNCA confiar no cliente pra OMITIR o filtro. Se empresa_id
    // vier, valida o acesso; senão, deriva do tenant do PRÓPRIO usuário. Sem
    // isso, omitir empresa_id devolvia micro_conteudos de TODOS os tenants.
    if (empresaParam) {
      const guard = assertTenantAccess(auth, empresaParam);
      if (guard) return guard;
    }
    const empresaId = empresaParam || auth.empresaId || null;
    // empresaId entra numa string de filtro PostgREST (.or) — trava em UUID pra
    // um valor de admin não conseguir injetar no filtro.
    if (empresaId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(empresaId)) {
      return NextResponse.json({ error: 'empresa_id inválido' }, { status: 400 });
    }

    const sb = createSupabaseAdmin();
    let q = sb.from('micro_conteudos')
      .select('id, titulo, descricao, formato, descritor, bunny_video_id, url, conteudo_inline, duracao_min, tipo_conteudo, created_at')
      .eq('competencia', competencia)
      .eq('ativo', true)
      .order('tipo_conteudo', { ascending: true }) // 'core' antes de 'complementar'
      .order('created_at', { ascending: false })
      .limit(limit);

    // Sempre escopa: tenant do usuário + conteúdo global (NULL). Sem tenant
    // (ex.: platform admin sem empresa_id) → só o conteúdo global.
    q = empresaId
      ? q.or(`empresa_id.eq.${empresaId},empresa_id.is.null`)
      : q.is('empresa_id', null);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ items: data || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Erro' }, { status: 500 });
  }
}
