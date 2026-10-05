/**
 * Guard: o worker do pdf.js servido de `public/` tem que ser da MESMA versão do `pdfjs-dist` travado no lock.
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
 * A régua é o LOCK, e não o `node_modules`: a catraca de push mede num worktree que reaproveita o
 * `node_modules` do disco principal (que pode estar numa versão anterior ao lock), e o CI instala do lock.
 * Na primeira versão deste guard a régua era o pacote instalado, e a catraca reprovou o próprio commit
 * que o criou. O lock é o que descreve o que vai ao ar, em qualquer máquina.
 *
 * Validado por mutação: trocar o número da versão no cabeçalho de `public/pdf.worker.min.mjs`, ou subir
 * o `pdfjs-dist` no lock sem copiar o worker, reprova o teste.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const versaoDoWorker = (arquivo: string) => /pdfjsVersion\s*=\s*([0-9]+\.[0-9]+\.[0-9]+)/.exec(readFileSync(arquivo, 'utf-8'))?.[1];
const travada = JSON.parse(readFileSync('package-lock.json', 'utf-8')).packages['node_modules/pdfjs-dist']?.version as string | undefined;

describe('worker do pdf.js em public/', () => {
  it('alvo vivo: o lock trava um pdfjs-dist e a cópia traz a versão no cabeçalho (senão o teste abaixo não mede nada)', () => {
    expect(travada).toMatch(/^[0-9]+\.[0-9]+\.[0-9]+$/);
    expect(versaoDoWorker('public/pdf.worker.min.mjs')).toMatch(/^[0-9]+\.[0-9]+\.[0-9]+$/);
  });

  it('a cópia de public/ é da mesma versão que o lock trava', () => {
    expect(versaoDoWorker('public/pdf.worker.min.mjs')).toBe(travada);
  });

  it('o package.json aceita a versão travada (lock e manifesto não divergem)', () => {
    const faixa = JSON.parse(readFileSync('package.json', 'utf-8')).dependencies['pdfjs-dist'] as string;
    expect(faixa.replace(/^[\^~]/, '').split('.')[0]).toBe((travada as string).split('.')[0]);
  });

  it('a tela de PPP ainda aponta para a cópia (se deixar de apontar, este guard perde o sentido)', () => {
    expect(readFileSync('app/admin/ppp/page.tsx', 'utf-8')).toContain("'/pdf.worker.min.mjs'");
  });
});
