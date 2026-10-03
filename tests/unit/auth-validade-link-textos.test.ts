/**
 * R-47 (revisão de 02/10/2026): o mesmo link de acesso aparecia com duas
 * validades. E-mail e WhatsApp em texto diziam 24 horas; o template
 * `acesso_vertho` e o Beto, 15 minutos. Medido em 03/10 no Supabase Auth:
 * `mailer_otp_exp = 3600`, ou seja, 1 hora.
 *
 * Este teste amarra os textos ao número medido: se alguém mudar a constante
 * (porque mudou a configuração no Supabase), os textos acusam aqui.
 */
import { describe, it, expect } from 'vitest';
import { VALIDADE_LINK_ACESSO_MS } from '@/lib/auth/validade-link';
import {
  magicLinkEmail,
  magicLinkWhatsapp,
  signupEmail,
  signupWhatsapp,
} from '@/lib/i18n-auth-templates';

const PARAMS = { nome: 'Ana', empresaNome: 'Escola Teste', link: 'https://escola.vertho.ai/auth/callback?x=1' };

// Como cada idioma escreve "1 hora".
const UMA_HORA: Record<string, RegExp> = {
  'pt-BR': /vale por 1 hora/,
  'pt-PT': /válido durante 1 hora/,
  'es-ES': /válido durante 1 hora/,
  'en-US': /valid for 1 hour/,
};

describe('validade do link de acesso nos textos (R-47)', () => {
  it('a constante é a medida no Supabase: 1 hora', () => {
    expect(VALIDADE_LINK_ACESSO_MS).toBe(60 * 60 * 1000);
  });

  for (const [locale, umaHora] of Object.entries(UMA_HORA)) {
    it(`${locale}: e-mail e WhatsApp em texto dizem 1 hora, nunca 24`, () => {
      const textos = [
        magicLinkEmail(locale as any, PARAMS).html,
        signupEmail(locale as any, PARAMS).html,
        magicLinkWhatsapp(locale as any, PARAMS),
        signupWhatsapp(locale as any, PARAMS),
      ];
      for (const texto of textos) {
        expect(texto).toMatch(umaHora);
        expect(texto).not.toMatch(/24\s?h/);
      }
    });
  }
});
