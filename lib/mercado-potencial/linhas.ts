import { calcularMercadoScores, type MercadoScoringFilters } from '@/lib/mercado-potencial/scoring';

/**
 * Linha da tela a partir da linha crua da MV (a mesma venha ela do PostgREST ou do
 * `mercado_potencial_linhas`, mig 293). Vivem aqui, e não no `actions.ts`, porque um arquivo
 * `'use server'` só exporta ação, e porque a conferência da ordem em SQL contra a do TS
 * precisa montar as linhas exatamente como a tela monta.
 *
 * 🔴 `nome` da visão Rede e as colunas que entram no score estão espelhados na ordem em SQL
 * (`mercado_potencial_base`): mudou aqui, mude lá.
 */

export function linhaDeMunicipio(r: any, filtros: MercadoScoringFilters) {
  return {
    id: r.municipio_ibge,
    nome: r.municipio,
    uf: r.uf,
    microrregiao: r.microrregiao,
    qt_escolas: Number(r.qt_escolas),
    qt_escolas_breakdown: {
      municipal: Number(r.qt_escolas_municipal || 0),
      estadual: Number(r.qt_escolas_estadual || 0),
      federal: Number(r.qt_escolas_federal || 0),
      privada: Number(r.qt_escolas_privada || 0),
    },
    qt_professores: Number(r.qt_professores || 0),
    qt_docs_0_24: Number(r.qt_docs_0_24 || 0),
    qt_docs_jovens: Number(r.qt_docs_jovens || 0),
    qt_docs_pos: Number(r.qt_docs_pos || 0),
    qt_gestores: Number(r.qt_gestores || 0),
    inse_medio: r.inse_medio != null ? Number(r.inse_medio) : null,
    pct_inse_oficial: r.pct_inse_oficial != null ? Number(r.pct_inse_oficial) : null,
    score_conectividade: r.score_conectividade,
    ...calcularMercadoScores(r, filtros),
  };
}

export function linhaDeRede(r: any, filtros: MercadoScoringFilters) {
  return {
    id: `${r.municipio_ibge}::${r.rede}`,
    nome: `${r.municipio} — ${r.rede}`,
    uf: r.uf,
    rede: r.rede,
    municipio: r.municipio,
    municipio_ibge: r.municipio_ibge,
    qt_escolas: Number(r.qt_escolas),
    qt_professores: Number(r.qt_professores || 0),
    qt_docs_0_24: Number(r.qt_docs_0_24 || 0),
    qt_docs_jovens: Number(r.qt_docs_jovens || 0),
    qt_docs_pos: Number(r.qt_docs_pos || 0),
    qt_gestores: Number(r.qt_gestores || 0),
    inse_medio: r.inse_medio != null ? Number(r.inse_medio) : null,
    pct_inse_oficial: r.pct_inse_oficial != null ? Number(r.pct_inse_oficial) : null,
    ...calcularMercadoScores(r, filtros),
  };
}

export function linhaDeEscola(r: any, filtros: MercadoScoringFilters) {
  const qt_gestores = Number(r.qt_coord_pedag || 0) + Number(r.qt_diretor_proxy || 0);
  // Pra escola, score usa inse_efetivo (oficial OR proxy do Censo).
  const enriched = {
    ...r,
    qt_professores: Number(r.qt_professores || 0),
    qt_docs_0_24: Number(r.qt_doc_0_24 || 0),   // escola tem qt_doc_0_24 singular
    qt_docs_jovens: Number(r.qt_docs_jovens || 0),
    qt_docs_pos: Number(r.qt_docs_pos || 0),
    qt_gestores,
    inse_medio: r.inse_efetivo != null ? Number(r.inse_efetivo) : null,
    qt_escolas: 1,
  };
  return {
    id: r.codigo_inep,
    nome: r.nome,
    uf: r.uf,
    rede: r.rede,
    municipio: r.municipio,
    municipio_ibge: r.municipio_ibge,
    codigo_inep: r.codigo_inep,
    etapas: r.etapas,
    qt_escolas: 1,
    qt_professores: enriched.qt_professores,
    qt_docs_0_24: enriched.qt_docs_0_24,
    qt_docs_jovens: enriched.qt_docs_jovens,
    qt_docs_pos: enriched.qt_docs_pos,
    qt_gestores: enriched.qt_gestores,
    inse_medio: enriched.inse_medio,
    inse_fonte: r.inse_fonte || null,             // 'oficial' | 'inferido'
    inse_grupo_oficial: r.inse_grupo != null ? Number(r.inse_grupo) : null,
    score_conectividade: r.score_conectividade,
    ...calcularMercadoScores(enriched, filtros),
  };
}
