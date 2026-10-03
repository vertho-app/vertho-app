import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

/**
 * R-106 (revisão de 02/10/2026): a home nativa do app (`app/page.tsx`, a que
 * www.vertho.com.br serve) tinha o botão "Ver Radar", que levava a
 * radar.vertho.ai. Desde 10/08/2026 esse subdomínio redireciona para vertho.ai
 * (o Radar virou ferramenta interna): o botão era uma volta para fora do app.
 *
 * A lista de subdomínios aposentados é lida do `proxy.js`, a fonte que faz o
 * redirecionamento, para que um aposentado novo passe a valer aqui também.
 */
const HOME = readFileSync('app/page.tsx', 'utf-8');
const PROXY = readFileSync('proxy.js', 'utf-8');

function subdominiosAposentados(): string[] {
  const m = PROXY.match(/SUBDOMINIOS_APOSENTADOS\s*=\s*new Set\(\[([^\]]*)\]\)/);
  return m ? [...m[1].matchAll(/['"]([a-z0-9-]+)['"]/g)].map((x) => x[1]) : [];
}

describe('home institucional: só links que levam a algum lugar', () => {
  it('nenhum link da home vai a subdomínio aposentado', () => {
    const aposentados = subdominiosAposentados();
    expect(aposentados, 'a lista do proxy.js precisa ser lida, senão o teste não prova nada').toContain('radar');

    const destinos = [...HOME.matchAll(/href=\{?\s*["'`]([^"'`]+)["'`]/g)].map((m) => m[1]);
    expect(destinos.length, 'a home precisa ter ao menos o link de acesso').toBeGreaterThan(0);

    const ofensores = destinos.filter((d) => aposentados.some((s) => new RegExp(`//${s}\\.`).test(d)));
    expect(ofensores, 'link para subdomínio que redireciona para fora do app').toEqual([]);
  });

  it('a copy do botão saiu junto, nos 4 idiomas', () => {
    for (const locale of ['pt-BR', 'pt-PT', 'es-ES', 'en-US']) {
      const home = JSON.parse(readFileSync(`messages/${locale}.json`, 'utf-8')).Home;
      expect(home?.accessPlatform, `${locale}: Home sem o botão de acesso`).toBeTruthy();
      expect(home?.viewRadar, `${locale}: texto de um botão que não existe mais`).toBeUndefined();
    }
  });
});
