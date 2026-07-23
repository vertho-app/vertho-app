import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Guarda do contrato do `lookupPublico` (regressão medida 23/07): o connector
 * anti-SSRF do Agent (undici) é chamado pelo `net` com `{ all: true }` quando o
 * Happy Eyeballs (`autoSelectFamily`, default no Node ≥20) está ligado, e ESPERA
 * o callback no formato ARRAY `[{address, family}]`. A versão antiga devolvia
 * sempre a forma single `(err, address, family)` → o `net` lia a STRING do
 * address como array → `addresses[0].address` = undefined → ERR_INVALID_IP_
 * ADDRESS, quebrando TODO `fetchPublico` (certificado + site-palette "puxar
 * cores"). Os testes de bloqueio (net-guard.test.ts) NÃO pegavam isso: batem só
 * em localhost/127.0.0.1, rejeitados ANTES da linha bugada.
 *
 * dns é mockado (sem rede) → arquivo separado do net-guard.test.ts, que usa o
 * dns real.
 */

const lookupMock = vi.fn();
vi.mock('node:dns/promises', () => ({ lookup: (...a: any[]) => lookupMock(...a) }));

import { lookupPublico } from '@/lib/net-guard';

function chamar(hostname: string, opts: any): Promise<any[]> {
  return new Promise((resolve) => lookupPublico(hostname, opts, (...args: any[]) => resolve(args)));
}

describe('lookupPublico — contrato do callback (Happy Eyeballs)', () => {
  beforeEach(() => lookupMock.mockReset());

  it('com { all: true } devolve o ARRAY [{address, family}] (o que o net espera)', async () => {
    lookupMock.mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
    const args = await chamar('exemplo.com', { all: true });
    expect(args).toEqual([null, [{ address: '8.8.8.8', family: 4 }]]);
  });

  it('sem all devolve a forma single (err, address, family) — compat', async () => {
    lookupMock.mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
    const args = await chamar('exemplo.com', {});
    expect(args).toEqual([null, '8.8.8.8', 4]);
  });

  it('SSRF: se QUALQUER endereço resolvido é privado, bloqueia (não devolve sucesso)', async () => {
    lookupMock.mockResolvedValue([{ address: '8.8.8.8', family: 4 }, { address: '10.0.0.1', family: 4 }]);
    const [err, addr] = await chamar('rebind.exemplo.com', { all: true });
    expect(err).toBeInstanceOf(Error);
    expect(String(err.message)).toMatch(/privado/i);
    expect(addr).toBeUndefined();
  });

  it('DNS vazio → erro (não devolve endereço)', async () => {
    lookupMock.mockResolvedValue([]);
    const [err, addr] = await chamar('nxdomain.exemplo.com', { all: true });
    expect(err).toBeInstanceOf(Error);
    expect(addr).toBeUndefined();
  });
});
