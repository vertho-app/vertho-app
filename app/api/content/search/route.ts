import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { requireUser, assertTenantAccess } from '@/lib/auth/request-context';
import { buscarConteudosRelacionados } from '@/lib/conteudos-relacionados';

/**
 * GET /api/content/search
 *
 * Busca micro-conteúdos por competência/descritor/nível, com fallback gradual.
 * A cascata vive em `lib/conteudos-relacionados` (mesma lógica que os assistentes
 * Beto/Tira-Dúvidas usam). Requer autenticação; se empresa_id passado, valida tenant.
 */
export async function GET(request: Request) {
  try {
    const auth = await requireUser(request);
    if (auth instanceof Response) return auth;

    const { searchParams } = new URL(request.url);
    const competencia = searchParams.get('competencia');
    if (!competencia) {
      return NextResponse.json({ error: 'competencia obrigatória' }, { status: 400 });
    }

    const empresaId = searchParams.get('empresa_id');
    const prioridade = (searchParams.get('prioridade') || '').split(',').map(s => s.trim()).filter(Boolean);

    if (empresaId) {
      const guard = assertTenantAccess(auth, empresaId);
      if (guard) return guard;
    }

    const res = await buscarConteudosRelacionados(createSupabaseAdmin(), {
      competencia,
      descritor: searchParams.get('descritor'),
      nivel: Number(searchParams.get('nivel')) || 1.5,
      formato: searchParams.get('formato'),
      contexto: searchParams.get('contexto') || 'generico',
      cargo: searchParams.get('cargo') || 'todos',
      empresaId,
    });

    // Formato_core baseado na prioridade do colaborador
    let formatoCore: string | null = null;
    if (prioridade.length > 0) {
      formatoCore = prioridade.find(f => res.formatosDisponiveis.includes(f)) || null;
    } else if (res.formatosDisponiveis.length > 0) {
      formatoCore = res.formatosDisponiveis[0];
    }

    return NextResponse.json({
      core: res.core,
      complementar: res.complementar,
      formatos_disponiveis: res.formatosDisponiveis,
      formato_core: formatoCore,
      match_level: res.matchLevel,
      total: res.total,
    });
  } catch (err: any) {
    console.error('[content/search]', err);
    return NextResponse.json({ error: err?.message || 'Erro' }, { status: 500 });
  }
}
