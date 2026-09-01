import { describe, expect, it } from 'vitest';
import {
  DEGUSTACAO_MAX_COMPETENCIAS,
  competenciasDaDegustacao,
  isAssessmentDeDegustacao,
  isEmailDeConvidadoDemo,
} from '@/lib/demo/convidado-demo';

/**
 * O convidado da demonstração responde UMA competência: a etapa 01 existe para
 * ele entender o fluxo, e o diagnóstico completo é o que ele vê pronto nas
 * visões 02–04. O risco desta régua não é errar para menos — é VAZAR para um
 * tenant de cliente e cortar o assessment de gente real em 1 de 5.
 */
describe('quem está em degustação', () => {
  const cinco = ['A', 'B', 'C', 'D', 'E'];

  it('convidado de passaporte é convidado, apesar do e-mail @vertho.ai', () => {
    expect(isEmailDeConvidadoDemo('convidado.acme.aaaaaaaaaaaaaaaaaaaa@vertho.ai')).toBe(true);
  });

  it('convidado nomeado do seed e cadastro manual são convidados', () => {
    expect(isEmailDeConvidadoDemo('alpheu.sousa@gruposinal.com')).toBe(true);
    expect(isEmailDeConvidadoDemo('PLGcardoso@gmail.com')).toBe(true);
  });

  it('elenco fixo e staff da Vertho não são convidados', () => {
    expect(isEmailDeConvidadoDemo('bruna.demo@vertho.ai')).toBe(false);
    expect(isEmailDeConvidadoDemo('rodrigo@vertho.ai')).toBe(false);
    expect(isEmailDeConvidadoDemo('')).toBe(false);
    expect(isEmailDeConvidadoDemo(null)).toBe(false);
  });

  it('exige as duas pontas: tenant de demonstração E convidado', () => {
    expect(isAssessmentDeDegustacao(true, 'plgcardoso@gmail.com')).toBe(true);
    // pessoa real em tenant de cliente: o `is_demo` é o que a protege
    expect(isAssessmentDeDegustacao(false, 'ana@clientereal.com.br')).toBe(false);
    // persona do fixture dentro do tenant demo: é cenário, não convidado
    expect(isAssessmentDeDegustacao(true, 'bruna.demo@vertho.ai')).toBe(false);
    // `is_demo` ausente/nulo não vale por true
    expect(isAssessmentDeDegustacao(null, 'plgcardoso@gmail.com')).toBe(false);
    expect(isAssessmentDeDegustacao(undefined, 'plgcardoso@gmail.com')).toBe(false);
  });

  it('corta em uma competência na degustação e devolve a lista inteira fora dela', () => {
    expect(competenciasDaDegustacao(cinco, true)).toEqual(['A']);
    expect(competenciasDaDegustacao(cinco, true)).toHaveLength(DEGUSTACAO_MAX_COMPETENCIAS);
    expect(competenciasDaDegustacao(cinco, false)).toEqual(cinco);
  });

  it('preserva a ordem: a competência da degustação é a PRIMEIRA do Top 5', () => {
    // não é sorteio nem a última: o cenário mostrado tem de ser o mesmo que o
    // vendedor vê ao preparar a experiência
    expect(competenciasDaDegustacao(cinco, true)[0]).toBe('A');
  });

  it('não devolve a mesma referência de array (quem chama pode ordenar sem efeito colateral)', () => {
    const original = [...cinco];
    const saida = competenciasDaDegustacao(original, false);
    saida.push('F');
    expect(original).toHaveLength(5);
  });
});
