// Mapa de arquétipos comportamentais derivados do perfil DISC dominante.
//
// O `perfil_dominante` salvo em colaboradores costuma vir como 1 ou 2
// letras (ex: "S", "DI", "SC"). Aqui mapeamos cada combinação para um
// nome curto + descrição usados no cabeçalho executivo.

export const ARQUETIPOS = {
  // ── Perfis puros (1 letra) ─────────────────────────────────────────────
  D: { nome: 'Comandante', desc: 'Direto, decidido, focado em resultados' },
  I: { nome: 'Inspirador', desc: 'Comunicativo, persuasivo, energético' },
  S: { nome: 'Estabilizador', desc: 'Cooperativo, paciente, confiável' },
  C: { nome: 'Analista', desc: 'Preciso, organizado, sistemático' },

  // ── Combinações de 2 letras (top 2 dominantes) ─────────────────────────
  DI: { nome: 'Empreendedor', desc: 'Líder carismático, mobiliza por desafios' },
  ID: { nome: 'Influenciador', desc: 'Persuasivo com forte iniciativa' },

  DS: { nome: 'Realizador', desc: 'Equilibrado entre ação e estabilidade' },
  SD: { nome: 'Operador Confiável', desc: 'Estável, produtivo, decidido' },

  DC: { nome: 'Estrategista', desc: 'Decisor analítico focado em precisão' },
  CD: { nome: 'Auditor', desc: 'Rigoroso, orientado por padrões' },

  IS: { nome: 'Conector', desc: 'Faz pontes entre pessoas com calma' },
  SI: { nome: 'Mediador', desc: 'Diplomático, construtor de consenso' },

  IC: { nome: 'Negociador', desc: 'Comunicador analítico e estruturado' },
  CI: { nome: 'Professor', desc: 'Especialista que ensina com clareza' },

  SC: { nome: 'Analista Crítico', desc: 'Detalhista, meticuloso, profundo' },
  CS: { nome: 'Especialista', desc: 'Profundidade técnica com prudência' },
};

const ARQUETIPO_DEFAULT = { nome: 'Profissional', desc: 'Perfil comportamental único' };

/**
 * Devolve { nome, desc } a partir do `perfil_dominante`.
 * Trata variações de caixa e espaços.
 */
export function derivarArquetipo(perfilDominante) {
  if (!perfilDominante) return ARQUETIPO_DEFAULT;
  const key = String(perfilDominante).trim().toUpperCase().replace(/\s+/g, '');
  return ARQUETIPOS[key] || ARQUETIPO_DEFAULT;
}

/**
 * Deriva 3 tags executivas curtas (1-2 palavras) a partir do colab.
 *
 * 1. Introvertido / Extrovertido — usa coluna `tp_introvertido_extrovertido`,
 *    com fallback heurístico baseado em I+S.
 * 2. Sensor / Intuitivo — usa coluna `tp_sensor_intuitivo`, com fallback
 *    heurístico (D+C concretos vs I+S relacionais).
 * 3. Driver dominante — derivado da maior pontuação DISC.
 */
export function derivarTagsExecutivas(colab) {
  if (!colab) return [];
  const tags = [];

  // 1. I/E
  const ie = String(colab.tp_introvertido_extrovertido || '').toLowerCase();
  if (ie.startsWith('intr')) tags.push('Introvertido');
  else if (ie.startsWith('extr')) tags.push('Extrovertido');
  else {
    const social = (Number(colab.i_natural) || 0) + (Number(colab.s_natural) || 0);
    tags.push(social >= 100 ? 'Extrovertido' : 'Introvertido');
  }

  // 2. S/N
  const sn = String(colab.tp_sensor_intuitivo || '').toLowerCase();
  if (sn.startsWith('intu')) tags.push('Intuitivo');
  else if (sn.startsWith('sens')) tags.push('Sensor');
  else {
    const concreto = (Number(colab.d_natural) || 0) + (Number(colab.c_natural) || 0);
    const relacional = (Number(colab.i_natural) || 0) + (Number(colab.s_natural) || 0);
    tags.push(concreto >= relacional ? 'Sensor' : 'Intuitivo');
  }

  // 3. Driver dominante
  const d = Number(colab.d_natural) || 0;
  const i = Number(colab.i_natural) || 0;
  const s = Number(colab.s_natural) || 0;
  const c = Number(colab.c_natural) || 0;
  const max = Math.max(d, i, s, c);
  if (max === d) tags.push('Resultado-Driven');
  else if (max === i) tags.push('Pessoas-Driven');
  else if (max === s) tags.push('Valores-Driven');
  else tags.push('Análise-Driven');

  return tags;
}

/**
 * Insights hardcoded por dimensão dominante. Servem de fallback enquanto
 * o LLM ainda não gerou a versão personalizada (ou em caso de falha).
 */
export function insightsHardcoded(perfilDominante) {
  const baseLetter = String(perfilDominante || '').trim().toUpperCase()[0];

  const fallback = {
    D: [
      'Use sua orientação a resultados pra liderar projetos com prazos apertados.',
      'Equilibre ousadia com escuta ativa pra trazer a equipe junto.',
      'Aproveite momentos de pressão pra mostrar capacidade de decisão rápida.',
    ],
    I: [
      'Use seu talento de comunicação pra apresentar ideias e mobilizar pessoas.',
      'Combine entusiasmo com follow-up estruturado pra fechar ciclos.',
      'Pratique escuta ativa pra equilibrar a tendência de falar demais.',
    ],
    S: [
      'Aproveite sua estabilidade pra ser referência de confiança pra equipe.',
      'Use sua paciência pra mediar conflitos e construir consenso.',
      'Pratique assertividade em situações que pedem decisão rápida.',
    ],
    C: [
      'Use sua precisão pra liderar análises críticas e auditorias.',
      'Combine detalhismo com visão estratégica pra evitar análise paralisada.',
      'Pratique flexibilidade quando o contexto pedir agilidade sobre perfeição.',
    ],
  };

  return fallback[baseLetter] || [
    'Continue desenvolvendo seu perfil comportamental único.',
    'Foque nos pontos fortes que aparecem nas avaliações.',
    'Pratique áreas de desenvolvimento identificadas no PDI.',
  ];
}

/**
 * Helper de display: transforma score 0-100 numa label qualitativa
 * (Baixo / Moderado / Alto) usada nos mini-cards do DISC.
 */
export function intensidadeQualitativa(score) {
  const v = Number(score) || 0;
  if (v >= 60) return 'Alto';
  if (v >= 40) return 'Moderado';
  return 'Baixo';
}
