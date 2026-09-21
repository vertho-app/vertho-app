import { seedEngajamentoDemo } from '@/lib/demo/seed-engajamento';
import { describe, it, expect } from 'vitest';
import { lerPaginas } from '@/lib/db/ler-paginas';
import { criarSupabaseMock } from '../helpers/supabase-mock';
import { sincronizarAdocaoDemo } from '@/lib/demo/sincronizar-adocao';
import { notaPanoramaDemo } from '@/lib/demo/adocao-resultados-fixture';
import { criarPdiAcmeDemo } from '@/lib/demo/acme-rh-report-fixture';

describe('adoção e resultados fictícios', () => {
  it('recusa tenant real e elenco incompleto antes de qualquer escrita', async () => {
    for (const empresa of [{ slug: 'acme-demo', is_demo: false }, { slug: 'cliente-real', is_demo: true }, { slug: 'acme-demo', is_demo: true }]) {
      const sb = criarSupabaseMock({ resolver: t => t === 'empresas' ? empresa : null });
      await expect(sincronizarAdocaoDemo(sb.client as any, 'empresa')).rejects.toThrow();
      expect(sb.escritas).toEqual([]);
    }
  });
  it('sinais de consumo recusam tenant real antes de escrever', async () => {
    const sb = criarSupabaseMock({ resolver: () => ({ is_demo: false, slug: 'acme-demo' }) });
    await expect(seedEngajamentoDemo(sb.client as any, 'empresa')).rejects.toThrow();
    expect(sb.escritas).toEqual([]);
  });
  it('mantém diferenças entre pessoas e competências sem ultrapassar a régua', () => {
    const notas = ['lucas', 'camila', 'diego', 'fernanda'].flatMap(p => ['Comunicação', 'Negociação', 'Resiliência'].map(c => notaPanoramaDemo(`${p}.demo@vertho.ai`, c, 'Evidência')));
    expect(new Set(notas).size).toBeGreaterThan(3);
    expect(Math.min(...notas)).toBeGreaterThanOrEqual(3);
    expect(Math.max(...notas)).toBeLessThan(4);
  });
  it('PDI usa o nível real e prioriza as menores notas', () => {
    const r = criarPdiAcmeDemo({ email: 'lucas.demo@vertho.ai', nome_completo: 'Lucas', cargo: 'Representante Comercial' }, {
      avaliacoes: [{ competencia: 'Negociação e Fechamento', nota: 2.5 }, { competencia: 'Orientação a Metas e Resultados', nota: 3.6 }],
    });
    expect(r.competencias[0].nome).toBe('Negociação e Fechamento');
    expect(r.resumo_desempenho.find(c => c.competencia === 'Orientação a Metas e Resultados')?.nivel).toBe(4);
  });
  it('não perde o fim do Top 5 quando passa de mil descritores', async () => {
    const rows = Array.from({ length: 1201 }, (_, i) => ({ id: i }));
    const result = await lerPaginas(async (a, b) => ({ data: rows.slice(a, b + 1), error: null }));
    expect(result.data).toHaveLength(1201);
    expect(result.data?.at(-1)?.id).toBe(1200);
  });
  it('não apresenta uma contagem parcial quando uma página falha', async () => {
    const result = await lerPaginas(async a => a === 0 ? { data: [1, 2], error: null } : { data: null, error: { message: 'timeout' } }, 2);
    expect(result.data).toBeNull();
    expect(result.error?.message).toBe('timeout');
  });
});
