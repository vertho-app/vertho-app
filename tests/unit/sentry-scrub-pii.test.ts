/**
 * Scrub do Sentry (R-112, 03/10/2026): o token do link de acesso (`/entrar?t=`)
 * saía inteiro no `request.url`, no `query_string` e no breadcrumb de
 * navegação. Quem lesse o evento entraria como a pessoa. Valores sintéticos.
 */
import { describe, it, expect } from 'vitest';
import { scrubPII } from '@/lib/sentry-scrub-pii';

const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.c2VncmVkbw.assinatura';
const URL_ACESSO = `https://escola.vertho.ai/entrar?t=${TOKEN}&ir=1`;

describe('credencial em URL', () => {
  it('request.url: o token sai, o resto da URL fica', () => {
    const ev: any = scrubPII({ request: { url: URL_ACESSO } }, {});
    expect(ev.request.url).toBe('https://escola.vertho.ai/entrar?t=[REDACTED]&ir=1');
  });

  it('query_string nos três formatos do SDK: texto, pares e objeto', () => {
    expect(scrubPII({ request: { query_string: `t=${TOKEN}&ir=1` } } as any, {})!.request!.query_string)
      .toBe('t=[REDACTED]&ir=1');
    expect(scrubPII({ request: { query_string: [['t', TOKEN], ['ir', '1']] } } as any, {})!.request!.query_string)
      .toEqual([['t', '[REDACTED]'], ['ir', '1']]);
    expect(scrubPII({ request: { query_string: { codigo: 'ABC123', aba: 'x' } } } as any, {})!.request!.query_string)
      .toEqual({ codigo: '[REDACTED]', aba: 'x' });
  });

  it('breadcrumb de navegação e de fetch', () => {
    const ev: any = scrubPII({
      breadcrumbs: [
        { category: 'navigation', data: { from: URL_ACESSO, to: '/dashboard' } },
        { category: 'fetch', data: { url: `/auth/callback?token_hash=${TOKEN}&type=magiclink` } },
      ],
    }, {});
    expect(ev.breadcrumbs[0].data.from).toBe('https://escola.vertho.ai/entrar?t=[REDACTED]&ir=1');
    expect(ev.breadcrumbs[1].data.url).toBe('/auth/callback?token_hash=[REDACTED]&type=magiclink');
  });

  it('span de transação e header Referer', () => {
    const ev: any = scrubPII({
      spans: [{ description: `GET ${URL_ACESSO}`, data: { 'http.url': URL_ACESSO } }],
      request: { headers: { Referer: URL_ACESSO } },
    }, {});
    expect(JSON.stringify(ev)).not.toContain(TOKEN);
  });

  it('parâmetro parecido com o nome não é tocado (`tab`, `type`)', () => {
    const ev: any = scrubPII({ request: { url: 'https://x.vertho.ai/admin?tab=t&type=token' } }, {});
    expect(ev.request.url).toBe('https://x.vertho.ai/admin?tab=t&type=token');
  });
});

describe('o que já era redigido continua', () => {
  it('e-mail, telefone e CPF na mensagem; e-mail do usuário removido', () => {
    const ev: any = scrubPII({
      message: 'falhou para ana@exemplo.com (11) 99999-8888 123.456.789-01',
      user: { id: 'u1', email: 'ana@exemplo.com' },
    }, {});
    expect(ev.message).toBe('falhou para [email] [telefone] [cpf]');
    expect(ev.user).toEqual({ id: 'u1' });
  });
});
