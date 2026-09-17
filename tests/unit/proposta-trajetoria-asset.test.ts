/**
 * Guard: as imagens do PDF da proposta (quadro "Por onde já caminhamos" e fotos
 * dos fundadores) têm que chegar à função serverless da Vercel.
 *
 * O PDF lê essas imagens por `fs` (lib/pdf-assets.ts). Na Vercel, arquivo de
 * `public/` lido por `fs` só existe na função se estiver em
 * `outputFileTracingIncludes` do next.config.mjs. Fora dele, a leitura falha, a
 * função devolve null e a imagem some do PDF: localmente tudo funciona, o build
 * passa e o cliente recebe o documento sem ela. Nada lança.
 *
 * O teste amarra as pontas pelo NOME: cada arquivo existe em `public/proposta`,
 * é o que o código lê e está coberto pelo tracing.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { FUNDADORES } from '@/lib/sales/proposal-document';

const RAIZ = join(__dirname, '..', '..');
const LOGOS = 'trajetoria-logos-2026-09.jpg';
const ARQUIVOS = [LOGOS, ...FUNDADORES.map((f) => f.arquivo)];

describe('imagens do PDF da proposta', () => {
  it('cada arquivo existe em public/proposta', () => {
    for (const arquivo of ARQUIVOS) {
      expect(existsSync(join(RAIZ, 'public', 'proposta', arquivo)), arquivo).toBe(true);
    }
  });

  it('o quadro de logos é o arquivo que o carregador do PDF lê', () => {
    const assets = readFileSync(join(RAIZ, 'lib', 'pdf-assets.ts'), 'utf8');
    expect(assets).toContain(`'proposta', '${LOGOS}'`);
  });

  it('as fotos passam na validação de nome do carregador (só arquivo solto, jpg ou png)', () => {
    for (const f of FUNDADORES) expect(f.arquivo).toMatch(/^[a-z0-9-]+\.(jpg|png)$/);
  });

  it('todas estão no outputFileTracingIncludes, senão somem só na Vercel', () => {
    const config = readFileSync(join(RAIZ, 'next.config.mjs'), 'utf8');
    const bloco = config.slice(config.indexOf('outputFileTracingIncludes'));
    for (const arquivo of ARQUIVOS) {
      const coberto = bloco.includes(`'./public/proposta/${arquivo}'`)
        || (arquivo.endsWith('.jpg') && bloco.includes(`'./public/proposta/*.jpg'`));
      expect(coberto, arquivo).toBe(true);
    }
  });
});
