import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PresentationNavigationLinks } from '@/components/dashboard/presentation-navigation';
import { listarPapeisDeApresentacao } from '@/lib/demo/presentation';
import MapeamentoLayout from '@/app/dashboard/perfil-comportamental/mapeamento/layout';

vi.mock('next-intl/server', () => ({ getTranslations: async () => () => 'Voltar ao início' }));

const codigo = 'AAAAAAAAAAAAAAAAAAAAAAAA';

describe('retorno explícito da degustação', () => {
  for (const papel of listarPapeisDeApresentacao()) {
    it(`${papel.hostSlug}: subpáginas voltam ao painel do próprio papel e ao convite do próprio ambiente`, () => {
      const html = renderToStaticMarkup(createElement(PresentationNavigationLinks, {
        papel, pathname: '/dashboard/gestor/engajamento', codigo,
      }));
      expect(html).toContain(`href="${papel.homePath}"`);
      expect(html).toContain(`href="https://${papel.tenantSlug}.vertho.ai/c/${codigo}"`);
      expect(html).toContain('data-degustacao="voltar-painel"');
      // Sair da degustação também sai da prévia em iframe de 390 px.
      expect(html).toContain('target="_top"');
      if (papel.tenantSlug === 'escolas-acme') expect(html).not.toContain('painel do RH');
    });

    it(`${papel.hostSlug}: no painel mostra apenas o retorno ao convite`, () => {
      const html = renderToStaticMarkup(createElement(PresentationNavigationLinks, {
        papel, pathname: `${papel.homePath}/`, codigo,
      }));
      expect(html).not.toContain('data-degustacao="voltar-painel"');
      expect(html).toContain('Início da degustação');
    });
  }

  it('sem convite ou com valor inválido, ainda permite voltar ao painel e não cria URL externa', () => {
    for (const valor of [null, 'https://outro.example', '../destino']) {
      const html = renderToStaticMarkup(createElement(PresentationNavigationLinks, {
        papel: listarPapeisDeApresentacao()[0], pathname: '/dashboard/pdi', codigo: valor,
      }));
      expect(html).toContain('data-degustacao="voltar-painel"');
      expect(html).not.toContain('data-degustacao="voltar-convite"');
    }
  });

  it('o retorno de todas as etapas do DISC aponta para a home, evitando o loop do perfil sem resultado', async () => {
    const html = renderToStaticMarkup(await MapeamentoLayout({ children: 'etapa do mapeamento' }));
    expect(html).toContain('href="/dashboard"');
    expect(html).not.toContain('href="/dashboard/perfil-comportamental"');
    expect(html.indexOf('Voltar ao início')).toBeLessThan(html.indexOf('etapa do mapeamento'));
  });
});
