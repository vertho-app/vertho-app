'use server';

import { requireAdminSupabase } from '@/lib/admin-supabase';
import { logAdminAction } from '@/lib/audit';
import { requireAdminAction } from '@/lib/auth/action-context';
import { isInternalEmail } from '@/lib/internal-emails';
import { enriquecerLote as enriquecerLoteNucleo, montarPlano, type PlanoEnriquecimento, type ResultadoLote } from '@/lib/mercado-potencial/enriquecimento/lote';
import { carregarSupressao, contatosParaExportacao, suprimirEmail } from '@/lib/mercado-potencial/enriquecimento/persistencia';
import { LIMITE_EXPORTACAO, TAMANHO_MAXIMO_BYTES, montarPlanilhaMercado, type VisaoMercado } from '@/lib/mercado-potencial/exportar-xlsx';
import { lerTudoPaginado } from '@/lib/paginacao';
import {
  GESTORES_NA_ESCOLA, GESTORES_NA_MV, corteDeMinimo, limiteDaConsulta, municipiosDasRegioes, orDeCidades,
  resumoDaLeitura, termosDeCidade, type ColunaGestores,
} from '@/lib/mercado-potencial/filtros';
import { linhaDeEscola, linhaDeMunicipio, linhaDeRede } from '@/lib/mercado-potencial/linhas';
import {
  contagemConfere, lerLinhasOrdenadas, normalizarOrdem, ordemConfere, ordenarLinhas,
} from '@/lib/mercado-potencial/ordem-global';
import { lerSomasDoFiltro, totaisDaLeitura, type OpcoesDaLeitura, type VisaoDoFiltro } from '@/lib/mercado-potencial/totais';
import { escaparLike } from '@/lib/sql-like';

/**
 * Mercado potencial — uso interno comercial.
 *
 * 3 endpoints (município, rede, escola) puxam das MVs criadas na migration 093.
 * Saeb / Ideb / VAAR / ENEM JOIN em runtime das MVs existentes do Radar.
 *
 * TAM = (professores + gestores) × preço/mês (configurável pelo user).
 * Score = TAM × fit_pedagogico × fit_financeiro (cada um 0-1).
 *   fit_pedagogico = 0.5 + 0.5 × (% sem pós + % recém-formados) / 2
 *   fit_financeiro pública = 0.5 + 0.5 × (1 - INSE_norm) — INSE 6 = mais pobre = mais demanda
 *   fit_financeiro privada = 0.5 + 0.5 × INSE_norm — INSE 1 = mais rica = mais bolso
 *
 * Sinais opcionais (NULL quando ausente, não afetam score base):
 *   pública  → saeb_proficiencia, ideb_meta_atingida, vaar_aluno
 *   privada  → enem_media, saresp_proficiencia (SP)
 */

export interface MercadoFilters {
  uf?: string[];                          // multi-UF (vazio = todas)
  regioesMetropolitanas?: string[];       // ids IBGE de RM/RIDE (lib/mercado-potencial/regioes-metropolitanas); união dos municípios
  redes?: string[];                       // MUNICIPAL/ESTADUAL/FEDERAL/PRIVADA (vazio = todas)
  municipioBusca?: string;                // nome(s) do município (ilike); várias separadas por vírgula = OU
  inseMin?: number;                       // 1-6 (NULL passa)
  inseMax?: number;
  professoresMin?: number;                // nº MÍNIMO de professores (total, >=) da linha
  gestoresMin?: number;                   // nº MÍNIMO de gestores (>=) da linha
  precoProf?: number;                     // R$/mês por professor (default 300)
  precoGestor?: number;                   // R$/mês por gestor (default 500)
  idadeOnboarding?: number;               // corte recém-formados (default 29)
  orderBy?: string;                       // coluna pra ordenar
  orderDir?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

interface MercadoRowBase {
  id: string;                             // municipio_ibge | rede pk | codigo_inep
  nome: string;
  uf: string;
  rede?: string;                          // só nas tabs rede e escola
  inse_medio: number | null;
  qt_escolas: number;
  qt_professores: number;
  qt_docs_jovens: number;
  qt_docs_pos: number;
  qt_gestores: number;
  pct_sem_pos: number;                    // 0-1
  pct_jovens: number;                     // 0-1
  tam_mensal_mentor_ia: number;
  tam_mensal_onboarding: number;
  fit_pedagogico: number;                 // 0-1
  fit_financeiro: number | null;
  score_base: number;                     // TAM_total × fit_pedagogico (quando INSE NULL)
  score_completo: number | null;          // TAM_total × fit_pedagogico × fit_financeiro
}

// ── Scoring helpers ─────────────────────────────────────────────────────────

/**
 * Aplica filtros UF + INSE + busca de cidade na query.
 * INSE: a MV de município/rede tem `inse_medio` (AVG agregado); a MV de escola
 * tem `inse_grupo` (valor original 1-6). Caller passa o nome da coluna.
 */
function aplicarFiltrosBase(
  query: any,
  filtros: MercadoFilters,
  inseCol: 'inse_medio' | 'inse_grupo' | 'inse_efetivo' = 'inse_medio',
  gestores: ColunaGestores = GESTORES_NA_MV,
) {
  if (filtros.uf?.length) query = query.in('uf', filtros.uf);
  // Região metropolitana: a união dos municípios das regiões escolhidas. As 3 MVs
  // têm `municipio_ibge`, e o filtro soma (AND) com UF, cidade e o resto.
  const municipiosRm = municipiosDasRegioes(filtros.regioesMetropolitanas);
  if (municipiosRm) query = query.in('municipio_ibge', municipiosRm);
  if (filtros.inseMin != null) query = query.gte(inseCol, filtros.inseMin);
  if (filtros.inseMax != null) query = query.lte(inseCol, filtros.inseMax);
  // Mínimos de professores e de gestores vão ao BANCO (antes do `limit`):
  // filtrar depois, no JS, cortaria o mínimo sobre as N primeiras linhas e
  // esconderia o resto. As 3 MVs têm `qt_professores`; onde fica o "gestores"
  // muda por visão (ver `GESTORES_NA_ESCOLA`). Valor do cliente: `corteDeMinimo`.
  const profsMin = corteDeMinimo(filtros.professoresMin);
  if (profsMin != null) query = query.gte('qt_professores', profsMin);
  const gestMin = corteDeMinimo(filtros.gestoresMin);
  if (gestMin != null) query = query.gte(gestores.coluna, gestMin - gestores.diretorProxy);
  // Cidades: uma ou várias separadas por vírgula ("campinas, salvador").
  // ilike é case-insensitive; unaccent ficaria melhor, mas o índice gin trgm
  // em diag_escolas não está nas MVs — usar ilike simples.
  const cidades = termosDeCidade(filtros.municipioBusca);
  if (cidades.length === 1) query = query.ilike('municipio', `%${escaparLike(cidades[0])}%`);
  else if (cidades.length > 1) query = query.or(orDeCidades(cidades));
  return query;
}

interface ConsultaDaVisao {
  tabela: string;
  colunas: string;
  /** Chave única da MV, na ordem: é a ordem da leitura em páginas e o desempate do sort. */
  chaves: string[];
  /** `aplicarFiltrosBase` + o que mais a visão filtra (redes). */
  filtrar: (q: any) => any;
}

/**
 * Lê as linhas de uma visão. Caminho normal: as N primeiras do FILTRO INTEIRO na ordem da
 * tela, ordenadas no banco (mig 293), com a contagem conferida pelo PostgREST (o filtro do SQL
 * tem que ser o deste arquivo). Se o RPC falhar ou a contagem não bater, lê em PÁGINAS pela
 * chave (o PostgREST corta cada consulta em 1.000 linhas sem avisar) e a ordem só vale entre
 * as linhas lidas. Os cartões somam o filtro inteiro no banco, em paralelo.
 */
async function lerVisao(sb: any, visao: VisaoDoFiltro, filtros: MercadoFilters, limit: number, opcoes: OpcoesDaLeitura, consulta: ConsultaDaVisao) {
  const ordem = normalizarOrdem(filtros);
  const [ordenadas, somas] = await Promise.all([
    lerLinhasOrdenadas(sb, visao, filtros, ordem, limit),
    lerSomasDoFiltro(sb, visao, filtros, opcoes),
  ]);
  if (ordenadas) {
    const { count, error } = await consulta.filtrar(sb.from(consulta.tabela).select(consulta.chaves[0], { count: 'exact', head: true }));
    if (contagemConfere(visao, ordenadas.total, count ?? null, error?.message)) {
      return { ordem, somas, data: ordenadas.linhas, total: ordenadas.total, doBanco: true };
    }
  }
  const r = await lerTudoPaginado((de, ate) => {
    let q = consulta.filtrar(sb.from(consulta.tabela).select(consulta.colunas, de === 0 ? { count: 'exact' } : undefined));
    for (const chave of consulta.chaves) q = q.order(chave);
    return q.range(de, ate);
  }, { max: limit });
  return { ordem, somas, data: r.data, total: r.total, error: r.error, doBanco: false };
}

/**
 * Ordena e monta a resposta. `ordemGlobal`: a tabela traz as N primeiras do filtro inteiro na
 * ordem pedida. Vale quando a ordem veio do banco e bate com os valores do TS, ou quando a
 * leitura por chave não cortou nada.
 */
function fecharLeitura(visao: VisaoDoFiltro, rows: any[], leitura: Awaited<ReturnType<typeof lerVisao>>, limit: number, filtros: MercadoFilters) {
  const resumo = resumoDaLeitura(rows.length, leitura.total, limit);
  const ordemGlobal = leitura.doBanco ? ordemConfere(rows, leitura.ordem, visao) : !resumo.truncado;
  return {
    ok: true as const,
    rows: ordenarLinhas(rows, leitura.ordem),
    ...resumo,
    totais: totaisDaLeitura(visao, leitura.somas, leitura.total, filtros),
    ordemGlobal,
  };
}

// ── 1. Lista por município ──────────────────────────────────────────────────

export async function loadMercadoMunicipios(filtros: MercadoFilters = {}, opcoes: OpcoesDaLeitura = {}) {
  await requireAdminAction();
  const sb = await requireAdminSupabase();
  // ~5.570 municípios no Brasil — default cobre o universo inteiro.
  const limit = limiteDaConsulta(filtros.limit, 6000, 10000);

  const leitura = await lerVisao(sb, 'municipio', filtros, limit, opcoes, {
    tabela: 'diag_mv_mercado_municipio',
    colunas: 'municipio_ibge, municipio, uf, microrregiao, qt_escolas, qt_escolas_municipal, qt_escolas_estadual, qt_escolas_federal, qt_escolas_privada, qt_professores, qt_docs_0_24, qt_docs_jovens, qt_docs_pos, qt_gestores, inse_medio, pct_inse_oficial, score_conectividade',
    chaves: ['municipio_ibge'],
    filtrar: (q) => aplicarFiltrosBase(q, filtros),
  });
  if (leitura.error) return { error: leitura.error };

  const rows = (leitura.data || []).map((r: any) => linhaDeMunicipio(r, filtros));

  return fecharLeitura('municipio', rows, leitura, limit, filtros);
}

// ── 2. Lista por rede (município × rede) ────────────────────────────────────

export async function loadMercadoRedes(filtros: MercadoFilters = {}, opcoes: OpcoesDaLeitura = {}) {
  await requireAdminAction();
  const sb = await requireAdminSupabase();
  // (5.570 municípios × 4 redes) = ~22k combinações no pior caso — default
  // 8000 cobre maioria; use filtros pra reduzir mais.
  const limit = limiteDaConsulta(filtros.limit, 8000, 25000);

  const leitura = await lerVisao(sb, 'rede', filtros, limit, opcoes, {
    tabela: 'diag_mv_mercado_rede',
    colunas: 'municipio_ibge, municipio, uf, rede, qt_escolas, qt_professores, qt_docs_0_24, qt_docs_jovens, qt_docs_pos, qt_gestores, inse_medio, pct_inse_oficial',
    chaves: ['municipio_ibge', 'rede'],
    filtrar: (q) => {
      q = aplicarFiltrosBase(q, filtros);
      return filtros.redes?.length ? q.in('rede', filtros.redes) : q;
    },
  });
  if (leitura.error) return { error: leitura.error };

  const rows = (leitura.data || []).map((r: any) => linhaDeRede(r, filtros));

  return fecharLeitura('rede', rows, leitura, limit, filtros);
}

// ── 3. Lista por escola ─────────────────────────────────────────────────────

export async function loadMercadoEscolas(filtros: MercadoFilters = {}, opcoes: OpcoesDaLeitura = {}) {
  await requireAdminAction();
  const sb = await requireAdminSupabase();
  // ~180k escolas no Brasil — default conservador 1000, force user a filtrar
  // por UF/rede/INSE pra ver mais. Cap 10000 protege o browser. A ordem e os
  // cartões cobrem o filtro inteiro no banco, sem esse teto.
  const limit = limiteDaConsulta(filtros.limit, 1000, 10000);

  const leitura = await lerVisao(sb, 'escola', filtros, limit, opcoes, {
    tabela: 'diag_mv_mercado_escola',
    colunas: 'codigo_inep, nome, municipio, municipio_ibge, uf, rede, inse_grupo, inse_efetivo, inse_fonte, etapas, qt_professores, qt_doc_0_24, qt_docs_jovens, qt_docs_pos, qt_coord_pedag, qt_diretor_proxy, score_conectividade',
    chaves: ['codigo_inep'],
    filtrar: (q) => {
      // Escola usa `inse_efetivo` (oficial OR proxy) pra filtros — pra que privadas
      // sem INSE oficial ainda apareçam quando o range cobrir o proxy.
      q = aplicarFiltrosBase(q, filtros, 'inse_efetivo', GESTORES_NA_ESCOLA);
      return filtros.redes?.length ? q.in('rede', filtros.redes) : q;
    },
  });
  if (leitura.error) return { error: leitura.error };

  const rows = (leitura.data || []).map((r: any) => linhaDeEscola(r, filtros));

  return fecharLeitura('escola', rows, leitura, limit, filtros);
}

// ── Exportação em XLSX (template fixo) ──────────────────────────────────────

type ResultadoExportacao =
  | { ok: true; base64: string; n: number; comContato: number; totalNoBanco: number | null; truncado: boolean; limite: number; nomeArquivo: string }
  | { ok: false; error: string };

/**
 * Gate comum da exportação e do enriquecimento: a permissão do pedido + conta da equipe vertho.ai
 * (decisão do dono, 16/10/2026: a base enriquecida com contatos é só da casa). Devolve erro, nunca lança.
 * A exportação pede `exports.run` (o Sócio tem); o enriquecimento pede `mercado.contatos.enrich`, só do master.
 */
async function gateEquipe(
  permissao: 'exports.run' | 'mercado.contatos.enrich', recusaSemPermissao: string, recusaForaDaEquipe: string,
): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  let ctx;
  try {
    ctx = await requireAdminAction(permissao);
  } catch {
    return { ok: false, error: recusaSemPermissao };
  }
  if (!isInternalEmail(ctx.email)) return { ok: false, error: recusaForaDaEquipe };
  return { ok: true, email: ctx.email };
}

/**
 * Exporta, em XLSX, as linhas que os filtros da tela devolvem na visão escolhida.
 *
 * Gate: `exports.run` + conta da equipe vertho.ai. Lê TODAS as linhas do filtro até
 * `LIMITE_EXPORTACAO`, sem o "Limite" da tela (ele existe para proteger o navegador, e
 * quem exporta quer a base inteira); acima do teto, vão as primeiras do filtro inteiro na
 * ordem da tela. Na visão Escola, anexa o contato enriquecido VIGENTE
 * de cada escola (só e-mail verificado; quem pediu para sair fica de fora). Cada exportação
 * vai para a auditoria.
 */
export async function exportarMercadoXLSX(visao: VisaoMercado, filtros: MercadoFilters = {}): Promise<ResultadoExportacao> {
  const gate = await gateEquipe('exports.run', 'Sem permissão para exportar.', 'A exportação é só da equipe vertho.ai.');
  if (gate.ok === false) return { ok: false, error: gate.error };
  const ctx = { email: gate.email };
  if (visao !== 'municipio' && visao !== 'rede' && visao !== 'escola') return { ok: false, error: 'Visão inválida.' };

  const carregar = visao === 'municipio' ? loadMercadoMunicipios : visao === 'rede' ? loadMercadoRedes : loadMercadoEscolas;
  const r: any = await carregar({ ...filtros, limit: LIMITE_EXPORTACAO }, { totais: false });
  if (r.error) return { ok: false, error: r.error };
  if (!r.rows?.length) return { ok: false, error: 'Nenhuma linha para exportar com estes filtros.' };

  const geradoEm = new Date();
  let linhas = r.rows;
  let comContato = 0;
  if (visao === 'escola') {
    // Falha FECHADA: sem a lista de quem pediu para sair, não há como garantir que o e-mail dela não saia.
    const sb = await requireAdminSupabase();
    const sup = await carregarSupressao(sb);
    if (sup.erro) return { ok: false, error: `Não consegui ler a lista de e-mails bloqueados: ${sup.erro}` };
    const contatos = await contatosParaExportacao(sb, geradoEm, sup.set);
    if (contatos.erro) return { ok: false, error: `Não consegui ler os contatos coletados: ${contatos.erro}` };
    linhas = r.rows.map((l: any) => {
      const contato = contatos.mapa.get(l.codigo_inep);
      if (contato) comContato++;
      return contato ? { ...l, contato } : l;
    });
  }
  const buf = await montarPlanilhaMercado({ visao, linhas });
  if (buf.length > TAMANHO_MAXIMO_BYTES) {
    return { ok: false, error: 'O arquivo ficou grande demais para baixar de uma vez. Refine os filtros (UF, região, rede) e exporte em partes.' };
  }

  await logAdminAction({
    adminEmail: ctx.email, acao: 'mercado.export', alvo: `${r.rows.length} linhas (${visao})`,
    detalhes: { visao, formato: 'xlsx', n: r.rows.length, comContato, totalNoBanco: r.totalNoBanco ?? null, truncado: !!r.truncado, filtros },
  });
  const dia = geradoEm.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  return {
    ok: true, base64: buf.toString('base64'), n: r.rows.length, comContato, totalNoBanco: r.totalNoBanco ?? null,
    truncado: !!r.truncado, limite: LIMITE_EXPORTACAO, nomeArquivo: `mercado-potencial-${visao}-${dia}.xlsx`,
  };
}

// ── Enriquecimento de contatos das escolas (Fase 2, 16/10/2026) ────────────
//
// Gate: conta @vertho.ai E a permissão `mercado.contatos.enrich`, que só o master tem (pedido do dono, 16/10/2026):
// a busca web é paga e o resultado é dado pessoal. A exportação segue em `exports.run`.
// A lógica vive em `lib/mercado-potencial/enriquecimento/` (núcleo sem gate, testável); aqui só entram o
// gate, o cliente de banco e a auditoria. Nada aqui grava nome ou e-mail em log ou na auditoria.

const RECUSA_SEM_PERMISSAO = 'Sem permissão para enriquecer contatos.';
const RECUSA_FORA_DA_EQUIPE = 'O enriquecimento de contatos é só da equipe vertho.ai.';

/**
 * Conta o que a rodada faria SEM gastar nada: quantas escolas já estão prontas, quantas faltam só no Hunter e
 * quantas precisam de busca web nova, com o custo estimado. As escolas vêm na ORDEM DA TELA (a mesma do filtro).
 */
export async function planejarEnriquecimento(filtros: MercadoFilters = {}): Promise<{ ok: true; plano: PlanoEnriquecimento } | { ok: false; error: string }> {
  const gate = await gateEquipe('mercado.contatos.enrich', RECUSA_SEM_PERMISSAO, RECUSA_FORA_DA_EQUIPE);
  if (gate.ok === false) return { ok: false, error: gate.error };
  // As N primeiras do filtro INTEIRO na ordem da tela (até o teto da exportação), ordenadas no banco.
  const r: any = await loadMercadoEscolas({ ...filtros, limit: LIMITE_EXPORTACAO }, { totais: false });
  if (r.error) return { ok: false, error: r.error };
  if (!r.rows?.length) return { ok: false, error: 'Nenhuma escola com estes filtros.' };
  const sb = await requireAdminSupabase();
  return montarPlano(sb, r.rows.map((x: any) => String(x.codigo_inep)), { totalNoBanco: r.totalNoBanco ?? null, truncado: !!r.truncado }, new Date());
}

/**
 * Enriquece até 5 escolas por chamada (busca web → conferência → Hunter) e grava cada uma ao terminar. A tela
 * chama em laço; o teto de 5 mantém cada chamada abaixo do limite de tempo da função.
 */
export async function enriquecerLote(codigos: string[]): Promise<({ ok: true } & ResultadoLote) | { ok: false; error: string }> {
  const gate = await gateEquipe('mercado.contatos.enrich', RECUSA_SEM_PERMISSAO, RECUSA_FORA_DA_EQUIPE);
  if (gate.ok === false) return { ok: false, error: gate.error };
  const sb = await requireAdminSupabase();
  const r = await enriquecerLoteNucleo(sb, gate.email, codigos);
  if (r.ok === false) return r;

  await logAdminAction({
    adminEmail: gate.email, acao: 'mercado.enriquecer', alvo: `${r.resultados.length} escolas`,
    detalhes: {
      escolas: r.resultados.map((x) => x.codigo_inep), buscas: r.buscas, custoUsd: r.custoUsd, hunterCreditos: r.hunterCreditosGastos,
      erros: r.resultados.filter((x) => !x.ok && !x.adiada).length, adiadas: r.resultados.filter((x) => x.adiada).length,
    },
  });
  return r;
}

/**
 * Pedido de quem não quer ser contatado: grava o e-mail na lista de bloqueio (conferida ao enriquecer e ao
 * exportar) e tira a pessoa de toda linha vigente. O e-mail NÃO vai para a auditoria (seria copiar o dado que se
 * está removendo); fica quem pediu e quantas escolas foram atingidas.
 */
export async function suprimirContato(email: string, motivo?: string): Promise<{ ok: true; escolas: number } | { ok: false; error: string }> {
  const gate = await gateEquipe('mercado.contatos.enrich', RECUSA_SEM_PERMISSAO, RECUSA_FORA_DA_EQUIPE);
  if (gate.ok === false) return { ok: false, error: gate.error };
  const sb = await requireAdminSupabase();
  const r = await suprimirEmail(sb, email, motivo ?? null, gate.email);
  if (r.ok === false) return { ok: false, error: r.erro };
  await logAdminAction({ adminEmail: gate.email, acao: 'mercado.suprimir', alvo: 'e-mail bloqueado', detalhes: { escolas: r.escolas } });
  return { ok: true, escolas: r.escolas };
}

// ── Refresh manual das MVs (admin Vertho only) ─────────────────────────────

export async function refreshMercadoPotencial() {
  await requireAdminAction('radar.admin.access');
  const sb = await requireAdminSupabase();
  const { error } = await sb.rpc('refresh_mv_mercado_potencial');
  if (error) return { error: error.message };
  return { ok: true, message: 'MVs atualizadas' };
}
