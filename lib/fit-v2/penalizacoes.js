// ── Penalizações do Fit v2 ──────────────────────────────────────────────────

// ── FATOR CRÍTICO ──────────────────────────────────────────────────────────
// Spec 4.1:
//   - Nenhum crítico < limiar → 1.00
//   - 1 crítico < limiar      → 0.85
//   - 2 críticos < limiar     → 0.70
//   - Qualquer crítico < 30   → 0.55 (precedência sobre as regras acima)

export function calcularFatorCritico(scores, blocosCriticos, limiarCritico = 50) {
  if (!blocosCriticos?.length) return 1.00;

  let abaixoLimiar = 0;
  let abaixo30 = false;

  for (const bloco of blocosCriticos) {
    // Ignora blocos excluídos do cálculo (ex: lideranca em cargo não-líder)
    if (scores[bloco] === undefined || scores[bloco] === null) continue;
    const score = scores[bloco];
    if (score < limiarCritico) abaixoLimiar++;
    if (score < 30) abaixo30 = true;
  }

  if (abaixo30) return 0.55;
  if (abaixoLimiar === 0) return 1.00;
  if (abaixoLimiar === 1) return 0.85;
  return 0.70;
}

// ── FATOR EXCESSO ──────────────────────────────────────────────────────────
// Spec 4.3:
//   Fator Excesso = 1 − (Σpenalidades / (N_itens × 100))
//   N_itens = número de competências + dimensões DISC COM excesso
//   Fator limitado ao intervalo [0.80, 1.00]

export function calcularFatorExcesso(excessosComp = [], excessosDISC = []) {
  const todosExcessos = [...excessosComp, ...excessosDISC];
  if (todosExcessos.length === 0) return 1.00;

  const totalPenalidade = todosExcessos.reduce((acc, e) => acc + Math.abs(e.penalidade || 0), 0);
  const nItens = todosExcessos.length;

  const fator = 1 - (totalPenalidade / (nItens * 100));
  const fatorLimitado = Math.max(0.80, Math.min(1.00, fator));
  return Math.round(fatorLimitado * 100) / 100;
}
