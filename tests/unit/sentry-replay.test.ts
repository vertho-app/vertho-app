import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { podeGravarReplay, opcoesDoReplay, limparEventoDeGravacao, ATRIBUTOS_MASCARADOS } from '@/lib/sentry-replay';
import { scrubPII, PARAMETROS_SECRETOS } from '@/lib/sentry-scrub-pii';

/**
 * Session Replay só em erro e com a tela mascarada (19/10/2026, lib/sentry-replay.ts). O que estes
 * testes protegem é o que a gravação NÃO pode levar: o token do link de acesso (que fica parado na
 * URL e no `href` da tela `/entrar/abrir`), o texto da tela e a lista de URLs da sessão.
 */

describe('podeGravarReplay: a URL da página vai crua no evento Meta do rrweb, então nem liga', () => {
  it('🔴 telas de acesso não gravam (o token fica parado nelas de propósito)', () => {
    for (const pathname of ['/entrar', '/entrar/abrir', '/degustacao', '/degustacao/x', '/auth/callback', '/c/AbCdEf123']) {
      expect(podeGravarReplay({ pathname, search: '' }), pathname).toBe(false);
    }
  });

  it('🔴 qualquer credencial de URL (a lista do scrub) desliga, em qualquer caixa', () => {
    for (const p of PARAMETROS_SECRETOS) {
      expect(podeGravarReplay({ pathname: '/dashboard', search: `?${p}=abc` }), p).toBe(false);
    }
    expect(podeGravarReplay({ pathname: '/dashboard', search: '?aba=1&TOKEN_HASH=x' })).toBe(false);
    // 🔴 o fragmento também: o login por link do Supabase entrega os tokens em `#access_token=...`
    expect(podeGravarReplay({ pathname: '/', search: '', hash: '#access_token=eyJ&refresh_token=abc&type=magiclink' })).toBe(false);
    expect(podeGravarReplay({ pathname: '/dashboard', search: '', hash: '#secao-2' })).toBe(true);
    // o ticket da sala e o código de volta da degustação
    expect(podeGravarReplay({ pathname: '/dashboard', search: '?sala=abc' })).toBe(false);
    expect(podeGravarReplay({ pathname: '/dashboard', search: '?volta=abc' })).toBe(false);
  });

  it('as telas do produto gravam (só em erro, pela amostragem do client)', () => {
    expect(podeGravarReplay({ pathname: '/dashboard/temporada/semana/3', search: '?trilha=abc' })).toBe(true);
    expect(podeGravarReplay({ pathname: '/admin/empresas', search: '' })).toBe(true);
    // prefixo não é rota: /entrarx não é a tela de acesso
    expect(podeGravarReplay({ pathname: '/entrarx', search: '' })).toBe(true);
    expect(podeGravarReplay(null)).toBe(false);
  });
});

describe('opcoesDoReplay: tela mascarada', () => {
  it('🔴 texto, campos e mídia mascarados; nenhum corpo de requisição', () => {
    const o = opcoesDoReplay();
    expect(o).toMatchObject({ maskAllText: true, maskAllInputs: true, blockAllMedia: true, networkDetailAllowUrls: [] });
  });

  it('🔴 `href` e `src` mascarados: mascarar texto não cobre atributo, e o token mora no href do /entrar/abrir', () => {
    for (const a of ['href', 'src', 'srcset', 'alt', 'value', 'title', 'placeholder', 'aria-label']) {
      expect(ATRIBUTOS_MASCARADOS, a).toContain(a);
    }
    expect(opcoesDoReplay().maskAttributes).toBe(ATRIBUTOS_MASCARADOS);
  });

  it('🔴 evento de navegação e de rede gravado passa pelo scrub (token, e-mail, telefone)', () => {
    const navegacao = { type: 5, timestamp: 1, data: { tag: 'breadcrumb', payload: { category: 'navigation', data: { from: '/login', to: '/entrar/abrir?t=SEGREDO' } } } };
    const rede = { type: 5, timestamp: 2, data: { tag: 'performanceSpan', payload: { op: 'resource.fetch', description: 'https://app.vertho.ai/api/x?token=SEGREDO&email=maria@x.com.br' } } };
    const texto = JSON.stringify([limparEventoDeGravacao(navegacao), limparEventoDeGravacao(rede)]);
    expect(texto).not.toContain('SEGREDO');
    expect(texto).not.toContain('maria@x.com.br');
    expect(opcoesDoReplay().beforeAddRecordingEvent).toBe(limparEventoDeGravacao);
  });
});

describe('replay_event: a lista de URLs da sessão', () => {
  it('🔴 o scrubPII limpa `urls` (o replay_event não passa pelo beforeSend)', () => {
    const ev: any = scrubPII({ type: 'replay_event', urls: ['https://app.vertho.ai/dashboard', 'https://app.vertho.ai/x?code=SEGREDO'] }, {});
    expect(JSON.stringify(ev.urls)).not.toContain('SEGREDO');
    expect(ev.urls[0]).toBe('https://app.vertho.ai/dashboard');
  });

  it('🔴 token no FRAGMENTO também é redigido (erro e replay)', () => {
    const ev: any = scrubPII({ message: 'falhou em https://app.vertho.ai/#access_token=SEGREDO1&refresh_token=SEGREDO2&type=magiclink' }, {});
    expect(ev.message).not.toContain('SEGREDO1');
    expect(ev.message).not.toContain('SEGREDO2');
    expect(ev.message).toContain('type=magiclink');
  });
});

describe('sentry.client.config.js', () => {
  const fonte = readFileSync('sentry.client.config.js', 'utf8');

  it('🔴 nenhuma sessão gravada por padrão; 100% das que têm erro', () => {
    expect(fonte).toMatch(/replaysSessionSampleRate:\s*0\s*,/);
    expect(fonte).toMatch(/replaysOnErrorSampleRate:\s*1(\.0)?\s*,/);
  });

  it('🔴 o Replay só liga onde pode gravar, com as opções mascaradas, e o replay_event passa pelo scrub', () => {
    expect(fonte).toMatch(/podeGravarReplay\(window\.location\)/);
    expect(fonte).toMatch(/replayIntegration\(opcoesDoReplay\(\)\)/);
    expect(fonte).toMatch(/event\.type === 'replay_event' \? scrubPII\(event, hint\)/);
    // sem Replay estático no init: ele entra depois, por import dinâmico
    expect(fonte).not.toMatch(/integrations:\s*\[[^\]]*replayIntegration/);
  });
});
