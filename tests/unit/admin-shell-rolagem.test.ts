/**
 * No /admin quem rola é a JANELA: a raiz do `AdminShell` é `min-h-dvh` e cresce
 * com o conteúdo. De 26/05 a 02/10/2026 a coluna tinha `overflow-hidden` e o
 * <main> `overflow-y-auto`: não rolavam nada, mas são contêineres de rolagem, e
 * todo `sticky` das telas se prendia a eles e ficava parado. A folha de decisão
 * do orçamento tinha `xl:sticky` e nunca acompanhou a rolagem (medido no harness
 * com o shell real: topo a -1805px depois de rolar; consertado em `a9c599cd`).
 *
 * Guard estático de propósito: prova o CONTRATO (as classes), não a experiência,
 * que só a imagem prova. Régua: docs/REORGANIZACAO-ADMIN.md §Rolagem do shell.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ler = (arquivo: string) => readFileSync(join(__dirname, '..', '..', arquivo), 'utf8');

/** As classes do elemento marcado (`admin-shell-…`), ou undefined se o marcador sumiu. */
function classesDe(fonte: string, marcador: string): string | undefined {
  return fonte.match(new RegExp(`className="([^"]*\\b${marcador}\\b[^"]*)"`))?.[1];
}

// `clip` e `visible` não viram contêiner de rolagem; hidden, auto e scroll viram.
const CONTEINER_DE_ROLAGEM = /(^|\s)overflow(-[xy])?-(hidden|auto|scroll)(\s|$)/;

describe('AdminShell: quem rola é a janela', () => {
  const shell = ler('app/admin/_shell/AdminShell.tsx');

  it('a coluna e o <main> não são contêiner de rolagem', () => {
    const coluna = classesDe(shell, 'admin-shell-column');
    const main = classesDe(shell, 'admin-shell-main');
    expect(coluna).toBeDefined();
    expect(main).toBeDefined();
    expect(coluna).not.toMatch(CONTEINER_DE_ROLAGEM);
    expect(main).not.toMatch(CONTEINER_DE_ROLAGEM);
  });

  it('a raiz cresce com o conteúdo (o <main> não rola; capturas fullPage dependem disso)', () => {
    const raiz = classesDe(shell, 'admin-shell-root');
    expect(raiz).toMatch(/(^|\s)min-h-dvh(\s|$)/);
    expect(raiz).not.toMatch(/(^|\s)h-(dvh|screen)(\s|$)/);
  });

  it('a régua do guard reconhece o que quebrava e aceita o que conserta', () => {
    // Sem isto, um regex que nunca casa deixaria os testes acima verdes para sempre.
    expect('flex-1 flex flex-col overflow-hidden admin-shell-column').toMatch(CONTEINER_DE_ROLAGEM);
    expect('flex-1 overflow-y-auto admin-shell-main').toMatch(CONTEINER_DE_ROLAGEM);
    expect('flex-1 flex flex-col min-w-0 overflow-x-clip admin-shell-column').not.toMatch(CONTEINER_DE_ROLAGEM);
  });
});

describe('a folha de decisão do orçamento acompanha a rolagem', () => {
  it('gruda no topo e cabe na altura da tela, rolando por dentro', () => {
    const pagina = ler('app/admin/vertho/orcamento/page.tsx');
    const aside = pagina.match(/<aside className="([^"]*)"/)?.[1];
    expect(aside).toMatch(/(^|\s)xl:sticky(\s|$)/);
    // Mais alta que a tela: sem isto, "Salvar" e "Virar proposta" só apareciam no fim da página.
    expect(aside).toContain('xl:max-h-[calc(100dvh-3rem)]');
    expect(aside).toMatch(/(^|\s)xl:overflow-y-auto(\s|$)/);
  });
});
