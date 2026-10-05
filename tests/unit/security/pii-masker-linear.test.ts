/**
 * Medido em 05/10/2026 ao provar o corte de tamanho do Beto: `maskTextPII` era
 * QUADRÁTICO. O regex de e-mail (`[\w.+-]+@...`) tentava casar a partir de CADA
 * posição de uma sequência longa sem `@`: 64 mil caracteres levavam 1,7 s, 100 mil
 * passavam de 6 s e 2 milhões, cerca de meia hora de CPU. Quem mandasse texto grande
 * a qualquer chamador sem teto de tamanho travava a instância (negação de serviço).
 *
 * Uma primeira correção (lookbehind no regex) deixava de mascarar o segundo e-mail de
 * `a@b.com+c@d.org`: mudava o RESULTADO. A varredura que ficou parte de cada `@` e
 * tem que casar exatamente o que o regex antigo casava. Este arquivo prova as duas
 * metades: o mesmo resultado, e tempo linear.
 */
import { describe, it, expect } from 'vitest';
import { maskTextPII } from '@/lib/pii-masker';

/** O comportamento ANTIGO, como referência (sem dígitos nos textos, para telefone/CPF não entrarem). */
const referencia = (texto: string) =>
  texto.normalize('NFC').replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, (m) => (m.toLowerCase().endsWith('@masked.local') ? m : '[email]'));

describe('maskTextPII é linear', () => {
  it.each([
    ['sequência de letras sem @', 'x'.repeat(100_000)],
    ['sequência de pontos e letras', 'a.b'.repeat(33_000)],
    ['várias sequências coladas por @ sem domínio válido', 'abc@'.repeat(25_000)],
    ['texto com e-mail no fim de uma sequência enorme', `${'x'.repeat(75_000)}@dominio.com`],
    ['arrobas em sequência', '@'.repeat(100_000)],
    ['partes locais longas, domínios inválidos', 'aaaa@b'.repeat(15_000)],
  ])('🔴 %s: 100 mil caracteres em menos de 1 s (antes: vários segundos, e crescendo ao quadrado)', (_nome, texto) => {
    const t = performance.now();
    maskTextPII(texto, null);
    expect(performance.now() - t).toBeLessThan(1000);
  });
});

describe('a varredura casa exatamente o que o regex antigo casava', () => {
  const PEDACOS = ['a', 'b', 'Z', '_', '.', '+', '-', '@', '@b.co', '@masked.local', '@x.com', ' ', '/', 'c', 'm', '\n', 'pessoa-x@masked.local'];
  const sorteio = (semente: number) => {
    let s = semente;
    return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  };

  it('5.000 textos aleatórios: mesma saída, inclusive com `+` colando e-mails', () => {
    const r = sorteio(20261005);
    for (let i = 0; i < 5000; i++) {
      const n = 1 + Math.floor(r() * 30);
      let texto = '';
      for (let k = 0; k < n; k++) texto += PEDACOS[Math.floor(r() * PEDACOS.length)];
      expect(maskTextPII(texto, null), JSON.stringify(texto)).toBe(referencia(texto));
    }
  });

  it('🔴 `+` entre dois e-mails: o segundo continua mascarado (o lookbehind deixava vazar)', () => {
    expect(maskTextPII('a@b.com+c@d.org', null)).toBe('[email][email]');
    expect(maskTextPII('a@b.com+c@d.org', null)).toBe(referencia('a@b.com+c@d.org'));
  });

  it('e-mails de verdade seguem mascarados, os do próprio domínio-alias não', () => {
    expect(maskTextPII('fale com ana.souza+x@escola.edu.br hoje', null)).toBe('fale com [email] hoje');
    expect(maskTextPII('veja pessoa-1@masked.local aqui', null)).toBe('veja pessoa-1@masked.local aqui');
    expect(maskTextPII('a@b.co, c@d.org', null)).toBe('[email], [email]');
  });

  it('texto sem arroba, vazio e nulo passam sem erro', () => {
    expect(maskTextPII('sem email aqui', null)).toBe('sem email aqui');
    expect(maskTextPII('', null)).toBe('');
    expect(maskTextPII(null, null)).toBe('');
  });
});
