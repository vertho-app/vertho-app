import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registrarDegradacao, DEGRADACAO } from '@/lib/degradacao';

// Prova o caminho DEFAULT (sem `sb`): o client admin explode e a função resolve assim mesmo.
vi.mock('@/lib/supabase', () => ({
  createSupabaseAdmin: () => { throw new Error('sem NEXT_PUBLIC_SUPABASE_URL'); },
}));

/**
 * O helper existe para o caminho de FALLBACK — por isso a invariante central
 * testada aqui é "NUNCA lança" (select que explode, upsert com erro, client
 * padrão sem env: tudo vira console.error e o fluxo segue). Validado por
 * mutação: remover o incremento quebra o 2º teste; remover o try/catch quebra
 * os três últimos.
 */

const consoleSpy = () => vi.spyOn(console, 'error').mockImplementation(() => {});

interface MockOpts {
  /** ocorrencias da linha existente (null = não existe) */
  existente?: number | null;
  selectLanca?: boolean;
  upsertFalha?: boolean;
}

function mockSb({ existente = null, selectLanca = false, upsertFalha = false }: MockOpts = {}) {
  const upserts: Array<{ payload: any; opts: any }> = [];
  const sb = {
    from: (tabela: string) => {
      expect(tabela).toBe('degradacao_log');
      const q: any = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => {
          if (selectLanca) throw new Error('pool esgotado');
          return { data: existente != null ? { ocorrencias: existente } : null, error: null };
        },
        upsert: async (payload: any, opts: any) => {
          upserts.push({ payload, opts });
          return upsertFalha ? { error: { message: 'constraint violada' } } : { error: null };
        },
      };
      return q;
    },
  };
  return { sb, upserts };
}

const input = {
  fluxo: 'trilha' as const,
  tipo: DEGRADACAO.DUO_PARA_SINGLE,
  chave: 'colab-1',
  empresaId: 'emp-1',
  colaboradorId: 'colab-1',
  detalhe: { motivo: 'sem assessment' },
};

describe('registrarDegradacao · upsert com dedup', () => {
  beforeEach(() => consoleSpy());

  it('primeira ocorrência → insere com ocorrencias = 1', async () => {
    const { sb, upserts } = mockSb({ existente: null });
    await registrarDegradacao(input, sb);
    expect(upserts).toHaveLength(1);
    expect(upserts[0].payload).toMatchObject({
      fluxo: 'trilha', tipo: 'duo-para-single', chave: 'colab-1',
      empresa_id: 'emp-1', colaborador_id: 'colab-1', severidade: 'aviso', ocorrencias: 1,
    });
    expect(upserts[0].payload.ultima_em).toBeTruthy();
    expect(upserts[0].opts).toEqual({ onConflict: 'fluxo,tipo,chave' });
  });

  it('repetição → incrementa ocorrencias e atualiza ultima_em (não cria 2ª linha)', async () => {
    const { sb, upserts } = mockSb({ existente: 3 });
    await registrarDegradacao(input, sb);
    expect(upserts).toHaveLength(1); // upsert na MESMA chave — o UNIQUE da mig 194 é o dedup
    expect(upserts[0].payload.ocorrencias).toBe(4);
  });

  it('severidade explícita vence o default', async () => {
    const { sb, upserts } = mockSb();
    await registrarDegradacao({ ...input, severidade: 'critico' }, sb);
    expect(upserts[0].payload.severidade).toBe('critico');
  });
});

describe('registrarDegradacao · NUNCA lança', () => {
  beforeEach(() => consoleSpy());

  it('select explodindo → resolve sem lançar e loga', async () => {
    const { sb } = mockSb({ selectLanca: true });
    await expect(registrarDegradacao(input, sb)).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });

  it('upsert com erro → resolve sem lançar e loga', async () => {
    const { sb } = mockSb({ upsertFalha: true });
    await expect(registrarDegradacao(input, sb)).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });

  it('client padrão indisponível (sem env) → resolve sem lançar', async () => {
    // Sem `sb`: cai no createSupabaseAdmin() mockado acima, que explode — e mesmo
    // assim a função resolve. É o cenário "telemetria quebrada NÃO quebra o fallback".
    await expect(registrarDegradacao(input)).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});
