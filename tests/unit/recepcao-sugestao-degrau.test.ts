/**
 * A-12 da revisão de 27/09/2026: a sugestão de degrau vem com o porquê.
 *
 * Quem treinava no Limite e não chegava ao Nível 3 lia "Sugerido para você agora:
 * Introdução", sem explicação. A régua (`NOTA_PARA_SUBIR`, Nível 3 na escala 1 a 4)
 * não mudou: o que muda é que a tela recebe o motivo e o degrau de base. Que o degrau
 * sugerido tenha caso publicado é conferido na tela (`scripts/verify-recepcao-ui.mjs`).
 */
import { describe, expect, it } from 'vitest';
import { sugerirNivel, sugerirNivelComMotivo } from '@/lib/recepcao/core';

const t = (nivel: string | null, nota: number | null) => ({ nivel, nota, escalaNota: '1-4' });

describe('A-12: sugestão de degrau com motivo', () => {
  it('sem treino com degrau: primeiro degrau, "sem_historico"', () => {
    expect(sugerirNivelComMotivo([])).toEqual({ nivel: 'introducao', motivo: 'sem_historico', base: null });
    expect(sugerirNivelComMotivo([t(null, 3.5)]).motivo).toBe('sem_historico');
  });

  it('no Limite sem chegar ao Nível 3: Introdução, com o motivo "abaixo_da_meta"', () => {
    expect(sugerirNivelComMotivo([t('limite', 2.9), t('limite', 2.4)])).toEqual({ nivel: 'introducao', motivo: 'abaixo_da_meta', base: null });
  });

  it('Nível 3 em Sob pressão: sugere o Limite, com a base', () => {
    expect(sugerirNivelComMotivo([t('introducao', 3.2), t('pressao', 3.0), t('limite', 2.1)])).toEqual({ nivel: 'limite', motivo: 'proximo', base: 'pressao' });
  });

  it('Nível 3 no Limite: segue nele, "topo"', () => {
    expect(sugerirNivelComMotivo([t('limite', 3.4)])).toEqual({ nivel: 'limite', motivo: 'topo', base: 'limite' });
  });

  it('a régua não mudou: `sugerirNivel` devolve o mesmo degrau', () => {
    for (const casos of [[], [t('limite', 2.9)], [t('pressao', 3)], [t('limite', 3.4)], [{ nivel: 'introducao', nota: 75 }]])
      expect(sugerirNivel(casos as any)).toBe(sugerirNivelComMotivo(casos as any).nivel);
    expect(sugerirNivel([{ nivel: 'introducao', nota: 75 }])).toBe('pressao'); // escala antiga 0-100
  });
});
