/**
 * Análise de segurança de 05/10/2026: `buildRelatorioIndividualPrompt` montava
 * `.or(\`colaborador_id.eq.X,email_colaborador.eq.${email}\`)` com o e-mail do
 * cadastro. Vírgula, parêntese e ponto são sintaxe do filtro do PostgREST: o
 * e-mail `a@b.cc,id.not.is.null` virava uma condição OR a mais e devolvia todas as
 * `respostas` do escopo para o PDI daquela pessoa. O e-mail entra sem validação
 * (importação em lote) ou com um regex que aceita vírgula (cadastro aberto).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { valorDeFiltro } from '@/lib/postgrest-valor';

describe('valorDeFiltro', () => {
  it('🔴 o e-mail do ataque vira UM valor entre aspas, não uma condição a mais', () => {
    expect(valorDeFiltro('a@b.cc,id.not.is.null')).toBe('"a@b.cc,id.not.is.null"');
  });

  it('parênteses e ponto também ficam dentro das aspas', () => {
    expect(valorDeFiltro('x@y.com),and(id.not.is.null')).toBe('"x@y.com),and(id.not.is.null"');
  });

  it('aspas e barra invertida são escapadas, senão o ataque só mudaria de forma', () => {
    expect(valorDeFiltro('a"b')).toBe('"a\\"b"');
    expect(valorDeFiltro('a\\b')).toBe('"a\\\\b"');
    expect(valorDeFiltro('x",id.not.is.null,y="')).toBe('"x\\",id.not.is.null,y=\\""');
  });

  it('e-mail comum (inclusive com apóstrofo) só ganha as aspas', () => {
    expect(valorDeFiltro("o'brien@escola.br")).toBe('"o\'brien@escola.br"');
  });
});

describe('o único .or() com e-mail livre usa o escape', () => {
  const src = readFileSync('lib/relatorio-individual-prompt.ts', 'utf8');

  it('🔴 o e-mail entra no filtro por valorDeFiltro()', () => {
    expect(src).toContain('email_colaborador.eq.${valorDeFiltro(emailFilter)}');
  });

  it('nenhum .or() do arquivo interpola o e-mail cru', () => {
    expect(src).not.toMatch(/email_colaborador\.eq\.\$\{emailFilter\}/);
  });
});
