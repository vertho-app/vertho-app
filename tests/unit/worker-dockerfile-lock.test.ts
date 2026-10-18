import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

/**
 * A imagem do worker da Hetzner instala as dependências na hora do build do snapshot. Sem lock, o `^` das dependências
 * de terceiros resolve o que estiver publicado NAQUELE dia. `Medido 18/10/2026`: o @hyperframes/aws-lambda 0.8.140 pede
 * `@hyperframes/producer@^0.8.140`, a última versão publicada apontava para um `@hyperframes/core@0.8.171` que ainda não
 * existia, e o `npm install` da imagem quebrou. Pior que quebrar seria resolver uma versão nova que instala e se
 * comporta diferente: o snapshot congela uma combinação que ninguém testou. Daí `npm ci` pelo lock versionado.
 */
describe('worker da Hetzner instala pelo lock versionado', () => {
  const dir = 'worker-hetzner';
  const dockerfile = readFileSync(`${dir}/Dockerfile`, 'utf-8');
  const pkg = JSON.parse(readFileSync(`${dir}/package.json`, 'utf-8'));
  const lock = existsSync(`${dir}/package-lock.json`) ? JSON.parse(readFileSync(`${dir}/package-lock.json`, 'utf-8')) : null;

  it('o Dockerfile copia o lock (sem curinga) e instala com npm ci', () => {
    const copia = dockerfile.split(/\r?\n/).find((l) => /^COPY\s/.test(l) && /package\.json/.test(l)) || '';
    expect(copia.split(/\s+/)).toContain('package-lock.json');
    expect(dockerfile).toMatch(/^RUN npm ci --omit=dev\s*$/m);
    expect(dockerfile).not.toMatch(/^RUN npm install/m);
  });

  it('o lock existe e é do formato do npm 7+', () => {
    expect(lock, `${dir}/package-lock.json não existe`).not.toBeNull();
    expect(lock.lockfileVersion).toBeGreaterThanOrEqual(2);
  });

  it('o lock acompanha o package.json (senão o npm ci quebra o build do snapshot)', () => {
    expect(lock.packages[''].dependencies).toEqual(pkg.dependencies);
    for (const [nome, faixa] of Object.entries(pkg.dependencies as Record<string, string>)) {
      const travado = lock.packages[`node_modules/${nome}`]?.version;
      expect(travado, `${nome} ausente do lock`).toBeTruthy();
      if (/^\d/.test(faixa)) expect(travado, `${nome} fixo em ${faixa} no package.json`).toBe(faixa);
    }
  });

  it('o SDK do HyperFrames é o da Lambda publicada (0.8.140) e as dependências dele estão travadas', () => {
    expect(lock.packages['node_modules/@hyperframes/aws-lambda']?.version).toBe('0.8.140');
    const hf = Object.keys(lock.packages).filter((k) => k.startsWith('node_modules/@hyperframes/'));
    expect(hf.length).toBeGreaterThan(1);
    for (const k of hf) expect(lock.packages[k].version, k).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
