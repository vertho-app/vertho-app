import { describe, it, expect } from 'vitest';
import { escopoTenantDaLinha, updateConteudoInTenantDaLinha, deleteConteudoInTenantDaLinha } from '@/lib/repositories/conteudos-repo';

/**
 * micro_conteudos é tabela MISTA (empresa OU catálogo global NULL) — a
 * disciplina testada é o predicado "tenant DA LINHA": eq pra tenant,
 * is-null pro catálogo, sempre repetido na mutação.
 */
function sbMock(linha: any, resultadoMutacao: any = { id: 'c1' }) {
  const filtros: Record<string, any> = {};
  let chamada = 0;
  const qFetch: any = {
    select: () => qFetch, eq: () => qFetch,
    maybeSingle: async () => ({ data: linha, error: null }),
  };
  const qMut: any = {
    update: (campos: any) => { qMut._campos = campos; return qMut; },
    delete: () => { qMut._delete = true; return qMut; },
    select: () => qMut,
    eq: (col: string, val: any) => { filtros[col] = val; return qMut; },
    is: (col: string, val: any) => { filtros[`${col} IS`] = val; return qMut; },
    maybeSingle: async () => ({ data: resultadoMutacao, error: null }),
    then: (resolve: any) => resolve({ data: resultadoMutacao, error: null }),
  };
  return { from: () => (++chamada === 1 ? qFetch : qMut), _filtros: filtros, _qMut: qMut };
}

describe('conteudos-repo (tenant da linha, tabela mista)', () => {
  it('escopoTenantDaLinha: linha de EMPRESA → .eq; linha GLOBAL → .is null', () => {
    const chamadas: any[] = [];
    const q: any = { eq: (...a: any[]) => chamadas.push(['eq', ...a]), is: (...a: any[]) => chamadas.push(['is', ...a]) };
    escopoTenantDaLinha(q, { empresa_id: 'e1' });
    escopoTenantDaLinha(q, { empresa_id: null });
    expect(chamadas).toEqual([['eq', 'empresa_id', 'e1'], ['is', 'empresa_id', null]]);
  });

  it('update em linha de empresa: WHERE repete id + empresa_id da LINHA', async () => {
    const sb = sbMock({ empresa_id: 'e1' });
    const r = await updateConteudoInTenantDaLinha(sb, 'c1', { ativo: true });
    expect(r).toEqual({ id: 'c1' });
    expect(sb._filtros).toEqual({ id: 'c1', empresa_id: 'e1' });
    expect(sb._qMut._campos).toEqual({ ativo: true });
  });

  it('update em linha do CATÁLOGO global: WHERE repete IS NULL', async () => {
    const sb = sbMock({ empresa_id: null });
    await updateConteudoInTenantDaLinha(sb, 'c9', { url: 'x' });
    expect(sb._filtros).toEqual({ id: 'c9', 'empresa_id IS': null });
  });

  it('id inexistente → null (update) e false (delete idempotente), sem mutação', async () => {
    expect(await updateConteudoInTenantDaLinha(sbMock(null), 'nao-existe', {})).toBeNull();
    expect(await deleteConteudoInTenantDaLinha(sbMock(null), 'nao-existe')).toBe(false);
  });

  it('delete escopado devolve true e repete o predicado da linha', async () => {
    const sb = sbMock({ empresa_id: 'e2' });
    expect(await deleteConteudoInTenantDaLinha(sb, 'c3')).toBe(true);
    expect(sb._filtros).toEqual({ id: 'c3', empresa_id: 'e2' });
    expect(sb._qMut._delete).toBe(true);
  });
});
