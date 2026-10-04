import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock, type SupabaseMock } from '../helpers/supabase-mock';
import { estado } from '../fixtures/simulador-vendas';
import type { Contexto } from '@/lib/simulador-vendas/access';

/**
 * R-96 (04/10/2026): as três mensagens que a pessoa lê quando o treino de vendas
 * não fecha mandam ao suporte, e agora o suporte TEM uma saída (o "Encerrar sem
 * devolutiva" da tela "Treinos parados"). A frase precisa dizer a verdade sobre
 * ela, sem prometer prazo: a ferramenta só vale depois de 48 horas sem atividade.
 */
let sb: SupabaseMock;
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/actions/ai-client', () => ({ callAI: vi.fn() }));
vi.mock('@/lib/ai-tasks', () => ({ getModelForTask: vi.fn(async () => 'gpt-5.4-2026-03-05') }));
vi.mock('@/lib/permissions', () => ({ can: vi.fn(async () => true) }));
import { callAI } from '@/actions/ai-client';
import { tenantDb } from '@/lib/tenant-db';
import { executarCore } from '@/lib/simulador-vendas/core';
import { executar } from '@/lib/simulador-vendas/service';
import { gerador } from '@/lib/simulador-vendas/ai';
import { HORAS_SEM_ATIVIDADE } from '@/lib/simuladores/treinos-parados-regras';

const REQ = '20000000-0000-4000-8000-000000000002';
const comConversa = () => {
  const s = estado();
  s.mensagens = [
    { id: 'r1:v', turno: 1, autor: 'vendedor', texto: 'Bom dia.', fase: 'preparar' },
    { id: 'r1:c', turno: 1, autor: 'cliente', texto: 'Bom dia.', fase: 'analisar' },
  ];
  return s;
};
/** Frases que prometem prazo ao participante: o suporte não assume isso. */
const PROMESSA_DE_PRAZO = /\bem até\b|\bhoje\b|\bimediat|\bnos próximos\b|\bem minutos\b/i;

describe('mensagens do treino de vendas que mandam ao suporte', () => {
  // Com chaves: `mockReset()` devolve o próprio mock, e o vitest chamaria o retorno como teardown.
  beforeEach(() => {
    vi.mocked(callAI).mockReset();
  });

  it('registro inconsistente: sem cobrança nova, e a saída é o suporte, depois de 48 horas', async () => {
    const s = comConversa();
    // Moderação sem categoria: o registro não pode virar penalidade (estado inconsistente).
    s.moderacoes = [{ violacao: true, categoria: null, severidade: null, motivo: '', turno: 1, fase: 'preparar' } as any];
    const gerar = vi.fn();
    const erro: any = await executarCore(s, { acao: 'encerrar', requestId: REQ, sessaoId: s.id, revisao: s.revisao }, gerar).catch((e) => e);

    expect(erro.status).toBe(409);
    expect(gerar).not.toHaveBeenCalled();
    expect(erro.message).toMatch(/Nenhuma nova avaliação foi cobrada/);
    expect(erro.message).toMatch(/suporte/);
    expect(erro.message).toContain(`${HORAS_SEM_ATIVIDADE} horas sem atividade`);
    expect(erro.message).toMatch(/sem devolutiva/);
    expect(erro.message).toMatch(/conversa fica preservada no histórico/);
    expect(erro.message).not.toMatch(PROMESSA_DE_PRAZO);
  });

  it('quem tenta descartar com conversa: é mandado concluir, e há o suporte se a devolutiva não vier', async () => {
    const s = comConversa();
    sb = criarSupabaseMock({ resolver: () => ({ id: s.id, estado: s, revisao: s.revisao, lock_until: null }) });
    const ctx = { empresaId: 'empresa-a', colaboradorId: 'colab-a', ownerKey: 'colab:colab-a', auth: { isPlatformAdmin: false }, tdb: tenantDb('empresa-a') } as Contexto;
    const erro: any = await executar(ctx, { acao: 'abandonar', sessaoId: s.id, revisao: s.revisao, requestId: REQ }).catch((e) => e);

    expect(erro.status).toBe(409);
    expect(erro.message).toMatch(/Conclua para receber a devolutiva/);
    expect(erro.message).toMatch(/Se a devolutiva não for gerada, fale com o suporte/);
    expect(erro.message).not.toMatch(PROMESSA_DE_PRAZO);
    // Recusado antes de qualquer lease, geração ou escrita.
    expect(sb.escritas).toHaveLength(0);
    expect(sb.client.rpc).not.toHaveBeenCalled();
    expect(callAI).not.toHaveBeenCalled();
  });

  it('a devolutiva que não fecha: diz que a conversa foi preservada e aponta o suporte se o erro continuar', async () => {
    sb = criarSupabaseMock({
      resolver: (tabela) =>
        tabela === 'sim_vendas_config'
          ? { habilitado: true, periodo_inicio: '2020-01-01T00:00:00Z', periodo_fim: '2099-01-01T00:00:00Z' }
          : null,
    });
    vi.mocked(callAI).mockRejectedValue(new Error('fetch failed'));
    const ctx = { empresaId: 'empresa-a', colaboradorId: 'colab-a', auth: { isPlatformAdmin: false }, tdb: tenantDb('empresa-a') } as Contexto;
    let erro: any;
    try {
      await gerador(ctx, estado(), REQ)('gerente', {});
    } catch (e) {
      erro = e;
    }

    expect(erro.status).toBe(502);
    expect(erro.message).toMatch(/A conversa foi preservada; tente novamente\./);
    expect(erro.message).toMatch(/Se o erro continuar, fale com o suporte\./);
    expect(erro.message).not.toMatch(PROMESSA_DE_PRAZO);
  });
});
