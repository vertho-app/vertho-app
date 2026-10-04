import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * R-46 (03/10/2026): a política de privacidade diz que quem usa a plataforma
 * declara ciência dela. O login e o rodapé do painel ganharam o link no deploy
 * 0fd7358d; aqui se prova o resto: TODO e-mail que o app manda a quem usa a
 * plataforma leva o link no rodapé, no host do tenant quando há um.
 *
 * Fora de propósito: e-mails do Pulso (módulo fora do escopo desta onda), de
 * lead (CONARH, Radar) e alertas internos (custo de IA, saúde do pipeline).
 */

const sb = criarSupabaseMock();
const sendEmail = vi.fn(async (_b: any) => ({ ok: true, provider: 'resend' }));

vi.mock('@/lib/email-provider', () => ({
  sendEmail: (b: any) => sendEmail(b),
  emailConfigurationError: () => null,
  emailProviderName: () => 'resend',
}));
vi.mock('@/lib/admin-supabase', () => ({
  requireAdminSupabase: vi.fn(async () => sbAtual.client),
  requireEmpresaSupabase: vi.fn(async () => sbAtual.client),
}));
vi.mock('@/lib/tenant-db', () => ({ tenantDb: () => sbAtual.client }));
vi.mock('@/lib/auth/action-context', () => ({ requireAdminAction: vi.fn(async () => ({ email: 'admin@vertho.ai' })) }));
vi.mock('@/lib/demo/envio-guard', () => ({ gateEnvioDemo: vi.fn(async () => ({ blocked: false })) }));
vi.mock('@/lib/audit', () => ({ logAdminAction: vi.fn(async () => {}) }));
vi.mock('@/actions/ai-client', () => ({ callAI: vi.fn() }));
vi.mock('@/lib/whatsapp', () => ({ assertWhatsappAvailable: vi.fn(), sendWhatsapp: vi.fn() }));

let sbAtual = sb;

import { ROTULO_PRIVACIDADE, rodapePrivacidadeHtml, urlPrivacidade } from '@/lib/notifications/rodape-privacidade';
import {
  emailAvaliacaoFinal, emailEvidencia, emailMissao, emailPilula, emailPilulaPendente, emailSemanaPendente,
} from '@/lib/notifications/pilula-envio';
import { magicLinkEmail, signupEmail } from '@/lib/i18n-auth-templates';
import { APP_URL } from '@/lib/domain';
import { enviarLinksPerfil } from '@/actions/fase5/relatorios-envios';
import { locales } from '@/i18n/routing';

const LINK_TENANT = 'https://acme.vertho.ai/privacidade';
const ITEM = { competencia: 'Comunicação', descritor: 'Escuta ativa', conteudo: { core_titulo: 'Escuta ativa' } };
const OPTS = { semana: 3, baseUrl: 'https://acme.vertho.ai', formato: 'texto', pilula: 1 };

function temLinkDePrivacidade(html: string, href: string, rotulo = ROTULO_PRIVACIDADE['pt-BR']) {
  expect(html).toContain(`<a href="${href}"`);
  expect(html).toContain(`>${rotulo}</a>`);
}

describe('rodapé de privacidade: o helper', () => {
  it('o rótulo é o MESMO de messages/*.json (login e painel), nos 4 idiomas', () => {
    for (const locale of locales) {
      const msgs = JSON.parse(readFileSync(join(process.cwd(), 'messages', `${locale}.json`), 'utf-8'));
      expect(msgs.Login.privacyLink, `Login.privacyLink ${locale}`).toBe(ROTULO_PRIVACIDADE[locale]);
      expect(msgs.DashboardShell.privacyLink, `DashboardShell.privacyLink ${locale}`).toBe(ROTULO_PRIVACIDADE[locale]);
    }
  });

  it('usa o host do tenant, sem barra dupla, e cai no APP_URL quando não há base', () => {
    expect(urlPrivacidade('https://ibipeba.vertho.ai')).toBe('https://ibipeba.vertho.ai/privacidade');
    expect(urlPrivacidade('https://ibipeba.vertho.ai/')).toBe('https://ibipeba.vertho.ai/privacidade');
    expect(urlPrivacidade('')).toBe(`${APP_URL}/privacidade`);
    expect(urlPrivacidade(null)).toBe(`${APP_URL}/privacidade`);
    expect(urlPrivacidade(undefined)).toBe(`${APP_URL}/privacidade`);
  });

  it('o link é sempre absoluto (link relativo num e-mail não abre em lugar nenhum)', () => {
    for (const base of ['', 'https://acme.vertho.ai', undefined]) {
      expect(urlPrivacidade(base)).toMatch(/^https?:\/\//);
    }
  });
});

describe('e-mails da pílula e da cadência levam o link da política', () => {
  const casos: Array<[string, () => string]> = [
    ['pílula', () => emailPilula('Maria Souza', ITEM, OPTS).html],
    ['evidência', () => emailEvidencia('Maria Souza', { semana: 3, baseUrl: OPTS.baseUrl }).html],
    ['avaliação final (abertura)', () => emailAvaliacaoFinal('Maria Souza', { semana: 7, baseUrl: OPTS.baseUrl, momento: 'abertura' }).html],
    ['avaliação final (cobrança)', () => emailAvaliacaoFinal('Maria Souza', { semana: 7, baseUrl: OPTS.baseUrl, momento: 'cobranca' }).html],
    ['missão', () => emailMissao('Maria Souza', { semana: 4, baseUrl: OPTS.baseUrl }).html],
    ['pílula pendente', () => emailPilulaPendente('Maria Souza', ITEM, OPTS).html],
    ['semana pendente', () => emailSemanaPendente('Maria Souza', { semana: 4, semanaPendente: 3, baseUrl: OPTS.baseUrl }).html],
  ];

  for (const [nome, gerar] of casos) {
    it(`${nome}: link no host do tenant e rótulo em pt-BR`, () => {
      temLinkDePrivacidade(gerar(), LINK_TENANT);
    });
  }

  it('sem baseUrl o link cai no app e continua absoluto', () => {
    const { html } = emailPilula('Maria Souza', ITEM, { ...OPTS, baseUrl: '' });
    temLinkDePrivacidade(html, `${APP_URL}/privacidade`);
  });

  it('o rodapé fica DENTRO do contêiner do e-mail, depois da assinatura', () => {
    const { html } = emailPilula('Maria Souza', ITEM, OPTS);
    expect(html.indexOf('Equipe Vertho')).toBeLessThan(html.indexOf('/privacidade'));
    expect(html.trimEnd().endsWith('</div>')).toBe(true);
  });
});

describe('e-mails de acesso levam o link da política nos 4 idiomas', () => {
  for (const locale of locales) {
    it(`${locale}: link de acesso e boas-vindas`, () => {
      const dados = { nome: 'Maria', empresaNome: 'Acme', link: 'https://acme.vertho.ai/auth/cb?x=1' };
      temLinkDePrivacidade(magicLinkEmail(locale, dados).html, `${APP_URL}/privacidade`, ROTULO_PRIVACIDADE[locale]);
      temLinkDePrivacidade(signupEmail(locale, dados).html, `${APP_URL}/privacidade`, ROTULO_PRIVACIDADE[locale]);
    });
  }
});

describe('e-mails de disparo do admin levam o link da política', () => {
  beforeEach(() => { sendEmail.mockClear(); });

  it('perfil de evolução (enviarLinksPerfil)', async () => {
    sbAtual = criarSupabaseMock({
      resolver: (t) => (t === 'empresas' ? { nome: 'Escola Teste', slug: 'escolateste' } : null),
      lista: (t) => (t === 'colaboradores' ? [{ id: 'c1', nome_completo: 'Ana Souza', email: 'ana@escola.test' }] : []),
    });
    const r: any = await enviarLinksPerfil('emp-1');
    expect(r.success).toBe(true);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    temLinkDePrivacidade(sendEmail.mock.calls[0][0].html, 'https://escolateste.vertho.ai/privacidade');
  });

});

describe('o rodapé em si', () => {
  it('é um parágrafo com o link e nada além', () => {
    const html = rodapePrivacidadeHtml('https://acme.vertho.ai', 'en-US');
    expect(html).toMatch(/^<p [^>]*><a href="https:\/\/acme\.vertho\.ai\/privacidade"[^>]*>Privacy and terms of use<\/a><\/p>$/);
  });
});
