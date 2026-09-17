/**
 * Simuladores no orçamento (17/09/2026): vendas, atendimento e liderança entram
 * por pessoa com acesso e por ciclo, no PREÇO, no CUSTO e no escopo que o
 * cliente lê. A régua de preço ainda não existe (default zero, com aviso na
 * tela), então o que estes testes travam é a MECÂNICA: um preço informado soma
 * no valor, o custo entra sempre, e cenário salvo antes da mudança abre igual.
 */
import { describe, expect, it } from 'vitest';
import {
  ORCAMENTO_DEFAULTS,
  acessosSimuladores,
  calcularProjeto,
  custoSimuladoresBrl,
  semSimuladores,
  type EscopoProjeto,
  type TabelaPreco,
} from '@/lib/orcamento/precificacao';
import {
  entradasPadrao,
  escopoPropostaDoCenario,
  normalizarEntradas,
  type ListasValidas,
} from '@/lib/orcamento/cenario';

const LISTAS: ListasValidas = { presets: ['atual'], jornadas: ['jornada'] };
const JORNADA = { rotulo: 'Jornada', semanas: 7 };

const PRECO: TabelaPreco = {
  setupGeral: 2000, pessoaCiclo: 300, unidade: 2000, matrizNova: 1000, matrizAdaptada: 500,
  workshop: 15000, descontoPct: 0, margemAlvoPct: 50,
};
const ESCOPO: EscopoProjeto = {
  pessoas: 100, ciclos: 2, unidades: 1, matrizesNovas: 3, matrizesAdaptadas: 0, workshop: false, parcelas: 4,
};
const CUSTO = { totalBrl: 10_000, oneTimeBrl: 5_000, mesesPrograma: 4 };

describe('preço dos simuladores', () => {
  it('soma acessos × preço × ciclos ao valor de tabela', () => {
    const sem = calcularProjeto(ESCOPO, PRECO, CUSTO);
    const com = calcularProjeto({ ...ESCOPO, simuladorAcessos: 150 }, { ...PRECO, simuladorPessoaCiclo: 40 }, CUSTO);
    expect(com.simuladores).toBe(150 * 40 * 2);
    expect(com.valorTabela - sem.valorTabela).toBe(12_000);
    expect(com.parcela).toBeCloseTo(com.valorFinal / 4);
  });

  it('sem preço (a régua de hoje) o valor não muda, e o campo ausente vale zero', () => {
    const sem = calcularProjeto(ESCOPO, PRECO, CUSTO);
    expect(calcularProjeto({ ...ESCOPO, simuladorAcessos: 150 }, { ...PRECO, simuladorPessoaCiclo: 0 }, CUSTO).valorTabela)
      .toBe(sem.valorTabela);
    expect(sem.simuladores).toBe(0);
  });

  it('o default da régua é zero, com 6 treinos por pessoa por ciclo', () => {
    expect(ORCAMENTO_DEFAULTS.precoSimuladorPessoaCiclo).toBe(0);
    expect(ORCAMENTO_DEFAULTS.treinosSimuladorPessoaCiclo).toBe(6);
  });
});

describe('custo dos simuladores', () => {
  it('acessos × treinos × custo do treino × ciclos × cotação', () => {
    expect(custoSimuladoresBrl({ acessos: 100, treinosPessoaCiclo: 6, custoTreinoUsd: 0.155, ciclos: 5, cotacao: 5.12 }))
      .toBeCloseTo(100 * 6 * 0.155 * 5 * 5.12, 6);
  });

  it('entra mesmo com preço zero: simulador de graça não é simulador sem custo', () => {
    const acessos = acessosSimuladores({ ...semSimuladores(), vendas: 50 }, 100);
    const custo = custoSimuladoresBrl({
      acessos, treinosPessoaCiclo: ORCAMENTO_DEFAULTS.treinosSimuladorPessoaCiclo,
      custoTreinoUsd: ORCAMENTO_DEFAULTS.custoTreinoSimuladorUsd, ciclos: 1, cotacao: ORCAMENTO_DEFAULTS.cotacao,
    });
    expect(custo).toBeGreaterThan(0);
  });

  it('acesso conta por simulador e nunca passa das pessoas do programa', () => {
    expect(acessosSimuladores({ vendas: 80, atendimento: 30, lideranca: 0 }, 100)).toBe(110);
    expect(acessosSimuladores({ vendas: 500, atendimento: 0, lideranca: 0 }, 100)).toBe(100);
    expect(acessosSimuladores({ vendas: -3, atendimento: Number.NaN, lideranca: 0 } as any, 100)).toBe(0);
  });
});

describe('cenário salvo e escopo da proposta', () => {
  it('cenário salvo antes dos simuladores abre com todos em zero e o preço padrão', () => {
    const antigo: any = { ...entradasPadrao(LISTAS) };
    delete antigo.simuladores;
    delete antigo.pricing.precoSimuladorPessoaCiclo;
    const lido = normalizarEntradas(antigo, LISTAS)!;
    expect(lido.simuladores).toEqual(semSimuladores());
    expect(lido.pricing.precoSimuladorPessoaCiclo).toBe(0);
  });

  it('acesso gravado acima das pessoas do programa é limitado na leitura', () => {
    const lido = normalizarEntradas(
      { ...entradasPadrao(LISTAS), nColabs: 40, simuladores: { vendas: 90, atendimento: 10, lideranca: 'x' } },
      LISTAS,
    )!;
    expect(lido.simuladores).toEqual({ vendas: 40, atendimento: 10, lideranca: 0 });
  });

  it('cada simulador incluído vira uma linha do escopo, antes do Mentor IA', () => {
    const e = { ...entradasPadrao(LISTAS), nColabs: 1200, simuladores: { vendas: 1200, atendimento: 0, lideranca: 1 } };
    const resumo: any = { pessoas: 1200, unidades: 1, cargos: 3, ciclos: 2 };
    const linhas = escopoPropostaDoCenario(e, resumo, JORNADA).split('\n');
    const iMentor = linhas.findIndex((l) => l.startsWith('Mentor IA'));
    expect(linhas.slice(iMentor - 2, iMentor)).toEqual([
      'Simulador de vendas para 1.200 pessoas',
      'Simulador de liderança para 1 pessoa',
    ]);
    expect(linhas.join('\n')).not.toMatch(/Simulador de atendimento/);
  });

  it('sem simulador, o escopo não ganha linha nenhuma', () => {
    const texto = escopoPropostaDoCenario(entradasPadrao(LISTAS), { pessoas: 100, unidades: 1, cargos: 3, ciclos: 1 } as any, JORNADA);
    expect(texto).not.toMatch(/Simulador/);
  });

  it('o texto também não promete acesso acima das pessoas do programa', () => {
    const e = { ...entradasPadrao(LISTAS), simuladores: { vendas: 300, atendimento: 0, lideranca: 0 } };
    const texto = escopoPropostaDoCenario(e, { pessoas: 100, unidades: 1, cargos: 3, ciclos: 1 } as any, JORNADA);
    expect(texto).toMatch(/^Simulador de vendas para 100 pessoas$/m);
  });
});

describe('nome dos simuladores (decisão do Rodrigo, 17/09/2026)', () => {
  it('os três se chamam "Simulador de …", sem "Treino" nem "Prontidão"', async () => {
    const { ROTULO_SIMULADOR } = await import('@/lib/orcamento/precificacao');
    expect(ROTULO_SIMULADOR).toEqual({
      vendas: 'Simulador de vendas',
      atendimento: 'Simulador de atendimento',
      lideranca: 'Simulador de liderança',
    });
  });

  it('nenhum idioma chama o módulo pelos nomes antigos', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const antigos = /prontid[ãa]o (para|de) (a )?lideran[çc]a|treino de atendimento|leadership readiness|reception training|preparaci[óo]n para el liderazgo|pr[áa]ctica de atenci[óo]n/i;
    for (const loc of ['pt-BR', 'pt-PT', 'en-US', 'es-ES']) {
      const texto = readFileSync(join(__dirname, '..', '..', 'messages', `${loc}.json`), 'utf8');
      expect(texto.match(antigos)?.[0], loc).toBeUndefined();
    }
  });
});
