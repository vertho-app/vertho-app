/**
 * Seleção de micro-conteúdos relacionados a um tema (competência/descritor/nível)
 * — a MESMA lógica de cascata do "Saiba mais" da trilha e do `/api/content/search`.
 *
 * Extraído para uma lib única para que a rota de busca E os assistentes (Beto,
 * Tira-Dúvidas) usem o mesmo critério de "o que é conteúdo relacionado" — sem dois
 * conceitos divergentes de relevância. Seleção ESTRUTURAL (competência + descritor
 * + cargo + nível), não semântica: `micro_conteudos` não tem embedding.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export interface ConteudoRelacionado {
  id: string;
  titulo: string;
  descricao: string | null;
  formato: string;
  url: string | null;
  tipo_conteudo: string | null;
  competencia: string | null;
  descritor: string | null;
  duracao_min: number | null;
}

export interface BuscaConteudos {
  competencia: string;
  descritor?: string | null;
  nivel?: number;
  formato?: string | null;
  contexto?: string;
  cargo?: string;
  empresaId?: string | null;
  /** IDs a excluir (ex.: o conteúdo já consumido na semana → sugere OUTROS). */
  excluirIds?: string[];
}

export interface ResultadoConteudos {
  core: ConteudoRelacionado[];
  complementar: ConteudoRelacionado[];
  formatosDisponiveis: string[];
  matchLevel: number | null;
  total: number;
}

/**
 * Busca em cascata: da tentativa mais específica (descritor+formato+contexto+cargo)
 * à mais relaxada (só competência+nível). Para na primeira que retorna algo.
 */
export async function buscarConteudosRelacionados(
  sb: SupabaseClient,
  opts: BuscaConteudos,
): Promise<ResultadoConteudos> {
  const { competencia } = opts;
  const descritor = opts.descritor || null;
  const nivel = opts.nivel ?? 1.5;
  const formato = opts.formato || null;
  const contexto = opts.contexto || 'generico';
  const cargo = opts.cargo || 'todos';
  const empresaId = opts.empresaId || null;
  const excluir = new Set(opts.excluirIds || []);

  const tentativas = [
    { level: 1, descritor: !!descritor, formato: !!formato, contexto: true, cargo: true },
    { level: 2, descritor: !!descritor, formato: !!formato, contexto: true, cargo: false },
    { level: 3, descritor: !!descritor, formato: !!formato, contexto: false, cargo: false },
    { level: 4, descritor: !!descritor, formato: false, contexto: false, cargo: false },
    { level: 5, descritor: false, formato: false, contexto: false, cargo: false },
  ];

  let resultados: any[] = [];
  let matchLevel: number | null = null;

  for (const t of tentativas) {
    // select('*') preserva o payload do /api/content/search (consumidores leem
    // campos além dos formatados aqui — bunny_video_id, storage_path, etc.).
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

    if (empresaId) q = q.or(`empresa_id.eq.${empresaId},empresa_id.is.null`);
    else q = q.is('empresa_id', null);

    q = q.order('versao', { ascending: false })
      .order('taxa_conclusao', { ascending: false, nullsFirst: false })
      .limit(20);

    const { data, error } = await q;
    if (error) { console.warn('[conteudos-relacionados]', error.message); continue; }
    const filtrados = (data || []).filter((r: any) => !excluir.has(r.id));
    if (filtrados.length) { resultados = filtrados; matchLevel = t.level; break; }
  }

  return {
    core: resultados.filter((r) => r.tipo_conteudo === 'core').slice(0, 5),
    complementar: resultados.filter((r) => r.tipo_conteudo === 'complementar').slice(0, 10),
    formatosDisponiveis: [...new Set(resultados.map((r) => r.formato))],
    matchLevel,
    total: resultados.length,
  };
}

/**
 * Bloco de prompt "Saiba mais disponível" para os assistentes. Lista curta e
 * factual — o assistente OFERECE estes quando o colaborador pedir mais conteúdo
 * sobre o tema, e é instruído a NÃO inventar fora desta lista. '' se vazio.
 */
export function formatConteudosRelacionadosBloco(res: ResultadoConteudos, limite = 6): string {
  const itens = [...res.core, ...res.complementar].slice(0, limite);
  if (!itens.length) return '';
  const linhas = itens.map((c) => {
    const dur = c.duracao_min ? ` (~${c.duracao_min}min)` : '';
    const desc = c.descricao ? ` — ${c.descricao.slice(0, 90)}` : '';
    return `- [${c.formato}] ${c.titulo}${dur}${desc}${c.url ? ` · ${c.url}` : ''}`;
  });
  return `SAIBA MAIS — outros conteúdos disponíveis sobre este tema (competência/descritor):
${linhas.join('\n')}

REGRA: quando o colaborador pedir "mais conteúdos", "outras sugestões" ou "onde aprender mais" sobre este tema, ofereça DESTES itens (título + formato + link). NÃO invente conteúdos fora desta lista. Se a lista estiver vazia ou não couber, diga que não há outras sugestões catalogadas para este tema.`;
}
