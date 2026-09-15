import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEMO_PROSPECT_TENANTS } from '@/lib/demo/acme-prospect-config';

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
 * ainda sem primeiro acesso (0 login, 0 DISC, 0 respostas) — e em 15/09 o card
 * voltou, quando o ambiente passou a oferecer degustação.
 *
 * 🔑 **Por que a asserção `oculto: true` no `gruposinal` SAIU daqui.** Ela
 * congelava o estado de um dia, não uma invariante: com ela, devolver o card ao
 * seletor — que é a saída que a própria docstring previa — ficava vermelho,
 * e o vermelho pedia para mexer no teste, que é como uma catraca vira ruído.
 * No lugar dela entrou a régua que o código realmente tem (abaixo): ambiente de
 * degustação não pode estar oculto. Essa morde nos DOIS sentidos.
 */

const fonte = readFileSync('app/admin/demo/page.tsx', 'utf8');
const mapa = fonte.slice(fonte.indexOf('const TENANTS:'), fonte.indexOf('const TENANTS_VISIVEIS'));

/** O bloco de um ambiente dentro do mapa `TENANTS` (a chave pode vir quotada). */
function blocoDoAmbiente(slug: string): string | null {
  const chave = slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const inicio = mapa.search(new RegExp(`^ {2}'?${chave}'?: \\{`, 'm'));
  if (inicio < 0) return null;
  const resto = mapa.slice(inicio);
  const fim = resto.indexOf('\n  },');
  return fim < 0 ? resto : resto.slice(0, fim);
}

describe('seletor de ambientes de demonstração', () => {
  it('nenhum ambiente some do mapa — ocultar tira da lista, não do produto', () => {
    // O mapa é a fonte do nome exibido e do acompanhamento; apagar uma entrada
    // é a versão destrutiva de "escondi o card".
    for (const slug of ['acme-demo', 'escolas-acme', 'gruposinal']) {
      const bloco = blocoDoAmbiente(slug);
      expect(bloco, `${slug} sumiu do mapa TENANTS`).toBeTruthy();
      expect(bloco, `${slug} sem nome exibível`).toMatch(/nome: '[^']+'/);
    }
  });

  /**
   * 🔴 Ambiente que oferece degustação não pode estar oculto no seletor.
   *
   * `AMBIENTES_DEGUSTACAO` sai de `DEMO_PROSPECT_TENANTS` (allowlist do
   * servidor) e FILTRA o que está oculto. Registrar um ambiente na allowlist e
   * deixá-lo escondido na tela não produz erro nenhum: o seletor da degustação
   * simplesmente não o oferece, e quem vai criar o roteiro — às pressas, antes
   * de uma conversa comercial — conclui que a mudança não subiu.
   *
   * É o par que faltava cruzar em 15/09/2026, quando o `gruposinal` passou a
   * oferecer passaporte estando oculto desde 01/09: duas decisões corretas
   * sozinhas, erradas juntas (a mesma forma do cargo sem matriz na degustação).
   */
  it('🔴 nenhum ambiente de degustação está oculto no seletor', () => {
    const ambientes = Object.keys(DEMO_PROSPECT_TENANTS);
    // Alvo vazio reporta verde: o guard tem que provar que olhou para algo.
    expect(ambientes.length).toBeGreaterThan(0);

    const violacoes: string[] = [];
    for (const slug of ambientes) {
      const bloco = blocoDoAmbiente(slug);
      expect(bloco, `${slug} oferece degustação mas não está no mapa da tela`).toBeTruthy();
      if (/oculto: true/.test(bloco!)) violacoes.push(slug);
    }

    expect(
      violacoes,
      `oferecem degustação e não aparecem no seletor: ${violacoes.join(', ')}`,
    ).toEqual([]);
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
    const bloco = blocoDoAmbiente(padrao!);
    expect(bloco, `o ambiente padrão ${padrao} não está no mapa`).toBeTruthy();
    expect(bloco).not.toContain('oculto');
  });
});
