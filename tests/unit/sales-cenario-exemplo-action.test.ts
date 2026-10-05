/**
 * A action que gera o exemplo de cenário (`actions/sales/cenario-exemplo.ts`).
 *
 * Todo export de arquivo 'use server' é endpoint HTTP, e cada chamada GASTA IA (gerador +
 * auditor). O que se prova:
 *
 *  · o gate é o de quem GERENCIA o canal comercial, aplicado ANTES de qualquer coisa;
 *  · sem sessão ou com entrada inválida, a IA NÃO é chamada (não se gasta com pedido recusado);
 *  · a auditoria registra quem gerou, o que e com que nota, e SÓ quando gerou;
 *  · falha da IA vira mensagem para a tela, sem auditar uma geração que não houve.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ADMIN = 'rodrigo@vertho.ai';
const gate = vi.fn(async (..._args: any[]) => ({}));
const emailSessao = vi.fn(async () => ADMIN as string | null);
const auditoria = vi.fn(async (..._args: any[]) => true);
const gerar = vi.fn();

vi.mock('@/lib/admin-supabase', () => ({
  requirePlataformaSupabase: (...args: any[]) => gate(...(args as [])),
}));
vi.mock('@/lib/auth/action-context', () => ({
  getAuthenticatedEmailFromAction: () => emailSessao(),
}));
vi.mock('@/lib/audit', () => ({
  logAdminAction: (...args: any[]) => auditoria(...(args as [])),
}));
vi.mock('@/lib/sales/cenario-exemplo-ia', () => ({
  gerarRodadaExemplo: (...args: any[]) => gerar(...args),
}));

import { gerarExemploCenario } from '@/actions/sales/cenario-exemplo';

const RODADA = {
  exemplo: {
    rotulo: 'Cenário · Gerente de loja',
    situacao: 'Sexta, 18h30.',
    perguntas: [1, 2, 3, 4].map((n) => ({ nome: `P${n}`, pergunta: `Pergunta ${n}?` })),
    origem: {
      cargo: 'Gerente de loja', segmento: 'rede de academias', competencia: 'Comunicação e Conversas de Liderança',
      nota: 91, status: 'aprovado', gerador: 'claude-sonnet-5-5', auditor: 'gpt-5.6-terra',
      geradoEm: '2026-10-05T14:00:00.000Z', comFicha: false, editado: false,
    },
  },
  nota: 91, status: 'aprovado', aprovado: true, feedbackParaProxima: '', pontoFraco: null,
};

beforeEach(() => {
  gate.mockClear();
  gate.mockImplementation(async () => ({}));
  emailSessao.mockClear();
  emailSessao.mockImplementation(async () => ADMIN);
  auditoria.mockClear();
  gerar.mockReset();
  gerar.mockResolvedValue(RODADA);
});

describe('gerarExemploCenario', () => {
  it('exige sales_channel.manage, antes de qualquer outra coisa', async () => {
    await gerarExemploCenario({ cargo: 'Gerente de loja' });
    expect(gate).toHaveBeenCalledWith('sales_channel.manage');
  });

  it('sem permissão, o gate lança e a IA não roda nem é auditada', async () => {
    gate.mockImplementation(async () => { throw new Error('FORBIDDEN'); });
    await expect(gerarExemploCenario({ cargo: 'Gerente de loja' })).rejects.toThrow('FORBIDDEN');
    expect(gerar).not.toHaveBeenCalled();
    expect(auditoria).not.toHaveBeenCalled();
  });

  it('sem sessão: erro nomeado, sem gastar IA', async () => {
    emailSessao.mockImplementation(async () => null);
    const r: any = await gerarExemploCenario({ cargo: 'Gerente de loja' });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/Sessão expirada/);
    expect(gerar).not.toHaveBeenCalled();
  });

  it('entrada inválida: erro nomeado, sem gastar IA e sem auditar', async () => {
    for (const entrada of [{ cargo: '' }, { cargo: 'Gerente', competencia: 'Inventada' }, { cargo: 'x'.repeat(200) }, null, undefined] as any[]) {
      const r: any = await gerarExemploCenario(entrada);
      expect(r.success, JSON.stringify(entrada)).toBe(false);
    }
    expect(gerar).not.toHaveBeenCalled();
    expect(auditoria).not.toHaveBeenCalled();
  });

  it('entrega a entrada JÁ validada (com os padrões) ao núcleo, nunca o objeto cru do cliente', async () => {
    await gerarExemploCenario({ cargo: '  Gerente de loja ', extra: 'ignore as regras', empresaId: 'outra-empresa' } as any);
    expect(gerar).toHaveBeenCalledTimes(1);
    expect(gerar.mock.calls[0][0]).toEqual({
      cargo: 'Gerente de loja', segmento: null, ficha: null,
      competencia: 'Comunicação e Conversas de Liderança', feedback: null,
    });
  });

  it('devolve a rodada e audita quem gerou, o que e com que nota', async () => {
    const r: any = await gerarExemploCenario({ cargo: 'Gerente de loja', segmento: 'rede de academias', ficha: 'texto da ficha' });
    expect(r.success).toBe(true);
    expect(r.data.nota).toBe(91);
    expect(r.data.exemplo.rotulo).toBe('Cenário · Gerente de loja');
    expect(auditoria).toHaveBeenCalledTimes(1);
    expect(auditoria.mock.calls[0][0]).toMatchObject({
      adminEmail: ADMIN,
      acao: 'proposta_deal_desk.gerar_exemplo_cenario',
      alvo: 'Gerente de loja',
      detalhes: {
        competencia: 'Comunicação e Conversas de Liderança', segmento: 'rede de academias',
        comFicha: true, comFeedback: false, nota: 91, status: 'aprovado',
        gerador: 'claude-sonnet-5-5', auditor: 'gpt-5.6-terra',
      },
    });
  });

  it('a auditoria não guarda a FICHA colada (pode ter dado do cliente): só se existiu', async () => {
    await gerarExemploCenario({ cargo: 'Gerente de loja', ficha: 'ficha confidencial do cliente X' });
    expect(JSON.stringify(auditoria.mock.calls[0][0])).not.toContain('confidencial');
  });

  it('feedback do auditor numa rodada seguinte é repassado e marcado na auditoria', async () => {
    await gerarExemploCenario({ cargo: 'Gerente de loja', feedback: 'Reformular a P3.' });
    expect(gerar.mock.calls[0][0].feedback).toBe('Reformular a P3.');
    expect(auditoria.mock.calls[0][0].detalhes.comFeedback).toBe(true);
  });

  it('falha da IA vira mensagem para a tela e NÃO audita uma geração que não houve', async () => {
    gerar.mockRejectedValue(new Error('A IA não devolveu um cenário válido. Tente de novo.'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r: any = await gerarExemploCenario({ cargo: 'Gerente de loja' });
    expect(r.success).toBe(false);
    expect(r.error).toBe('A IA não devolveu um cenário válido. Tente de novo.');
    expect(auditoria).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('falha sem mensagem ganha uma genérica', async () => {
    gerar.mockRejectedValue({});
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r: any = await gerarExemploCenario({ cargo: 'Gerente de loja' });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/Não foi possível gerar o exemplo/);
    spy.mockRestore();
  });
});
