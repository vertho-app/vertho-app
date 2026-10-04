import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { locales } from '@/i18n/routing';

/**
 * R-117 (03/10/2026): a tela inicial do Simulador de vendas dizia "cerca de 20 a
 * 30 minutos", o comentário do painel dizia "de 15 a 30" e o FEATURES dizia 15.
 * Nenhum dos três foi medido: as 43 sessões do banco são todas do tenant de
 * demonstração (34 de fixture), então não existe sessão real para tirar a
 * duração. O tempo saiu da tela; só volta com sessão real medida.
 */
describe('Simulador de vendas: a tela não promete duração', () => {
  for (const locale of locales) {
    it(`${locale}: o resumo "como funciona" não traz minutos`, () => {
      const msgs = JSON.parse(readFileSync(join(process.cwd(), 'messages', `${locale}.json`), 'utf-8'));
      const titulo: string = msgs.SimuladorVendas.howItWorks;
      expect(titulo.length).toBeGreaterThan(0);
      expect(titulo).not.toMatch(/\d/);
      expect(titulo).not.toMatch(/min/i);
    });
  }

  it('o script de verificação visual espera o mesmo título, sem tempo', () => {
    const script = readFileSync(join(process.cwd(), 'scripts', 'verify-pace-ui.mjs'), 'utf-8');
    expect(script).not.toContain('cerca de 20 a 30 minutos');
  });
});
