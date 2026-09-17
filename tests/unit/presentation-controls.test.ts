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

  it('🔴 no celular os seletores ficam sem o ícone: com os três controles, a barra cobria o Beto', () => {
    const html = barra('https://acme-demo.vertho.ai/c/AAAAAAAAAAAAAAAAAAAAAAAA');
    for (const rotulo of ['Trocar função apresentada', 'Trocar dispositivo apresentado']) {
      const label = html.slice(html.lastIndexOf('<label', html.indexOf(rotulo)), html.indexOf(rotulo));
      // o primeiro span do label é o ícone
      const icone = label.match(/<span class="([^"]*)" aria-hidden="true">/)?.[1] ?? '';
      expect(icone, `ícone de "${rotulo}"`).toMatch(/(^|\s)hidden(\s|$)/);
      expect(icone, `ícone de "${rotulo}"`).toContain('sm:grid');
    }
    // o "Voltar" mantém o ícone: no celular é tudo o que ele mostra
    const voltar = html.slice(html.indexOf('<a '), html.indexOf('</a>'));
    expect(voltar.match(/<span class="([^"]*)" aria-hidden="true">/)?.[1]).toMatch(/^grid /);
  });

  it('quem apresenta (sem convite) continua com os dois seletores e sem o "Voltar"', () => {
    const html = barra(null);
    expect(html).not.toContain('voltar-ao-inicio');
    expect(html).toContain('aria-label="Trocar função apresentada"');
    expect(html).toContain('aria-label="Trocar dispositivo apresentado"');
  });
});
