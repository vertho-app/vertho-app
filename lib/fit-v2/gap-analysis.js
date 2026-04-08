// ── Gap Analysis para PDI ───────────────────────────────────────────────────

export function gerarGapAnalysis(resultado) {
  const gaps = [];
  const forcas = [];
  const alertasExcesso = [];

  // Gaps de competências
  if (resultado.blocos.competencias?.detalhes) {
    for (const d of resultado.blocos.competencias.detalhes) {
      if (d.gap === 'abaixo' && d.score < 75) {
        const tratabilidade = d.distancia <= 15 ? 'Desenvolvível' : d.distancia <= 25 ? 'Coaching' : 'Estrutural';
        const impacto = estimarImpacto(d.peso, d.distancia);
        gaps.push({
          tipo: 'competencia', nome: d.nome, valorReal: d.valorReal,
          faixa: d.faixa, distancia: d.distancia, score: d.score,
          peso: d.peso, tratabilidade, impacto,
          prioridade: impacto * (d.peso === 'critica' ? 3 : d.peso === 'importante' ? 2 : 1),
        });
      }
      if (d.score >= 75) {
        forcas.push({ tipo: 'competencia', nome: d.nome, score: d.score, valorReal: d.valorReal });
      }
    }
  }

  // Gaps de DISC
  if (resultado.blocos.disc?.detalhes) {
    for (const [dim, d] of Object.entries(resultado.blocos.disc.detalhes)) {
      if (d.distancia > 0 && d.score < 75) {
        const tratabilidade = d.distancia <= 15 ? 'Desenvolvível' : d.distancia <= 25 ? 'Coaching' : 'Estrutural';
        gaps.push({
          tipo: 'disc', nome: `DISC ${dim}`, valorReal: d.valorReal,
          faixa: `${d.min}-${d.max}`, distancia: d.distancia, score: d.score,
          tratabilidade, impacto: d.distancia * 0.5,
          prioridade: d.distancia * 0.5,
        });
      }
      if (d.score >= 75) {
        forcas.push({ tipo: 'disc', nome: `DISC ${dim}`, score: d.score, valorReal: d.valorReal });
      }
    }
  }

  // Gaps de liderança
  if (resultado.blocos.lideranca?.detalhes?.diferencas) {
    const difs = resultado.blocos.lideranca.detalhes.diferencas;
    for (const [estilo, dif] of Object.entries(difs)) {
      if (dif > 20) {
        gaps.push({
          tipo: 'lideranca', nome: `Liderança ${estilo}`, distancia: dif,
          score: Math.max(0, 100 - dif), tratabilidade: dif > 30 ? 'Coaching' : 'Desenvolvível',
          impacto: dif * 0.3, prioridade: dif * 0.3,
        });
      }
    }
  }

  // Alertas de excesso
  const excessosComp = resultado.blocos.competencias?.excessos || [];
  const excessosDISC = resultado.blocos.disc?.excessos || [];
  for (const e of [...excessosComp, ...excessosDISC]) {
    alertasExcesso.push({
      nome: e.nome || e.dimensao, excesso: e.excesso, penalidade: e.penalidade,
      alerta: `${e.nome || e.dimensao}: ${e.excesso}pts acima da faixa ideal`,
    });
  }

  // Ordenar por prioridade
  gaps.sort((a, b) => b.prioridade - a.prioridade);
  forcas.sort((a, b) => b.score - a.score);

  return {
    top_gaps: gaps.slice(0, 5),
    top_forcas: forcas.slice(0, 3),
    alertas_excesso: alertasExcesso,
    todos_gaps: gaps,
    todas_forcas: forcas,
    resumo: {
      total_gaps: gaps.length,
      total_forcas: forcas.length,
      total_excessos: alertasExcesso.length,
      gaps_criticos: gaps.filter(g => g.tratabilidade === 'Estrutural').length,
      gaps_desenvolviveis: gaps.filter(g => g.tratabilidade === 'Desenvolvível').length,
    },
  };
}

function estimarImpacto(peso, distancia) {
  const pesoNum = peso === 'critica' ? 3 : peso === 'importante' ? 2 : 1;
  return Math.round(distancia * pesoNum * 0.1 * 100) / 100;
}
