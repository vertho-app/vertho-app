import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { criarSupabaseMock, type SupabaseMock } from '../helpers/supabase-mock';

/**
 * Fronteira de persistência do Simulador de liderança (`service.ts`).
 */
let sb: SupabaseMock;
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/permissions', () => ({ can: vi.fn(async () => true) }));

import { executar } from '@/lib/simulador-lideranca/service';
import { tenantDb } from '@/lib/tenant-db';
import { estado, episodio, FALA } from '../fixtures/simulador-lideranca';

const EMP = '10000000-0000-4000-8000-000000000001';
const contexto = () =>
  ({
    auth: { isPlatformAdmin: false, role: 'colaborador', email: 'ana@cliente.test' },
    empresaId: EMP,
    empresaNome: 'Fictícia',
    tdb: tenantDb(EMP),
    ownerKey: 'colab:ana',
    variante: 'lider',
    colaboradorId: 'ana',
  }) as any;

describe('envio com outro envio em andamento (27/09/2026)', () => {
  it('🔴 lock ocupado responde 423, não 409: o cliente mantém o pedido e não duplica a fala', async () => {
    const s = { ...estado(), ativo: episodio(0) };
    sb = criarSupabaseMock({
      resolver: (tabela) =>
        tabela === 'sim_lideranca_jornadas'
          ? { id: 'j1', estado: s, revisao: 3, lock_until: new Date(Date.now() + 60_000).toISOString() }
          : null,
      // O CAS do lock não casa linha nenhuma: outro envio segura o encontro.
      escritaUnica: (tabela, op, payload) => (tabela === 'sim_lideranca_jornadas' && op === 'update' ? null : payload),
    });
    await expect(
      executar(contexto(), { acao: 'responder', requestId: randomUUID(), revisao: 3, texto: FALA }),
    ).rejects.toMatchObject({ status: 423, message: 'Há um envio em processamento. Aguarde e atualize o encontro.' });
    // Chegou ao CAS do lock (não é o 409 de revisão nem de recibo).
    expect(sb.usou('sim_lideranca_jornadas', 'or')).toBe(true);
    expect(sb.escritas.filter((e) => e.op === 'update').map((e) => Object.keys(e.payload))).toEqual([
      ['lock_token', 'lock_until'],
    ]);
  });

  it('revisão diferente continua 409 (o pedido não vale mais)', async () => {
    const s = { ...estado(), ativo: episodio(0) };
    sb = criarSupabaseMock({
      resolver: (tabela) => (tabela === 'sim_lideranca_jornadas' ? { id: 'j1', estado: s, revisao: 4, lock_until: null } : null),
    });
    await expect(
      executar(contexto(), { acao: 'responder', requestId: randomUUID(), revisao: 3, texto: FALA }),
    ).rejects.toMatchObject({ status: 409 });
    expect(sb.usou('sim_lideranca_jornadas', 'or')).toBe(false);
  });
});
