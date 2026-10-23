import { describe, expect, it } from 'vitest';
import { erroDoCadastroPacote, papelExigeCadastroDoPacote, type ReferenciaCadastroPacote } from '@/lib/pacote-clinicas';
import { MODELOS_CLINICA, codigoDoCasoNoModelo, FORMATO_CODIGO_MODELO } from '@/lib/recepcao/modelos-clinica';

/**
 * Cadastro da secretária no pacote de clínicas (onlabel, 23/10/2026): quem cadastra é o admin da
 * vertho.ai, e o servidor confere clínica, cargo e modelo do simulador contra o que existe NA EMPRESA.
 * Antes o cargo era texto livre (um erro de digitação punha a pessoa num cargo sem matriz) e a
 * clínica nem existia no cadastro.
 */

const REF: ReferenciaCadastroPacote = {
  cargos: ['Secretária de convênios', 'Secretária de procedimentos'],
  clinicas: ['clinica-1', 'clinica-2'],
  modelos: ['horizonte', 'aurora'],
};
const OK = { cargo: 'Secretária de convênios', escolaId: 'clinica-1', recepcaoModelo: 'horizonte' };

describe('erroDoCadastroPacote', () => {
  it('aceita clínica, cargo e modelo da empresa', () => {
    expect(erroDoCadastroPacote(OK, REF)).toBeNull();
  });

  it('recusa cargo fora da lista da empresa (o texto livre de antes)', () => {
    expect(erroDoCadastroPacote({ ...OK, cargo: 'Secretaria de convenios' }, REF)).toMatch(/não é um dos cargos/);
    expect(erroDoCadastroPacote({ ...OK, cargo: '  ' }, REF)).toMatch(/escolha o cargo/);
  });

  it('recusa clínica que não é da empresa (o id vem do navegador)', () => {
    expect(erroDoCadastroPacote({ ...OK, escolaId: 'clinica-de-outro-tenant' }, REF)).toMatch(/não pertence a esta empresa/);
    expect(erroDoCadastroPacote({ ...OK, escolaId: '' }, REF)).toMatch(/escolha a clínica/);
  });

  it('com modelos no código, o modelo é obrigatório e precisa existir', () => {
    expect(erroDoCadastroPacote({ ...OK, recepcaoModelo: '' }, REF)).toMatch(/escolha o modelo/);
    expect(erroDoCadastroPacote({ ...OK, recepcaoModelo: 'inventado' }, REF)).toMatch(/não existe/);
  });

  it('com a lista de modelos vazia (recurso desligado), nenhum modelo é aceito e a falta dele não barra', () => {
    const semModelos = { ...REF, modelos: [] };
    expect(erroDoCadastroPacote({ ...OK, recepcaoModelo: null }, semModelos)).toBeNull();
    expect(erroDoCadastroPacote({ ...OK, recepcaoModelo: 'horizonte' }, semModelos)).toMatch(/ainda não há modelos/);
  });

  it('na edição, só o que veio no pedido é conferido', () => {
    expect(erroDoCadastroPacote({ recepcaoModelo: 'aurora' }, REF, { parcial: true })).toBeNull();
    expect(erroDoCadastroPacote({ cargo: 'Outro' }, REF, { parcial: true })).toMatch(/não é um dos cargos/);
    // Campo vazio que VEIO não é "ausente": tirar a clínica da secretária é recusado.
    expect(erroDoCadastroPacote({ escolaId: '' }, REF, { parcial: true })).toMatch(/escolha a clínica/);
  });
});

describe('quem precisa de clínica, cargo e modelo', () => {
  it('só a secretária (colaborador); a conta de RH da empresa não treina', () => {
    expect(papelExigeCadastroDoPacote('colaborador')).toBe(true);
    expect(papelExigeCadastroDoPacote(undefined)).toBe(true);
    expect(papelExigeCadastroDoPacote('rh')).toBe(false);
    expect(papelExigeCadastroDoPacote('gestor')).toBe(false);
  });
});

describe('modelos de clínica do simulador', () => {
  it('a lista nasce vazia até a definição dos 6 modelos (recurso desligado)', () => {
    expect(MODELOS_CLINICA).toEqual([]);
  });

  it('o código do caso leva o modelo: publicar o modelo B não arquiva o caso do modelo A', () => {
    const a = codigoDoCasoNoModelo('remarcacao-02', 'horizonte');
    const b = codigoDoCasoNoModelo('remarcacao-02', 'aurora');
    expect(a).not.toBe(b);
    // Continua um id de caso válido (`schema.ts`: /^[a-z][a-z0-9_\-]{1,63}$/).
    expect(a).toMatch(/^[a-z][a-z0-9_\-]{1,63}$/);
  });

  it('o formato do código é o do CHECK da mig 297', () => {
    expect(FORMATO_CODIGO_MODELO.test('horizonte')).toBe(true);
    expect(FORMATO_CODIGO_MODELO.test('Horizonte')).toBe(false);
    expect(FORMATO_CODIGO_MODELO.test('x')).toBe(false);
  });
});
