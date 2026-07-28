import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * trilha-core · DUO indisponível (decisão de produto 28/07): na CONSTRUÇÃO,
 * falha alto. Antes o fluxo caía em silêncio pro single-comp e a pessoa
 * recebia 1 competência em vez de 2 sem ninguém saber. Agora registra
 * `duo-para-single` E ABORTA com erro acionável — o catch do core headless
 * converte o throw em `{ error }`, que é como a mensagem chega ao admin
 * (loop do lote isola por colaborador). Escape explícito:
 * programa_modo='regular_single' (mig 154).
 *
 * Validado por mutação: remover o `throw` (voltar a cair no fluxo single)
 * derruba o 1º teste (voltaria a tentar o single e quebraria em
 * sem_assessment OU seguiria adiante — nunca com a mensagem DUO); remover o
 * registrarDegradacao derruba a assertiva do spy.
 */

function chainable(rows: any[], single: any = null) {
  const q: any = {};
  const self = () => q;
  for (const m of ['select', 'eq', 'lte', 'gte', 'or', 'is', 'in', 'not', 'order', 'limit', 'upsert', 'insert', 'update']) q[m] = vi.fn(self);
  q.maybeSingle = vi.fn(async () => ({ data: single }));
  q.then = (resolve: any) => resolve({ data: rows });
  return q;
}

// tdb (tenant): cargos_empresa sem foco, top10_cargos vazio → DUO não resolve
// 2 competências → gerarTemporadaRegularDuo devolve { _fallbackSingle, motivo }.
const mockTdb = { from: vi.fn((_table: string) => chainable([], null)) };

vi.mock('@/lib/tenant-db', () => ({ tenantDb: () => mockTdb }));
vi.mock('@/lib/degradacao', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/degradacao')>();
  return { ...mod, registrarDegradacao: vi.fn(async () => {}) };
});

import { gerarTemporadaCoreHeadless } from '@/lib/season-engine/trilha-core';
import { registrarDegradacao, DEGRADACAO } from '@/lib/degradacao';

const registrarSpy = vi.mocked(registrarDegradacao);

const COLAB = {
  id: 'colab-1', nome_completo: 'Pessoa', cargo: 'Analista', empresa_id: 'emp-1',
  area_depto: null, programa_modo: null,
  pref_video_curto: null, pref_video_longo: null, pref_texto: null, pref_audio: null, pref_estudo_caso: null,
};

function sbRawMock() {
  return {
    from: vi.fn((table: string) => {
      if (table === 'colaboradores') return chainable([], COLAB);
      if (table === 'empresas') return chainable([], { segmento: 'educacao', sys_config: {} });
      return chainable([], null);
    }),
  };
}

beforeEach(() => registrarSpy.mockClear());

describe('gerarTemporada · DUO indisponível', () => {
  it('registra duo-para-single E devolve erro acionável pro admin (throw convertido pelo core)', async () => {
    const r: any = await gerarTemporadaCoreHeadless(sbRawMock(), {
      colaboradorId: 'colab-1', competencia: 'Comp A',
    });

    // O throw vira { error } no catch do core — é a mensagem que o admin vê por colaborador.
    expect(r.error).toBe(
      "DUO indisponível (cargo sem 2 competências resolvíveis) — rode o mapeamento da competência ou defina programa_modo='regular_single' explicitamente",
    );
    expect(r.ok).toBeUndefined(); // NÃO caiu no fluxo single nem gerou trilha

    expect(registrarSpy).toHaveBeenCalledTimes(1);
    expect(registrarSpy).toHaveBeenCalledWith(expect.objectContaining({
      fluxo: 'trilha',
      tipo: DEGRADACAO.DUO_PARA_SINGLE,
      chave: 'colab-1',
      empresaId: 'emp-1',
      colaboradorId: 'colab-1',
    }));
  });

  it("escape explícito: programa_modo='regular_single' NÃO tenta DUO (sem registro, sem erro DUO)", async () => {
    const sb = {
      from: vi.fn((table: string) => {
        if (table === 'colaboradores') return chainable([], { ...COLAB, programa_modo: 'regular_single' });
        if (table === 'empresas') return chainable([], { segmento: 'educacao', sys_config: {} });
        return chainable([], null);
      }),
    };
    const r: any = await gerarTemporadaCoreHeadless(sb, {
      colaboradorId: 'colab-1', competencia: 'Comp A',
    });

    // Single explícito segue o fluxo single — que aqui para no anti-viés
    // (sem assessment), NUNCA no erro de DUO, e sem degradação registrada.
    expect(r.error).toContain('descriptor_assessments');
    expect(r.error).not.toContain('DUO');
    expect(registrarSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ tipo: DEGRADACAO.DUO_PARA_SINGLE }),
    );
  });
});
