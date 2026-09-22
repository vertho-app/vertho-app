// `emailDeAcessoPorTelefone`: a régua única do e-mail da conta de quem entra
// pelo WhatsApp (OTP, link por telefone e o Beto). Se ela divergir entre as
// portas, a mesma pessoa ganha duas contas em `auth.users`.
import { describe, it, expect } from 'vitest';
import { emailDeAcessoPorTelefone, isProxyEmail, proxyEmailFromPhone } from '@/lib/phone-otp';

describe('emailDeAcessoPorTelefone', () => {
  it('e-mail real do cadastro vence, em minúsculas', () => {
    expect(emailDeAcessoPorTelefone('Ana@Escola.gov.br', 'emp-1', '5574999225966')).toBe('ana@escola.gov.br');
  });

  it('proxy já gravado é mantido (não gera outro)', () => {
    const proxy = proxyEmailFromPhone('emp-1', '5574999225966');
    expect(emailDeAcessoPorTelefone(proxy.toUpperCase(), 'emp-2', '5511999999999')).toBe(proxy);
  });

  it('sem e-mail, proxy determinístico do telefone', () => {
    for (const vazio of [null, undefined, '']) {
      const r = emailDeAcessoPorTelefone(vazio, 'emp-1', '5574999225966');
      expect(r).toBe(proxyEmailFromPhone('emp-1', '5574999225966'));
      expect(isProxyEmail(r)).toBe(true);
    }
  });
});
