/**
 * O núcleo puro de "salvar orçamento" (lib/orcamento/cenario.ts).
 *
 * O que se prova aqui, e por quê cada teste existe:
 *
 *  · `entradasPadrao` reproduz EXATAMENTE os defaults com que a tela abre. Se
 *    alguém mudar um `useState` da página sem mexer aqui, "Restaurar padrão"
 *    passa a devolver outro cenário do que o inicial — e ninguém percebe, porque
 *    os dois parecem plausíveis.
 *  · `normalizarEntradas` é a fronteira entre o jsonb gravado e a tela. O bug que
 *    ela impede é real e não hipotético: a página faz `PRESETS[preset].label`,
 *    que LANÇA com uma chave desconhecida. Um preset renomeado daqui a seis
 *    meses mataria a tela inteira ao reabrir um orçamento antigo.
 *  · Um campo ausente cai no default da régua, nunca vira `NaN`. `NaN` aqui não
 *    fica onde nasceu: propaga por todo o cálculo e aparece como "R$ NaN" numa
 *    folha de decisão que alguém vai usar para negociar.
 */
import { describe, expect, it } from 'vitest';
import {
  CONTEUDO_POR_FORMATO_DEFAULT,
  OPCOES_COMISSAO_ORCAMENTO,
  ORCAMENTO_DEFAULTS,
} from '@/lib/orcamento/precificacao';
import {
  entradasPadrao,
  normalizarEntradas,
  normalizarResumo,
  validarIdentificacao,
  type ListasValidas,
} from '@/lib/orcamento/cenario';

/** As listas que a TELA passa — mesmas chaves de PRESET_KEYS e JORNADAS. */
const LISTAS: ListasValidas = {
  presets: ['atual', 'premium', 'balanced', 'cheap'],
  jornadas: ['jornada', 'regular_duo', 'regular_single', 'onboarding', 'piloto'],
};

const BASE = entradasPadrao(LISTAS);

describe('entradasPadrao — os defaults com que a tela abre', () => {
  it('reproduz o cenário inicial da página campo a campo', () => {
    expect(BASE).toEqual({
      nClusters: 1,
      nPerfis: 3,
      nColabs: 100,
      matrizNovas: 3,
      ciclosPorAno: 1,
      metodo: 'votacao',
      tipoComissao: 'rc',
      preset: 'atual',
      jornada: 'jornada',
      conteudoColab: {
        video: CONTEUDO_POR_FORMATO_DEFAULT,
        podcast: CONTEUDO_POR_FORMATO_DEFAULT,
        texto: CONTEUDO_POR_FORMATO_DEFAULT,
        case: CONTEUDO_POR_FORMATO_DEFAULT,
      },
      nVideosExtraidos: 0,
      auditarExtracao: true,
      comAvatar: true,
      // A tela abre sem simulador no escopo.
      simuladores: { vendas: 0, atendimento: 0, lideranca: 0 },
      pricing: { ...ORCAMENTO_DEFAULTS },
    });
  });

  it('não compartilha o objeto da régua (editar o cenário não editaria ORCAMENTO_DEFAULTS)', () => {
    expect(BASE.pricing).not.toBe(ORCAMENTO_DEFAULTS);
    BASE.pricing.cotacao = 999;
    expect(ORCAMENTO_DEFAULTS.cotacao).not.toBe(999);
  });

  it('o default de comissão é o conservador (RC), e a jornada é a de 7 semanas', () => {
    expect(BASE.tipoComissao).toBe(OPCOES_COMISSAO_ORCAMENTO[0].key);
    expect(BASE.jornada).toBe('jornada');
  });
});

describe('normalizarEntradas — round-trip', () => {
  it('devolve intacto um cenário válido', () => {
    const gravado = { ...BASE, nColabs: 3000, ciclosPorAno: 6, jornada: 'regular_duo' };
    expect(normalizarEntradas(gravado, LISTAS)).toEqual(gravado);
  });

  it('preserva a régua editada do cenário, não a default', () => {
    const gravado = { ...BASE, pricing: { ...BASE.pricing, cotacao: 6.4, precoPessoaCiclo: 420 } };
    const lido = normalizarEntradas(gravado, LISTAS)!;
    expect(lido.pricing.cotacao).toBe(6.4);
    expect(lido.pricing.precoPessoaCiclo).toBe(420);
    // os campos não editados seguem os do cenário, não os de hoje
    expect(lido.pricing.precoSetupGeral).toBe(ORCAMENTO_DEFAULTS.precoSetupGeral);
  });
});

describe('normalizarEntradas — cenário antigo ou incompleto', () => {
  it('campo ausente cai no default da régua (não vira undefined nem NaN)', () => {
    const antigo: any = { ...BASE };
    delete antigo.nVideosExtraidos;
    delete antigo.comAvatar;
    delete antigo.pricing.precoMatrizAdaptada;

    const lido = normalizarEntradas(antigo, LISTAS)!;
    expect(lido.nVideosExtraidos).toBe(BASE.nVideosExtraidos);
    expect(lido.comAvatar).toBe(BASE.comAvatar);
    expect(lido.pricing.precoMatrizAdaptada).toBe(ORCAMENTO_DEFAULTS.precoMatrizAdaptada);
  });

  it('pricing ausente por inteiro volta com a régua completa', () => {
    const lido = normalizarEntradas({ ...BASE, pricing: undefined }, LISTAS)!;
    expect(lido.pricing).toEqual(ORCAMENTO_DEFAULTS);
  });

  it('chave desconhecida é descartada — campo removido da tela não ressuscita', () => {
    const lido: any = normalizarEntradas({ ...BASE, campoExtinto: 'zumbi' }, LISTAS)!;
    expect('campoExtinto' in lido).toBe(false);
    expect(Object.keys(lido).sort()).toEqual(Object.keys(BASE).sort());
  });

  it('número corrompido cai no default em vez de propagar NaN', () => {
    const lido = normalizarEntradas(
      { ...BASE, nColabs: 'abc', ciclosPorAno: null, pricing: { ...BASE.pricing, custoHora: NaN } },
      LISTAS,
    )!;
    expect(lido.nColabs).toBe(BASE.nColabs);
    expect(lido.ciclosPorAno).toBe(BASE.ciclosPorAno);
    expect(lido.pricing.custoHora).toBe(ORCAMENTO_DEFAULTS.custoHora);
    expect(Number.isNaN(lido.nColabs)).toBe(false);
  });
});

describe('normalizarEntradas — invariantes que a tela pressupõe', () => {
  it('preset fora da lista cai no default: PRESETS[chave] lançaria', () => {
    const lido = normalizarEntradas({ ...BASE, preset: 'preset_que_saiu_de_linha' }, LISTAS)!;
    expect(lido.preset).toBe('atual');
    expect(LISTAS.presets).toContain(lido.preset);
  });

  it('jornada fora da lista cai no default (a tela indexa JORNADAS por key)', () => {
    const lido = normalizarEntradas({ ...BASE, jornada: 'jornada_extinta' }, LISTAS)!;
    expect(lido.jornada).toBe('jornada');
  });

  it('preset não-string cai no default', () => {
    expect(normalizarEntradas({ ...BASE, preset: 42 }, LISTAS)!.preset).toBe('atual');
  });

  it('método de mapeamento inválido cai em votação', () => {
    expect(normalizarEntradas({ ...BASE, metodo: 'telepatia' }, LISTAS)!.metodo).toBe('votacao');
    expect(normalizarEntradas({ ...BASE, metodo: 'workshop' }, LISTAS)!.metodo).toBe('workshop');
  });

  it('canal de comissão inválido cai no RC (o fallback conservador da régua)', () => {
    const lido = normalizarEntradas({ ...BASE, tipoComissao: 'canal_inventado' }, LISTAS)!;
    expect(lido.tipoComissao).toBe('rc');
  });

  it('matrizes novas nunca passam do número de cargos (cargos = novas + adaptadas)', () => {
    const lido = normalizarEntradas({ ...BASE, nPerfis: 3, matrizNovas: 99 }, LISTAS)!;
    expect(lido.matrizNovas).toBe(3);
  });

  it('cargos crescido depois mantém as novas dentro do teto', () => {
    const lido = normalizarEntradas({ ...BASE, nPerfis: 10, matrizNovas: 4 }, LISTAS)!;
    expect(lido.matrizNovas).toBe(4);
  });

  it('clientesAtivos tem piso 1 — é o divisor do rateio de infra', () => {
    expect(normalizarEntradas({ ...BASE, pricing: { ...BASE.pricing, clientesAtivos: 0 } }, LISTAS)!.pricing.clientesAtivos).toBe(1);
    expect(normalizarEntradas({ ...BASE, pricing: { ...BASE.pricing, clientesAtivos: -5 } }, LISTAS)!.pricing.clientesAtivos).toBe(1);
  });

  it('contagens não ficam negativas nem fracionárias', () => {
    const lido = normalizarEntradas(
      { ...BASE, nColabs: -40, nClusters: 0, ciclosPorAno: 2.9, conteudoColab: { video: -3, podcast: 1.7, texto: 12, case: 12 } },
      LISTAS,
    )!;
    expect(lido.nColabs).toBe(0);
    expect(lido.nClusters).toBe(1);
    expect(lido.ciclosPorAno).toBe(2);
    expect(lido.conteudoColab.video).toBe(0);
    expect(lido.conteudoColab.podcast).toBe(1);
  });

  it('booleanos só aceitam booleano de verdade (string "false" não vira false)', () => {
    expect(normalizarEntradas({ ...BASE, comAvatar: 'false' }, LISTAS)!.comAvatar).toBe(true);
    expect(normalizarEntradas({ ...BASE, comAvatar: false }, LISTAS)!.comAvatar).toBe(false);
  });

  it('payload que não é objeto devolve null — a action reporta, a tela não renderiza NaN', () => {
    expect(normalizarEntradas(null, LISTAS)).toBeNull();
    expect(normalizarEntradas(undefined, LISTAS)).toBeNull();
    expect(normalizarEntradas('orcamento', LISTAS)).toBeNull();
    expect(normalizarEntradas([], LISTAS)).toBeNull();
    expect(normalizarEntradas(42, LISTAS)).toBeNull();
  });
});

describe('normalizarResumo — a folha congelada', () => {
  const RESUMO = {
    valorTabela: 100000, valorFinal: 90000, desconto: 10000, parcela: 45000, parcelas: 2,
    margemAbs: 30000, margemPct: 33.3, descontoMaxPct: 12.5, acimaDoPiso: false,
    custoTotalBrl: 60000, custoOperacionalBrl: 50000, custoIABrl: 8000,
    investimentoPorPessoaBrl: 900, custoPorPessoaBrl: 600, mesesPrograma: 2, ciclos: 1,
    pessoas: 100, unidades: 1, cargos: 3, jornada: 'jornada',
    piorSaldo: { mes: 1, saldo: -12000 },
  };

  it('round-trip do resumo completo', () => {
    expect(normalizarResumo(RESUMO)).toEqual(RESUMO);
  });

  it('margem e saldo negativos SOBREVIVEM — é o número que importa quando dá ruim', () => {
    const lido = normalizarResumo({ ...RESUMO, margemAbs: -5000, margemPct: -8.2, piorSaldo: { mes: 3, saldo: -99999 } })!;
    expect(lido.margemAbs).toBe(-5000);
    expect(lido.margemPct).toBe(-8.2);
    expect(lido.piorSaldo.saldo).toBe(-99999);
  });

  it('resumo de cenário antigo (sem KPI novo) ainda é listável, com zeros', () => {
    const antigo: any = { ...RESUMO };
    delete antigo.custoIABrl;
    delete antigo.piorSaldo;
    const lido = normalizarResumo(antigo)!;
    expect(lido.custoIABrl).toBe(0);
    expect(lido.piorSaldo).toEqual({ mes: 1, saldo: 0 });
    expect(lido.valorFinal).toBe(90000);
  });

  it('parcelas e ciclos têm piso 1 (dividem o valor do projeto)', () => {
    const lido = normalizarResumo({ ...RESUMO, parcelas: 0, ciclos: -3, mesesPrograma: 0 })!;
    expect(lido.parcelas).toBe(1);
    expect(lido.ciclos).toBe(1);
    expect(lido.mesesPrograma).toBe(1);
  });

  it('não-objeto devolve null', () => {
    expect(normalizarResumo(null)).toBeNull();
    expect(normalizarResumo([])).toBeNull();
  });
});

describe('validarIdentificacao — sem nome não há lista útil', () => {
  it('nome é obrigatório', () => {
    expect(validarIdentificacao('', null).ok).toBe(false);
    expect(validarIdentificacao('   ', null).ok).toBe(false);
    expect(validarIdentificacao(undefined, undefined).ok).toBe(false);
    expect(validarIdentificacao(42, null).ok).toBe(false);
  });

  it('nome e cliente são aparados', () => {
    const r = validarIdentificacao('  Rede X  ', '  Colégio Y  ');
    expect(r.ok).toBe(true);
    expect(r.valor).toEqual({ nome: 'Rede X', cliente: 'Colégio Y' });
  });

  it('cliente vazio vira null (não string vazia no banco)', () => {
    expect(validarIdentificacao('Cenário', '   ')).toMatchObject({ ok: true, valor: { cliente: null } });
    expect(validarIdentificacao('Cenário', null)).toMatchObject({ ok: true, valor: { cliente: null } });
  });

  it('teto de tamanho nos dois campos, com mensagem que diz o limite', () => {
    expect(validarIdentificacao('a'.repeat(121), null).erro).toMatch(/120/);
    expect(validarIdentificacao('ok', 'b'.repeat(121)).erro).toMatch(/120/);
    expect(validarIdentificacao('a'.repeat(120), null).ok).toBe(true);
  });
});
