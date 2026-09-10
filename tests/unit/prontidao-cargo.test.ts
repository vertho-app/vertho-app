/**
 * Prontidão para o próximo cargo — o cruzamento entre duas avaliações da MESMA
 * pessoa contra gabaritos diferentes.
 *
 * O motor de scoring já é coberto pelos testes dele; o que este arquivo protege
 * é a camada que eu escrevi, e que quebra em silêncio: casar as duas leituras
 * pela pessoa certa, ordenar honrando o gate, e não afirmar delta quando falta
 * uma das pontas.
 *
 * `aggregateAdequacao` entra mockado de propósito — montar um gabarito completo
 * + DISC de quatro fatores para exercitar um `sort` seria um teste do motor
 * disfarçado de teste desta camada, e passaria a falhar por motivos que não são
 * este arquivo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAggregate = vi.fn();
vi.mock('@/lib/adequacao-cargo/aggregate', () => ({
  aggregateAdequacao: (...args: any[]) => mockAggregate(...args),
}));

const { compararProntidao } = await import('@/lib/adequacao-cargo/prontidao');

/** Pessoa no formato que o motor devolve, com só o que esta camada lê. */
function pessoa(over: Partial<any> = {}): any {
  return {
    id: 'id-1',
    nome: 'Fulana',
    beta: { pct: 80, atendidos: 0, total: 0, classe: 'alta', aplicavel: true },
    status: 'recomendado',
    statusLabel: 'Recomendado',
    knockoutFailed: false,
    knockoutMotivos: [],
    gaps: [],
    borderline: false,
    tracos: [],
    ...over,
  };
}

/** Atalho: uma pessoa com N medidas de fit conhecidas. */
function comTracos(id: string, fits: Record<string, number>): any {
  return pessoa({ id, nome: id, tracos: Object.entries(fits).map(([label, fitPct]) => ({ label, bloco: 'Competência', fitPct })) });
}

function base(pessoas: any[], over: Partial<any> = {}): any {
  return {
    cargo: 'X',
    avaliados: pessoas.length,
    pessoas,
    perfilIdeal: { pesos: [{ bloco: 'Competência', pct: 40 }], faixas: { recomendadoMin: 86.5, ressalvasMin: 75.4 } },
    semGabarito: false,
    semColaboradores: false,
    avisosCalibracao: [],
  };
}

/**
 * São TRÊS passadas: (1) pool da origem contra o gabarito do ALVO, (2) a origem
 * contra si mesma, (3) quem OCUPA o alvo — esta última é a que permite dizer se
 * os dois cargos são distinguíveis um do outro.
 */
function responder(noAlvo: any, naOrigem: any, ocupantesDoAlvo: any = base([])) {
  mockAggregate.mockImplementation((_sb: any, _emp: string, cargo: string, opts: any = {}) => {
    if (opts.poolCargos) return Promise.resolve(noAlvo);
    return Promise.resolve(cargo === 'B' || cargo === 'Gerente' ? ocupantesDoAlvo : naOrigem);
  });
}

beforeEach(() => { mockAggregate.mockReset(); });

describe('as duas passagens do motor', () => {
  it('avalia o pool da ORIGEM contra o gabarito do ALVO, e a origem contra si mesma', async () => {
    responder(base([pessoa()]), base([pessoa()]));
    await compararProntidao({} as any, 'emp-1', 'Representante Comercial', 'Gerente Comercial');

    expect(mockAggregate).toHaveBeenCalledTimes(3);
    // A pergunta: gente de Representante medida contra o perfil de Gerente.
    expect(mockAggregate).toHaveBeenCalledWith({}, 'emp-1', 'Gerente Comercial', { poolCargos: ['Representante Comercial'] });
    // A linha de base: sem ela, 88% no destino não significa nada.
    expect(mockAggregate).toHaveBeenCalledWith({}, 'emp-1', 'Representante Comercial');
    // Quem JÁ ocupa o destino: sem esta população não há como dizer se os dois
    // cargos são distinguíveis um do outro.
    expect(mockAggregate).toHaveBeenCalledWith({}, 'emp-1', 'Gerente Comercial');
  });
});

describe('cruzamento das duas leituras', () => {
  it('casa a pessoa pelo ID, não pelo nome', async () => {
    // Dois homônimos: casar por nome atribuiria a aderência atual da pessoa errada.
    responder(
      base([pessoa({ id: 'a', nome: 'Ana Souza', beta: { pct: 70 } })]),
      base([
        pessoa({ id: 'b', nome: 'Ana Souza', beta: { pct: 99 } }),
        pessoa({ id: 'a', nome: 'Ana Souza', beta: { pct: 50 } }),
      ]),
    );
    const r = await compararProntidao({} as any, 'e', 'A', 'B');
    expect(r.linhas[0].aderenciaAtual).toBe(50);
    expect(r.linhas[0].delta).toBe(20);
  });

  it('cai para o nome quando o id não veio (snapshot antigo), sem inventar delta', async () => {
    responder(
      base([pessoa({ id: undefined, nome: 'Beto Lima', beta: { pct: 60 } })]),
      base([pessoa({ id: 'x', nome: 'beto lima', beta: { pct: 90 } })]),
    );
    const r = await compararProntidao({} as any, 'e', 'A', 'B');
    expect(r.linhas[0].aderenciaAtual).toBe(90);
    expect(r.linhas[0].delta).toBe(-30);
  });

  it('quem não existe na origem fica com atual e delta NULOS, nunca zero', async () => {
    // Zero seria uma afirmação ("aderência 0% ao cargo atual"); nulo é a verdade
    // ("não foi avaliada lá") — e a tela imprime "—".
    responder(base([pessoa({ id: 'so-no-alvo', beta: { pct: 77 } })]), base([]));
    const r = await compararProntidao({} as any, 'e', 'A', 'B');
    expect(r.linhas[0].aderenciaAtual).toBeNull();
    expect(r.linhas[0].delta).toBeNull();
    expect(r.linhas[0].aderenciaAlvo).toBe(77);
  });
});

describe('ordenação', () => {
  it('joga quem reprova um requisito eliminatório para o FIM, mesmo com aderência alta', async () => {
    responder(
      base([
        pessoa({ id: '1', nome: 'Alta mas bloqueada', beta: { pct: 94 }, knockoutFailed: true, knockoutMotivos: ['Liderança abaixo do mínimo'] }),
        pessoa({ id: '2', nome: 'Média livre', beta: { pct: 71 } }),
        pessoa({ id: '3', nome: 'Boa livre', beta: { pct: 88 } }),
      ]),
      base([]),
    );
    const r = await compararProntidao({} as any, 'e', 'A', 'B');
    expect(r.linhas.map((l) => l.nome)).toEqual(['Boa livre', 'Média livre', 'Alta mas bloqueada']);
    expect(r.linhas[2].motivosBloqueio).toEqual(['Liderança abaixo do mínimo']);
  });

  it('entre não-bloqueados, ordena pela aderência ao destino', async () => {
    responder(
      base([
        pessoa({ id: '1', nome: 'C', beta: { pct: 60 } }),
        pessoa({ id: '2', nome: 'A', beta: { pct: 91 } }),
        pessoa({ id: '3', nome: 'B', beta: { pct: 75 } }),
      ]),
      base([]),
    );
    const r = await compararProntidao({} as any, 'e', 'A', 'B');
    expect(r.linhas.map((l) => l.nome)).toEqual(['A', 'B', 'C']);
  });
});

describe('lacunas', () => {
  it('mostra no máximo 3, das piores para as melhores', async () => {
    responder(
      base([pessoa({
        gaps: [
          { traco: 'ok-ish', bloco: 'DISC', fitPct: 80 },
          { traco: 'pior', bloco: 'Competência', fitPct: 20 },
          { traco: 'meio', bloco: 'Competência', fitPct: 55 },
          { traco: 'quarto', bloco: 'DISC', fitPct: 90 },
        ],
      })]),
      base([]),
    );
    const r = await compararProntidao({} as any, 'e', 'A', 'B');
    expect(r.linhas[0].lacunas.map((g) => g.traco)).toEqual(['pior', 'meio', 'ok-ish']);
  });
});

describe('quando não dá para responder', () => {
  it('cargo alvo sem gabarito é dito, não vira lista vazia', async () => {
    responder({ ...base([]), semGabarito: true }, base([]));
    const r = await compararProntidao({} as any, 'e', 'Rep', 'Gerente');
    expect(r.indisponivel).toBe('sem_gabarito_alvo');
    expect(r.linhas).toEqual([]);
    expect(r.cargoAlvo).toBe('Gerente');
  });

  it('ninguém com DISC na origem é dito à parte de "sem gabarito"', async () => {
    responder({ ...base([]), semColaboradores: true }, base([]));
    const r = await compararProntidao({} as any, 'e', 'Rep', 'Gerente');
    expect(r.indisponivel).toBe('sem_pessoas_na_origem');
  });

  it('a falha de leitura do motor SOBE — não vira "ninguém está apto"', async () => {
    mockAggregate.mockRejectedValue(new Error('não foi possível ler os colaboradores'));
    await expect(compararProntidao({} as any, 'e', 'A', 'B')).rejects.toThrow('não foi possível ler');
  });
});

describe('o gabarito do alvo discrimina?', () => {
  it('acusa a medida que dá praticamente a mesma nota para todo mundo', async () => {
    // O caso real que gerou isto (09/09/2026): 4 das 14 medidas do perfil de
    // Gerente Comercial davam 100% para as 12 pessoas do pool. A ordem existia,
    // mas quase não era produzida pelo gabarito.
    responder(base([
      comTracos('a', { 'Empatia': 100, 'Planejamento': 100, 'Estabilidade': 35 }),
      comTracos('b', { 'Empatia': 100, 'Planejamento': 98, 'Estabilidade': 90 }),
      comTracos('c', { 'Empatia': 100, 'Planejamento': 100, 'Estabilidade': 60 }),
    ]), base([]));
    const r = await compararProntidao({} as any, 'e', 'A', 'B');
    expect(r.calibracaoAlvo.semDiscriminacao).toEqual(['Empatia', 'Planejamento']);
    expect(r.calibracaoAlvo.totalMedidas).toBe(3);
  });

  it('uma pessoa só não vira "gabarito ruim" — não há o que separar com n=1', async () => {
    responder(base([comTracos('a', { 'Empatia': 100, 'Estabilidade': 35 })]), base([]));
    const r = await compararProntidao({} as any, 'e', 'A', 'B');
    expect(r.calibracaoAlvo.semDiscriminacao).toEqual([]);
  });

  it('repassa os avisos do guardião do motor sem reescrevê-los', async () => {
    const avisos = [{ traco: 'Objetividade', pct: 100, tipo: 'teto' as const }];
    responder({ ...base([pessoa()]), avisosCalibracao: avisos }, base([]));
    const r = await compararProntidao({} as any, 'e', 'A', 'B');
    expect(r.calibracaoAlvo.avisos).toEqual(avisos);
  });
});

describe('os dois cargos são distinguíveis?', () => {
  const comBeta = (id: string, pct: number) => pessoa({ id, nome: id, beta: { pct } });

  it('separação total dá índice 1,00 e não acusa nada', async () => {
    // Todo ocupante do alvo acima de todo candidato.
    responder(
      base([comBeta('c1', 70), comBeta('c2', 72), comBeta('c3', 68)]),
      base([]),
      base([comBeta('o1', 90), comBeta('o2', 88)]),
    );
    const r = await compararProntidao({} as any, 'e', 'A', 'B');
    expect(r.separacaoEntreCargos.indice).toBe(1);
    expect(r.separacaoEntreCargos.indistinguiveis).toBe(false);
  });

  it('listas embaralhadas dão índice perto de 0,50 e ACUSAM', async () => {
    // O caso de Ibipeba: ocupantes e candidatos na mesma faixa.
    responder(
      base([comBeta('c1', 88), comBeta('c2', 86), comBeta('c3', 84), comBeta('c4', 90)]),
      base([]),
      base([comBeta('o1', 87), comBeta('o2', 85), comBeta('o3', 89)]),
    );
    const r = await compararProntidao({} as any, 'e', 'A', 'B');
    expect(r.separacaoEntreCargos.indice).toBeLessThan(0.6);
    expect(r.separacaoEntreCargos.indistinguiveis).toBe(true);
  });

  it('um lado com menos de 2 pessoas NÃO vira "cargos iguais" — vira não medido', async () => {
    // n=1 de um lado torna o índice 0 ou 1 por construção; afirmar qualquer
    // coisa ali seria inventar.
    responder(base([comBeta('c1', 70), comBeta('c2', 72)]), base([]), base([comBeta('o1', 60)]));
    const r = await compararProntidao({} as any, 'e', 'A', 'B');
    expect(r.separacaoEntreCargos.indice).toBeNull();
    expect(r.separacaoEntreCargos.indistinguiveis).toBe(false);
  });

  it('empate conta meio ponto — duas listas idênticas dão exatamente 0,50', async () => {
    responder(
      base([comBeta('c1', 80), comBeta('c2', 80)]),
      base([]),
      base([comBeta('o1', 80), comBeta('o2', 80)]),
    );
    const r = await compararProntidao({} as any, 'e', 'A', 'B');
    expect(r.separacaoEntreCargos.indice).toBe(0.5);
  });
});

describe('o que a tela precisa para não reinventar régua', () => {
  it('devolve as faixas e os pesos do cargo ALVO, e carimba o instante do cálculo', async () => {
    responder(base([pessoa()]), base([]));
    const antes = Date.now();
    const r = await compararProntidao({} as any, 'e', 'A', 'B');
    expect(r.faixas).toEqual({ recomendadoMin: 86.5, ressalvasMin: 75.4 });
    expect(r.pesosAlvo).toEqual([{ bloco: 'Competência', pct: 40 }]);
    // Não é snapshot: a tela precisa dizer QUANDO rodou.
    expect(new Date(r.calculadoEm).getTime()).toBeGreaterThanOrEqual(antes);
  });
});
