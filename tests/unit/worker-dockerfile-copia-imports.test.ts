import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { posix } from 'node:path';

/**
 * O Dockerfile do worker da Hetzner copia os arquivos UM A UM. Um módulo novo importado pelo worker e esquecido no
 * `COPY` não quebra nada no repositório nem na suíte: o snapshot sai, o worker sobe e MORRE no import
 * (`ERR_MODULE_NOT_FOUND`), e todo render falha. Medido em 02/10/2026: `saudacao.mjs` foi criado, importado por
 * `worker.mjs` e esquecido no Dockerfile; só foi pego antes de a box rodar porque conferi o Dockerfile à mão.
 */
describe('Dockerfile do worker copia tudo o que o worker importa', () => {
  const dir = 'worker-hetzner';
  const dockerfile = readFileSync(`${dir}/Dockerfile`, 'utf-8');
  const copiados = new Set(
    dockerfile.split(/\r?\n/).filter((l) => /^COPY\s/.test(l)).flatMap((l) => l.replace(/^COPY\s+/, '').split(/\s+/).slice(0, -1)),
  );

  it('há arquivos .mjs de código para checar', () => {
    expect(readdirSync(dir).filter((f) => f.endsWith('.mjs')).length).toBeGreaterThan(3);
  });

  // Os .mjs que o container EXECUTA: o ponto de entrada e tudo o que ele importa, transitivamente. O import é
  // resolvido a partir da pasta de QUEM importa (`miolo-v7.mjs` importa `./video-v7/composicao.mjs`).
  const alcancados = (() => {
    const vistos = new Set<string>(['worker.mjs']);
    const fila = ['worker.mjs'];
    while (fila.length) {
      const f = fila.pop()!;
      const src = readFileSync(`${dir}/${f}`, 'utf-8');
      for (const m of src.matchAll(/from\s+['"](\.\.?\/[^'"]+)['"]|import\(\s*['"](\.\.?\/[^'"]+)['"]\s*\)/g)) {
        const alvo = posix.normalize(posix.join(posix.dirname(f), m[1] || m[2]));
        if (!vistos.has(alvo)) { vistos.add(alvo); fila.push(alvo); }
      }
    }
    return [...vistos];
  })();

  // `COPY video-v7 ./video-v7` cobre tudo o que está dentro da pasta.
  const copiado = (arq: string) => copiados.has(arq) || [...copiados].some((c) => arq.startsWith(c.replace(/\/$/, '') + '/'));

  it.each(alcancados)('%s está no COPY', (arq) => {
    expect(copiado(arq), `${arq} é importado pelo worker mas NÃO está em nenhum COPY do Dockerfile`).toBe(true);
  });

  it('o ponto de entrada importa a regra da saudação e a composição v7 (o guard não pode ficar vazio de sentido)', () => {
    expect(alcancados).toContain('saudacao.mjs');
    expect(alcancados).toContain('video-v7/composicao.mjs');
  });

  it('a pasta copiada leva o runtime da biblioteca e as fontes que a composição lê do disco', () => {
    const v7 = readdirSync(`${dir}/video-v7`);
    for (const f of ['kit.js', 'ui-linhas.js', 'biblioteca.js', 'camada.js', 'driver.js', 'base.css', 'biblioteca.css']) expect(v7, f).toContain(f);
    expect(readdirSync(`${dir}/video-v7/fontes`).sort()).toEqual(['codec-cold-extrabold.woff2', 'roboto.woff2']);
    expect(copiado('video-v7/kit.js')).toBe(true);
  });
});
