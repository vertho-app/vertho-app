// ── Penalizações do Fit v2 ──────────────────────────────────────────────────

// ── FATOR CRÍTICO ──────────────────────────────────────────────────────────
// Penaliza quando blocos marcados como "críticos" ficam abaixo do limiar

export function calcularFatorCritico(scores, blocosCriticos, limiarCritico = 50) {
  if (!blocosCriticos?.length) return 1.00;

  let abaixoLimiar = 0;
  let abaixo30 = false;

  for (const bloco of blocosCriticos) {
    const score = scores[bloco] ?? 0;
    if (score < limiarCritico) abaixoLimiar++;
    if (score < 30) abaixo30 = true;
  }

  // Qualquer crítico abaixo de 30 → 0.55
  if (abaixo30) return 0.55;

  // 0 abaixo → 1.00, 1 abaixo → 0.85, 2 abaixo → 0.70
  if (abaixoLimiar === 0) return 1.00;
  if (abaixoLimiar === 1) return 0.85;
  return 0.70;
}

// ── FATOR EXCESSO ──────────────────────────────────────────────────────────
// Penaliza excesso em competências e DISC (acima da faixa ideal)
// Fator limitado a [0.80, 1.00]

export function calcularFatorExcesso(excessosComp = [], excessosDISC = []) {
  const todosExcessos = [...excessosComp, ...excessosDISC];

  if (todosExcessos.length === 0) return 1.00;

  const totalPenalidade = todosExcessos.reduce((acc, e) => acc + Math.abs(e.penalidade), 0);

  // Fator: cada -5 de penalidade reduz 0.02 do fator
  const reducao = totalPenalidade * 0.004;
  const fator = Math.max(0.80, 1.00 - reducao);

  return Math.round(fator * 100) / 100;
}
