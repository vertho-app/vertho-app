import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { requireUser, assertTenantAccess } from '@/lib/auth/request-context';

/**
 * GET /api/content/search
 *
 * Busca micro-conteúdos por competência/descritor/nível, com fallback gradual.
 * Requer autenticação. Se empresa_id passado, valida tenant access.
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

    const descritor = searchParams.get('descritor');
    const nivel = Number(searchParams.get('nivel')) || 1.5;
    const formato = searchParams.get('formato');
    const contexto = searchParams.get('contexto') || 'generico';
    const cargo = searchParams.get('cargo') || 'todos';
    const empresaId = searchParams.get('empresa_id');
    const prioridade = (searchParams.get('prioridade') || '').split(',').map(s => s.trim()).filter(Boolean);

    // Se empresa_id passado, validar tenant access
    if (empresaId) {
      const guard = assertTenantAccess(auth, empresaId);
      if (guard) return guard;
    }

    const sb = createSupabaseAdmin();

    // Tentativas em cascata, da mais específica para a mais relaxada
    const tentativas = [
      { level: 1, descritor: !!descritor, formato: !!formato, contexto: true, cargo: true },
      { level: 2, descritor: !!descritor, formato: !!formato, contexto: true, cargo: false },
      { level: 3, descritor: !!descritor, formato: !!formato, contexto: false, cargo: false },
      { level: 4, descritor: !!descritor, formato: false,     contexto: false, cargo: false },
      { level: 5, descritor: false,       formato: false,     contexto: false, cargo: false },
    ];

    let resultados: any[] = [];
    let matchLevel: number | null = null;

    for (const t of tentativas) {
      let q = sb.from('micro_conteudos')
        .select('*')
        .eq('ativo', true)
        .eq('competencia', competencia)
        .lte('nivel_min', nivel)
        .gte('nivel_max', nivel);

      if (t.descritor) q = q.eq('descritor', descritor!);
      if (t.formato) q = q.eq('formato', formato!);
      if (t.contexto) q = q.eq('contexto', contexto);
      if (t.cargo) q = q.eq('cargo', cargo);

      // Multi-tenant: empresa específica + global (NULL)
      if (empresaId) {
        q = q.or(`empresa_id.eq.${empresaId},empresa_id.is.null`);
      } else {
        q = q.is('empresa_id', null);
      }

      q = q.order('versao', { ascending: false })
           .order('taxa_conclusao', { ascending: false, nullsFirst: false })
           .limit(20);

      const { data, error } = await q;
      if (error) {
        console.error('[content/search] erro:', error.message);
        continue;
      }
      if (data && data.length > 0) {
        resultados = data;
        matchLevel = t.level;
        break;
      }
    }

    const core = resultados.filter((r: any) => r.tipo_conteudo === 'core').slice(0, 5);
    const complementar = resultados.filter((r: any) => r.tipo_conteudo === 'complementar').slice(0, 10);
    const formatosDisponiveis = [...new Set(resultados.map((r: any) => r.formato))];

    // Formato_core baseado na prioridade do colaborador
    let formatoCore: string | null = null;
    if (prioridade.length > 0) {
      formatoCore = prioridade.find(f => formatosDisponiveis.includes(f)) || null;
    } else if (formatosDisponiveis.length > 0) {
      formatoCore = formatosDisponiveis[0] as string;
    }

    return NextResponse.json({
      core,
      complementar,
      formatos_disponiveis: formatosDisponiveis,
      formato_core: formatoCore,
      match_level: matchLevel,
      total: resultados.length,
    });
  } catch (err: any) {
    console.error('[content/search]', err);
    return NextResponse.json({ error: err?.message || 'Erro' }, { status: 500 });
  }
}
