import { describe, expect, it } from 'vitest';
import {
  colunasDoCargo, casosReaisDaLinha, casosReaisParaGravar, slotsDosCasos, comCasoTrocado,
  camposNovosDoCargo, planoDoImportDeCargos, MAX_CASOS_DA_PLANILHA,
} from '@/lib/cargos-import';

/**
 * Casos reais do gestor e fronteiras do cargo (mig 286; plano de cenários de 11/10/2026,
 * Fase 3). O gestor devolve a planilha de cargos com "Fronteiras" e "Caso real 1" a 8; o
 * import grava esses campos também em cargo que já existe, e o "Salvar cargo" não os zera.
 */

describe('planilha: títulos novos', () => {
  it('"Fronteiras", "O que o cargo não faz", "Caso real N" e "Caso N" viram as colunas certas', () => {
    const [l] = colunasDoCargo([{ cargo: 'Caixa', 'o que o cargo não faz': 'Não abre o cofre', 'Caso real 1': 'A', 'caso 2': 'B' }]);
    expect(l).toMatchObject({ nome: 'Caixa', fronteiras: 'Não abre o cofre', caso_real_1: 'A', caso_real_2: 'B' });
    expect(colunasDoCargo([{ 'Fronteiras do cargo': 'X' }])[0]).toEqual({ fronteiras: 'X' });
  });

  it('os casos da linha saem na ordem das colunas, sem os vazios', () => {
    expect(casosReaisDaLinha({ caso_real_3: 'três', caso_real_1: ' um ', caso_real_2: '  ' })).toEqual([{ texto: 'um' }, { texto: 'três' }]);
    expect(casosReaisDaLinha({})).toBeNull();
  });
});

describe('casosReaisParaGravar', () => {
  it('aceita strings e objetos, limpa e devolve null sem nenhum caso (coluna vazia, não [])', () => {
    expect(casosReaisParaGravar(['a', { texto: ' b ' }, { texto: '' }, 3, null])).toEqual([{ texto: 'a' }, { texto: 'b' }]);
    expect(casosReaisParaGravar([])).toBeNull();
    expect(casosReaisParaGravar('não é lista')).toBeNull();
  });

  it(`no máximo ${MAX_CASOS_DA_PLANILHA} casos`, () => {
    expect(casosReaisParaGravar(Array.from({ length: 12 }, (_, i) => `c${i}`))).toHaveLength(MAX_CASOS_DA_PLANILHA);
  });
});

describe('formulário de cargo: os casos', () => {
  it('o texto vai cru (o espaço no fim fica, senão não dá para digitar duas palavras) e há um campo em branco no fim', () => {
    expect(slotsDosCasos([{ texto: 'duas ' }])).toEqual(['duas ', '']);
    expect(slotsDosCasos(null)).toEqual(['']);
  });

  it('campos vazios no fim não se acumulam; no máximo os 8', () => {
    expect(slotsDosCasos([{ texto: 'a' }, { texto: '' }, { texto: ' ' }])).toEqual(['a', '']);
    const cheios = Array.from({ length: MAX_CASOS_DA_PLANILHA }, (_, i) => ({ texto: `c${i}` }));
    expect(slotsDosCasos(cheios)).toHaveLength(MAX_CASOS_DA_PLANILHA);
  });

  it('trocar um caso preserva os outros', () => {
    expect(comCasoTrocado([{ texto: 'a' }, { texto: 'b' }], 1, 'B')).toEqual([{ texto: 'a' }, { texto: 'B' }, { texto: '' }]);
    expect(comCasoTrocado([], 0, 'novo')).toEqual([{ texto: 'novo' }]);
  });
});

describe('"Salvar cargo": as colunas novas só entram se vieram no pedido', () => {
  it('sem os campos: nada (não zera o que o gestor preencheu pela planilha)', () => {
    expect(camposNovosDoCargo({})).toEqual({});
  });

  it('com os campos: limpos; vazio vira null (o usuário apagou)', () => {
    expect(camposNovosDoCargo({ fronteiras: '  Não executa climatização ', casos_reais: [{ texto: 'X' }, { texto: '' }] }))
      .toEqual({ fronteiras: 'Não executa climatização', casos_reais: [{ texto: 'X' }] });
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

  it('cargo existente sem caso nem fronteira na planilha: nada a fazer', () => {
    const plano = planoDoImportDeCargos(existentes, [{ nome: 'SUP. DE MANUTENÇÃO - INFRA E MECÂNICA', descricao: 'x' }]);
    expect(plano).toEqual({ novos: [], atualizar: [], ignorados: 1 });
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
