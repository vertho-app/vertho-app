import { describe, it, expect } from 'vitest';
import { buscarFilaPdi } from '@/lib/relatorios/fila-pdi';

/**
 * Fila do PDI, extraída de `actions/relatorios.ts` para `lib/` (a prévia e a orquestração do fluxo completo usam
 * a MESMA regra). Duas travas que custaram caro: (1) quem JÁ TEM relatório fica de fora (o upsert sobrescreveria um
 * PDI entregue); (2) PDI COMPLETO: só entra quem avaliou TODO o top 5 do cargo.
 */
function tdbCom(tabelas: Record<string, any[] | { error: string }>) {
  return {
    from: (t: string) => {
      const base = tabelas[t];
      const resposta = Array.isArray(base) ? { data: base, error: null } : { data: null, error: { message: (base as any)?.error || 'sem tabela' } };
      const q: any = {
        select: () => q, not: () => q, eq: () => q,
        in: () => q,
        then: (res: any) => res(resposta),
      };
      return q;
    },
  };
}
const resp = (colaborador_id: string) => ({ colaborador_id });

describe('buscarFilaPdi', () => {
  it('ninguém com avaliação: semAvaliacao (a action responde "Nenhuma avaliação encontrada")', async () => {
    const r: any = await buscarFilaPdi(tdbCom({ respostas: [], relatorios: [], colaboradores: [], cargos_empresa: [] }));
    expect(r.semAvaliacao).toBe(true);
    expect(r.pendentes).toEqual([]);
  });

  it('PDI COMPLETO: top5 = 3, só quem tem 3 respostas avaliadas entra; o de 2 vira "incompleto"', async () => {
    const r: any = await buscarFilaPdi(tdbCom({
      respostas: [resp('a'), resp('a'), resp('a'), resp('b'), resp('b')],
      relatorios: [],
      colaboradores: [{ id: 'a', cargo: 'CAIXA' }, { id: 'b', cargo: 'CAIXA' }],
      cargos_empresa: [{ nome: 'CAIXA', top5_workshop: ['x', 'y', 'z'] }],
    }));
    expect(r.pendentes).toEqual(['a']);
    expect(r.incompletos).toBe(1);
  });

  it('quem JÁ TEM relatório fica de fora (não sobrescreve PDI entregue) e não conta como incompleto', async () => {
    const r: any = await buscarFilaPdi(tdbCom({
      respostas: [resp('a'), resp('a'), resp('b')],
      relatorios: [{ colaborador_id: 'a' }],
      colaboradores: [{ id: 'a', cargo: 'CAIXA' }, { id: 'b', cargo: 'CAIXA' }],
      cargos_empresa: [{ nome: 'CAIXA', top5_workshop: ['x'] }],
    }));
    expect(r.pendentes).toEqual(['b']);
    expect(r.jaGerados).toEqual(['a']);
    expect(r.incompletos).toBe(0);
  });

  it('cargo SEM top5 configurado mantém a regra antiga: basta ter avaliação', async () => {
    const r: any = await buscarFilaPdi(tdbCom({
      respostas: [resp('a')], relatorios: [],
      colaboradores: [{ id: 'a', cargo: 'SEM-TOP5' }],
      cargos_empresa: [{ nome: 'SEM-TOP5', top5_workshop: [] }],
    }));
    expect(r.pendentes).toEqual(['a']);
  });

  it('erro de leitura FALHA em cada tabela (antes uma falha virava "nenhuma avaliação encontrada")', async () => {
    const ok = { respostas: [resp('a')], relatorios: [], colaboradores: [{ id: 'a', cargo: 'C' }], cargos_empresa: [] };
    for (const tabela of ['respostas', 'relatorios', 'colaboradores', 'cargos_empresa'] as const) {
      const r: any = await buscarFilaPdi(tdbCom({ ...ok, [tabela]: { error: 'boom' } }));
      expect(r.error, tabela).toMatch(new RegExp(`${tabela}: boom`));
    }
  });
});
