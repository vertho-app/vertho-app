import { describe, it, expect } from 'vitest';
import { canUseModulo, moduloContratado, MODULOS } from '@/lib/access-gates';

describe('canUseModulo', () => {
  it('🔴 fail-closed: config vazia = NÃO contratado', () => {
    // O default liberado é exatamente o estado que produziu o card fantasma:
    // 40 diretores de Macaé com um "Pulso T0" pendente por 3 meses, de um
    // módulo que ninguém comprou. Módulo que vaza ligado não dá erro em lugar
    // nenhum — só aparece na tela de quem não pagou.
    const gate = canUseModulo({}, MODULOS.PULSO);
    expect(gate.allowed).toBe(false);
    expect(gate.code).toBe('MODULO_NAO_CONTRATADO');
    expect(gate.remediation).toContain('modulos.pulso');
  });

  it('null/undefined também nega', () => {
    expect(canUseModulo(null, MODULOS.PULSO).allowed).toBe(false);
    expect(canUseModulo(undefined, MODULOS.PULSO).allowed).toBe(false);
  });

  it('libera com o módulo contratado', () => {
    expect(canUseModulo({ modulos: { pulso: true } } as any, MODULOS.PULSO).allowed).toBe(true);
    expect(moduloContratado({ modulos: { pulso: true } } as any, MODULOS.PULSO)).toBe(true);
  });

  it('só `true` conta — string/1/objeto não liberam', () => {
    for (const valor of ['true', 1, {}, 'sim']) {
      expect(canUseModulo({ modulos: { pulso: valor } } as any, MODULOS.PULSO).allowed).toBe(false);
    }
  });

  it('contratar um módulo não libera outro', () => {
    const cfg = { modulos: { outro_modulo: true } } as any;
    expect(canUseModulo(cfg, MODULOS.PULSO).allowed).toBe(false);
  });

  it('a mensagem diz o nome do produto, não o slug do código', () => {
    // Jargão de código vazando para o operador é uma classe conhecida aqui.
    expect(canUseModulo({}, MODULOS.PULSO).message).toContain('Pulso de Desenvolvimento');
  });
});
