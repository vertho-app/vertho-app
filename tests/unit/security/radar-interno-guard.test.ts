import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { detectRewriteSubdomain, extractTenantSlug, resolveSubdominioAposentado } from '../../../proxy.js';

/**
 * O Radar saiu do ar público em 10/08/2026 (decisão do dono). Era
 * `radar.vertho.ai`, sem login e indexável; virou ferramenta interna em
 * `app.vertho.ai/radar`, com a régua do /admin.
 *
 * 🔴 O que este guard existe para impedir: que "interno" volte a ser só a
 * PÁGINA. Num arquivo `'use server'` cada export é um endpoint HTTP, com id no
 * bundle público e chamável sem passar por layout nenhum — uma action nova sem
 * gate reabre exatamente o que foi fechado, e nada na tela denuncia. O mesmo
 * vale para route handler (o sitemap servia o inventário de URLs por fora do
 * layout) e para o rewrite do subdomínio.
 */

const RAIZ = join(__dirname, '..', '..', '..');
const ACTIONS = join(RAIZ, 'app', 'radar', 'actions.ts');

describe('Radar interno', () => {
  it('toda Server Action do Radar aplica o gate de plataforma', () => {
    const fonte = readFileSync(ACTIONS, 'utf8');
    const exports = [...fonte.matchAll(/export\s+async\s+function\s+(\w+)/g)].map((m) => m[1]);
    expect(exports.length).toBeGreaterThan(3); // denominador: se a varredura zerar, o teste não prova nada

    const semGate: string[] = [];
    for (const nome of exports) {
      // Corpo da função: do nome até o próximo `export async function` (ou fim).
      const inicio = fonte.indexOf(`export async function ${nome}`);
      const resto = fonte.slice(inicio + 1);
      const proximo = resto.indexOf('\nexport async function ');
      const corpo = proximo === -1 ? resto : resto.slice(0, proximo);
      if (!/exigirAcessoPlataforma\(|checarAcessoPlataforma\(/.test(corpo)) semGate.push(nome);
    }

    expect(
      semGate,
      'action do Radar sem gate = a tela some e a API fica, servindo o mesmo dado sem sessão',
    ).toEqual([]);
  });

  it('a página do Radar é montada atrás do gate', () => {
    const layout = readFileSync(join(RAIZ, 'app', 'radar', 'layout.tsx'), 'utf8');
    expect(layout).toMatch(/checarAcessoPlataforma\(/);
    expect(layout).toMatch(/index:\s*false/); // não pede indexação
  });

  it('não sobrou endpoint de indexação servindo o inventário por fora do layout', () => {
    // Route handler NÃO passa por layout: enquanto existiam, `sitemap.xml` e
    // `sitemap/[id].xml` listavam todas as escolas e municípios a quem pedisse.
    for (const morto of [
      'app/radar/robots.ts',
      'app/radar/sitemap.xml/route.ts',
      'app/radar/sitemap/[...id]/route.ts',
      'app/radarbett/robots.ts',
      'app/radarbett/sitemap.xml/route.ts',
    ]) {
      expect(existsSync(join(RAIZ, morto)), `${morto} voltou a existir`).toBe(false);
    }
  });

  it('radar.vertho.ai não faz rewrite e responde 301 para a home institucional', () => {
    expect(detectRewriteSubdomain('radar.vertho.ai')).toBeNull();
    expect(resolveSubdominioAposentado('radar.vertho.ai')).toBe('https://vertho.ai');
    expect(resolveSubdominioAposentado('radarbett.vertho.ai')).toBe('https://vertho.ai');
    expect(resolveSubdominioAposentado('radar.vertho.ai:443')).toBe('https://vertho.ai');
    // …e nem por isso vira um tenant chamado "radar".
    expect(extractTenantSlug('radar.vertho.ai')).toBeNull();
    // O que continua público não pode ter sido arrastado junto.
    expect(detectRewriteSubdomain('imprensa.vertho.ai')).toBe('/imprensa');
    expect(resolveSubdominioAposentado('imprensa.vertho.ai')).toBeNull();
    expect(resolveSubdominioAposentado('acme.vertho.ai')).toBeNull();
  });
});
