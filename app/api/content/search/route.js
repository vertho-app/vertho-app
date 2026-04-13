import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';

/**
 * GET /api/content/search
 *
 * Busca micro-conteúdos por competência/descritor/nível, com fallback gradual:
 *  1. exato (competência + descritor + nível + formato + contexto + cargo)
 *  2. relaxa cargo (cargo='todos')
 *  3. relaxa contexto (contexto='generico')
 *  4. relaxa formato (qualquer formato)
 *  5. relaxa descritor (qualquer descritor da competência)
 *
 * Query params:
 *   - competencia (obrigatório)
 *   - descritor (opcional)
 *   - nivel (opcional, default 1.5) — busca conteúdo com nivel_min <= nivel <= nivel_max
 *   - formato (opcional) — video|audio|texto|case|pdf
 *   - contexto (opcional) — educacional|corporativo|generico
 *   - cargo (opcional)
 *   - empresa_id (opcional) — se passado, inclui conteúdo da empresa + global; senão só global
 *   - prioridade (opcional, csv) — ordem de formatos preferidos, ex: "audio,video,texto,case"
 *
 * Retorna:
 *   {
 *     core: [...],                     // melhores matches (top 5)
 *     complementar: [...],             // tipo_conteudo='complementar'
 *     formatos_disponiveis: [...],     // formatos únicos encontrados (para o switch)
 *     formato_core: 'video' | null,    // primeiro formato da prioridade que tem conteúdo
 *     match_level: 1..5                // nível de relaxamento usado
 *   }
 */
export async function GET(request) {
  try {
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

    const sb = createSupabaseAdmin();

    // Tentativas em cascata, da mais específica para a mais relaxada
    const tentativas = [
      { level: 1, descritor: !!descritor, formato: !!formato, contexto: true, cargo: true },
      { level: 2, descritor: !!descritor, formato: !!formato, contexto: true, cargo: false },
      { level: 3, descritor: !!descritor, formato: !!formato, contexto: false, cargo: false },
      { level: 4, descritor: !!descritor, formato: false,     contexto: false, cargo: false },
      { level: 5, descritor: false,       formato: false,     contexto: false, cargo: false },
    ];

    let resultados = [];
    let matchLevel = null;

    for (const t of tentativas) {
      let q = sb.from('micro_conteudos')
        .select('*')
        .eq('ativo', true)
        .eq('competencia', competencia)
        .lte('nivel_min', nivel)
        .gte('nivel_max', nivel);

      if (t.descritor) q = q.eq('descritor', descritor);
      if (t.formato) q = q.eq('formato', formato);
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

    const core = resultados.filter(r => r.tipo_conteudo === 'core').slice(0, 5);
    const complementar = resultados.filter(r => r.tipo_conteudo === 'complementar').slice(0, 10);
    const formatosDisponiveis = [...new Set(resultados.map(r => r.formato))];

    // Formato_core baseado na prioridade do colaborador
    let formatoCore = null;
    if (prioridade.length > 0) {
      formatoCore = prioridade.find(f => formatosDisponiveis.includes(f)) || null;
    } else if (formatosDisponiveis.length > 0) {
      formatoCore = formatosDisponiveis[0];
    }

    return NextResponse.json({
      core,
      complementar,
      formatos_disponiveis: formatosDisponiveis,
      formato_core: formatoCore,
      match_level: matchLevel,
      total: resultados.length,
    });
  } catch (err) {
    console.error('[content/search]', err);
    return NextResponse.json({ error: err?.message || 'Erro' }, { status: 500 });
  }
}
