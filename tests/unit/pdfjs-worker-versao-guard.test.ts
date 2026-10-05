/**
 * Guard: o worker do pdf.js servido de `public/` tem que ser da MESMA versão do `pdfjs-dist` instalado.
 *
 * Por que existe (05/10/2026, upgrade do pdfjs-dist 5.6.205 para 6.4.299 por causa do GHSA-hq66-cqwq-w95j,
 * execução de JavaScript ao abrir um PDF malicioso): o leitor do app (`components/pdf/in-app-pdf-document`)
 * resolve o worker pelo bundler, e acompanha o pacote sozinho. Já a tela de PPP
 * (`app/admin/ppp/page.tsx`) usa `/pdf.worker.min.mjs`, uma CÓPIA em `public/`. O pdf.js se recusa a
 * rodar quando a versão da API e a do worker diferem, e lá o `getDocument` está dentro de um
 * `try { … } catch {}` vazio: o upgrade do pacote sem atualizar a cópia faria a extração de texto dos PPPs
 * em PDF sem formulário devolver VAZIO, sem erro nenhum. Foi o único consumidor da cópia que precisou
 * ser lembrado à mão; agora o teste lembra.
 *
 * Validado por mutação: trocar o número da versão no cabeçalho de `public/pdf.worker.min.mjs`, ou subir o
 * `pdfjs-dist` sem copiar o worker, reprova o teste.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const versaoDoWorker = (arquivo: string) => /pdfjsVersion\s*=\s*([0-9]+\.[0-9]+\.[0-9]+)/.exec(readFileSync(arquivo, 'utf-8'))?.[1];

describe('worker do pdf.js em public/', () => {
  const instalada = JSON.parse(readFileSync('node_modules/pdfjs-dist/package.json', 'utf-8')).version as string;

  it('a cópia de public/ é da mesma versão do pacote instalado', () => {
    expect(versaoDoWorker('public/pdf.worker.min.mjs')).toBe(instalada);
  });

  it('alvo vivo: o worker do próprio pacote traz a versão no cabeçalho (senão o teste acima não mede nada)', () => {
    expect(versaoDoWorker('node_modules/pdfjs-dist/build/pdf.worker.min.mjs')).toBe(instalada);
  });

  it('a tela de PPP ainda aponta para a cópia (se deixar de apontar, este guard perde o sentido)', () => {
    expect(readFileSync('app/admin/ppp/page.tsx', 'utf-8')).toContain("'/pdf.worker.min.mjs'");
  });
});
