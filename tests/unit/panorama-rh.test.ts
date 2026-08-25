import { describe, it, expect, beforeEach, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * `carregarPanoramaRH` — os números da home do Admin da empresa.
 *
 * Duas invariantes, as duas já custaram caro nesta base:
 *
 *  1. **Pessoas, não ocorrências.** `trilhas` tem uma linha por temporada, então
 *     quem contar linhas anuncia "12 em jornada ativa" numa empresa de 7. É a
 *     mesma classe do alarme que dizia "N ocorrências" e era lido como
 *     "N pessoas".
 *  2. **Erro de banco não vira zero.** `count` volta `null` quando a query
 *     falha, e `null || 0` = 0: sem `indisponivel`, a home escreveria
 *     "0 pessoas" para uma empresa inteira — o modo de falha do F15, onde a
 *     falha de contagem virava o estado da pessoa na tela.
 */

/** `sys_config` da empresa — os testes trocam para exercitar a fonte externa. */
let sysConfig: any = {};

const sb = criarSupabaseMock({
  resolver: (tabela) => (tabela === 'empresas' ? { nome: 'Prefeitura de Exemplo', sys_config: sysConfig } : null),
  contagem: (tabela) => (tabela === 'colaboradores' ? 7 : null),
  lista: (tabela) =>
    tabela === 'trilhas'
      ? [
          // 5 linhas, 3 pessoas: quem já teve mais de uma temporada aparece
          // repetido — é exatamente o caso que a contagem crua erra.
          { colaborador_id: 'p1' },
          { colaborador_id: 'p1' },
          { colaborador_id: 'p2' },
          { colaborador_id: 'p3' },
          { colaborador_id: 'p3' },
        ]
      : [],
});

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
// O loader passa por `tenantDb`, que constrói o client com o mesmo
// `createSupabaseAdmin` — o mock acima cobre os dois caminhos.

import { carregarPanoramaRH } from '@/lib/home/loaders';

describe('panorama do RH', () => {
  beforeEach(() => { sb.reset(); sysConfig = {}; });

  it('conta PESSOAS em jornada, não linhas de trilha', async () => {
    const p = await carregarPanoramaRH('emp-1');
    expect(p.emJornada).toBe(3);
    expect(p.emJornada).not.toBe(5);
  });

  it('lê os totais do count, não do tamanho da lista', async () => {
    const p = await carregarPanoramaRH('emp-1');
    // `lista('colaboradores')` é `[]`: se o loader passasse a usar `data.length`
    // estes viriam 0 e a home mostraria empresa vazia.
    expect(p.pessoas).toBe(7);
    expect(p.comPerfil).toBe(7);
    expect(p.empresaNome).toBe('Prefeitura de Exemplo');
    expect(p.indisponivel).toBe(false);
  });

  it('não inclui contas de RH no funil de participantes', async () => {
    await carregarPanoramaRH('emp-1');
    const exclusoes = sb.chamadas.filter((c) =>
      c.tabela === 'colaboradores' && c.metodo === 'neq'
      && c.args[0] === 'role' && c.args[1] === 'rh',
    );
    // Uma exclusão no total de pessoas e outra no total com perfil.
    expect(exclusoes).toHaveLength(2);
  });

  it('escopa por tenant e só olha trilha ATIVA', async () => {
    await carregarPanoramaRH('emp-1');
    expect(sb.usou('colaboradores', 'eq', 'empresa_id')).toBe(true);
    expect(sb.usou('trilhas', 'eq', 'empresa_id')).toBe(true);
    const status = sb.chamadas.find((c) => c.tabela === 'trilhas' && c.metodo === 'eq' && c.args[0] === 'status');
    expect(status?.args[1]).toBe('ativa');
  });

  it('"com perfil" usa perfil_dominante — a mesma coluna que os gates do app', async () => {
    await carregarPanoramaRH('emp-1');
    const filtro = sb.chamadas.find((c) => c.tabela === 'colaboradores' && c.metodo === 'or');
    // Contar por `disc_resultados` daria 105 onde a tela de Equipe trata 144
    // como mapeadas (medido em `macae`): dois números para a mesma pergunta.
    expect(filtro?.args[0]).toContain('perfil_dominante');
    expect(sb.usou('colaboradores', 'not', 'disc_resultados')).toBe(false);
  });

  it('empresa com fonte externa conta o PDF extraído, não o DISC', async () => {
    sysConfig = { perfil_externo_fonte: 'opq32' };
    await carregarPanoramaRH('emp-1');
    expect(sb.usou('colaboradores', 'not', 'perfil_externo_dados')).toBe(true);
    expect(sb.chamadas.some((c) => c.tabela === 'colaboradores' && c.metodo === 'or')).toBe(false);
  });

  it('falha de contagem marca indisponivel — não vira "0 pessoas"', async () => {
    sb.falharEm({ tabela: 'colaboradores', op: 'select', mensagem: 'timeout no pool' });
    const p = await carregarPanoramaRH('emp-1');
    expect(p.indisponivel).toBe(true);
  });
});
