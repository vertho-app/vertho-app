import { describe, it, expect } from 'vitest';
import { gateAcumuladaPiloto } from '@/lib/season-engine/trilha-runtime';
import { buscarCenarioBComFallback } from '@/lib/season-engine/cenario-b';

// ── B2: gate da acumulada do piloto ────────────────────────────────────────
describe('gateAcumuladaPiloto (B2)', () => {
  const NOW = 1_000_000_000_000;
  const isoAtras = (min: number) => new Date(NOW - min * 60_000).toISOString();

  it("status 'done' → pronto, sem redisparar", () => {
    expect(gateAcumuladaPiloto({ acumulada_status: 'done' }, NOW)).toEqual({ pronto: true, redisparar: false });
  });

  it("'processing' RECENTE → não pronto, aguarda (não redispara)", () => {
    expect(gateAcumuladaPiloto({ acumulada_status: 'processing', acumulada_started_at: isoAtras(1) }, NOW))
      .toEqual({ pronto: false, redisparar: false });
  });

  it("'processing' STALE (>5min) → não pronto, redispara (self-heal)", () => {
    expect(gateAcumuladaPiloto({ acumulada_status: 'processing', acumulada_started_at: isoAtras(6) }, NOW))
      .toEqual({ pronto: false, redisparar: true });
  });

  it("'error' → não pronto, redispara", () => {
    expect(gateAcumuladaPiloto({ acumulada_status: 'error' }, NOW)).toEqual({ pronto: false, redisparar: true });
  });

  it('sem row / status null → não pronto, redispara (nunca disparou)', () => {
    expect(gateAcumuladaPiloto(null, NOW)).toEqual({ pronto: false, redisparar: true });
    expect(gateAcumuladaPiloto({ acumulada_status: null }, NOW)).toEqual({ pronto: false, redisparar: true });
  });
});

// ── B1: fallback do Cenário B para 'todos' ─────────────────────────────────
function mockSb(byCargo: Record<string, any>) {
  let calls = 0;
  const from = () => {
    let cargo = '';
    const b: any = {
      select: () => b,
      eq: (col: string, val: string) => { if (col === 'cargo') cargo = val; return b; },
      limit: () => b,
      maybeSingle: async () => { calls++; return { data: byCargo[cargo] ?? null, error: null }; },
    };
    return b;
  };
  return { sb: { from }, getCalls: () => calls };
}
const CEN = (cargo: string) => ({ id: `cen-${cargo}`, titulo: 't', descricao: `desc ${cargo}`, alternativas: {} });

describe('buscarCenarioBComFallback (B1)', () => {
  it('usa o cenário do CARGO específico quando existe (sem fallback)', async () => {
    const { sb, getCalls } = mockSb({ Vendedor: CEN('Vendedor') });
    const r = await buscarCenarioBComFallback(sb, 'emp', 'Vendedor');
    expect(r?.id).toBe('cen-Vendedor');
    expect(getCalls()).toBe(1); // não consultou 'todos'
  });

  it("FALLBACK: cargo sem cenário → usa o 'todos' (o bug B1)", async () => {
    const { sb, getCalls } = mockSb({ todos: CEN('todos') }); // Vendedor ausente
    const r = await buscarCenarioBComFallback(sb, 'emp', 'Vendedor');
    expect(r?.id).toBe('cen-todos');
    expect(getCalls()).toBe(2); // tentou o cargo, depois 'todos'
  });

  it('nenhum cenário (nem cargo nem todos) → null', async () => {
    const { sb } = mockSb({});
    expect(await buscarCenarioBComFallback(sb, 'emp', 'Vendedor')).toBeNull();
  });

  it("cargo já é 'todos' → não duplica a query", async () => {
    const { sb, getCalls } = mockSb({});
    await buscarCenarioBComFallback(sb, 'emp', 'todos');
    expect(getCalls()).toBe(1);
  });
});
