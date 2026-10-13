import { describe, expect, it } from 'vitest';
import {
  colunasDoCargo, casosReaisDaLinha, casosReaisParaGravar, slotsDosCasos, comCasoTrocado,
  camposNovosDoCargo, planoDoImportDeCargos, MAX_CASOS_DA_PLANILHA,
} from '@/lib/cargos-import';
import { casosReaisDoCargo, casoRealDaCompetencia } from '@/lib/ia3-cenarios-v2';

/**
 * Casos reais do gestor e fronteiras do cargo (mig 286; plano de cenários de 11/10/2026,
 * Fase 3). O gestor devolve a planilha de cargos com "Fronteiras" e os pares "Competência N"
 * + "Caso real N"; o import grava esses campos também em cargo que já existe, e o "Salvar
 * cargo" não os zera. Cada caso vai gravado COM a competência para a qual foi escrito.
 */

const TOP5 = ['Foco no cliente', 'Trabalho em equipe', 'Comunicação clara'];

describe('planilha: títulos novos', () => {
  it('"Fronteiras", "O que o cargo não faz", "Competência N", "Caso real N" e "Caso N" viram as colunas certas', () => {
    const [l] = colunasDoCargo([{ cargo: 'Caixa', 'o que o cargo não faz': 'Não abre o cofre', 'Competência 1': 'Foco no cliente', 'Caso real 1': 'A', 'caso 2': 'B' }]);
    expect(l).toMatchObject({ nome: 'Caixa', fronteiras: 'Não abre o cofre', competencia_1: 'Foco no cliente', caso_real_1: 'A', caso_real_2: 'B' });
    expect(colunasDoCargo([{ 'Fronteiras do cargo': 'X' }])[0]).toEqual({ fronteiras: 'X' });
  });

  it('cada caso da linha leva a competência e a coluna DELE: o vazio no meio não desloca os outros', () => {
    expect(casosReaisDaLinha({ competencia_1: 'Foco no cliente', caso_real_1: ' um ', caso_real_2: '  ', competencia_3: ' Comunicação  clara ', caso_real_3: 'três' })).toEqual([
      { texto: 'um', competencia: 'Foco no cliente', coluna: 1 },
      { texto: 'três', competencia: 'Comunicação clara', coluna: 3 },
    ]);
    expect(casosReaisDaLinha({})).toBeNull();
  });
});

describe('casosReaisParaGravar', () => {
  it('aceita strings e objetos, guarda a competência, tira a coluna e devolve null sem nenhum caso', () => {
    expect(casosReaisParaGravar(['a', { texto: ' b ', competencia: ' Foco ', coluna: 2 }, { texto: '' }, 3, null]))
      .toEqual([{ texto: 'a' }, { texto: 'b', competencia: 'Foco' }]);
    expect(casosReaisParaGravar([])).toBeNull();
    expect(casosReaisParaGravar('não é lista')).toBeNull();
  });

  it(`no máximo ${MAX_CASOS_DA_PLANILHA} casos`, () => {
    expect(casosReaisParaGravar(Array.from({ length: 12 }, (_, i) => `c${i}`))).toHaveLength(MAX_CASOS_DA_PLANILHA);
  });
});

describe('o caso chega à competência para a qual foi escrito (o defeito que a revisão de 13/10 achou)', () => {
  it('planilha com os casos 1 e 3 e o 2 em branco: a competência 3 recebe o caso 3, e a 2 sai da ficha (não pega o caso de outra)', () => {
    const [linha] = colunasDoCargo([{
      cargo: 'Analista', 'competência 1': TOP5[0], 'caso real 1': 'Caso do cliente',
      'competência 2': TOP5[1], 'caso real 2': '',
      'competência 3': TOP5[2], 'caso real 3': 'Caso da comunicação',
    }]);
    const plano = planoDoImportDeCargos([{ id: 'c-1', nome: 'Analista', top5_workshop: TOP5 }], [{ nome: linha.nome, casos_reais: casosReaisDaLinha(linha) }]);
    const gravados = casosReaisDoCargo(plano.atualizar[0].campos.casos_reais);
    expect(casoRealDaCompetencia(gravados, TOP5, { nome: TOP5[0] })).toBe('Caso do cliente');
    expect(casoRealDaCompetencia(gravados, TOP5, { nome: TOP5[1] })).toBeNull();
    expect(casoRealDaCompetencia(gravados, TOP5, { nome: TOP5[2] })).toBe('Caso da comunicação');
  });

  it('planilha SEM as colunas de competência: o caso N herda a competência N do Top 5 pela coluna', () => {
    const plano = planoDoImportDeCargos([{ id: 'c-1', nome: 'Analista', top5_workshop: TOP5 }], [{
      nome: 'Analista', casos_reais: casosReaisDaLinha({ caso_real_1: 'um', caso_real_3: 'três' }),
    }]);
    expect(plano.atualizar[0].campos.casos_reais).toEqual([
      { texto: 'um', competencia: TOP5[0] }, { texto: 'três', competencia: TOP5[2] },
    ]);
  });

  it('o Top 5 reordenado depois do import não troca os casos de competência', () => {
    const gravados = casosReaisDoCargo([{ texto: 'do cliente', competencia: TOP5[0] }, { texto: 'da equipe', competencia: TOP5[1] }]);
    const reordenado = [TOP5[1], TOP5[0], TOP5[2]];
    expect(casoRealDaCompetencia(gravados, reordenado, { nome: TOP5[0] })).toBe('do cliente');
  });

  it('competência escrita na planilha que não está no Top 5: gravada, e o import AVISA (nenhum cenário a usaria)', () => {
    const plano = planoDoImportDeCargos([{ id: 'c-1', nome: 'Analista', top5_workshop: TOP5 }], [{
      nome: 'Analista', casos_reais: casosReaisDaLinha({ competencia_1: 'Negociação', caso_real_1: 'x' }),
    }]);
    expect(plano.atualizar[0].campos.casos_reais).toEqual([{ texto: 'x', competencia: 'Negociação' }]);
    expect(plano.avisos).toEqual(['Analista: a competência "Negociação" não está no Top 5 do cargo; o caso foi gravado, mas nenhum cenário o usará']);
  });
});

describe('formulário de cargo: os casos', () => {
  it('com Top 5: um campo por competência, na ordem, com o texto gravado para ela', () => {
    expect(slotsDosCasos([{ texto: 'B', competencia: 'trabalho em equipe' }], TOP5)).toEqual([
      { competencia: TOP5[0], texto: '' }, { competencia: TOP5[1], texto: 'B' }, { competencia: TOP5[2], texto: '' },
    ]);
  });

  it('com Top 5: caso de competência que saiu do Top 5 e caso geral continuam visíveis depois', () => {
    const slots = slotsDosCasos([{ texto: 'antigo', competencia: 'Negociação' }, { texto: 'geral' }], TOP5);
    expect(slots.slice(3)).toEqual([{ competencia: 'Negociação', texto: 'antigo' }, { competencia: null, texto: 'geral' }]);
  });

  it('sem Top 5: os casos gerais, crus (o espaço no fim fica, senão não dá para digitar duas palavras), e um campo em branco no fim', () => {
    expect(slotsDosCasos([{ texto: 'duas ' }])).toEqual([{ competencia: null, texto: 'duas ' }, { competencia: null, texto: '' }]);
    expect(slotsDosCasos(null)).toEqual([{ competencia: null, texto: '' }]);
    expect(slotsDosCasos([{ texto: 'a' }, { texto: '' }, { texto: ' ' }])).toEqual([{ competencia: null, texto: 'a' }, { competencia: null, texto: '' }]);
  });

  it('trocar o texto guarda a competência do campo, e os outros ficam como estavam', () => {
    expect(comCasoTrocado([{ texto: 'B', competencia: TOP5[1] }], TOP5, 2, 'C')).toEqual([
      { texto: '' , competencia: TOP5[0] }, { texto: 'B', competencia: TOP5[1] }, { texto: 'C', competencia: TOP5[2] },
    ]);
    expect(comCasoTrocado([], null, 0, 'novo')).toEqual([{ texto: 'novo' }]);
  });
});

describe('"Salvar cargo": as colunas novas só entram se vieram no pedido', () => {
  it('sem os campos: nada (não zera o que o gestor preencheu pela planilha)', () => {
    expect(camposNovosDoCargo({})).toEqual({});
  });

  it('com os campos: limpos, com a competência; vazio vira null (o usuário apagou)', () => {
    expect(camposNovosDoCargo({ fronteiras: '  Não executa climatização ', casos_reais: [{ texto: 'X', competencia: TOP5[0] }, { texto: '' }] }))
      .toEqual({ fronteiras: 'Não executa climatização', casos_reais: [{ texto: 'X', competencia: TOP5[0] }] });
    expect(camposNovosDoCargo({ fronteiras: '', casos_reais: [] })).toEqual({ fronteiras: null, casos_reais: null });
  });
});

describe('import: cargo novo entra inteiro; cargo existente só ganha casos e fronteiras', () => {
  const existentes = [{ id: 'c-1', nome: 'SUP. DE MANUTENÇÃO - INFRA E MECÂNICA' }];

  it('cargo existente (nome sem caixa nem espaço nas pontas): só fronteiras e casos, o resto da ficha não é tocado', () => {
    const plano = planoDoImportDeCargos(existentes, [{
      nome: ' sup. de manutenção - infra e mecânica ', descricao: 'NÃO PODE SOBRESCREVER',
      fronteiras: 'Climatização: aciona o terceirizado', casos_reais: [{ texto: 'Duas pistas paradas com festa' }],
    }]);
    expect(plano.novos).toEqual([]);
    expect(plano.atualizar).toEqual([{
      id: 'c-1', nome: 'SUP. DE MANUTENÇÃO - INFRA E MECÂNICA',
      campos: { fronteiras: 'Climatização: aciona o terceirizado', casos_reais: [{ texto: 'Duas pistas paradas com festa' }] },
    }]);
  });

  it('planilha devolvida SEM acento e com espaço duplo casa com o cargo existente (a régua da ficha), em vez de virar cargo novo', () => {
    const plano = planoDoImportDeCargos(existentes, [{ nome: 'SUP. DE MANUTENCAO  - INFRA E MECANICA', casos_reais: [{ texto: 'Caso' }] }]);
    expect(plano.novos).toEqual([]);
    expect(plano.atualizar).toEqual([{ id: 'c-1', nome: 'SUP. DE MANUTENÇÃO - INFRA E MECÂNICA', campos: { casos_reais: [{ texto: 'Caso' }] } }]);
  });

  it('cargo existente sem caso nem fronteira na planilha: nada a fazer', () => {
    const plano = planoDoImportDeCargos(existentes, [{ nome: 'SUP. DE MANUTENÇÃO - INFRA E MECÂNICA', descricao: 'x' }]);
    expect(plano).toEqual({ novos: [], atualizar: [], ignorados: 1, avisos: [] });
  });

  it('só um dos dois campos: atualiza só esse', () => {
    const plano = planoDoImportDeCargos(existentes, [{ nome: 'SUP. DE MANUTENÇÃO - INFRA E MECÂNICA', fronteiras: '  ', casos_reais: [{ texto: 'Caso' }] }]);
    expect(plano.atualizar[0].campos).toEqual({ casos_reais: [{ texto: 'Caso' }] });
  });

  it('cargo novo: a ficha inteira, com fronteiras e casos; liderança só com "sim"', () => {
    const plano = planoDoImportDeCargos(existentes, [{ nome: 'Caixa', descricao: ' Atende ', eh_lideranca: 'Sim', fronteiras: 'Não faz sangria', casos_reais: [{ texto: 'Fila no sábado' }] }]);
    expect(plano.novos).toEqual([expect.objectContaining({
      nome: 'Caixa', descricao: 'Atende', eh_lideranca: true, fronteiras: 'Não faz sangria', casos_reais: [{ texto: 'Fila no sábado' }],
    })]);
    expect(plano.novos[0]).not.toHaveProperty('empresa_id');
  });

  it('nome repetido na planilha: vale a primeira linha', () => {
    const plano = planoDoImportDeCargos([], [{ nome: 'Caixa', descricao: 'primeira' }, { nome: 'CAIXA', descricao: 'segunda' }]);
    expect(plano.novos.map((c) => c.descricao)).toEqual(['primeira']);
  });
});
