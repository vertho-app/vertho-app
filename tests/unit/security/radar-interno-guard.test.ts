import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
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

function varrerTsx(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const caminho = join(dir, e.name);
    if (e.isDirectory()) return varrerTsx(caminho);
    return e.name.endsWith('.tsx') ? [caminho] : [];
  });
}

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

  it('o Radar tem porta de entrada no menu, com a mesma régua do gate', async () => {
    // O subdomínio ERA o botão: aposentá-lo deixou a ferramenta sem entrada
    // nenhuma (o menu só tinha a INGESTÃO, `/admin/radar`).
    const { NAV_ITEMS } = await import('@/app/admin/_shell/nav-items');
    const item = NAV_ITEMS.find((i: any) => i.hrefFn() === '/radar');
    expect(item, 'sem item de menu, a ferramenta só é alcançável digitando a URL').toBeDefined();

    // Sem permissão granular, de propósito: `radar.admin.access` é `critical` e
    // cobre a INGESTÃO — o Admin Sócio não a tem. Consultar é leitura, e o gate
    // de `app/radar/layout.tsx` deixa entrar qualquer platform admin. Amarrar o
    // item àquela permissão faria o botão sumir para quem ainda entra pela URL.
    expect(item!.permission).toBeUndefined();
    expect(item!.showWhenEmpresa).toBe(false); // é admin-wide, não tem tenant
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

  it('a navegação interna do Radar aponta para /radar, não para a raiz do app', () => {
    // Enquanto o Radar era `radar.vertho.ai`, o REWRITE do proxy prefixava tudo:
    // `href="/comparar"` chegava como `/radar/comparar` sozinho, e `href="/"` era
    // a home do Radar. Sem o subdomínio, os mesmos links levam para a home do APP
    // e para 404 — quebra que não aparece em typecheck nem em build.
    const ROTAS = ['escola', 'municipio', 'estado', 'rede', 'comparar', 'metodologia'];
    const arquivos = varrerTsx(join(RAIZ, 'app', 'radar'));
    expect(arquivos.length).toBeGreaterThan(10);

    const soltos: string[] = [];
    for (const arquivo of arquivos) {
      // Sem comentários: o próprio aviso escrito no header cita `href="/"` como
      // exemplo do erro, e um guard que acusa a própria documentação treina a
      // pessoa a ignorá-lo.
      const fonte = readFileSync(arquivo, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      const rel = arquivo.slice(RAIZ.length + 1).replace(/\\/g, '/');
      // href="/x" | href={`/x/...`} | router.push('/x') — sem o prefixo /radar
      for (const [, alvo] of fonte.matchAll(/(?:href=|router\.push\()[{('"`]+(\/[a-z-]+)/g)) {
        if (ROTAS.includes(alvo.slice(1))) soltos.push(`${rel}: ${alvo}`);
      }
      // A raiz nua: no app inteiro ela é o dashboard, aqui parecia a home do Radar.
      if (/href="\/"/.test(fonte)) soltos.push(`${rel}: href="/"`);
    }

    expect(soltos, 'link do Radar sem o prefixo /radar cai fora da ferramenta').toEqual([]);
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
