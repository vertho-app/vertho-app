import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import conteudoJson from '@/app/conarh/_data/conteudo.json';
import manifesto from '@/app/conarh/_data/paginas-pdf.json';

/**
 * CONARH 52 — os documentos abrem DENTRO da demo, e offline.
 *
 * O que este guard existe para impedir (medido no iPhone em 07/08/2026): um
 * card abrir o PDF com `target="_blank"`. Num PWA instalado no iOS a nova aba
 * é uma view SEM barra de navegação — o expositor entra no documento e não tem
 * como voltar para a demo, na frente do visitante. A saída passou a ser o
 * visualizador de `_components/documento.tsx`, que folheia as páginas
 * pré-renderizadas por `scripts/_conarh-paginas-pdf.ts`.
 *
 * Duas formas de isso apodrecer em silêncio, ambas cobertas aqui:
 *   1. documento novo entra na tela e ninguém roda o script → o overlay abre
 *      vazio, e só em modo avião alguém descobre;
 *   2. o manifesto que a TELA importa (`_data`) e o que o SERVICE WORKER busca
 *      para precachear (`public`) divergem → a tela mostra páginas que não
 *      estão no cache do tablet.
 */

const RAIZ = join(__dirname, '..', '..');
const PUBLICO = join(RAIZ, 'public');
const COMPONENTES = join(RAIZ, 'app', 'conarh', '_components');

const paginas = manifesto as Record<string, string[]>;

/** Todo `.pdf` citado no conteúdo, menos o bloco `personas` — reserva de
 *  conteúdo que nenhum componente renderiza (por isso fica fora do precache
 *  também: são 80 MB que a tela não mostra). */
function pdfsDaTela(): string[] {
  const { personas, ...exibido } = conteudoJson as Record<string, unknown>;
  const achados = new Set<string>();
  const varrer = (no: unknown) => {
    if (typeof no === 'string') {
      if (no.endsWith('.pdf')) achados.add(no);
    } else if (Array.isArray(no)) {
      no.forEach(varrer);
    } else if (no && typeof no === 'object') {
      Object.values(no).forEach(varrer);
    }
  };
  varrer(exibido);
  return [...achados];
}

describe('CONARH · documentos', () => {
  it('todo PDF que a tela abre tem páginas no manifesto, e os arquivos existem', () => {
    const pdfs = pdfsDaTela();
    expect(pdfs.length).toBeGreaterThan(0); // denominador: se a varredura zerar, o teste não prova nada

    for (const pdf of pdfs) {
      const lista = paginas[pdf];
      expect(lista, `${pdf} não está em paginas-pdf.json — rode scripts/_conarh-paginas-pdf.ts`).toBeDefined();
      expect(lista.length).toBeGreaterThan(0);
      for (const pagina of lista) {
        expect(existsSync(join(PUBLICO, pagina)), `${pagina} não existe`).toBe(true);
      }
    }
  });

  it('a contagem de páginas na tela é a do documento', () => {
    // Escrito à mão no conteúdo, e por isso envelhecia calado: o card dizia
    // "PDF · 7 páginas" para um relatório de 9 (medido 07/08). Ninguém via,
    // porque o PDF abria FORA da demo. Com o visualizador, o cabeçalho mostra a
    // contagem real ao lado da declarada — dois números diferentes para o mesmo
    // documento, na mesma tela, na frente do visitante.
    const conteudo = conteudoJson as any;
    const declarados: Array<[string, string, number | undefined]> = [
      ['etapa 3 · PDI', conteudo.porta3.pdf.src, conteudo.porta3.pdf.paginas],
      ...(conteudo.porta5.relatorios ?? []).map(
        (r: { titulo: string; src: string; paginas?: number }) =>
          [`etapa 5 · ${r.titulo}`, r.src, r.paginas] as [string, string, number | undefined],
      ),
    ];
    expect(declarados.length).toBeGreaterThan(1);

    for (const [onde, src, declarado] of declarados) {
      if (declarado === undefined) continue; // campo opcional: só valida quem declara
      expect(declarado, `${onde}: a tela diz ${declarado} páginas`).toBe(paginas[src]?.length);
    }
  });

  it('o manifesto da tela e o do service worker são o mesmo arquivo', () => {
    const daTela = readFileSync(join(RAIZ, 'app', 'conarh', '_data', 'paginas-pdf.json'), 'utf8');
    const doWorker = readFileSync(join(PUBLICO, 'conarh', 'paginas-pdf.json'), 'utf8');
    expect(doWorker).toBe(daTela);
  });

  it('nenhuma tela da demo abre PDF em nova aba', () => {
    const arquivos = readdirSync(COMPONENTES).filter((f) => f.endsWith('.tsx'));
    const infratores: string[] = [];

    for (const arquivo of arquivos) {
      const fonte = readFileSync(join(COMPONENTES, arquivo), 'utf8');
      // Cada elemento <a …> do arquivo, com seus atributos.
      for (const [, atributos] of fonte.matchAll(/<a\s([^>]*)>/gs)) {
        if (!/target=["{']?_blank/.test(atributos)) continue;
        // `href` para PDF, direto ou por campo do conteúdo (`.pdf`, `.src` de
        // um objeto de documento). Só `.pdf` literal deixaria passar o caso
        // real, que é `href={r.src}`.
        if (/href=\{[^}]*\.(pdf|src)\b/.test(atributos) || /href="[^"]*\.pdf"/.test(atributos)) {
          infratores.push(`${arquivo}: ${atributos.trim().slice(0, 80)}`);
        }
      }
    }

    expect(
      infratores,
      'PDF em nova aba prende o expositor fora do app no iOS — use <AbrirDocumento>',
    ).toEqual([]);
  });

  it('o service worker precacheia o manifesto de páginas', () => {
    const sw = readFileSync(join(PUBLICO, 'conarh-sw.js'), 'utf8');
    expect(sw).toContain('/conarh/paginas-pdf.json');
    // O SW lê a lista do manifesto em vez de repetir os nomes — segunda lista
    // sai de sincronia no primeiro documento novo.
    expect(sw).toMatch(/paginasDosDocumentos/);
  });
});
