import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PresentationControls } from '@/components/dashboard/presentation-role-switcher';
import { getDemoPresentationRoleFromHostname } from '@/lib/demo/presentation';

/**
 * A barra da sala de apresentação.
 *
 * 16/09/2026 o seletor de dispositivo saiu para quem chega pelo convite (dava
 * lugar ao "Voltar ao início"); 17/09 o dono pediu de volta. Os dois convivem, e
 * no celular o "Voltar" fica só com o ícone para a barra não passar da tela.
 */
function barra(linkDeVolta: string | null) {
  const papel = getDemoPresentationRoleFromHostname('gestor-demo.vertho.ai');
  expect(papel).toBeTruthy();
  return renderToStaticMarkup(createElement(PresentationControls, {
    currentRole: papel!,
    device: 'desktop',
    switching: false,
    onRoleChange: () => {},
    onDeviceChange: () => {},
    linkDeVolta,
  }));
}

describe('barra da sala de apresentação', () => {
  it('🔴 quem veio do convite tem o "Voltar ao início" E o seletor de dispositivo', () => {
    const html = barra('https://acme-demo.vertho.ai/c/AAAAAAAAAAAAAAAAAAAAAAAA');
    expect(html).toContain('data-sala="voltar-ao-inicio"');
    expect(html).toContain('aria-label="Trocar função apresentada"');
    expect(html).toContain('aria-label="Trocar dispositivo apresentado"');
    // a ordem da barra: voltar, função, dispositivo
    const posicoes = ['data-sala="voltar-ao-inicio"', 'Trocar função apresentada', 'Trocar dispositivo apresentado']
      .map((ancora) => html.indexOf(ancora));
    expect(posicoes).toEqual([...posicoes].sort((a, b) => a - b));
  });

  it('no celular o "Voltar" é só o ícone, com nome acessível', () => {
    const html = barra('https://acme-demo.vertho.ai/c/AAAAAAAAAAAAAAAAAAAAAAAA');
    const link = html.slice(html.indexOf('<a '), html.indexOf('</a>'));
    expect(link).toContain('aria-label="Voltar ao início"');
    // o texto existe, mas escondido abaixo de sm
    expect(link).toMatch(/<span class="hidden min-w-0 sm:block">/);
  });

  it('quem apresenta (sem convite) continua com os dois seletores e sem o "Voltar"', () => {
    const html = barra(null);
    expect(html).not.toContain('voltar-ao-inicio');
    expect(html).toContain('aria-label="Trocar função apresentada"');
    expect(html).toContain('aria-label="Trocar dispositivo apresentado"');
  });
});
