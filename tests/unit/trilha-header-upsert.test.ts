import { describe, it, expect } from 'vitest';
import { persistirTrilha } from '@/lib/season-engine/trilha-core';

/**
 * F-C1 do docs/FMEA-PIPELINE.md: o HEADER da trilha era SELECT-then-UPDATE/INSERT
 * sem lock nem versão — sob regeneração concorrente, o UPDATE batia em 0 linhas
 * (a row sumiu entre os statements) ou o INSERT colidia no
 * UNIQUE(empresa_id,colaborador_id), e ambos falhavam em silêncio (lost-update
 * com ok:true). A correção é um UPSERT atômico no UNIQUE que já existe — mesmo
 * padrão de development_blueprints (lib/blueprint/core.ts).
 *
 * O SELECT prévio SEGUE existindo: lê data_inicio (F-I1) e numero_temporada da
 * trilha atual pra compor o payload. A gravação é que virou statement único.
 *
 * Validação por mutação: reverter pra `update(payload).eq('id', ...)` derruba
 * o 1º teste (upsert nunca é chamado); engolir o erro do upsert derruba o 2º.
 */

/** Mock chainable do tdb que registra as operações por tabela. */
function tdbMock(opts: { existente?: any; upsertError?: any } = {}) {
  const ops: { tipo: string; tabela: string; payload?: any; opts?: any }[] = [];
  const mk = (tabela: string) => {
    const q: any = {
      select: () => q,
      eq: () => q,
      order: () => q,
      limit: () => q,
      in: () => q,
      delete: () => q,
      update: (p: any) => { ops.push({ tipo: 'update', tabela, payload: p }); return q; },
      insert: (p: any) => { ops.push({ tipo: 'insert', tabela, payload: p }); return q; },
      upsert: (p: any, o: any) => {
        ops.push({ tipo: 'upsert', tabela, payload: p, opts: o });
        q._upsert = true;
        return q;
      },
      maybeSingle: async () => {
        if (q._upsert) {
          if (tabela === 'trilhas' && opts.upsertError) return { data: null, error: opts.upsertError };
          return { data: { id: 'trilha-1' }, error: null };
        }
        return { data: tabela === 'trilhas' ? (opts.existente ?? null) : null, error: null };
      },
      then: (resolve: any) => resolve(
        q._upsert
          ? { error: tabela === 'trilhas' ? (opts.upsertError ?? null) : null }
          : { data: [], error: null },
      ),
    };
    return q;
  };
  return { from: mk, ops };
}

const ARGS = {
  colaboradorId: 'colab-1',
  competenciaFoco: 'Autocuidado',
  competenciasFoco: ['Autocuidado'],
  programaModo: 'regular' as any,
  semanas: [{ semana: 1, tipo: 'conteudo' }, { semana: 2, tipo: 'aplicacao' }],
  descritoresSelecionados: [],
};

describe('persistirTrilha · header da trilha é UPSERT atômico (F-C1)', () => {
  it('grava o header por upsert com onConflict empresa_id,colaborador_id — sem update/insert', async () => {
    const tdb = tdbMock();
    const r = await persistirTrilha(tdb, ARGS);
    expect(r).toEqual({ trilhaId: 'trilha-1', numeroTemporada: 1 });

    const header = tdb.ops.filter((o) => o.tabela === 'trilhas');
    const upserts = header.filter((o) => o.tipo === 'upsert');
    expect(upserts).toHaveLength(1);
    expect(upserts[0].opts).toEqual({ onConflict: 'empresa_id,colaborador_id' });
    // Nenhum caminho de update/insert sobrou — eram os 2 modos de falha silenciosa.
    expect(header.filter((o) => o.tipo === 'update')).toHaveLength(0);
    expect(header.filter((o) => o.tipo === 'insert')).toHaveLength(0);
  });

  it('erro do upsert PROPAGA (nunca ok:true com header perdido)', async () => {
    const tdb = tdbMock({ upsertError: { message: 'duplicate key value violates unique constraint' } });
    const r = await persistirTrilha(tdb, ARGS);
    expect(r).toEqual({ error: 'duplicate key value violates unique constraint' });
    // E não segue pro progresso com trilhaId de mentira.
    expect(tdb.ops.filter((o) => o.tabela === 'temporada_semana_progresso')).toHaveLength(0);
  });

  it('data_inicio e numero_temporada existentes são preservados no payload do upsert (F-I1)', async () => {
    const tdb = tdbMock({ existente: { id: 'trilha-9', numero_temporada: 3, data_inicio: '2026-01-05' } });
    const r = await persistirTrilha(tdb, ARGS);
    expect(r).toEqual({ trilhaId: 'trilha-1', numeroTemporada: 3 });

    const upsert = tdb.ops.find((o) => o.tabela === 'trilhas' && o.tipo === 'upsert');
    expect(upsert?.payload.data_inicio).toBe('2026-01-05');
    expect(upsert?.payload.numero_temporada).toBe(3);
  });

  it('trilha nova (SELECT vazio) calcula data_inicio da próxima segunda', async () => {
    const tdb = tdbMock({ existente: null });
    await persistirTrilha(tdb, ARGS);
    const upsert = tdb.ops.find((o) => o.tabela === 'trilhas' && o.tipo === 'upsert');
    expect(upsert?.payload.data_inicio).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
