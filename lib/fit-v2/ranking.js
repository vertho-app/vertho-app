// ── Ranking e Percentil do Fit v2 ───────────────────────────────────────────
import { getFaixaDistribuicao } from './classificacao.js';

// Desempate hierárquico:
// 1. maior score no primeiro bloco crítico
// 2. maior score no segundo crítico
// 3. menor número de competências com score 0
// 4. ordem alfabética

export function gerarRanking(resultados, blocosCriticos = []) {
  const items = resultados.map(r => ({
    ...r,
    _comp_zero: (r.blocos?.competencias?.detalhes || []).filter(d => d.score === 0).length,
  }));

  items.sort((a, b) => {
    // 1. Fit final desc
    if (b.fit_final !== a.fit_final) return b.fit_final - a.fit_final;

    // 2. Primeiro bloco crítico
    if (blocosCriticos[0]) {
      const sa = a.blocos?.[blocosCriticos[0]]?.score ?? 0;
      const sb2 = b.blocos?.[blocosCriticos[0]]?.score ?? 0;
      if (sb2 !== sa) return sb2 - sa;
    }

    // 3. Segundo bloco crítico
    if (blocosCriticos[1]) {
      const sa = a.blocos?.[blocosCriticos[1]]?.score ?? 0;
      const sb2 = b.blocos?.[blocosCriticos[1]]?.score ?? 0;
      if (sb2 !== sa) return sb2 - sa;
    }

    // 4. Menor nº de competências com score 0
    if (a._comp_zero !== b._comp_zero) return a._comp_zero - b._comp_zero;

    // 5. Ordem alfabética
    return (a.colaborador?.nome || '').localeCompare(b.colaborador?.nome || '');
  });

  const N = items.length;
  return items.map((item, idx) => ({
    ...item,
    ranking: {
      posicao: idx + 1,
      total: N,
      percentil: N > 0 ? Math.round(((N - idx) / N) * 10000) / 100 : 0,
    },
  }));
}

export function gerarDistribuicao(resultadosComRanking) {
  const dist = { excelente: 0, alta: 0, razoavel: 0, baixa: 0, critica: 0 };
  for (const r of resultadosComRanking) {
    const faixa = getFaixaDistribuicao(r.fit_final);
    dist[faixa]++;
  }
  return dist;
}
