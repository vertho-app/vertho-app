import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { scrubPII, scrubLog } from '@/lib/sentry-scrub-pii';

/**
 * IP de quem acessa não vai ao Sentry (19/10/2026). Medido no dia: o rastreamento do servidor gravava
 * `http.request.header.x_vercel_proxied_for: 200.0.203.206` num GET de usuário, fora do filtro padrão
 * do Sentry e da limpeza daqui. O volume subiu com o rastreamento a 100%.
 */
describe('IP no Sentry', () => {
  it('🔴 transação: o cabeçalho com o IP some na raiz (contexts.trace.data) e nos spans; o resto fica', () => {
    const ev: any = scrubPII({
      type: 'transaction',
      contexts: { trace: { data: {
        'http.request.header.x_vercel_proxied_for': '200.0.203.206',
        'http.request.header.x_forwarded_for': '200.0.203.206, 10.0.0.1',
        'http.request.header.x_real_ip': '2804:14c:5b:8000::1',
        'http.request.header.x_vercel_ip_city': 'Maca%C3%A9',
        'http.request.header.user_agent': 'Mozilla/5.0',
      } } },
      spans: [{ description: 'GET /x', data: { 'http.request.header.x_vercel_proxied_for': '2804:14c:5b:8000::1' } }],
    }, {});
    const texto = JSON.stringify(ev);
    for (const proibido of ['200.0.203.206', '2804:14c', 'Maca%C3%A9']) expect(texto, proibido).not.toContain(proibido);
    expect(ev.contexts.trace.data['http.request.header.user_agent']).toBe('Mozilla/5.0');
  });

  it('🔴 IPv4 em texto livre (mensagem de erro, log) vira [ip]', () => {
    expect(scrubPII({ message: 'limite estourado para 200.0.203.206 na rota' }, {}).message)
      .toBe('limite estourado para [ip] na rota');
    expect(scrubLog({ level: 'warn', message: 'ip=172.174.223.101 bloqueado' }).message).not.toContain('172.174.223.101');
  });

  it('não confunde versão, data nem número qualquer com IP', () => {
    const msg = 'SDK 10.76.1, Trigger 4.7.3, data 19.10.2026, nota 8.5, build 1.2.3.4.5, 999.1.1.1';
    expect(scrubPII({ message: msg }, {}).message).toBe(msg);
  });

  it('a regex do IP não usa lookbehind (roda no navegador; Safari antigo quebraria o bundle)', () => {
    const fonte = readFileSync('lib/sentry-scrub-pii.ts', 'utf8');
    expect(fonte).not.toMatch(/\(\?<[=!]/);
  });
});
