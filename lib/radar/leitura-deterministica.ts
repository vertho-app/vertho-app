/**
 * Leituras determinísticas (sem IA) por indicador.
 *
 * Servem como fallback no SEO (toda página tem texto único) e como
 * "primeira camada" antes da narrativa IA. A IA usa estes textos como
 * insumo + dados estruturados pra gerar uma análise mais aprofundada.
 */

import type { Escola, SaebSnapshot, IcaSnapshot } from './queries';

const ETAPA_LABEL: Record<string, string> = {
  '5_EF': '5º ano do EF',
  '9_EF': '9º ano do EF',
  '3_EM': '3º ano do EM',
};
const DISC_LABEL: Record<string, string> = {
  LP: 'Língua Portuguesa',
  MAT: 'Matemática',
};

function pctNivel0a1(dist: Record<string, number>): number {
  const n0 = Number(dist?.['0'] || 0);
  const n1 = Number(dist?.['1'] || 0);
  return n0 + n1;
}

export function leituraSaebEscola(escola: Escola, saeb: SaebSnapshot[]): {
  resumo: string;
  pontosAtencao: string[];
  pontosForcas: string[];
} {
  const ano = saeb.length > 0 ? Math.max(...saeb.map(s => s.ano)) : null;
  const recente = saeb.filter(s => s.ano === ano);

  const pontosAtencao: string[] = [];
  const pontosForcas: string[] = [];

  for (const s of recente) {
    const baseEsc = pctNivel0a1(s.distribuicao);
    const baseSim = s.similares ? pctNivel0a1(s.similares) : null;
    const lbl = `${DISC_LABEL[s.disciplina] || s.disciplina} no ${ETAPA_LABEL[s.etapa] || s.etapa}`;
    if (baseSim != null) {
      const delta = baseEsc - baseSim;
      if (delta > 10) {
        pontosAtencao.push(
          `Em ${lbl}, ${baseEsc.toFixed(1)}% dos estudantes estão nos níveis 0-1 (insuficiente), ${delta.toFixed(1)} p.p. acima de escolas similares.`
        );
      } else if (delta < -10) {
        pontosForcas.push(
          `Em ${lbl}, ${baseEsc.toFixed(1)}% nos níveis 0-1 — ${Math.abs(delta).toFixed(1)} p.p. abaixo de escolas similares (resultado melhor que pares).`
        );
      }
    }
    if ((s.taxa_participacao ?? 100) < 80) {
      pontosAtencao.push(
        `Taxa de participação no ${ETAPA_LABEL[s.etapa] || s.etapa} foi ${s.taxa_participacao?.toFixed(1)}% — abaixo do mínimo Saeb (80%). Resultados podem não refletir a realidade.`
      );
    }
    if ((s.formacao_docente ?? 100) < 30) {
      pontosAtencao.push(
        `Formação docente adequada em ${ETAPA_LABEL[s.etapa] || s.etapa}: apenas ${s.formacao_docente?.toFixed(1)}% das disciplinas com professor licenciado.`
      );
    }
  }

  const resumo = ano
    ? `${escola.nome} apresenta dados Saeb de ${ano}. ${recente.length} série(s) avaliada(s) entre ${recente.map(s => `${ETAPA_LABEL[s.etapa] || s.etapa} de ${DISC_LABEL[s.disciplina] || s.disciplina}`).slice(0, 4).join(', ')}.${escola.inse_grupo ? ` Grupo INSE ${escola.inse_grupo} (1 = mais alto, 6 = mais baixo).` : ''}`
    : `${escola.nome}: ainda não há resultados Saeb publicados nesta plataforma.`;

  return { resumo, pontosAtencao, pontosForcas };
}

export function leituraIcaMunicipio(municipio: { nome: string; uf: string }, ica: IcaSnapshot[]): {
  resumo: string;
  pontosAtencao: string[];
  pontosForcas: string[];
} {
  const pontosAtencao: string[] = [];
  const pontosForcas: string[] = [];

  // Mais recente, rede MUNICIPAL preferencialmente, fallback TOTAL
  const sortedByYear = [...ica].sort((a, b) => b.ano - a.ano);
  const recent = sortedByYear.find(i => i.rede === 'MUNICIPAL') || sortedByYear[0];

  if (!recent) {
    return {
      resumo: `${municipio.nome}/${municipio.uf}: dados ICA ainda não importados nesta plataforma.`,
      pontosAtencao: [],
      pontosForcas: [],
    };
  }

  const taxa = recent.taxa ?? 0;
  const tEstado = recent.total_estado ?? 0;
  const tBrasil = recent.total_brasil ?? 0;

  if (tEstado && taxa < tEstado - 5) {
    pontosAtencao.push(
      `ICA ${recent.ano}: ${taxa.toFixed(1)}% — abaixo da média da ${municipio.uf} (${tEstado.toFixed(1)}%).`
    );
  } else if (tEstado && taxa > tEstado + 5) {
    pontosForcas.push(
      `ICA ${recent.ano}: ${taxa.toFixed(1)}% — acima da média da ${municipio.uf} (${tEstado.toFixed(1)}%).`
    );
  }

  const resumo = `Em ${recent.ano}, ${taxa.toFixed(1)}% das crianças avaliadas em ${municipio.nome}/${municipio.uf} (rede ${recent.rede.toLowerCase()}) foram consideradas alfabetizadas pelo Indicador Criança Alfabetizada (ICA). A média da ${municipio.uf} foi ${tEstado.toFixed(1)}% e do Brasil ${tBrasil.toFixed(1)}%.`;

  return { resumo, pontosAtencao, pontosForcas };
}

export const ETAPA_LABELS = ETAPA_LABEL;
export const DISC_LABELS = DISC_LABEL;
export { pctNivel0a1 };
