import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../../helpers/supabase-mock';

/**
 * R-104 (revisão de 02/10/2026): `capturarLeadComercial` é `'use server'` e não
 * exige login. Os dois formulários que a usam (CONARH e RadarBett) estão
 * off-line desde 31/08, mas a action seguia gravando lead e acionando o worker
 * de envio para quem tivesse o action id.
 *
 * Este arquivo NÃO mocka `@/lib/blocos-offline`: é o registro real que decide.
 */
const sb = criarSupabaseMock();
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('next/headers', () => ({ headers: async () => ({ get: () => null }) }));
vi.mock('@/lib/radar/eventos', () => ({ registrarEvento: async () => {} }));

import { capturarLeadComercial } from '@/actions/lead-comercial';
import { BlocoOfflineError } from '@/lib/blocos-offline';

const lead = (campanha?: string) => ({
  nome: 'Visitante',
  email: 'visitante@empresa.com',
  cargo: 'Gerente',
  instituicao: 'Empresa',
  consentimento_lgpd: true,
  ...(campanha === undefined ? {} : { campanha }),
});

describe('capturarLeadComercial recusa no topo enquanto o bloco está off-line (R-104)', () => {
  beforeEach(() => sb.reset());

  it.each([
    ['conarh', 'conarh'],
    ['radarbett', 'radarbett'],
    ['CONARH', 'conarh'],
    [undefined, 'radarbett'],
    ['campanha-inventada', 'radarbett'],
    ['constructor', 'radarbett'],
  ])('🔴 campanha %j cai no bloco %s e é recusada sem tocar o banco', async (campanha, bloco) => {
    const erro = await capturarLeadComercial(lead(campanha as any)).catch((e) => e);
    expect(erro).toBeInstanceOf(BlocoOfflineError);
    expect(erro.bloco).toBe(bloco);
    expect(sb.chamadas).toHaveLength(0);
    expect(sb.escritas).toHaveLength(0);
  });

  it('a recusa vem antes da validação: payload vazio também é recusado pelo bloco', async () => {
    const erro = await capturarLeadComercial({} as any).catch((e) => e);
    expect(erro).toBeInstanceOf(BlocoOfflineError);
  });
});
