import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * Resolução das personas da orientação (e-mail → id, no momento da visita).
 *
 * Duas invariantes: a leitura é escopada no tenant, e falha de leitura devolve
 * mapa vazio. Uma dica não pode derrubar a tela nem vazar pessoa de outro
 * ambiente de demonstração.
 */

process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'service-role-key-used-only-by-unit-test';

let colaboradores: any[] = [];

const sb = criarSupabaseMock({
  lista: (tabela) => (tabela === 'colaboradores' ? colaboradores : []),
});
sb.client.auth = { admin: {} };
sb.client.rpc = vi.fn();

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));

import { resolverPersonasDaOrientacao } from '@/lib/demo/degustacao-orientacao-servidor';

describe('personas da orientação', () => {
  beforeEach(() => {
    sb.reset();
    colaboradores = [
      { id: 'colab-bruna', email: 'bruna.demo@vertho.ai' },
      { id: 'colab-marina', email: 'marina.demo@vertho.ai' },
    ];
  });

  it('devolve e-mail para id, lendo dentro do tenant', async () => {
    const mapa = await resolverPersonasDaOrientacao('acme-id', ['bruna.demo@vertho.ai']);

    expect(mapa).toEqual({
      'bruna.demo@vertho.ai': 'colab-bruna',
      'marina.demo@vertho.ai': 'colab-marina',
    });
    expect(sb.chamadas).toContainEqual(expect.objectContaining({
      tabela: 'colaboradores', metodo: 'eq', args: ['empresa_id', 'acme-id'],
    }));
    expect(sb.usou('colaboradores', 'in', 'email')).toBe(true);
  });

  it('🔴 falha de leitura devolve mapa vazio, sem lançar e DEIXANDO RASTRO', async () => {
    // Sem o aviso, mapa vazio por erro fica igual a mapa vazio por não existir
    // ninguém: o link some e nada no mundo diz por quê. O retorno sozinho não
    // distingue os dois casos, então é o rastro que esta asserção segura.
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      sb.falharEm({ tabela: 'colaboradores', op: 'select', mensagem: 'timeout no pool' });
      await expect(resolverPersonasDaOrientacao('acme-id', ['bruna.demo@vertho.ai'])).resolves.toEqual({});
      expect(aviso).toHaveBeenCalledWith(expect.stringContaining('orientacao'), 'timeout no pool');
    } finally {
      aviso.mockRestore();
    }
  });

  it('sem tenant ou sem persona a resolver, nem consulta o banco', async () => {
    expect(await resolverPersonasDaOrientacao('', ['bruna.demo@vertho.ai'])).toEqual({});
    expect(await resolverPersonasDaOrientacao('acme-id', [])).toEqual({});
    expect(sb.chamadas).toHaveLength(0);
  });

  it('linha sem id ou sem e-mail não entra no mapa', async () => {
    colaboradores = [
      { id: '', email: 'bruna.demo@vertho.ai' },
      { id: 'colab-sem-email', email: null },
      { id: 'colab-marina', email: 'marina.demo@vertho.ai' },
    ];
    expect(await resolverPersonasDaOrientacao('acme-id', ['bruna.demo@vertho.ai'])).toEqual({
      'marina.demo@vertho.ai': 'colab-marina',
    });
  });
});
