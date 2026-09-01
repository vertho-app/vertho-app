import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Seletor de ambientes da sala de demonstração.
 *
 * Ocultar um ambiente é decisão de tela, não de produto: o tenant continua
 * existindo (reset, hosts, convidados, acompanhamento). O que este guard impede
 * é a versão destrutiva da mesma ideia — apagar a entrada do mapa —, que levaria
 * junto o nome exibido e o acompanhamento daquele ambiente.
 *
 * ⚠️ O acompanhamento é POR AMBIENTE: ambiente fora do seletor é ambiente cujos
 * convidados ninguém vê. Em 01/09/2026 o `gruposinal` foi ocultado com o Alpheu
 * ainda sem primeiro acesso (0 login, 0 DISC, 0 respostas) — se um dia houver
 * gente em experiência lá, o card precisa voltar.
 */

const fonte = readFileSync('app/admin/demo/page.tsx', 'utf8');

describe('seletor de ambientes de demonstração', () => {
  it('o ambiente oculto continua no mapa — some da lista, não do produto', () => {
    const mapa = fonte.slice(fonte.indexOf('const TENANTS:'), fonte.indexOf('const TENANTS_VISIVEIS'));
    expect(mapa).toContain('gruposinal');
    expect(mapa).toContain('oculto: true');
    // o nome segue disponível: é ele que a tela usa em confirmações e avisos
    expect(mapa).toMatch(/gruposinal:[\s\S]{0,200}nome: 'Grupo Sinal'/);
  });

  it('a lista renderizada filtra por `oculto`, e não é a lista crua', () => {
    expect(fonte).toContain(
      "const TENANTS_VISIVEIS = (Object.keys(TENANTS) as TenantSlug[]).filter((slug) => !TENANTS[slug].oculto)",
    );
    expect(fonte).toContain('{TENANTS_VISIVEIS.map((slug) => {');
    // se voltar a iterar o mapa inteiro, o ocultado reaparece sem ninguém pedir
    expect(fonte).not.toContain('{(Object.keys(TENANTS) as TenantSlug[]).map((slug) => {');
  });

  it('o ambiente padrão da tela nunca pode estar oculto', () => {
    const padrao = fonte.match(/useState<TenantSlug>\('([^']+)'\)/)?.[1];
    expect(padrao).toBeTruthy();
    const mapa = fonte.slice(fonte.indexOf('const TENANTS:'), fonte.indexOf('const TENANTS_VISIVEIS'));
    const bloco = mapa.slice(mapa.indexOf(`'${padrao}'`));
    const fim = bloco.indexOf('},');
    expect(bloco.slice(0, fim)).not.toContain('oculto');
  });
});
