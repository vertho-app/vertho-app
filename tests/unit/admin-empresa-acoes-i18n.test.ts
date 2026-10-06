import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Todo botão da tela da empresa (`/admin/empresas/[id]`) tem rótulo nos 4 catálogos.
 *
 * Medido em 06/10/2026: o card "Fluxo completo (prévia)" entrou com `key: 'fluxo-previa'` e `label` em português, e o botão
 * apareceu na tela como o caminho cru `AdminCompanyPipeline.actions.fluxo-previa`. O `label` do código é só fallback de leitura:
 * o texto que a pessoa vê vem de `t(`actions.${action.key}`)`, e next-intl devolve a CHAVE quando ela não existe no catálogo.
 * O teste de paridade (`i18n-paridade`) não pega: a chave faltava nos quatro catálogos, igualmente.
 */
const LOCALES = ['pt-BR', 'pt-PT', 'es-ES', 'en-US'];
const raiz = process.cwd();
const pagina = readFileSync(join(raiz, 'app', 'admin', 'empresas', '[empresaId]', 'page.tsx'), 'utf8');

/** As chaves declaradas nas listas de ações: `{ key: 'x', label: ... }` (espaços variam de uma linha para outra). */
const chavesDaPagina = [...pagina.matchAll(/\{\s*key:\s*'([a-z0-9-]+)'\s*,\s*label:/g)].map((m) => m[1]);

describe('tela da empresa: rótulo de cada ação nos catálogos', () => {
  it('a página ainda resolve o rótulo por actions.<key> no namespace AdminCompanyPipeline (o teste olha o lugar certo)', () => {
    expect(pagina).toContain("useTranslations('AdminCompanyPipeline')");
    expect(pagina).toContain('t(`actions.${action.key}`)');
    expect(chavesDaPagina.length).toBeGreaterThan(30);
    expect(chavesDaPagina).toContain('fluxo-previa');
  });

  for (const locale of LOCALES) {
    it(`${locale} tem rótulo para toda ação da página`, () => {
      const catalogo = JSON.parse(readFileSync(join(raiz, 'messages', `${locale}.json`), 'utf8'));
      const acoes = catalogo?.AdminCompanyPipeline?.actions ?? {};
      const faltando = [...new Set(chavesDaPagina)].filter((k) => typeof acoes[k] !== 'string' || !acoes[k].trim());
      expect(faltando, `ações sem rótulo em ${locale}`).toEqual([]);
    });
  }
});
