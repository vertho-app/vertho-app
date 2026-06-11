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
    nivelMin: number;
    locale?: string;
    contexto_pedagogico?: string;
    empresaId?: string | null;
  },
): Promise<ModuloBaseEscolhido | null> {
  // 1) Resolver competencia_base_id pelo nome
  const { data: comps } = await sb.from('competencias_base')
    .select('id, nome')
    .ilike('nome', opts.competenciaNome)
    .limit(1);
  const competencia_base_id = comps?.[0]?.id;
  if (!competencia_base_id) return null;

  const { entrada, destino } = niveisDoNivelMin(opts.nivelMin);
  const locale = (opts.locale || 'pt-BR') as string;

  // 2) Tenta no locale solicitado; se vazio, faz fallback pra pt-BR.
  //    Alcance: módulos GLOBAIS (empresa_id NULL) + os EXCLUSIVOS do tenant
  //    (empresa_id = empresaId), quando um tenant é informado. Sem tenant,
  //    só globais (mantém o comportamento anterior).
  async function buscar(loc: string) {
    let q = sb.from('modulos_base_conteudo')
      .select('id, grupo_id, locale, preferido, contexto_pedagogico, tags, published_at, empresa_id, conteudo_central, conteudo_aplicavel, guarda_corpos, adaptacao_por_formato')
      .eq('competencia_base_id', competencia_base_id)
      .eq('nivel_entrada', entrada)
      .eq('nivel_destino', destino)
      .eq('locale', loc)
      .eq('status', 'publicado');
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

  // 3) Ordenar: do-tenant > preferido > contexto match > tag match > recência.
  //    O módulo exclusivo da empresa vence o global na mesma transição.
  candidatos.sort((a: any, b: any) => {
    const aEmp = a.empresa_id ? 1 : 0;
    const bEmp = b.empresa_id ? 1 : 0;
    if (aEmp !== bEmp) return bEmp - aEmp;
    if (a.preferido !== b.preferido) return a.preferido ? -1 : 1;
    const aCtx = opts.contexto_pedagogico && a.contexto_pedagogico === opts.contexto_pedagogico ? 1 : 0;
    const bCtx = opts.contexto_pedagogico && b.contexto_pedagogico === opts.contexto_pedagogico ? 1 : 0;
    if (aCtx !== bCtx) return bCtx - aCtx;
    const aTags = Array.isArray(a.tags) ? a.tags.length : 0;
    const bTags = Array.isArray(b.tags) ? b.tags.length : 0;
    if (aTags !== bTags) return bTags - aTags;
    return new Date(b.published_at || 0).getTime() - new Date(a.published_at || 0).getTime();
  });

  const escolhido = candidatos[0];
  const criterio = [
    escolhido.empresa_id && 'exclusivo-do-tenant',
    escolhido.preferido && 'preferido',
    escolhido.contexto_pedagogico === opts.contexto_pedagogico && 'contexto-match',
    usouFallbackLocale && `fallback-locale(${locale}→pt-BR)`,
    candidatos.length > 1 && `desempate-em-${candidatos.length}`,
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
