import { describe, expect, it } from 'vitest';
import { janelaRenovada } from '@/lib/demo/janela-simulador-vendas';

const agora = new Date('2026-09-19T03:00:00.000Z');

describe('janela do simulador de vendas na demo', () => {
  it('renova a janela vencida (estado real do ACME: fim em 14/09 às 18h)', () => {
    const nova = janelaRenovada(
      { habilitado: true, periodo_inicio: '2026-09-14T15:59:00.000Z', periodo_fim: '2026-09-14T21:00:00.000Z' },
      agora,
    );
    expect(nova).toEqual({ periodo_inicio: '2026-09-14T15:59:00.000Z', periodo_fim: '2026-12-18T03:00:00.000Z' });
  });

  it('não mexe em janela com folga, nem em simulador desligado', () => {
    expect(janelaRenovada({ habilitado: true, periodo_inicio: null, periodo_fim: '2027-01-30T00:00:00.000Z' }, agora)).toBeNull();
    expect(janelaRenovada({ habilitado: false, periodo_inicio: null, periodo_fim: null }, agora)).toBeNull();
    expect(janelaRenovada(null, agora)).toBeNull();
  });

  it('sem período ou com início no futuro, o acesso abre agora', () => {
    expect(janelaRenovada({ habilitado: true, periodo_inicio: null, periodo_fim: null }, agora)?.periodo_inicio)
      .toBe(agora.toISOString());
    expect(janelaRenovada({ habilitado: true, periodo_inicio: '2026-10-01T00:00:00.000Z', periodo_fim: '2026-09-20T00:00:00.000Z' }, agora)?.periodo_inicio)
      .toBe(agora.toISOString());
  });
});
