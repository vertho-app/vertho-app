/**
 * Guard: o quadro "Por onde já caminhamos" do PDF da proposta tem que chegar à
 * função serverless da Vercel.
 *
 * O PDF lê a imagem por `fs` (`getTrajetoriaLogosBase64` em lib/pdf-assets.ts).
 * Na Vercel, arquivo de `public/` lido por `fs` só existe na função se estiver
 * em `outputFileTracingIncludes` do next.config.mjs. Fora dele, a leitura falha,
 * a função devolve null e a seção some do PDF: localmente tudo funciona, o build
 * passa e o cliente recebe o documento sem o quadro. Nada lança.
 *
 * O teste amarra as três pontas pelo NOME do arquivo: ele existe em `public/`,
 * é o que o carregador lê e está no tracing.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const RAIZ = join(__dirname, '..', '..');
const ARQUIVO = 'trajetoria-logos-2026-09.jpg';

describe('quadro de logos da proposta', () => {
  it('o arquivo existe em public/proposta', () => {
    expect(existsSync(join(RAIZ, 'public', 'proposta', ARQUIVO))).toBe(true);
  });

  it('é o arquivo que o carregador do PDF lê', () => {
    const assets = readFileSync(join(RAIZ, 'lib', 'pdf-assets.ts'), 'utf8');
    expect(assets).toContain(`'proposta', '${ARQUIVO}'`);
  });

  it('está no outputFileTracingIncludes, senão some só na Vercel', () => {
    const config = readFileSync(join(RAIZ, 'next.config.mjs'), 'utf8');
    const bloco = config.slice(config.indexOf('outputFileTracingIncludes'));
    expect(bloco).toContain(`'./public/proposta/${ARQUIVO}'`);
  });
});
