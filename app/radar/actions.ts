'use server';

import { createSupabaseAdmin } from '@/lib/supabase';

type SearchResult = {
  tipo: 'escola' | 'municipio';
  id: string;
  label: string;
  sub?: string;
};

export async function buscarEscolasMunicipios(termo: string): Promise<SearchResult[]> {
  const q = termo.trim();
  if (q.length < 2) return [];

  const sb = createSupabaseAdmin();
  const isInepLike = /^\d{6,8}$/.test(q);
  const isIbgeLike = /^\d{7}$/.test(q);

  // Busca exata por código primeiro (rápido)
  if (isInepLike || isIbgeLike) {
    const { data: escola } = await sb
      .from('diag_escolas')
      .select('codigo_inep, nome, municipio, uf, rede')
      .or(`codigo_inep.eq.${q},municipio_ibge.eq.${q}`)
      .limit(10);
    if (escola?.length) {
      return escola.map((e: any) => ({
        tipo: 'escola',
        id: e.codigo_inep,
        label: e.nome,
        sub: [e.rede, `${e.municipio}/${e.uf}`].filter(Boolean).join(' · '),
      }));
    }
  }

  // Busca por nome (escolas e municípios)
  const [escolas, municipios] = await Promise.all([
    sb.from('diag_escolas')
      .select('codigo_inep, nome, municipio, uf, rede')
      .ilike('nome', `%${q}%`)
      .limit(8),
    sb.from('diag_escolas')
      .select('municipio, municipio_ibge, uf')
      .ilike('municipio', `%${q}%`)
      .limit(20),
  ]);

  // Dedup municípios pelo IBGE
  const municipiosUnicos = new Map<string, { municipio: string; uf: string }>();
  for (const m of municipios.data || []) {
    if (!municipiosUnicos.has(m.municipio_ibge)) {
      municipiosUnicos.set(m.municipio_ibge, { municipio: m.municipio, uf: m.uf });
    }
  }

  const results: SearchResult[] = [];
  for (const [ibge, m] of municipiosUnicos) {
    if (results.length >= 5) break;
    results.push({
      tipo: 'municipio',
      id: ibge,
      label: m.municipio,
      sub: `${m.uf} · município`,
    });
  }
  for (const e of escolas.data || []) {
    if (results.length >= 12) break;
    results.push({
      tipo: 'escola',
      id: e.codigo_inep,
      label: e.nome,
      sub: [e.rede, `${e.municipio}/${e.uf}`].filter(Boolean).join(' · '),
    });
  }

  return results;
}
