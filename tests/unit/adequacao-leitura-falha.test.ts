/**
 * `aggregateAdequacao` lia duas tabelas sem checar o `{ error }` que o
 * supabase-js RETORNA — e o supabase-js não lança.
 *
 * O que isso produzia, e por que ninguém veria:
 *   · falha ao ler `cargos_empresa` → `semGabarito: true`, e a tela diz "este
 *     cargo não tem perfil ideal", uma afirmação sobre a CONFIGURAÇÃO do cliente;
 *   · falha ao ler `colaboradores` → `semColaboradores: true`, e a tela manda
 *     capturar um DISC que o cliente já tem.
 *
 * Nos dois casos a avaria nossa se apresenta como resultado do cliente. Este é
 * caminho de CONSTRUÇÃO (admin gera o relatório), então a régua da casa é falhar
 * alto com mensagem acionável — não degradar para um resultado plausível.
 */
import { describe, it, expect } from 'vitest';
import { criarSupabaseMock } from '@/tests/helpers/supabase-mock';
import { aggregateAdequacao } from '@/lib/adequacao-cargo/aggregate';

/** Gabarito mínimo que faz o motor seguir além da primeira query. */
const GABARITO = {
  gabarito: { tela4: { competencias: [] }, tela1: { caracteristicas: [] } },
  eh_lideranca: false,
};

describe('leitura do perfil ideal', () => {
  it('LANÇA quando a query do cargo falha, em vez de dizer "sem gabarito"', async () => {
    const sb = criarSupabaseMock({ resolver: () => GABARITO });
    sb.falharEm({ tabela: 'cargos_empresa', op: 'select', mensagem: 'timeout no pool' });

    await expect(aggregateAdequacao(sb.client as any, 'emp-1', 'Gerente Comercial'))
      .rejects.toThrow(/perfil ideal do cargo "Gerente Comercial".*timeout no pool/);
  });

  it('cargo sem gabarito de verdade continua sendo "sem gabarito", não erro', async () => {
    // A distinção é o ponto: ausência configurada ≠ falha de leitura.
    const sb = criarSupabaseMock({ resolver: () => null });
    const r = await aggregateAdequacao(sb.client as any, 'emp-1', 'Cargo Novo');
    expect(r.semGabarito).toBe(true);
  });
});

describe('leitura dos colaboradores', () => {
  it('LANÇA quando a query de colaboradores falha, em vez de dizer "ninguém tem DISC"', async () => {
    const sb = criarSupabaseMock({ resolver: () => GABARITO });
    sb.falharEm({ tabela: 'colaboradores', op: 'select', mensagem: 'conexão encerrada' });

    await expect(aggregateAdequacao(sb.client as any, 'emp-1', 'Gerente Comercial'))
      .rejects.toThrow(/colaboradores para o cargo "Gerente Comercial".*conexão encerrada/);
  });

  it('cargo realmente sem ninguém mapeado continua sendo "sem colaboradores"', async () => {
    const sb = criarSupabaseMock({ resolver: () => GABARITO, lista: () => [] });
    const r = await aggregateAdequacao(sb.client as any, 'emp-1', 'Gerente Comercial');
    expect(r.semColaboradores).toBe(true);
    expect(r.semGabarito).toBe(false);
  });
});
