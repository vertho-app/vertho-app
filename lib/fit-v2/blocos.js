// ── Cálculo dos 4 blocos do Fit v2 ──────────────────────────────────────────

// ── BLOCO 1: MAPEAMENTO (tags comportamentais) ─────────────────────────────
// Compara tags do perfil real com tags ideais do cargo.
//
// Spec 3.1.1 define 5 níveis de aderência:
//   100 = forte (tag presente e marcada como forte pelo CIS)
//    75 = boa (intensidade média)
//    50 = parcial (intensidade baixa)
//    25 = baixa (tag ausente mas sem oposição)
//     0 = oposta (tag oposta presente no perfil)
//
// Enquanto o CIS não expõe "intensidade" nem lista de "tags opostas", o match
// que conseguimos distinguir é: exato (100), parcial (50), ausente (25).
// Opostas exigiriam o perfil ideal definir antônimos explícitos.

export function calcularMapeamento(tagsReais, tagsIdeais) {
  if (!tagsIdeais?.length) return { score: 0, detalhes: [] };

  const detalhes = [];
  let somaScorePonderado = 0;
  let somaPesos = 0;

  const reaisLower = (tagsReais || []).map(t => String(t).toLowerCase().trim());

  for (const tagIdeal of tagsIdeais) {
    const pesoNum = tagIdeal.peso === 'critica' ? 2 : 1;
    const nomeIdeal = String(tagIdeal.nome || tagIdeal.tag || '').toLowerCase().trim();
    if (!nomeIdeal) continue;

    // Match exato
    const matchExato = reaisLower.includes(nomeIdeal);

    // Match parcial (um nome contém o início do outro)
    let matchParcial = false;
    if (!matchExato) {
      const primeiraPalavra = nomeIdeal.split(/\s+/)[0];
      matchParcial = reaisLower.some(t =>
        t.includes(primeiraPalavra) || nomeIdeal.includes(t.split(/\s+/)[0])
      );
    }

    // Oposta: se o perfil ideal declarou explicitamente tags opostas.
    const opostas = (tagIdeal.opostas || []).map(o => String(o).toLowerCase().trim());
    const matchOposta = opostas.length > 0 && opostas.some(o => reaisLower.includes(o));

    let aderencia;
    if (matchOposta) aderencia = 0;
    else if (matchExato) aderencia = 100;
    else if (matchParcial) aderencia = 50;
    else aderencia = 25; // ausente sem oposição (spec)

    somaScorePonderado += aderencia * pesoNum;
    somaPesos += pesoNum;
    detalhes.push({
      tag: tagIdeal.nome || tagIdeal.tag,
      peso: tagIdeal.peso,
      aderencia,
      match: matchExato,
      parcial: matchParcial && !matchExato,
      oposta: matchOposta,
    });
  }

  const score = somaPesos > 0 ? Math.round((somaScorePonderado / (somaPesos * 100)) * 10000) / 100 : 0;
  return { score: Math.min(100, Math.max(0, score)), detalhes };
}

// ── BLOCO 2: COMPETÊNCIAS (16 sub-competências CIS) ────────────────────────
// Compara scores reais com faixas ideais.
// Spec 3.2.1: scoring gradual 0/25/50/75/100 por distância.
// Spec 4.2: penalização por excesso é SUBTRAÍDA do score do item (0/-5/-10/-15).

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

    // Excesso (acima do max) — subtrai do scoreItem e registra pro fator global
    let excesso = 0;
    let penalidadeExcesso = 0;
    if (valorReal > ideal.faixa_max) {
      excesso = valorReal - ideal.faixa_max;
      if (excesso > 10 && excesso <= 20) penalidadeExcesso = 5;
      else if (excesso <= 30) penalidadeExcesso = 10;
      else if (excesso > 30) penalidadeExcesso = 15;
      if (penalidadeExcesso > 0) {
        excessos.push({ nome: ideal.nome, excesso, penalidade: -penalidadeExcesso });
        scoreItem = Math.max(0, scoreItem - penalidadeExcesso);
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
// Spec 3.3: Liderança = max(0, 100 − ΣdiferençasAbsolutas / 2).
// Spec 2.1 usa a key "executivo". Aceitamos "executor" como fallback legado.

function getLideranca(obj) {
  if (!obj) return { executivo: 0, motivador: 0, metodico: 0, sistematico: 0 };
  return {
    executivo: Number(obj.executivo ?? obj.executor ?? 0),
    motivador: Number(obj.motivador ?? 0),
    metodico: Number(obj.metodico ?? 0),
    sistematico: Number(obj.sistematico ?? 0),
  };
}

export function calcularLideranca(lidReal, lidIdeal) {
  if (!lidIdeal || !lidReal) return { score: 0, detalhes: {} };

  // Normaliza para soma 100
  const normalizar = (lid) => {
    const soma = lid.executivo + lid.motivador + lid.metodico + lid.sistematico;
    if (soma === 0) return { executivo: 25, motivador: 25, metodico: 25, sistematico: 25 };
    if (Math.abs(soma - 100) > 1) {
      const fator = 100 / soma;
      return {
        executivo: Math.round(lid.executivo * fator * 100) / 100,
        motivador: Math.round(lid.motivador * fator * 100) / 100,
        metodico: Math.round(lid.metodico * fator * 100) / 100,
        sistematico: Math.round(lid.sistematico * fator * 100) / 100,
      };
    }
    return lid;
  };

  const real = normalizar(getLideranca(lidReal));
  const ideal = normalizar(getLideranca(lidIdeal));

  const difs = {
    executivo: Math.abs(real.executivo - ideal.executivo),
    motivador: Math.abs(real.motivador - ideal.motivador),
    metodico: Math.abs(real.metodico - ideal.metodico),
    sistematico: Math.abs(real.sistematico - ideal.sistematico),
  };

  const difTotal = difs.executivo + difs.motivador + difs.metodico + difs.sistematico;
  const score = Math.max(0, 100 - (difTotal / 2));

  return {
    score: Math.round(score * 100) / 100,
    detalhes: { real, ideal, diferencas: difs, difTotal },
  };
}

// ── BLOCO 4: DISC ──────────────────────────────────────────────────────────
// Spec 3.4: mesma lógica gradual das competências, média simples das 4 dimensões.
// Spec 4.2: excesso subtraído do score do item (aplica também a DISC).

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

    // Excesso — subtrai do scoreItem e registra pro fator global
    let excesso = 0;
    let penalidadeExcesso = 0;
    if (valorReal > ideal.max) {
      excesso = valorReal - ideal.max;
      if (excesso > 10 && excesso <= 20) penalidadeExcesso = 5;
      else if (excesso <= 30) penalidadeExcesso = 10;
      else if (excesso > 30) penalidadeExcesso = 15;
      if (penalidadeExcesso > 0) {
        excessos.push({ dimensao: dim, excesso, penalidade: -penalidadeExcesso });
        scoreItem = Math.max(0, scoreItem - penalidadeExcesso);
      }
    }

    detalhes[dim] = { valorReal, min: ideal.min, max: ideal.max, distancia, score: scoreItem, excesso };
    somaScores += scoreItem;
    count++;
  }

  const score = count > 0 ? Math.round((somaScores / count) * 100) / 100 : 0;
  return { score: Math.min(100, Math.max(0, score)), detalhes, excessos };
}
