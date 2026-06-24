/**
 * Integração engine ↔ Módulos-Base de Conteúdo (frente 3).
 *
 * - Converte nivelMin (float 1.0-4.0 do engine) para a transição N→N esperada
 *   pelos módulos.
 * - Resolve qual módulo-base publicado usar, com critério: locale → preferido →
 *   contexto pedagógico → tags → recência (published_at).
 * - Enriquece o par {system, user} de qualquer prompt com seções canônicas
 *   (ideia, princípios, guarda-corpos, repertório, exemplos, boas práticas).
 * - Backward-compatible: sem módulo, retorna o prompt inalterado.
 *
 * Spec: docs/MODULOS-BASE-CONTEUDO.md.
 */

import { embedQuery } from '@/lib/embeddings';

type Nivel = 'N1' | 'N2' | 'N3' | 'N4';

export interface ModuloBaseEscolhido {
  modulo: any;
  criterio: string;
}

/** Map do nivelMin (float) da engine pra transição (entrada, destino). */
export function niveisDoNivelMin(nivelMin: number): { entrada: Nivel; destino: Nivel } {
  if (nivelMin <= 1.5) return { entrada: 'N1', destino: 'N2' };
  if (nivelMin <= 2.5) return { entrada: 'N2', destino: 'N3' };
  return { entrada: 'N3', destino: 'N4' };
}

/** Map do formato do engine pra chave de `adaptacao_por_formato` no módulo. */
export function formatoAdaptacao(formatoEngine: string): 'texto' | 'podcast_roteiro' | 'video_roteiro' | null {
  if (formatoEngine === 'texto') return 'texto';
  if (formatoEngine === 'audio') return 'podcast_roteiro';
  if (formatoEngine === 'video') return 'video_roteiro';
  return null;
}

/**
 * Resolve o módulo-base publicado pra um conteúdo a ser gerado.
 *
 * @param sb Cliente Supabase (admin/service-role; mesma conexão do caller).
 * @param opts Critérios de busca.
 * @returns Módulo escolhido + critério, ou null se nenhum publicado.
 */
export async function resolverModuloBaseParaConteudo(
  sb: any,
  opts: {
    competenciaNome: string;
    descritor?: string;
    nivelMin: number;
    locale?: string;
    contexto_pedagogico?: string;
    cargo?: string;
    empresaId?: string | null;
  },
): Promise<ModuloBaseEscolhido | null> {
  // 1) Resolver a competência pelo NOME — no catálogo canônico (competencia_base_id)
  //    E no modelo da EMPRESA (competencia_id). Empresas como Macaé têm pilares
  //    próprios (Empreendedorismo) fora do canônico; os módulos extraídos no escopo
  //    da empresa apontam para competencia_id. Casa por qualquer um dos dois.
  const { data: comps } = await sb.from('competencias_base')
    .select('id').ilike('nome', opts.competenciaNome).limit(1);
  const competencia_base_id = comps?.[0]?.id || null;

  let competencia_id: string | null = null;
  if (opts.empresaId) {
    const { data: ec } = await sb.from('competencias')
      .select('id').eq('empresa_id', opts.empresaId).ilike('nome', opts.competenciaNome).limit(1);
    competencia_id = ec?.[0]?.id || null;
  }
  if (!competencia_base_id && !competencia_id) return null;

  const { entrada, destino } = niveisDoNivelMin(opts.nivelMin);
  const locale = (opts.locale || 'pt-BR') as string;

  // 2) Tenta no locale solicitado; se vazio, faz fallback pra pt-BR.
  //    Alcance: módulos GLOBAIS (empresa_id NULL) + os EXCLUSIVOS do tenant
  //    (empresa_id = empresaId), quando um tenant é informado. Sem tenant,
  //    só globais (mantém o comportamento anterior).
  async function buscar(loc: string) {
    let q = sb.from('modulos_base_conteudo')
      .select('id, grupo_id, locale, preferido, contexto_pedagogico, tags, published_at, empresa_id, descritor, titulo, auditoria_ia, descritor_embedding, conteudo_central, conteudo_aplicavel, guarda_corpos, adaptacao_por_formato')
      .eq('nivel_entrada', entrada)
      .eq('nivel_destino', destino)
      .eq('locale', loc)
      .eq('status', 'publicado');
    // Competência: canônica (competencia_base_id) OU da empresa (competencia_id).
    const compOr = [
      competencia_base_id ? `competencia_base_id.eq.${competencia_base_id}` : null,
      competencia_id ? `competencia_id.eq.${competencia_id}` : null,
    ].filter(Boolean).join(',');
    q = q.or(compOr);
    q = opts.empresaId ? q.or(`empresa_id.is.null,empresa_id.eq.${opts.empresaId}`) : q.is('empresa_id', null);
    const { data } = await q;
    return data || [];
  }
  let candidatos = await buscar(locale);
  let usouFallbackLocale = false;
  if (candidatos.length === 0 && locale !== 'pt-BR') {
    candidatos = await buscar('pt-BR');
    usouFallbackLocale = true;
  }
  if (candidatos.length === 0) return null;

  // 3) Escolha INTELIGENTE por SCORE ponderado. Sinais (do mais forte ao mais fraco):
  //    - RELEVÂNCIA ao descritor da semana: SEMÂNTICA (embedding/cosseno — pega
  //      paráfrase e sinônimo) quando há embedding; senão overlap de tokens.
  //    - EXCLUSIVO do tenant · QUALIDADE (nota da auditoria) · PREFERIDO (empurrão).
  //    - FIT POR CARGO (via contexto pedagógico) · ANTI-REPETIÇÃO (não reusar sempre
  //      o mesmo módulo nesta competência) · contexto/tags/recência.
  const STOP = new Set(['para', 'como', 'sobre', 'mais', 'pela', 'pelo', 'entre', 'isso', 'esta', 'este', 'essa', 'esse', 'dos', 'das', 'com', 'sem', 'que']);
  const norm = (s: string) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const toks = (s: string) => new Set(norm(s).split(/[^a-z0-9]+/g).filter((t) => t.length >= 4 && !STOP.has(t)));
  const wantTok = toks(opts.descritor || '');
  const wantNorm = norm(opts.descritor || '');

  // Embedding da semana (semântico). Sem provider/descritor → cai p/ tokens.
  let queryVec: number[] | null = null;
  if (opts.descritor) { try { queryVec = (await embedQuery(opts.descritor))?.vector || null; } catch { queryVec = null; } }
  const parseEmb = (v: any): number[] | null => {
    if (!v) return null;
    if (Array.isArray(v)) return v;
    try { const a = JSON.parse(v); return Array.isArray(a) ? a : null; } catch { return null; }
  };
  const cosine = (a: number[], b: number[]): number => {
    let d = 0, na = 0, nb = 0; const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
    return (na && nb) ? d / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
  };

  // Anti-repetição: módulos JÁ usados p/ gerar conteúdo desta competência (varia o material).
  const jaUsados = new Set<string>();
  try {
    let uq = sb.from('micro_conteudos').select('modulo_base_id').eq('competencia', opts.competenciaNome).not('modulo_base_id', 'is', null).limit(500);
    if (opts.empresaId) uq = uq.or(`empresa_id.is.null,empresa_id.eq.${opts.empresaId}`);
    const { data: usados } = await uq;
    for (const u of usados || []) if (u.modulo_base_id) jaUsados.add(u.modulo_base_id);
  } catch { /* best-effort */ }

  const relCache = new Map<string, number>();
  const semanticoCache = new Map<string, boolean>();
  const relevancia = (m: any): number => {
    if (relCache.has(m.id)) return relCache.get(m.id)!;
    let r = 0; let semantico = false;
    const emb = parseEmb(m.descritor_embedding);
    if (queryVec && emb) { r = Math.max(0, cosine(queryVec, emb)); semantico = true; }
    else if (wantTok.size) {
      const have = toks(`${m.descritor || ''} ${m.titulo || ''}`);
      let hit = 0; for (const t of wantTok) if (have.has(t)) hit++;
      const overlap = Math.min(1, hit / wantTok.size);
      const exato = wantNorm && norm(m.descritor) === wantNorm ? 1 : 0;
      r = Math.min(1, overlap * 0.85 + exato * 0.15);
    }
    relCache.set(m.id, r); semanticoCache.set(m.id, semantico); return r;
  };
  const nota = (m: any): number => {
    const n = Number(m?.auditoria_ia?.nota);
    return Number.isFinite(n) ? Math.max(0, Math.min(10, n)) : 6;
  };
  const cargoNorm = norm(opts.cargo || '');
  const cargoFit = (m: any): number => {
    if (!cargoNorm || !m.contexto_pedagogico) return 0;
    const ctx = norm(m.contexto_pedagogico);
    return ctx && (ctx.includes(cargoNorm) || cargoNorm.includes(ctx)) ? 1 : 0;
  };
  const score = (m: any): number =>
    100 * relevancia(m)                                                              // descritor (semântico)
    + 30 * (m.empresa_id ? 1 : 0)                                                     // exclusivo do tenant
    + 22 * (nota(m) / 10)                                                             // qualidade (auditoria)
    + 10 * (m.preferido ? 1 : 0)                                                      // preferido = empurrão
    + 6 * (opts.contexto_pedagogico && m.contexto_pedagogico === opts.contexto_pedagogico ? 1 : 0)
    + 5 * cargoFit(m)                                                                 // fit por cargo (via contexto)
    - 25 * (jaUsados.has(m.id) ? 1 : 0)                                               // anti-repetição (penalidade leve)
    + 2 * Math.min(1, (Array.isArray(m.tags) ? m.tags.length : 0) / 3);

  candidatos.sort((a: any, b: any) =>
    score(b) - score(a) || new Date(b.published_at || 0).getTime() - new Date(a.published_at || 0).getTime());

  const escolhido = candidatos[0];
  const rel = relevancia(escolhido);
  const sem = semanticoCache.get(escolhido.id) ? 'semântico' : 'tokens';
  const criterio = [
    rel >= 0.55 ? `descritor-${sem}(${rel.toFixed(2)})` : rel > 0 ? `descritor-parcial-${sem}(${rel.toFixed(2)})` : null,
    escolhido.empresa_id && 'exclusivo-do-tenant',
    `nota(${nota(escolhido).toFixed(1)})`,
    escolhido.preferido && 'preferido',
    cargoFit(escolhido) && 'cargo-fit',
    jaUsados.has(escolhido.id) && 'reuso(penalizado)',
    usouFallbackLocale && `fallback-locale(${locale}→pt-BR)`,
    candidatos.length > 1 && `entre-${candidatos.length}`,
  ].filter(Boolean).join(' · ') || 'unico-candidato';

  return { modulo: escolhido, criterio };
}

// ── Enricher (síncrono) ─────────────────────────────────────────────────────

function fmtPrincipios(principios: any[]): string {
  if (!Array.isArray(principios) || !principios.length) return '';
  return principios.map((p: any) => `- ${p.nome}: ${p.explicacao}${p.implicacao_pratica ? ` (implicação: ${p.implicacao_pratica})` : ''}`).join('\n');
}

function fmtLista(arr: any, limite = 5): string {
  if (!Array.isArray(arr) || !arr.length) return '—';
  return arr.slice(0, limite).map((x: any) => `"${String(x).trim()}"`).join(' · ');
}

function fmtSituacoes(arr: any[]): string {
  if (!Array.isArray(arr) || !arr.length) return '';
  return arr.slice(0, 4).map((s: any) =>
    `- ${s.contexto || '—'}: desafio=${s.desafio || '—'}; boa abordagem=${s.boa_abordagem || '—'}`
  ).join('\n');
}

function fmtBoasPraticas(arr: any[]): string {
  if (!Array.isArray(arr) || !arr.length) return '';
  return arr.slice(0, 4).map((b: any) => `- ${b.o_que_fazer}: ${b.como_aplicar || b.por_que || ''}`).join('\n');
}

/**
 * Enriquece system + user com seções canônicas do módulo-base.
 *
 * SYSTEM ganha: ideia, princípios, guarda-corpos, adaptação de formato.
 * USER ganha: exemplos, repertório, situações, boas práticas.
 */
export function enriquecerPromptComModuloBase(
  prompt: { system: string; user: string },
  modulo: any,
  formatoEngine: string,
): { system: string; user: string } {
  const cc = modulo.conteudo_central || {};
  const ca = modulo.conteudo_aplicavel || {};
  const gc = modulo.guarda_corpos || {};
  const ap = modulo.adaptacao_por_formato || {};

  const formatoKey = formatoAdaptacao(formatoEngine);
  const adaptFormato = formatoKey && ap[formatoKey] ? String(ap[formatoKey]).trim() : '';

  const systemAdd = [
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    'MÓDULO-BASE DE CONTEÚDO (matéria-prima canônica — preserve as bases):',
    '',
    cc.ideia_principal ? `IDEIA PRINCIPAL:\n${String(cc.ideia_principal).trim()}` : '',
    '',
    fmtPrincipios(cc.principios) ? `PRINCÍPIOS DO TEMA (preserve em qualquer geração):\n${fmtPrincipios(cc.principios)}` : '',
    '',
    'GUARDA-CORPOS:',
    Array.isArray(gc.preservar) && gc.preservar.length ? `- PRESERVAR: ${gc.preservar.map((s: any) => `"${s}"`).join(' · ')}` : '',
    Array.isArray(gc.evitar) && gc.evitar.length ? `- NUNCA: ${gc.evitar.map((s: any) => `"${s}"`).join(' · ')}` : '',
    Array.isArray(gc.cuidados_eticos) && gc.cuidados_eticos.length ? `- CUIDADOS ÉTICOS: ${gc.cuidados_eticos.map((s: any) => `"${s}"`).join(' · ')}` : '',
    Array.isArray(gc.cuidados_linguagem) && gc.cuidados_linguagem.length ? `- CUIDADOS DE LINGUAGEM: ${gc.cuidados_linguagem.map((s: any) => `"${s}"`).join(' · ')}` : '',
    '',
    adaptFormato ? `ADAPTAÇÃO PARA ESTE FORMATO (${formatoKey}):\n${adaptFormato}` : '',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
  ].filter(Boolean).join('\n');

  const ex = ca.exemplos_universais || {};
  const rl = ca.repertorio_linguagem || {};

  const userAdd = [
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    'REPERTÓRIO E EXEMPLOS CANÔNICOS (use como matéria-prima — adapte ao cargo/contexto):',
    '',
    ex.simples || ex.intermediario || ex.complexo || ex.aplicacao_adequada || ex.aplicacao_inadequada ? 'EXEMPLOS UNIVERSAIS:' : '',
    ex.simples ? `- Simples: ${ex.simples}` : '',
    ex.intermediario ? `- Intermediário: ${ex.intermediario}` : '',
    ex.complexo ? `- Complexo: ${ex.complexo}` : '',
    ex.aplicacao_adequada ? `- Aplicação ADEQUADA (mire este): ${ex.aplicacao_adequada}` : '',
    ex.aplicacao_inadequada ? `- Aplicação INADEQUADA (EVITE este padrão): ${ex.aplicacao_inadequada}` : '',
    '',
    'REPERTÓRIO DE LINGUAGEM:',
    Array.isArray(rl.frases_uteis) && rl.frases_uteis.length ? `- Frases úteis: ${fmtLista(rl.frases_uteis)}` : '',
    Array.isArray(rl.perguntas_poderosas) && rl.perguntas_poderosas.length ? `- Perguntas poderosas: ${fmtLista(rl.perguntas_poderosas)}` : '',
    Array.isArray(rl.abertura) && rl.abertura.length ? `- Abertura: ${fmtLista(rl.abertura, 3)}` : '',
    Array.isArray(rl.conducao_situacao_dificil) && rl.conducao_situacao_dificil.length ? `- Condução de situação difícil: ${fmtLista(rl.conducao_situacao_dificil, 3)}` : '',
    Array.isArray(rl.fechamento_com_compromisso) && rl.fechamento_com_compromisso.length ? `- Fechamento com compromisso: ${fmtLista(rl.fechamento_com_compromisso, 3)}` : '',
    Array.isArray(rl.frases_a_evitar) && rl.frases_a_evitar.length ? `- EVITE estas frases: ${fmtLista(rl.frases_a_evitar)}` : '',
    '',
    fmtBoasPraticas(ca.boas_praticas) ? `BOAS PRÁTICAS:\n${fmtBoasPraticas(ca.boas_praticas)}` : '',
    '',
    fmtSituacoes(ca.situacoes_tipicas) ? `SITUAÇÕES TÍPICAS (inspiração de cenário):\n${fmtSituacoes(ca.situacoes_tipicas)}` : '',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
  ].filter(Boolean).join('\n');

  return {
    system: `${prompt.system}\n${systemAdd}`,
    user: `${prompt.user}\n${userAdd}`,
  };
}
