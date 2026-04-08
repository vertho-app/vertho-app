// ── Cálculo dos 4 blocos do Fit v2 ──────────────────────────────────────────

// ── BLOCO 1: MAPEAMENTO (tags comportamentais) ─────────────────────────────
// Compara tags do perfil real com tags ideais do cargo

export function calcularMapeamento(tagsReais, tagsIdeais) {
  if (!tagsIdeais?.length) return { score: 0, detalhes: [] };

  const detalhes = [];
  let somaScorePonderado = 0;
  let somaPesos = 0;

  for (const tagIdeal of tagsIdeais) {
    const pesoNum = tagIdeal.peso === 'critica' ? 2 : 1;
    const match = tagsReais.find(t =>
      t.toLowerCase().trim() === tagIdeal.nome.toLowerCase().trim()
    );

    // Aderência: 100 (match exato), 75 (parcial), 50 (relacionado), 25 (fraco), 0 (ausente)
    let aderencia = 0;
    if (match) {
      aderencia = 100;
    } else {
      // Busca parcial (contém parte do nome)
      const parcial = tagsReais.find(t =>
        t.toLowerCase().includes(tagIdeal.nome.toLowerCase().split(' ')[0]) ||
        tagIdeal.nome.toLowerCase().includes(t.toLowerCase().split(' ')[0])
      );
      if (parcial) aderencia = 50;
    }

    somaScorePonderado += aderencia * pesoNum;
    somaPesos += pesoNum;
    detalhes.push({ tag: tagIdeal.nome, peso: tagIdeal.peso, aderencia, match: !!match });
  }

  const score = somaPesos > 0 ? Math.round((somaScorePonderado / (somaPesos * 100)) * 10000) / 100 : 0;
  return { score: Math.min(100, Math.max(0, score)), detalhes };
}

// ── BLOCO 2: COMPETÊNCIAS (16 sub-competências CIS) ────────────────────────
// Compara scores reais com faixas ideais

export function calcularCompetencias(compReais, compIdeais) {
  if (!compIdeais?.length) return { score: 0, detalhes: [], excessos: [] };

  const pesosNum = { critica: 3, importante: 2, complementar: 1 };
  const detalhes = [];
  const excessos = [];
  let somaScorePonderado = 0;
  let somaPesos = 0;

  for (const ideal of compIdeais) {
    const peso = pesosNum[ideal.peso] || 1;
    const valorReal = compReais[ideal.nome] ?? compReais[ideal.key] ?? null;

    if (valorReal === null) {
      detalhes.push({ nome: ideal.nome, peso: ideal.peso, score: 0, valorReal: null, faixa: `${ideal.faixa_min}-${ideal.faixa_max}`, gap: 'ausente' });
      somaPesos += peso;
      continue;
    }

    // Distância para a faixa
    let distancia = 0;
    if (valorReal < ideal.faixa_min) {
      distancia = ideal.faixa_min - valorReal;
    } else if (valorReal > ideal.faixa_max) {
      distancia = valorReal - ideal.faixa_max;
    }

    // Score gradual
    let scoreItem;
    if (distancia === 0) scoreItem = 100;
    else if (distancia <= 10) scoreItem = 75;
    else if (distancia <= 20) scoreItem = 50;
    else if (distancia <= 30) scoreItem = 25;
    else scoreItem = 0;

    // Excesso (acima do max)
    let excesso = 0;
    if (valorReal > ideal.faixa_max) {
      excesso = valorReal - ideal.faixa_max;
      if (excesso > 0) {
        let penalidade = 0;
        if (excesso <= 10) penalidade = 0;
        else if (excesso <= 20) penalidade = -5;
        else if (excesso <= 30) penalidade = -10;
        else penalidade = -15;
        if (penalidade < 0) excessos.push({ nome: ideal.nome, excesso, penalidade });
      }
    }

    const gap = distancia > 0 ? (valorReal < ideal.faixa_min ? 'abaixo' : 'acima') : 'dentro';

    somaScorePonderado += scoreItem * peso;
    somaPesos += peso;
    detalhes.push({
      nome: ideal.nome, peso: ideal.peso, score: scoreItem,
      valorReal, faixa: `${ideal.faixa_min}-${ideal.faixa_max}`,
      distancia, gap, excesso,
    });
  }

  const score = somaPesos > 0 ? Math.round((somaScorePonderado / (somaPesos * 100)) * 10000) / 100 : 0;
  return { score: Math.min(100, Math.max(0, score)), detalhes, excessos };
}

// ── BLOCO 3: LIDERANÇA ─────────────────────────────────────────────────────
// Diferença absoluta entre distribuições (soma = 100 cada)

export function calcularLideranca(lidReal, lidIdeal) {
  if (!lidIdeal || !lidReal) return { score: 0, detalhes: {} };

  // Normalizar se não soma 100
  const normalizar = (lid) => {
    const soma = (lid.executor || 0) + (lid.motivador || 0) + (lid.metodico || 0) + (lid.sistematico || 0);
    if (soma === 0) return { executor: 25, motivador: 25, metodico: 25, sistematico: 25 };
    if (Math.abs(soma - 100) > 1) {
      const fator = 100 / soma;
      return {
        executor: Math.round((lid.executor || 0) * fator),
        motivador: Math.round((lid.motivador || 0) * fator),
        metodico: Math.round((lid.metodico || 0) * fator),
        sistematico: Math.round((lid.sistematico || 0) * fator),
      };
    }
    return lid;
  };

  const real = normalizar(lidReal);
  const ideal = normalizar(lidIdeal);

  const difs = {
    executor: Math.abs((real.executor || 0) - (ideal.executor || 0)),
    motivador: Math.abs((real.motivador || 0) - (ideal.motivador || 0)),
    metodico: Math.abs((real.metodico || 0) - (ideal.metodico || 0)),
    sistematico: Math.abs((real.sistematico || 0) - (ideal.sistematico || 0)),
  };

  const difTotal = difs.executor + difs.motivador + difs.metodico + difs.sistematico;
  const score = Math.max(0, 100 - (difTotal / 2));

  return {
    score: Math.round(score * 100) / 100,
    detalhes: { real, ideal, diferencas: difs, difTotal },
  };
}

// ── BLOCO 4: DISC ──────────────────────────────────────────────────────────
// Mesma lógica gradual das competências, média das 4 dimensões

export function calcularDISC(discReal, discIdeal) {
  if (!discIdeal || !discReal) return { score: 0, detalhes: {}, excessos: [] };

  const dims = ['D', 'I', 'S', 'C'];
  const detalhes = {};
  const excessos = [];
  let somaScores = 0;
  let count = 0;

  for (const dim of dims) {
    const ideal = discIdeal[dim];
    const valorReal = discReal[dim] ?? 0;

    if (!ideal) continue;

    let distancia = 0;
    if (valorReal < ideal.min) distancia = ideal.min - valorReal;
    else if (valorReal > ideal.max) distancia = valorReal - ideal.max;

    let scoreItem;
    if (distancia === 0) scoreItem = 100;
    else if (distancia <= 10) scoreItem = 75;
    else if (distancia <= 20) scoreItem = 50;
    else if (distancia <= 30) scoreItem = 25;
    else scoreItem = 0;

    // Excesso
    if (valorReal > ideal.max) {
      const exc = valorReal - ideal.max;
      let penalidade = 0;
      if (exc <= 10) penalidade = 0;
      else if (exc <= 20) penalidade = -5;
      else if (exc <= 30) penalidade = -10;
      else penalidade = -15;
      if (penalidade < 0) excessos.push({ dimensao: dim, excesso: exc, penalidade });
    }

    detalhes[dim] = { valorReal, min: ideal.min, max: ideal.max, distancia, score: scoreItem };
    somaScores += scoreItem;
    count++;
  }

  const score = count > 0 ? Math.round((somaScores / count) * 100) / 100 : 0;
  return { score: Math.min(100, Math.max(0, score)), detalhes, excessos };
}
