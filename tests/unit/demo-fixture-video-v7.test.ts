import { describe, expect, it } from 'vitest';
import { configVideoV7 } from '@/lib/video/v7/etapa-plano';
import acmeDemo from '@/lib/demo/acme-demo-fixture.json';
import escolasDemo from '@/lib/demo/escolas-demo-fixture.json';

// O reset dos demos (`lib/demo/reset-acme-demo.ts`, 04h e sob demanda) reconstrói `empresas.sys_config` a partir do
// fixture. `Medido 19/10/2026`: a chave do vídeo no formato novo, ligada por script em 18/10 nas empresas, tinha sumido
// de acme-demo e escolas-acme na manhã seguinte, e todo vídeo novo da demo voltaria a sair no formato antigo. A chave
// mora no fixture, que é a fonte do reset.
describe('fixtures dos demos: vídeo no formato novo', () => {
  it.each([
    ['acme-demo', acmeDemo],
    ['escolas-acme', escolasDemo],
  ])('%s liga a biblioteca v7 com a frase do lugar de trabalho', (_slug, fixture) => {
    const cfg = configVideoV7((fixture as any).empresa?.sys_config);
    expect(cfg.ligado).toBe(true);
    expect(cfg.contexto && cfg.contexto.length).toBeGreaterThan(40);
  });
});
