import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { criarSupabaseMock, type SupabaseMock } from '../helpers/supabase-mock';

/**
 * Fronteira de persistência do Simulador de liderança (`service.ts`).
 */
let sb: SupabaseMock;
const m = vi.hoisted(() => ({ modelo: 'gpt-5.4-2026-03-05' }));
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/permissions', () => ({ can: vi.fn(async () => true) }));
vi.mock('@/lib/ai-tasks', () => ({ getModelForTask: vi.fn(async () => m.modelo) }));
vi.mock('@/actions/ai-client', () => ({
  callAI: vi.fn(async () => JSON.stringify({ fala: 'Posso trazer os pedidos para revisarmos juntos.' })),
}));
// A revalidação de acesso antes de cada chamada paga tem teste próprio.
vi.mock('@/lib/simulador-lideranca/access', () => ({ contexto: vi.fn(async () => ({})) }));

import { executar } from '@/lib/simulador-lideranca/service';
import { gerador } from '@/lib/simulador-lideranca/ai';
import { PROMPTS } from '@/lib/simulador-lideranca/prompts';
import { VERSAO, type Estado } from '@/lib/simulador-lideranca/schema';
import { callAI } from '@/actions/ai-client';
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

describe('modelo resolvido na chamada, não congelado na jornada (27/09/2026)', () => {
  const registro = (modelo: string): Estado['modelos'] => ({
    abertura: modelo,
    personagem: modelo,
    consequencia: modelo,
    avaliador: modelo,
  });
  const bancoDaJornada = (s: Estado) =>
    criarSupabaseMock({
      resolver: (tabela) =>
        tabela === 'sim_lideranca_jornadas' ? { id: 'j1', estado: structuredClone(s), revisao: 0, lock_until: null } : null,
    });

  it('🔴 a chamada usa o modelo configurado HOJE; o da jornada fica só como registro', async () => {
    vi.mocked(callAI).mockClear();
    m.modelo = 'gpt-5.4-2026-03-05';
    const s = { ...estado(), modelos: registro('gpt-5.4-mini'), ativo: episodio(0) };
    sb = bancoDaJornada(s);
    const gerar = gerador(contexto(), 'j1', s, randomUUID(), Date.now() + 270_000);
    await gerar('personagem', { mensagens: [] });
    expect(vi.mocked(callAI).mock.calls[0][2]).toEqual({ model: 'gpt-5.4-2026-03-05' });
  });

  it('modelo configurado fora dos compatíveis com o formato estruturado recusa antes de chamar', async () => {
    vi.mocked(callAI).mockClear();
    m.modelo = 'claude-sonnet-4-6';
    const s = { ...estado(), modelos: registro('gpt-5.4-mini'), ativo: episodio(0) };
    sb = bancoDaJornada(s);
    const gerar = gerador(contexto(), 'j1', s, randomUUID(), Date.now() + 270_000);
    await expect(gerar('personagem', { mensagens: [] })).rejects.toMatchObject({ status: 400 });
    expect(callAI).not.toHaveBeenCalled();
    m.modelo = 'gpt-5.4-2026-03-05';
  });

  it('🔴 jornada de versão anterior ganha os prompts E o registro de modelos de hoje', async () => {
    m.modelo = 'gpt-5.4-2026-03-05';
    const v1 = {
      ...estado(),
      versao: 'lideranca-jornada-1' as const,
      modelos: registro('gpt-5.4-mini'),
      ativo: episodio(0),
    };
    sb = bancoDaJornada(v1);
    // O RPC de salvar devolve `null` (confirmação perdida): o que importa é o estado que ele RECEBEU.
    await expect(
      executar(contexto(), { acao: 'responder', requestId: randomUUID(), revisao: 0, texto: FALA }),
    ).rejects.toMatchObject({ status: 409 });
    const salvo = vi.mocked(sb.client.rpc).mock.calls[0][1].p_estado as Estado;
    expect(salvo.versao).toBe(VERSAO);
    expect(salvo.prompts).toEqual(PROMPTS);
    expect(salvo.modelos).toEqual(registro('gpt-5.4-2026-03-05'));
    // A conversa em andamento segue (a fala entrou com a resposta do personagem).
    expect(salvo.ativo?.mensagens.filter((x) => x.autor === 'lider')).toHaveLength(4);
  });
});
