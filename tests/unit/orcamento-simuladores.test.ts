/**
 * Simuladores no orçamento: vendas, atendimento e liderança entram por pessoa
 * com acesso e por ciclo, no PREÇO, no CUSTO e no escopo que o cliente lê.
 *
 * Desde 02/10/2026 cada simulador tem a sua régua (preço, treinos, turnos e
 * custo). Antes eram um preço e um custo de treino para os três, e o custo era o
 * do atendimento, o mais caro: a margem dos outros dois saía errada. O que estes
 * testes travam é que cada simulador usa os SEUS números, que a conta do card
 * bate com a do projeto, e que o cenário salvo antes da mudança mantém o preço.
 */
import { describe, expect, it } from 'vitest';
import {
  CUSTO_FIXO_TREINO_USD,
  CUSTO_TURNO_USD,
  ORCAMENTO_DEFAULTS,
  SIMULADORES_DEFAULT,
  acessosSimuladores,
  calcularProjeto,
  configSimuladoresPadrao,
  custoSimuladoresBrl,
  custoTreinoUsd,
  markupSimuladorPct,
  precoMinimoSimuladorBrl,
  semSimuladores,
  simuladoresDoOrcamento,
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
  pessoas: 100, ciclos: 2, unidades: 1, matrizesNovas: 3, matrizesAdaptadas: 0, workshops: 0, parcelas: 4,
};
const CUSTO = { totalBrl: 10_000, oneTimeBrl: 5_000, mesesPrograma: 4 };

describe('preço dos simuladores', () => {
  it('soma acessos × preço × ciclos de CADA simulador ao valor de tabela', () => {
    const sem = calcularProjeto(ESCOPO, PRECO, CUSTO);
    const com = calcularProjeto(
      { ...ESCOPO, simuladores: [{ acessos: 150, precoPessoaCiclo: 40 }, { acessos: 30, precoPessoaCiclo: 75 }] },
      PRECO,
      CUSTO,
    );
    expect(com.simuladores).toBe(150 * 40 * 2 + 30 * 75 * 2);
    expect(com.valorTabela - sem.valorTabela).toBe(16_500);
    expect(com.parcela).toBeCloseTo(com.valorFinal / 4);
  });

  it('sem preço o valor não muda, e o campo ausente vale zero', () => {
    const sem = calcularProjeto(ESCOPO, PRECO, CUSTO);
    expect(calcularProjeto({ ...ESCOPO, simuladores: [{ acessos: 150, precoPessoaCiclo: 0 }] }, PRECO, CUSTO).valorTabela)
      .toBe(sem.valorTabela);
    expect(sem.simuladores).toBe(0);
  });

  it('o default é preço zero nos três, com 6 treinos (5 encontros na liderança) e 8 turnos', () => {
    for (const s of ['vendas', 'atendimento', 'lideranca'] as const) {
      expect(SIMULADORES_DEFAULT[s].precoPessoaCiclo).toBe(0);
      expect(SIMULADORES_DEFAULT[s].turnosPorTreino).toBe(8);
    }
    expect(SIMULADORES_DEFAULT.vendas.treinosPessoaCiclo).toBe(6);
    expect(SIMULADORES_DEFAULT.atendimento.treinosPessoaCiclo).toBe(6);
    expect(SIMULADORES_DEFAULT.lideranca.treinosPessoaCiclo).toBe(5);
    // A régua geral não carrega mais campo de simulador: um lugar só para cada número.
    expect(Object.keys(ORCAMENTO_DEFAULTS).filter((k) => /simulador/i.test(k))).toEqual([]);
  });
});

describe('custo dos simuladores', () => {
  it('acessos × treinos × custo do treino × ciclos × cotação', () => {
    expect(custoSimuladoresBrl({ acessos: 100, treinosPessoaCiclo: 6, custoTreinoUsd: 0.155, ciclos: 5, cotacao: 5.12 }))
      .toBeCloseTo(100 * 6 * 0.155 * 5 * 5.12, 6);
  });

  it('o treino custa o fixo mais o turno × turnos, e mais turnos custam mais', () => {
    expect(custoTreinoUsd({ custoFixoTreinoUsd: 0.1, custoTurnoUsd: 0.0075, turnosPorTreino: 8 })).toBeCloseTo(0.16, 10);
    const vendas = { custoFixoTreinoUsd: CUSTO_FIXO_TREINO_USD.vendas, custoTurnoUsd: CUSTO_TURNO_USD.vendas };
    const curto = custoTreinoUsd({ ...vendas, turnosPorTreino: 8 });
    const longo = custoTreinoUsd({ ...vendas, turnosPorTreino: 20 });
    expect(longo - curto).toBeCloseTo(12 * CUSTO_TURNO_USD.vendas, 10);
  });

  it('os custos da plataforma reproduzem o pior caso medido em 8 turnos: vendas 0,16 · atendimento 0,22 · liderança 0,13', () => {
    const treino = (s: 'vendas' | 'atendimento' | 'lideranca') => custoTreinoUsd({
      custoFixoTreinoUsd: CUSTO_FIXO_TREINO_USD[s], custoTurnoUsd: CUSTO_TURNO_USD[s], turnosPorTreino: SIMULADORES_DEFAULT[s].turnosPorTreino,
    });
    expect(treino('vendas')).toBeCloseTo(0.16, 3);
    expect(treino('atendimento')).toBeCloseTo(0.2212, 4);
    expect(treino('lideranca')).toBeCloseTo(0.13, 3);
  });

  it('os dois custos do treino são da plataforma: não existem na régua do cenário', () => {
    // Decisões do Rodrigo (02/10/2026): nenhum dos dois é campo editável no orçamento.
    for (const s of ['vendas', 'atendimento', 'lideranca'] as const) {
      expect(Object.keys(SIMULADORES_DEFAULT[s]).sort()).toEqual(['precoPessoaCiclo', 'treinosPessoaCiclo', 'turnosPorTreino']);
    }
    expect(CUSTO_FIXO_TREINO_USD).toEqual({ vendas: 0.1, atendimento: 0.166, lideranca: 0.09 });
    expect(CUSTO_TURNO_USD).toEqual({ vendas: 0.0075, atendimento: 0.0069, lideranca: 0.005 });
  });

  it('cada simulador usa o SEU custo: o mesmo acesso custa diferente em cada um', () => {
    const r = simuladoresDoOrcamento({
      pessoas: { vendas: 100, atendimento: 100, lideranca: 100 },
      pessoasDoPrograma: 100,
      config: configSimuladoresPadrao(),
      ciclos: 1,
      cotacao: 5,
    });
    const [vendas, atendimento, lideranca] = r.itens;
    expect([vendas.simulador, atendimento.simulador, lideranca.simulador]).toEqual(['vendas', 'atendimento', 'lideranca']);
    expect(atendimento.custoBrl).toBeCloseTo(100 * 6 * 0.2212 * 5, 6);
    expect(vendas.custoBrl).toBeCloseTo(100 * 6 * 0.16 * 5, 6);
    expect(lideranca.custoBrl).toBeCloseTo(100 * 5 * 0.13 * 5, 6);
    expect(r.custoBrl).toBeCloseTo(vendas.custoBrl + atendimento.custoBrl + lideranca.custoBrl, 6);
    expect(atendimento.custoPessoaCicloBrl).toBeCloseTo(6 * 0.2212 * 5, 6);
  });

  it('entra mesmo com preço zero: simulador de graça não é simulador sem custo', () => {
    const r = simuladoresDoOrcamento({
      pessoas: { ...semSimuladores(), vendas: 50 },
      pessoasDoPrograma: 100,
      config: configSimuladoresPadrao(),
      ciclos: 1,
      cotacao: ORCAMENTO_DEFAULTS.cotacao,
    });
    expect(r.valorBrl).toBe(0);
    expect(r.custoBrl).toBeGreaterThan(0);
  });

  it('acesso conta por simulador e nunca passa das pessoas do programa', () => {
    expect(acessosSimuladores({ vendas: 80, atendimento: 30, lideranca: 0 }, 100)).toBe(110);
    expect(acessosSimuladores({ vendas: 500, atendimento: 0, lideranca: 0 }, 100)).toBe(100);
    expect(acessosSimuladores({ vendas: -3, atendimento: Number.NaN, lideranca: 0 } as any, 100)).toBe(0);
    const r = simuladoresDoOrcamento({
      pessoas: { vendas: 500, atendimento: 30, lideranca: -3 },
      pessoasDoPrograma: 100,
      config: configSimuladoresPadrao(),
      ciclos: 1,
      cotacao: 5,
    });
    expect(r.itens.map((i) => i.acessos)).toEqual([100, 30, 0]);
    expect(r.acessos).toBe(130);
  });
});

describe('o card e o projeto fazem a MESMA conta', () => {
  const config = configSimuladoresPadrao();
  config.vendas.precoPessoaCiclo = 50;
  config.atendimento.precoPessoaCiclo = 75;

  it('o valor somado no card é o que o projeto cobra', () => {
    const r = simuladoresDoOrcamento({
      pessoas: { vendas: 40, atendimento: 25, lideranca: 10 }, pessoasDoPrograma: 100, config, ciclos: 3, cotacao: 5,
    });
    const projeto = calcularProjeto(
      { ...ESCOPO, ciclos: 3, simuladores: r.itens.map((i) => ({ acessos: i.acessos, precoPessoaCiclo: config[i.simulador].precoPessoaCiclo })) },
      PRECO,
      CUSTO,
    );
    expect(projeto.simuladores).toBe(r.valorBrl);
    expect(r.valorBrl).toBe(40 * 50 * 3 + 25 * 75 * 3);
  });

  it('no preço mínimo, o markup do simulador sozinho é exatamente o markup-alvo', () => {
    const regua = { custoPessoaCicloBrl: 6.79, contingenciaPct: 10, impostosPct: 20, comissaoPct: 20 };
    const minimo = precoMinimoSimuladorBrl({ ...regua, margemAlvoPct: 30 });
    expect(minimo).toBeCloseTo(1.3 * 6.79 * 1.1 / (1 - 1.3 * 0.4), 10);
    expect(markupSimuladorPct({ ...regua, precoPessoaCiclo: minimo })).toBeCloseTo(30, 10);

    // E o mesmo markup sai de `calcularProjeto` num projeto que só tem o simulador.
    const acessos = 100;
    const ciclos = 2;
    const projeto = calcularProjeto(
      { ...ESCOPO, ciclos, matrizesNovas: 0, simuladores: [{ acessos, precoPessoaCiclo: minimo }] },
      { ...PRECO, setupGeral: 0, pessoaCiclo: 0, unidade: 0, margemAlvoPct: 30 },
      { totalBrl: acessos * ciclos * regua.custoPessoaCicloBrl * 1.1, oneTimeBrl: 0, mesesPrograma: 4, percentualSobreReceita: 0.4 },
    );
    expect(projeto.markupPct).toBeCloseTo(30, 8);
  });

  it('o mínimo é markup sobre o custo total: R$ 3,38 com 30% de encargos e 50% de alvo dá R$ 10,14', () => {
    // O caso que o dono estranhou em 09/10/2026: na régua antiga (margem sobre o
    // preço) o mesmo custo pedia R$ 18,59, 5,5× o custo.
    const regua = { custoPessoaCicloBrl: 3.38, contingenciaPct: 10, impostosPct: 20, comissaoPct: 10 };
    const minimo = precoMinimoSimuladorBrl({ ...regua, margemAlvoPct: 50 });
    expect(minimo).toBeCloseTo(10.14, 2);

    // No mínimo, o lucro é metade de tudo o que sai: IA com contingência + impostos + comissão.
    const custoTotal = 3.38 * 1.1 + minimo * 0.3;
    expect(minimo - custoTotal).toBeCloseTo(custoTotal * 0.5, 10);
    // R$ 15 por pessoa dá 82,5% sobre o custo total (era "45,2%" de margem no preço).
    expect(markupSimuladorPct({ ...regua, precoPessoaCiclo: 15 })).toBeCloseTo((10.5 - 3.718) / (3.718 + 4.5) * 100, 10);
  });

  it('sem sobra para o markup não há preço mínimo, e sem preço não há markup', () => {
    // 2,5 × (20% + 20%) = 100% do preço em impostos e comissão.
    expect(precoMinimoSimuladorBrl({
      custoPessoaCicloBrl: 5, contingenciaPct: 10, impostosPct: 20, comissaoPct: 20, margemAlvoPct: 150,
    })).toBe(Number.POSITIVE_INFINITY);
    expect(markupSimuladorPct({
      precoPessoaCiclo: 0, custoPessoaCicloBrl: 5, contingenciaPct: 10, impostosPct: 20, comissaoPct: 20,
    })).toBeNull();
  });
});

describe('cenário salvo e escopo da proposta', () => {
  it('cenário salvo antes dos simuladores abre com todos em zero e a régua padrão', () => {
    const antigo: any = { ...entradasPadrao(LISTAS) };
    delete antigo.simuladores;
    delete antigo.configSimuladores;
    const lido = normalizarEntradas(antigo, LISTAS)!;
    expect(lido.simuladores).toEqual(semSimuladores());
    expect(lido.configSimuladores).toEqual(configSimuladoresPadrao());
  });

  it('cenário salvo antes de 02/10 leva o preço e os treinos únicos para cada simulador', () => {
    // A forma real das 3 linhas de `orcamento_cenarios` em 02/10/2026.
    const antigo: any = {
      ...entradasPadrao(LISTAS),
      simuladores: { vendas: 100, atendimento: 0, lideranca: 100 },
      pricing: { ...ORCAMENTO_DEFAULTS, precoSimuladorPessoaCiclo: 50, treinosSimuladorPessoaCiclo: 6, custoTreinoSimuladorUsd: 0.22 },
    };
    delete antigo.configSimuladores;
    const lido = normalizarEntradas(antigo, LISTAS)!;
    for (const s of ['vendas', 'atendimento', 'lideranca'] as const) {
      expect(lido.configSimuladores[s].precoPessoaCiclo).toBe(50);
      expect(lido.configSimuladores[s].treinosPessoaCiclo).toBe(6);
      // O custo único antigo não é herdado: custo é da plataforma, não do cenário.
      expect(lido.configSimuladores[s]).toEqual({ ...SIMULADORES_DEFAULT[s], precoPessoaCiclo: 50, treinosPessoaCiclo: 6 });
    }
    // E as chaves antigas não ressuscitam na régua geral.
    expect('precoSimuladorPessoaCiclo' in lido.pricing).toBe(false);
  });

  it('a régua por simulador volta como foi gravada, e lixo cai no default', () => {
    const config = configSimuladoresPadrao();
    config.atendimento = { precoPessoaCiclo: 75, treinosPessoaCiclo: 4, turnosPorTreino: 12 };
    const gravado = { ...entradasPadrao(LISTAS), configSimuladores: config };
    expect(normalizarEntradas(gravado, LISTAS)!.configSimuladores).toEqual(config);

    const sujo: any = { ...entradasPadrao(LISTAS), configSimuladores: { vendas: { precoPessoaCiclo: 'x', turnosPorTreino: -4 }, lideranca: 7 } };
    const lido = normalizarEntradas(sujo, LISTAS)!;
    expect(lido.configSimuladores.vendas.precoPessoaCiclo).toBe(0);
    expect(lido.configSimuladores.vendas.turnosPorTreino).toBe(0);
    expect(lido.configSimuladores.lideranca).toEqual(SIMULADORES_DEFAULT.lideranca);
  });

  it('custos gravados no cenário (quando ainda eram editáveis) são descartados e não mudam a conta', () => {
    // A forma real de um cenário salvo em 02/10 entre `0288ab0b` e estas mudanças.
    const gravado: any = {
      ...entradasPadrao(LISTAS),
      simuladores: { vendas: 100, atendimento: 0, lideranca: 0 },
      configSimuladores: {
        ...configSimuladoresPadrao(),
        vendas: { ...SIMULADORES_DEFAULT.vendas, precoPessoaCiclo: 50, custoFixoTreinoUsd: 0.9, custoTurnoUsd: 0.5 },
      },
    };
    const lido = normalizarEntradas(gravado, LISTAS)!;
    expect('custoFixoTreinoUsd' in lido.configSimuladores.vendas).toBe(false);
    expect('custoTurnoUsd' in lido.configSimuladores.vendas).toBe(false);
    expect(lido.configSimuladores.vendas.precoPessoaCiclo).toBe(50);

    // E mesmo que o objeto chegue à conta com as chaves, ela usa os custos da plataforma.
    const r = simuladoresDoOrcamento({
      pessoas: gravado.simuladores, pessoasDoPrograma: 100, config: gravado.configSimuladores, ciclos: 1, cotacao: 5,
    });
    expect(r.itens[0].custoFixoTreinoUsd).toBe(CUSTO_FIXO_TREINO_USD.vendas);
    expect(r.itens[0].custoTurnoUsd).toBe(CUSTO_TURNO_USD.vendas);
    expect(r.itens[0].custoTreinoUsd).toBeCloseTo(CUSTO_FIXO_TREINO_USD.vendas + 8 * CUSTO_TURNO_USD.vendas, 10);
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
    // "reception simulations" (menu do RH em inglês) entrou na lista em 27/09/2026.
    const antigos = /prontid[ãa]o (para|de) (a )?lideran[çc]a|treino de atendimento|leadership readiness|reception training|reception simulations?|preparaci[óo]n para el liderazgo|pr[áa]ctica de atenci[óo]n/i;
    for (const loc of ['pt-BR', 'pt-PT', 'en-US', 'es-ES']) {
      const texto = readFileSync(join(__dirname, '..', '..', 'messages', `${loc}.json`), 'utf8');
      expect(texto.match(antigos)?.[0], loc).toBeUndefined();
    }
  });

  it('o Beto chama a tela do atendimento pelo nome atual (27/09/2026)', async () => {
    const { resolverPaginaAtualBeto } = await import('@/lib/beto/pagina-atual');
    expect(resolverPaginaAtualBeto('/dashboard/treino-atendimento')?.tela).toBe('Simulador de atendimento');
  });
});
