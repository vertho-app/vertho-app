import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * O bundle de render não está no git e o CCleaner apaga binários do disco (28/09: 63 arquivos, inclusive o logo). Estes
 * testes travam o que PODE ser travado no repositório: o manifesto lista os assets essenciais, o script de snapshot o
 * confere antes de gastar uma box, e o bundle do Trigger leva a vinheta do podcast. (Conferir o DISCO aqui daria vermelho
 * local a cada limpeza do CCleaner; quem confere o disco é o próprio script de build.)
 */
describe('manifesto do bundle de render', () => {
  const manifesto = readFileSync('worker-hetzner/spike-bundle.manifest', 'utf-8');
  it.each(['public/assets/logo-vertho.png', 'public/assets/avatar-intro.mp4', 'public/assets/avatar-outro.mp4', 'public/assets/mentora.png', 'bundle.js'])('lista %s', (arq) => {
    expect(manifesto).toMatch(new RegExp(`^\\d+ ${arq.replace(/\./g, '\\.')}$`, 'm'));
  });
  it('o script de snapshot confere o manifesto ANTES de provisionar a box', () => {
    const s = readFileSync('scripts/_render-snapshot-build.mjs', 'utf-8');
    expect(s).toContain('spike-bundle.manifest');
    expect(s.indexOf('conferirBundle();')).toBeGreaterThan(-1);
    expect(s.indexOf('conferirBundle();')).toBeLessThan(s.indexOf("provisionando box de build"));
  });
});

describe('bundle do Trigger leva a vinheta do podcast', () => {
  it('trigger.config inclui public/audio/podcast e o diretório tem as duas vinhetas versionadas', () => {
    expect(readFileSync('trigger.config.ts', 'utf-8')).toContain("additionalFiles({ files: ['public/audio/podcast/**'] })");
  });
});
