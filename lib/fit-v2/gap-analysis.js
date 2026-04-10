// ── Gap Analysis para PDI (Fit v2 — spec seção 7) ──────────────────────────
//
// Regras da spec:
//
// 7.1 Um gap é qualquer competência / DISC / tag / estilo de liderança cujo
//     score está FORA da faixa ideal (não exige score < 75).
//
// 7.2 Impacto no Fit = (100 − score_atual) × peso_item × peso_bloco / Σ(pesos_items_bloco)
//     — quantos pontos o Fit Final subiria se o gap fosse eliminado.
//
// 7.3 Fator de Desenvolvimento (tratabilidade):
//     Competência (dist ≤ 20)  1.5  Desenvolvimento rápido via treinamento
//     Competência (dist > 20)  1.0  PDI estruturado
//     DISC (qualquer)          0.5  Traços de personalidade são estáveis
//     Liderança                0.8  Coaching de liderança
//     Mapeamento (oposta)      0.3  Perfil comportamental fundamental
//
//     Prioridade PDI = Impacto × Fator Desenvolvimento
//
// 7.4 Saída: top 5 gaps, ganho potencial se top 5 resolvidos, top 3 forças,
//     alertas de excesso, classificação (desenvolvível ≥1.0 / coaching 0.5-0.9 /
//     estrutural <0.5).

const PESOS_COMP = { critica: 3, importante: 2, complementar: 1 };

function fatorDesenvolvimentoComp(distancia) {
  return distancia <= 20 ? 1.5 : 1.0;
}

function classificarPorFator(fator) {
  if (fator >= 1.0) return 'Desenvolvível';
  if (fator >= 0.5) return 'Coaching';
  return 'Estrutural';
}

export function gerarGapAnalysis(resultado, perfilIdeal = null) {
  const gaps = [];
  const forcas = [];
  const alertasExcesso = [];

  const pesosBlocos = perfilIdeal?.pesos_blocos || {};
  const compIdeais = perfilIdeal?.competencias || [];

  // Soma dos pesos dos itens do bloco de competências (denominador do impacto)
  const somaPesosComp = compIdeais.reduce(
    (acc, c) => acc + (PESOS_COMP[c.peso] || 1),
    0
  ) || 1;

  // ── Gaps de competências ──────────────────────────────────────────────────
  // Spec 7.1: considerar QUALQUER item fora da faixa (não só score < 75)
  if (resultado.blocos.competencias?.detalhes) {
    for (const d of resultado.blocos.competencias.detalhes) {
      if (d.gap === 'abaixo' || d.gap === 'acima') {
        const pesoItem = PESOS_COMP[d.peso] || 1;
        const pesoBloco = pesosBlocos.competencias || 0;
        // Impacto spec 7.2: (100 − score) × pesoItem × pesoBloco / Σpesos
        const impacto = somaPesosComp > 0
          ? Math.round(
              ((100 - d.score) * pesoItem * pesoBloco / somaPesosComp) * 100
            ) / 100
          : 0;
        const fator = fatorDesenvolvimentoComp(d.distancia || 0);
        const prioridade = Math.round(impacto * fator * 100) / 100;
        gaps.push({
          tipo: 'competencia',
          nome: d.nome,
          valorReal: d.valorReal,
          faixa: d.faixa,
          distancia: d.distancia,
          score: d.score,
          peso: d.peso,
          impacto,
          fator_desenvolvimento: fator,
          tratabilidade: classificarPorFator(fator),
          prioridade,
        });
      }
      // Forças: score ≥ 75 dentro ou muito perto da faixa ideal
      if (d.gap === 'dentro' || d.score >= 75) {
        forcas.push({
          tipo: 'competencia',
          nome: d.nome,
          score: d.score,
          valorReal: d.valorReal,
          faixa: d.faixa,
          peso: d.peso,
        });
      }
    }
  }

  // ── Gaps de DISC ─────────────────────────────────────────────────────────
  if (resultado.blocos.disc?.detalhes) {
    const pesoBloco = pesosBlocos.disc || 0;
    // DISC tem 4 dims com peso igual → soma de pesos = 4
    const somaPesosDisc = 4;
    for (const [dim, d] of Object.entries(resultado.blocos.disc.detalhes)) {
      if (d.distancia > 0) {
        const impacto = Math.round(
          ((100 - d.score) * 1 * pesoBloco / somaPesosDisc) * 100
        ) / 100;
        const fator = 0.5; // Spec 7.3: DISC sempre 0.5
        const prioridade = Math.round(impacto * fator * 100) / 100;
        gaps.push({
          tipo: 'disc',
          nome: `DISC ${dim}`,
          valorReal: d.valorReal,
          faixa: `${d.min}-${d.max}`,
          distancia: d.distancia,
          score: d.score,
          impacto,
          fator_desenvolvimento: fator,
          tratabilidade: classificarPorFator(fator),
          prioridade,
        });
      }
      if (d.distancia === 0) {
        forcas.push({
          tipo: 'disc',
          nome: `DISC ${dim}`,
          score: d.score,
          valorReal: d.valorReal,
          faixa: `${d.min}-${d.max}`,
        });
      }
    }
  }

  // ── Gaps de liderança ─────────────────────────────────────────────────────
  if (resultado.blocos.lideranca?.detalhes?.diferencas) {
    const pesoBloco = pesosBlocos.lideranca || 0;
    const difs = resultado.blocos.lideranca.detalhes.diferencas;
    // 4 estilos com peso igual
    const somaPesosLid = 4;
    for (const [estilo, dif] of Object.entries(difs)) {
      if (dif > 10) {
        // Score do item de liderança ≈ 100 - dif (aproximação individual)
        const scoreItem = Math.max(0, 100 - dif);
        const impacto = Math.round(
          ((100 - scoreItem) * 1 * pesoBloco / somaPesosLid) * 100
        ) / 100;
        const fator = 0.8; // Spec 7.3: Liderança sempre 0.8
        const prioridade = Math.round(impacto * fator * 100) / 100;
        gaps.push({
          tipo: 'lideranca',
          nome: `Liderança ${estilo}`,
          distancia: dif,
          score: scoreItem,
          impacto,
          fator_desenvolvimento: fator,
          tratabilidade: classificarPorFator(fator),
          prioridade,
        });
      }
    }
  }

  // ── Gaps de mapeamento (tags opostas) ────────────────────────────────────
  // Spec 7.3: peso 0.3 para tag oposta. Considera só itens com aderência ≤ 25.
  if (resultado.blocos.mapeamento?.detalhes) {
    const pesoBloco = pesosBlocos.mapeamento || 0;
    const detalhes = resultado.blocos.mapeamento.detalhes;
    const somaPesosMap = detalhes.reduce(
      (acc, t) => acc + (t.peso === 'critica' ? 2 : 1),
      0
    ) || 1;
    for (const t of detalhes) {
      if ((t.aderencia ?? 0) <= 25) {
        const pesoItem = t.peso === 'critica' ? 2 : 1;
        const impacto = Math.round(
          ((100 - (t.aderencia || 0)) * pesoItem * pesoBloco / somaPesosMap) * 100
        ) / 100;
        const fator = t.oposta ? 0.3 : 1.0; // spec: "tag oposta" 0.3. Ausência comum é mais tratável.
        const prioridade = Math.round(impacto * fator * 100) / 100;
        gaps.push({
          tipo: 'mapeamento',
          nome: `Tag: ${t.tag}`,
          score: t.aderencia || 0,
          peso: t.peso,
          impacto,
          fator_desenvolvimento: fator,
          tratabilidade: classificarPorFator(fator),
          prioridade,
        });
      }
    }
  }

  // ── Alertas de excesso ───────────────────────────────────────────────────
  const excessosComp = resultado.blocos.competencias?.excessos || [];
  const excessosDISC = resultado.blocos.disc?.excessos || [];
  for (const e of [...excessosComp, ...excessosDISC]) {
    const nome = e.nome || e.dimensao;
    alertasExcesso.push({
      nome,
      excesso: e.excesso,
      penalidade: e.penalidade,
      alerta: `${nome}: ${e.excesso}pts acima da faixa ideal`,
    });
  }

  // ── Ordenação: prioridade PDI desc; forças: score desc + peso ─────────────
  gaps.sort((a, b) => b.prioridade - a.prioridade);
  forcas.sort((a, b) => {
    const pesoNum = (p) => p === 'critica' ? 3 : p === 'importante' ? 2 : 1;
    const pb = pesoNum(b.peso) - pesoNum(a.peso);
    if (pb !== 0) return pb;
    return (b.score || 0) - (a.score || 0);
  });

  // Spec 7.4: ganho potencial = soma dos impactos dos top 5 gaps
  const top5 = gaps.slice(0, 5);
  const ganhoPotencialTop5 = Math.round(
    top5.reduce((acc, g) => acc + (g.impacto || 0), 0) * 100
  ) / 100;

  return {
    top_gaps: top5,
    top_forcas: forcas.slice(0, 3),
    alertas_excesso: alertasExcesso,
    todos_gaps: gaps,
    todas_forcas: forcas,
    ganho_potencial_top5: ganhoPotencialTop5,
    resumo: {
      total_gaps: gaps.length,
      total_forcas: forcas.length,
      total_excessos: alertasExcesso.length,
      gaps_desenvolviveis: gaps.filter(g => g.tratabilidade === 'Desenvolvível').length,
      gaps_coaching: gaps.filter(g => g.tratabilidade === 'Coaching').length,
      gaps_estruturais: gaps.filter(g => g.tratabilidade === 'Estrutural').length,
    },
  };
}
