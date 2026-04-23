// ── Engine principal do Fit v2 ───────────────────────────────────────────────
// Fit Final = Score Base × Fator Crítico × Fator Excesso

import { calcularMapeamento, calcularCompetencias, calcularLideranca, calcularDISC } from './blocos.js';
import { calcularFatorCritico, calcularFatorExcesso } from './penalizacoes.js';
import { classificar, gerarLeituraExecutiva } from './classificacao.js';
import { gerarGapAnalysis } from './gap-analysis.js';
import { validarPerfilIdeal } from './validacao.js';

export function calcularFit(perfilIdeal, perfilReal, colaborador = {}) {
  // 1. Validar perfil ideal
  const errosValidacao = validarPerfilIdeal(perfilIdeal);
  if (errosValidacao.length > 0) {
    return { success: false, erros: errosValidacao };
  }

  const pesos = perfilIdeal.pesos_blocos || {};

  // 2. Calcular os 4 blocos
  const blocoMapeamento = calcularMapeamento(
    perfilReal.tags || [],
    perfilIdeal.mapeamento?.tags_ideais || []
  );

  const blocoCompetencias = calcularCompetencias(
    perfilReal.competencias || {},
    perfilIdeal.competencias || []
  );

  // Bloco Liderança só é calculado quando o cargo tem lideranca_ideal definido.
  // Se null/undefined (cargo não-líder), bloco é excluído e pesos redistribuídos.
  const temLideranca = perfilIdeal.lideranca_ideal && Object.keys(perfilIdeal.lideranca_ideal).length > 0;
  const blocoLideranca = temLideranca
    ? calcularLideranca(perfilReal.lideranca || {}, perfilIdeal.lideranca_ideal)
    : null;

  const blocoDISC = calcularDISC(
    perfilReal.disc || {},
    perfilIdeal.disc_ideal || {}
  );

  const scores = {
    mapeamento: blocoMapeamento.score,
    competencias: blocoCompetencias.score,
    disc: blocoDISC.score,
  };
  if (blocoLideranca) scores.lideranca = blocoLideranca.score;

  // 3. Score Base = ∑ (Score_bloco × Peso_bloco)
  // Caso de borda: bloco ausente → excluir e redistribuir pesos
  let pesosAtivos = {};
  let somaPesosAtivos = 0;
  for (const [bloco, peso] of Object.entries(pesos)) {
    if (scores[bloco] !== undefined) {
      pesosAtivos[bloco] = peso;
      somaPesosAtivos += peso;
    }
  }
  // Normalizar pesos se algum bloco foi excluído
  if (somaPesosAtivos > 0 && Math.abs(somaPesosAtivos - 1.0) > 0.01) {
    for (const bloco of Object.keys(pesosAtivos)) {
      pesosAtivos[bloco] = pesosAtivos[bloco] / somaPesosAtivos;
    }
  }

  let scoreBase = 0;
  for (const [bloco, peso] of Object.entries(pesosAtivos)) {
    scoreBase += (scores[bloco] || 0) * peso;
  }
  scoreBase = Math.round(scoreBase * 100) / 100;

  // 4. Fator Crítico
  const fatorCritico = calcularFatorCritico(
    scores,
    perfilIdeal.blocos_criticos || [],
    perfilIdeal.limiar_critico ?? 50
  );

  // 5. Fator Excesso
  const fatorExcesso = calcularFatorExcesso(
    blocoCompetencias.excessos,
    blocoDISC.excessos
  );

  // 6. Fit Final = Score Base × Fator Crítico × Fator Excesso
  let fitFinal = scoreBase * fatorCritico * fatorExcesso;
  fitFinal = Math.max(0, Math.min(100, fitFinal)); // Limitar [0, 100]
  fitFinal = Math.round(fitFinal * 10) / 10; // 1 casa decimal

  // 7. Classificação
  const { classificacao, recomendacao } = classificar(fitFinal);

  // 8. Montar resultado
  const resultado = {
    colaborador: {
      id: colaborador.id,
      nome: colaborador.nome_completo || colaborador.nome,
      email: colaborador.email,
      cargo: colaborador.cargo,
    },
    cargo: perfilIdeal.cargo,
    versao_modelo: '2.0',
    fit_final: fitFinal,
    classificacao,
    recomendacao,
    score_base: scoreBase,
    fatores: {
      fator_critico: fatorCritico,
      fator_excesso: fatorExcesso,
    },
    blocos: {
      mapeamento: { score: blocoMapeamento.score, peso: pesosAtivos.mapeamento || 0, detalhes: blocoMapeamento.detalhes },
      competencias: { score: blocoCompetencias.score, peso: pesosAtivos.competencias || 0, detalhes: blocoCompetencias.detalhes, excessos: blocoCompetencias.excessos },
      lideranca: blocoLideranca
        ? { score: blocoLideranca.score, peso: pesosAtivos.lideranca || 0, detalhes: blocoLideranca.detalhes }
        : { score: null, peso: 0, detalhes: [], excluido: true },
      disc: { score: blocoDISC.score, peso: pesosAtivos.disc || 0, detalhes: blocoDISC.detalhes, excessos: blocoDISC.excessos },
    },
  };

  // 9. Gap Analysis (recebe o perfil ideal para cálculo de impacto conforme spec 7.2)
  resultado.gap_analysis = gerarGapAnalysis(resultado, perfilIdeal);

  // 10. Leitura executiva
  resultado.leitura_executiva = gerarLeituraExecutiva(resultado);

  return { success: true, ...resultado };
}

// ── Adapter: converte gabarito CIS (tela1-4) para schema perfil ideal ───────

export function converterGabaritoParaPerfil(gabarito, cargoNome, opts = {}) {
  if (!gabarito) return null;

  const perfil = {
    cargo: cargoNome,
    versao: '2.0',
    pesos_blocos: opts.pesos || { mapeamento: 0.20, competencias: 0.35, lideranca: 0.20, disc: 0.25 },
    blocos_criticos: opts.blocos_criticos || ['competencias'],
    limiar_critico: opts.limiar_critico ?? 50,
    mapeamento: { tags_ideais: [] },
    competencias: [],
    lideranca_ideal: {},
    disc_ideal: {},
  };

  // Tela 1: Características → tags de mapeamento
  // Formato novo: { confianca, caracteristicas: [{par, polo_escolhido, intensidade}] }
  // Formato antigo: ["tag1", "tag2"]
  const tela1Items = Array.isArray(gabarito.tela1)
    ? gabarito.tela1
    : (gabarito.tela1?.caracteristicas || []).map(c => c.polo_escolhido || c.par);
  if (tela1Items.length) {
    perfil.mapeamento.tags_ideais = tela1Items.map((tag, i) => ({
      nome: typeof tag === 'string' ? tag : (tag.polo_escolhido || tag.par || tag.nome || ''),
      peso: i < 5 ? 'critica' : 'complementar',
    }));
  }

  // Tela 2: Sub-competências CIS → competências com faixa
  // Formato novo: { confianca, subcompetencias: [{nome, faixa_min, faixa_max, dimensao}] }
  // Formato antigo: [{nome, faixa_min, faixa_max}]
  const tela2Items = Array.isArray(gabarito.tela2)
    ? gabarito.tela2
    : (gabarito.tela2?.subcompetencias || []);
  if (tela2Items.length) {
    perfil.competencias = tela2Items.map(s => {
      const faixaToNum = (f) => {
        if (!f) return 50;
        if (f.includes('Muito baixo')) return 10;
        if (f.includes('Baixo')) return 30;
        if (f.includes('Extremamente alto')) return 90;
        if (f.includes('Muito alto')) return 70;
        if (f.includes('Alto')) return 50;
        return 50;
      };
      return {
        nome: s.nome,
        key: `comp_${s.nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_')}`,
        dimensao: s.dimensao,
        faixa_min: faixaToNum(s.faixa_min),
        faixa_max: faixaToNum(s.faixa_max),
        peso: 'importante', // default
      };
    });
  }

  // Tela 3: Liderança (spec usa "executivo" — aceita "executor" como fallback legado)
  if (gabarito.tela3) {
    perfil.lideranca_ideal = {
      executivo: gabarito.tela3.executivo ?? gabarito.tela3.executor ?? 0,
      motivador: gabarito.tela3.motivador || 0,
      metodico: gabarito.tela3.metodico || 0,
      sistematico: gabarito.tela3.sistematico || 0,
    };
  }

  // Tela 4: DISC ideal
  if (gabarito.tela4) {
    const faixaToNum = (f) => {
      if (!f) return 50;
      if (f.includes('Muito baixo')) return 10;
      if (f.includes('Baixo')) return 30;
      if (f.includes('Extremamente alto')) return 90;
      if (f.includes('Muito alto')) return 70;
      if (f.includes('Alto')) return 50;
      return 50;
    };
    for (const dim of ['D', 'I', 'S', 'C']) {
      if (gabarito.tela4[dim]) {
        perfil.disc_ideal[dim] = {
          min: faixaToNum(gabarito.tela4[dim].min),
          max: faixaToNum(gabarito.tela4[dim].max),
        };
      }
    }
  }

  return perfil;
}

// ── Adapter: extrai perfil real do colaborador ──────────────────────────────

export function extrairPerfilReal(colaborador) {
  return {
    tags: [], // Preenchido externamente se houver mapeamento de tags
    competencias: {
      comp_ousadia: colaborador.comp_ousadia,
      comp_comando: colaborador.comp_comando,
      comp_objetividade: colaborador.comp_objetividade,
      comp_assertividade: colaborador.comp_assertividade,
      comp_persuasao: colaborador.comp_persuasao,
      comp_extroversao: colaborador.comp_extroversao,
      comp_entusiasmo: colaborador.comp_entusiasmo,
      comp_sociabilidade: colaborador.comp_sociabilidade,
      comp_empatia: colaborador.comp_empatia,
      comp_paciencia: colaborador.comp_paciencia,
      comp_persistencia: colaborador.comp_persistencia,
      comp_planejamento: colaborador.comp_planejamento,
      comp_organizacao: colaborador.comp_organizacao,
      comp_detalhismo: colaborador.comp_detalhismo,
      comp_prudencia: colaborador.comp_prudencia,
      comp_concentracao: colaborador.comp_concentracao,
    },
    lideranca: {
      executivo: colaborador.lid_executivo || 0,
      motivador: colaborador.lid_motivador || 0,
      metodico: colaborador.lid_metodico || 0,
      sistematico: colaborador.lid_sistematico || 0,
    },
    disc: {
      D: colaborador.d_natural || 0,
      I: colaborador.i_natural || 0,
      S: colaborador.s_natural || 0,
      C: colaborador.c_natural || 0,
    },
  };
}
