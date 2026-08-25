import { describe, it, expect, beforeEach, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * Os relatórios gerenciais que o RH consome (RH · Perfil Organizacional · DNA).
 *
 * O DNA e o Perfil Organizacional não têm índice em tabela: são arquivos em
 * `conteudos/final/{dna,perfil-org}/{empresaId}-{timestamp}.pdf`. Duas coisas
 * podem dar errado aí, e as duas estão testadas:
 *
 *  1. **`search` do Storage é SUBSTRING, não prefixo.** Um arquivo cujo nome
 *     apenas CONTÉM o id do tenant passa pelo filtro do servidor. Confiar só
 *     nele entregaria o relatório de uma empresa dentro de outra — a classe de
 *     vazamento que esta base trata como inegociável.
 *  2. **O mais recente é o que vale.** Ibipeba tem 11 perfis organizacionais
 *     acumulados; devolver o primeiro da lista mostraria um retrato velho como
 *     se fosse o de hoje.
 */

const EMP = 'emp-1';
let ARQUIVOS: Record<string, { name: string }[]> = {};

const sb = criarSupabaseMock({
  resolver: (tabela) => (tabela === 'relatorios' ? { id: 'rel-rh-1', gerado_em: '2026-08-20T10:00:00Z' } : null),
});

// O helper devolve storage vazio; aqui a listagem é programável por pasta.
sb.client.storage.from = () => ({
  list: async (pasta: string) => ({ data: ARQUIVOS[pasta] || [], error: null }),
  getPublicUrl: (p: string) => ({ data: { publicUrl: `https://cdn/${p}` } }),
});

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));

import { carregarRelatoriosGerenciais } from '@/lib/home/loaders';

describe('relatórios gerenciais do RH', () => {
  beforeEach(() => { sb.reset(); ARQUIVOS = {}; });

  it('ignora arquivo de outro tenant que só CONTÉM o id no nome', async () => {
    ARQUIVOS['final/dna'] = [
      { name: `outra-empresa-${EMP}-999.pdf` }, // passa no `search`, não é nosso
      { name: `${EMP}-100.pdf` },
    ];
    const r = await carregarRelatoriosGerenciais(EMP);
    expect(r.dna?.url).toBe(`https://cdn/final/dna/${EMP}-100.pdf`);
    expect(r.dna?.url).not.toContain('outra-empresa');
  });

  it('pega o mais recente pelo timestamp do nome, não o primeiro da lista', async () => {
    ARQUIVOS['final/perfil-org'] = [
      { name: `${EMP}-100.pdf` },
      { name: `${EMP}-300.pdf` },
      { name: `${EMP}-200.pdf` },
    ];
    const r = await carregarRelatoriosGerenciais(EMP);
    expect(r.perfilOrg?.url).toBe(`https://cdn/final/perfil-org/${EMP}-300.pdf`);
    expect(r.perfilOrg?.em).toBe(new Date(300).toISOString());
  });

  it('pasta vazia devolve null — nada de card apontando para o nada', async () => {
    const r = await carregarRelatoriosGerenciais(EMP);
    expect(r.dna).toBeNull();
    expect(r.perfilOrg).toBeNull();
  });

  it('o relatório de RH aponta para a rota que já autoriza o papel rh', async () => {
    const r = await carregarRelatoriosGerenciais(EMP);
    expect(r.rh?.url).toBe('/api/relatorios/pdf?id=rel-rh-1');
    expect(sb.usou('relatorios', 'eq', 'tipo')).toBe(true);
  });
});
