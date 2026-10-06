import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { linksDoPrerequisito } from '@/lib/pipeline-fluxo/prerequisitos-links';
import type { IdPrereq } from '@/lib/pipeline-fluxo/prerequisitos';

/**
 * Cada pré-requisito do painel leva à tela onde ele se resolve. O risco é o link apodrecer: a rota é renomeada e o painel segue
 * apontando para um 404, justo na hora em que a pessoa tenta destravar o fluxo. Por isso o teste procura a rota em `app/`.
 *
 * Um segmento DINÂMICO (`[id]`) só vale quando o valor é o id da empresa que o teste passou. Sem isso, `/modulos-base/qualquer-coisa`
 * "existia" por causa de `/modulos-base/[id]`, e o link morto passava (provado por mutação).
 */
const IDS: IdPrereq[] = ['modulo-base', 'programa', 'disc', 'preferencias', 'render'];
const EMPRESA = 'emp-teste-1';
const raiz = process.cwd();

type Rota = string[]; // segmentos; `[x]` = dinâmico, `[...x]` = pega o resto

function rotasDePagina(): Rota[] {
  const base = join(raiz, 'app');
  const rotas: Rota[] = [];
  const andar = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const caminho = join(dir, nome);
      if (statSync(caminho).isDirectory()) { andar(caminho); continue; }
      if (!/^page\.(tsx|jsx|ts|js)$/.test(nome)) continue;
      // `(grupo)` e `@slot` não entram na URL.
      rotas.push(relative(base, dir).split(sep).filter((s) => s && !/^\(.*\)$/.test(s) && !s.startsWith('@')));
    }
  };
  andar(base);
  return rotas;
}
const rotas = rotasDePagina();

function casa(rota: Rota, url: string[]): boolean {
  for (let i = 0; i < rota.length; i++) {
    const seg = rota[i];
    if (/^\[\.\.\..+\]$/.test(seg)) return url.length > i;
    if (i >= url.length) return false;
    if (/^\[.+\]$/.test(seg)) { if (url[i] !== EMPRESA) return false; continue; }
    if (seg !== url[i]) return false;
  }
  return rota.length === url.length;
}
const existe = (href: string) => {
  const url = decodeURIComponent(href.split('?')[0].split('#')[0]).split('/').filter(Boolean);
  return rotas.some((r) => casa(r, url));
};

describe('linksDoPrerequisito', () => {
  it('todo item do painel tem pelo menos um link, com rótulo', () => {
    for (const id of IDS) {
      const links = linksDoPrerequisito(id, EMPRESA);
      expect(links.length, id).toBeGreaterThan(0);
      for (const l of links) expect(l.rotulo.trim().length, `${id}: ${l.href}`).toBeGreaterThan(0);
    }
  });

  it('o id da empresa entra na URL e é codificado (nunca interpola valor cru)', () => {
    const urls = IDS.flatMap((id) => linksDoPrerequisito(id, 'a b/c').map((l) => l.href));
    expect(urls.filter((u) => u.includes('a%20b%2Fc')).length).toBeGreaterThanOrEqual(4);
    for (const u of urls) { expect(u).not.toContain('a b/c'); expect(u).not.toMatch(/\s/); }
  });

  it('só telas do admin, sem URL absoluta', () => {
    for (const id of IDS) for (const l of linksDoPrerequisito(id, EMPRESA)) expect(l.href, id).toMatch(/^\/admin\//);
  });

  it('o leitor de rotas enxerga o app e não aceita segmento solto em rota dinâmica (sanidade do teste de existência)', () => {
    expect(rotas.length).toBeGreaterThan(50);
    expect(existe(`/admin/empresas/${EMPRESA}/fluxo`)).toBe(true);
    expect(existe('/admin/rota-que-nao-existe-xyz')).toBe(false);
    // existe `/admin/vertho/modulos-base/[id]`, mas `cobertura-x` não é o id da empresa: não pode contar como tela
    expect(existe('/admin/vertho/modulos-base/cobertura-x')).toBe(false);
    expect(existe('/admin/vertho/modulos-base/cobertura')).toBe(true);
  });

  it.each(IDS)('%s: toda rota apontada existe em app/', (id) => {
    for (const l of linksDoPrerequisito(id, EMPRESA)) expect(existe(l.href), `${l.rotulo} → ${l.href}`).toBe(true);
  });

  it('a tela do fluxo usa estes links (não uma cópia local)', () => {
    const pagina = readFileSync(join(raiz, 'app', 'admin', 'empresas', '[empresaId]', 'fluxo', 'page.tsx'), 'utf8');
    expect(pagina).toContain("from '@/lib/pipeline-fluxo/prerequisitos-links'");
    expect(pagina).toContain('linksDoPrerequisito(');
  });
});
