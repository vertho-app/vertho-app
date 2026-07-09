import { describe, it, expect } from 'vitest';
import { extractCorpo } from '@/lib/modulo-base-autor';

const bloco = (n: string) => `"${n}":{"x":1,"txt":"chave } dentro de string","arr":[{"y":2}]}`;
const bom = `{${bloco('conteudo_central')},${bloco('conteudo_aplicavel')},${bloco('guarda_corpos')},${bloco('adaptacao_por_formato')}}`;

describe('extractCorpo', () => {
  it('parseia JSON limpo', () => {
    const r = extractCorpo(bom);
    expect(r.conteudo_central.x).toBe(1);
    expect(r.adaptacao_por_formato.arr[0].y).toBe(2);
  });

  it('tolera cerca de markdown', () => {
    expect(extractCorpo('```json\n' + bom + '\n```')).toBeTruthy();
  });

  it('tolera prosa antes e depois', () => {
    expect(extractCorpo('Claro! Aqui está:\n' + bom + '\nEspero ter ajudado.')).toBeTruthy();
  });

  // A regressão real: o modelo fechou a chave raiz cedo demais, no meio do
  // payload — `...]}}},"guarda_corpos":{...`. JSON.parse do texto inteiro falha,
  // e o regex ganancioso devolve a mesma string quebrada. Os 4 blocos, porém,
  // estão íntegros. Um refino morreu assim com 26k chars de conteúdo bom.
  it('resgata bloco a bloco quando a chave raiz fecha cedo demais', () => {
    const quebrado = `{${bloco('conteudo_central')},${bloco('conteudo_aplicavel')}},${bloco('guarda_corpos')},${bloco('adaptacao_por_formato')}}`;
    expect(() => JSON.parse(quebrado)).toThrow(); // confirma que o payload é inválido

    const r = extractCorpo(quebrado);
    expect(r).toBeTruthy();
    expect(r.conteudo_central.x).toBe(1);
    expect(r.guarda_corpos.x).toBe(1);
    expect(r.adaptacao_por_formato.arr[0].y).toBe(2);
  });

  it('não se perde com chaves dentro de strings', () => {
    const r = extractCorpo(`{"conteudo_central":{"txt":"um } e um { soltos","ok":true}}}`);
    expect(r.conteudo_central.ok).toBe(true);
  });

  it('não se perde com aspas escapadas', () => {
    const r = extractCorpo(`{"conteudo_central":{"txt":"ele disse \\"} fim\\" e parou"}}}`);
    expect(r.conteudo_central.txt).toContain('} fim');
  });

  it('aceita corpo parcial (blocos faltantes viram {})', () => {
    const r = extractCorpo(`{${bloco('conteudo_central')}}`);
    expect(r.conteudo_central.x).toBe(1);
    expect(r.guarda_corpos).toEqual({});
  });

  it('devolve null quando não há nenhum bloco', () => {
    expect(extractCorpo('{"outra_coisa":1}')).toBeNull();
    expect(extractCorpo('')).toBeNull();
    expect(extractCorpo(null)).toBeNull();
    expect(extractCorpo('desculpe, não consegui')).toBeNull();
  });
});
