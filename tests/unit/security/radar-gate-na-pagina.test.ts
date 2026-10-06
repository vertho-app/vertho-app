/**
 * Reanálise de segurança de 06/10/2026: o gate do Radar (e o `notFound()` do bloco RadarBett) morava só no
 * LAYOUT, e layout não protege página. Numa navegação o Next não refaz os layouts que o cliente já tem: um
 * pedido RSC com `Next-Router-State-Tree` de quem "está em /radar" e `Next-Url` apontando para
 * `/radar/metodologia` devolveu a página (200, `text/x-component`, 18 KB) sem sessão e sem passar pelo
 * `redirect` do layout. O mesmo vale para `generateMetadata`, que roda fora do layout e lia o banco, e para as
 * páginas do `radarbett`, que leem o banco e geram narrativa com IA paga.
 *
 * Agora toda página (e todo `generateMetadata`) chama um helper no TOPO, antes de ler qualquer dado. Este arquivo
 * prova (1) a decisão dos helpers e (2) que nenhuma página das duas superfícies ficou sem a chamada.
 * Validado por mutação: tirar a chamada de uma função, inverter a decisão ou trocar o helper reprova um teste.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const h = vi.hoisted(() => ({
  acesso: { authorized: false, reason: 'unauthenticated' } as { authorized: boolean; reason?: string },
  offline: ['radarbett'] as string[],
}));

vi.mock('next/navigation', () => ({
  redirect: (destino: string) => { throw new Error(`REDIRECT:${destino}`); },
  notFound: () => { throw new Error('NOT_FOUND'); },
}));
vi.mock('@/lib/authz-plataforma', () => ({ checarAcessoPlataforma: async () => h.acesso }));
vi.mock('@/lib/blocos-offline', async (orig) => {
  const real = await orig<typeof import('@/lib/blocos-offline')>();
  return { ...real, blocoEstaOffline: (b: string) => h.offline.includes(b) };
});

import { exigirAcessoRadarNaPagina, exigirRadarBettOnline } from '@/lib/radar/acesso-pagina';
import { BLOCOS_OFFLINE } from '@/lib/blocos-offline';

beforeEach(() => {
  h.acesso = { authorized: false, reason: 'unauthenticated' };
  h.offline = ['radarbett'];
});

describe('exigirAcessoRadarNaPagina: a mesma régua do layout, dentro da página', () => {
  it('🔴 sem sessão: redireciona ao login do Radar (e não entrega a página)', async () => {
    await expect(exigirAcessoRadarNaPagina()).rejects.toThrow('REDIRECT:/login?redirect=/radar');
  });

  it('🔴 logado sem acesso de plataforma: 404', async () => {
    h.acesso = { authorized: false, reason: 'unauthorized' };
    await expect(exigirAcessoRadarNaPagina()).rejects.toThrow('NOT_FOUND');
  });

  it('plataforma autorizada: segue', async () => {
    h.acesso = { authorized: true };
    await expect(exigirAcessoRadarNaPagina()).resolves.toBeUndefined();
  });
});

describe('exigirRadarBettOnline: o bloco off-line vale também para a página', () => {
  it('o registro REAL ainda tem o radarbett (sem isto o resto do arquivo não prova nada)', () => {
    expect(Object.keys(BLOCOS_OFFLINE)).toContain('radarbett');
  });

  it('🔴 enquanto o bloco está na lista, a página dá 404', () => {
    expect(() => exigirRadarBettOnline()).toThrow('NOT_FOUND');
  });

  it('religado (entrada removida do registro), a página volta', () => {
    h.offline = [];
    expect(() => exigirRadarBettOnline()).not.toThrow();
  });

  it('outro bloco off-line não desliga o radarbett por engano, nem o contrário', () => {
    h.offline = ['pulso'];
    expect(() => exigirRadarBettOnline()).not.toThrow();
  });
});

// ── Guard de texto: nenhuma página ficou sem a chamada ───────────────────────────────────────────────────────
const RAIZ = join(__dirname, '..', '..', '..');

function paginas(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const caminho = join(dir, e.name);
    if (e.isDirectory()) return paginas(caminho);
    return e.name === 'page.tsx' ? [caminho] : [];
  });
}

const rel = (p: string) => relative(RAIZ, p).split('\\').join('/');
const TODAS = [...paginas(join(RAIZ, 'app', 'radar')), ...paginas(join(RAIZ, 'app', 'radarbett'))].map(rel).sort();

/** Páginas de CLIENTE: não leem dado no servidor (o pedido RSC só devolve a referência do chunk público). */
const PAGINAS_DE_CLIENTE = ['app/radarbett/page.tsx'];

const ehBett = (arq: string) => arq.startsWith('app/radarbett/') || arq.startsWith('app/radar/bett/');

/** As funções exportadas de uma página (default e generateMetadata) com o início do corpo. */
function funcoesExportadas(fonte: string): Array<{ nome: string; corpo: string }> {
  const texto = fonte.replace(/\r\n/g, '\n');
  const saida: Array<{ nome: string; corpo: string }> = [];
  const re = /export\s+(?:default\s+)?(?:async\s+)?function\s+(\w+)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto))) {
    const resto = texto.slice(m.index + m[0].length);
    const abre = /\)(?:: [^\n{]*)? \{\n/.exec(resto);
    if (!abre) continue;
    saida.push({ nome: m[1], corpo: resto.slice(abre.index + abre[0].length) });
  }
  return saida;
}

describe('toda página do Radar e do RadarBett chama o gate no topo (layout não protege página)', () => {
  it('denominador: a varredura achou as páginas (se zerar, o teste não prova nada)', () => {
    expect(TODAS.length).toBeGreaterThanOrEqual(15);
    expect(TODAS).toContain('app/radar/escola/[inep]/page.tsx');
    expect(TODAS).toContain('app/radarbett/escola/[inep]/page.tsx');
    expect(PAGINAS_DE_CLIENTE.every((p) => TODAS.includes(p))).toBe(true);
  });

  it('a lista de páginas de cliente é exatamente o que tem "use client" (nenhuma isenção a mais ou a menos)', () => {
    const comUseClient = TODAS.filter((p) => /^\s*['"]use client['"]/.test(readFileSync(join(RAIZ, p), 'utf8')));
    expect(comUseClient).toEqual(PAGINAS_DE_CLIENTE);
  });

  describe.each(TODAS.filter((p) => !PAGINAS_DE_CLIENTE.includes(p)))('%s', (arq) => {
    const fonte = readFileSync(join(RAIZ, arq), 'utf8');
    const helper = ehBett(arq) ? 'exigirRadarBettOnline' : 'exigirAcessoRadarNaPagina';
    const outro = ehBett(arq) ? 'exigirAcessoRadarNaPagina' : 'exigirRadarBettOnline';
    const chamada = ehBett(arq) ? 'exigirRadarBettOnline();' : 'await exigirAcessoRadarNaPagina();';

    it(`importa ${helper} de lib/radar/acesso-pagina e não o do outro bloco`, () => {
      expect(fonte).toMatch(new RegExp(`import\\s*\\{\\s*${helper}\\s*\\}\\s*from\\s*'@/lib/radar/acesso-pagina'`));
      expect(fonte).not.toContain(outro);
    });

    it('cada função exportada (default e generateMetadata) abre com a chamada, antes de ler qualquer dado', () => {
      const funcoes = funcoesExportadas(fonte);
      expect(funcoes.some((f) => f.nome !== 'generateMetadata'), 'a página tem de exportar a função da rota').toBe(true);
      for (const f of funcoes) {
        expect(f.corpo.trimStart().startsWith(chamada), `${f.nome} de ${arq} não abre com ${chamada}`).toBe(true);
      }
    });

    it('as funções da página são async quando o helper é assíncrono', () => {
      if (ehBett(arq)) return;
      for (const f of funcoesExportadas(fonte)) {
        const decl = new RegExp(`export\\s+(?:default\\s+)?async\\s+function\\s+${f.nome}\\b`);
        expect(decl.test(fonte.replace(/\r\n/g, '\n')), `${f.nome} usa await e precisa ser async`).toBe(true);
      }
    });
  });

  it('o layout do Radar continua com o gate (a página é a 2ª linha, e não a única)', () => {
    const layout = readFileSync(join(RAIZ, 'app', 'radar', 'layout.tsx'), 'utf8');
    expect(layout).toMatch(/checarAcessoPlataforma\(/);
    const bett = readFileSync(join(RAIZ, 'app', 'radarbett', 'layout.tsx'), 'utf8');
    expect(bett).toMatch(/notFound\(\)/);
  });
});
