import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Sprint 2 da auditoria 22/08 — o gate da classe A5.
 *
 * A classe: export `'use server'` que exige uma permissão que o papel `rh`
 * POSSUI (`content.manage`), recebe o id do RECURSO vindo do cliente e escopa a
 * escrita ao tenant DA LINHA sem nunca perguntar se quem pediu tinha direito a
 * ela. "A escrita não escapa da linha" ≠ "quem pediu tinha direito à linha".
 *
 * `requireLinhaSupabase` é o gate que faltava. Estes casos provam as três
 * réguas dele separadamente — inclusive a ORDEM, que é o detalhe que decide se
 * o gate vira oráculo de existência.
 */

let sessao: any = null;
let temPermissao = true;
/** Tenant da linha alvo. `null` = catálogo global. */
let tenantDaLinha: string | null = 'emp-B';
/** `null` = o id não existe. */
let linhaExiste = true;

/** Registra o que o gate pediu ao banco — é assim que provamos a ORDEM. */
let chamadasFrom: string[] = [];
let colunasPedidas: string[] = [];

function makeClient() {
  const from = (tabela: string) => {
    chamadasFrom.push(tabela);
    const b: any = {
      select: (cols: string) => { colunasPedidas.push(cols); return b; },
      eq: () => b,
      maybeSingle: async () => ({
        data: linhaExiste ? { id: 'x', empresa_id: tenantDaLinha, titulo: 'Conteúdo' } : null,
        error: null,
      }),
    };
    return b;
  };
  return { from };
}
const client = makeClient();

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => client }));
vi.mock('@/lib/auth/action-context', () => ({
  requireUserAction: async () => {
    if (!sessao) throw new Error('UNAUTHORIZED');
    return sessao;
  },
  requireAdminAction: async (permission?: string) => {
    if (!sessao) throw new Error('UNAUTHORIZED');
    if (!sessao.isPlatformAdmin) throw new Error('FORBIDDEN: apenas platform admin');
    if (permission && !temPermissao) throw new Error(`FORBIDDEN: permissão necessária ${permission}`);
    return sessao;
  },
  requirePermissionAction: async () => {
    if (!sessao) throw new Error('UNAUTHORIZED');
    return sessao;
  },
}));
vi.mock('@/lib/permissions', () => ({ can: async () => temPermissao }));
vi.mock('@/lib/audit', () => ({ logAdminAction: vi.fn() }));

import { requireLinhaSupabase, requirePlataformaSupabase, requireEmpresaSupabase } from '@/lib/admin-supabase';
import { logAdminAction } from '@/lib/audit';

const rhEmpA = { role: 'rh', empresaId: 'emp-A', email: 'rh@a.com', colaborador: { id: 'rh-1' }, isPlatformAdmin: false };
const platformAdmin = { role: null, empresaId: null, email: 'admin@vertho.ai', colaborador: null, isPlatformAdmin: true };
const FORBIDDEN = /FORBIDDEN/;

beforeEach(() => {
  sessao = rhEmpA;
  temPermissao = true;
  tenantDaLinha = 'emp-B';
  linhaExiste = true;
  chamadasFrom = [];
  colunasPedidas = [];
  vi.mocked(logAdminAction).mockClear();
});

describe('requireLinhaSupabase — tenant vem da LINHA', () => {
  it('RH do tenant A não alcança linha do tenant B (é a classe A5)', async () => {
    await expect(
      requireLinhaSupabase('micro_conteudos', 'c-1', 'content.manage', 'conteudo.atualizar'),
    ).rejects.toThrow(FORBIDDEN);
  });

  it('RH passa na linha do PRÓPRIO tenant, e a linha volta junto (sem re-fetch)', async () => {
    tenantDaLinha = 'emp-A';
    const { sb, linha } = await requireLinhaSupabase('micro_conteudos', 'c-1', 'content.manage', 'conteudo.atualizar', 'titulo');
    expect(sb).toBeTruthy();
    expect(linha?.empresa_id).toBe('emp-A');
    expect((linha as any)?.titulo).toBe('Conteúdo');
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it('platform admin alcança qualquer tenant', async () => {
    sessao = platformAdmin;
    const { linha } = await requireLinhaSupabase('micro_conteudos', 'c-1', 'content.manage', 'conteudo.atualizar');
    expect(linha?.empresa_id).toBe('emp-B');
  });

  /**
   * 🔑 A ORDEM é a regra, não um detalhe: se a leitura viesse antes da checagem
   * de permissão, o gate responderia "existe/não existe" para quem nem passou no
   * primeiro degrau — vira oráculo de id.
   */
  it('sem a permissão, o banco NÃO é tocado (o gate não vira oráculo de existência)', async () => {
    temPermissao = false;
    await expect(
      requireLinhaSupabase('micro_conteudos', 'c-1', 'content.manage', 'conteudo.atualizar'),
    ).rejects.toThrow(/permissão necessária content.manage/);
    expect(chamadasFrom).toEqual([]);
  });

  it('id inexistente devolve linha null (a action responde "não encontrado")', async () => {
    linhaExiste = false;
    const { linha } = await requireLinhaSupabase('micro_conteudos', 'inexistente', 'content.manage', 'conteudo.atualizar');
    expect(linha).toBeNull();
  });

  it('id vazio é BAD_REQUEST antes de tudo', async () => {
    await expect(
      requireLinhaSupabase('micro_conteudos', '', 'content.manage', 'conteudo.atualizar'),
    ).rejects.toThrow(/BAD_REQUEST/);
    expect(chamadasFrom).toEqual([]);
  });

  it('`empresa_id` entra no select mesmo quando o chamador pede outras colunas', async () => {
    tenantDaLinha = 'emp-A';
    await requireLinhaSupabase('micro_conteudos', 'c-1', 'content.manage', 'conteudo.atualizar', 'titulo, formato');
    expect(colunasPedidas[0]).toMatch(/empresa_id/);
  });

  it('não duplica `empresa_id` quando o chamador já pediu', async () => {
    tenantDaLinha = 'emp-A';
    await requireLinhaSupabase('micro_conteudos', 'c-1', 'content.manage', 'conteudo.atualizar', 'empresa_id, titulo');
    expect(colunasPedidas[0]).toBe('empresa_id, titulo');
  });

  it('`*` já traz empresa_id — o select passa intacto (embed continua válido)', async () => {
    tenantDaLinha = 'emp-A';
    await requireLinhaSupabase('micro_conteudos', 'c-1', 'content.manage', 'conteudo.gerar_final', '*, empresa:empresas(nome)');
    expect(colunasPedidas[0]).toBe('*, empresa:empresas(nome)');
  });
});

/**
 * Catálogo global (`empresa_id IS NULL`) — a decisão de produto de 24/08:
 * platform_admin apenas. `micro_conteudos` e `banco_cenarios` são tabelas
 * MISTAS (linhas de empresa + linhas globais), então a mesma action atende os
 * dois casos e a régua tem de separar.
 */
describe('linha do catálogo GLOBAL', () => {
  it('RH com content.manage NÃO alcança linha global', async () => {
    tenantDaLinha = null;
    await expect(
      requireLinhaSupabase('micro_conteudos', 'c-1', 'content.manage', 'conteudo.atualizar'),
    ).rejects.toThrow(FORBIDDEN);
  });

  it('platform admin alcança linha global', async () => {
    tenantDaLinha = null;
    sessao = platformAdmin;
    const { linha } = await requireLinhaSupabase('micro_conteudos', 'c-1', 'content.manage', 'conteudo.atualizar');
    expect(linha?.empresa_id).toBeNull();
  });

  it('requireEmpresaSupabase com empresaId nulo = catálogo global: RH barrado', async () => {
    await expect(requireEmpresaSupabase(null, 'content.manage', 'conteudo.gerar_ia')).rejects.toThrow(FORBIDDEN);
  });

  it('requireEmpresaSupabase com empresaId nulo: platform admin passa', async () => {
    sessao = platformAdmin;
    await expect(requireEmpresaSupabase(null, 'content.manage', 'conteudo.gerar_ia')).resolves.toBeTruthy();
  });
});

describe('requirePlataformaSupabase — recurso que não é de tenant nenhum', () => {
  it('RH é barrado mesmo tendo a permissão (content.manage está no papel rh)', async () => {
    await expect(requirePlataformaSupabase('content.manage')).rejects.toThrow(/apenas platform admin/);
  });

  it('platform admin com a permissão passa', async () => {
    sessao = platformAdmin;
    await expect(requirePlataformaSupabase('content.manage')).resolves.toBeTruthy();
  });

  it('platform admin SEM a permissão granular é barrado (o Sócio não apaga catálogo)', async () => {
    sessao = platformAdmin;
    temPermissao = false;
    await expect(requirePlataformaSupabase('content.manage')).rejects.toThrow(FORBIDDEN);
  });
});

/**
 * A vigília da Sprint 0 só serve se souber QUAL recurso foi sondado. Com o
 * tenant vindo da linha, `empresa_id_pedido` sozinho não diz nada — o cliente
 * mandou um id de conteúdo, não de empresa.
 */
describe('vigília: o gate por linha registra o recurso sondado', () => {
  it('cross-tenant → motivo tenant + recurso `<tabela>:<id>`', async () => {
    await expect(
      requireLinhaSupabase('micro_conteudos', 'c-1', 'content.manage', 'conteudo.deletar'),
    ).rejects.toThrow(FORBIDDEN);

    const arg: any = vi.mocked(logAdminAction).mock.calls[0][0];
    expect(arg.acao).toBe('gate.forbidden');
    expect(arg.alvo).toBe('conteudo.deletar');
    expect(arg.detalhes.motivo).toBe('tenant');
    expect(arg.detalhes.recurso).toBe('micro_conteudos:c-1');
    expect(arg.detalhes.empresa_id_pedido).toBe('emp-B');
    expect(arg.detalhes.mesmo_tenant).toBe(false);
    // a coluna com FK recebe o tenant de QUEM CHAMOU, nunca o pedido
    expect(arg.empresaId).toBe('emp-A');
  });

  it('sem permissão no próprio tenant → motivo permissao (candidato a fluxo quebrado)', async () => {
    temPermissao = false;
    await expect(
      requireLinhaSupabase('micro_conteudos', 'c-1', 'content.manage', 'conteudo.deletar'),
    ).rejects.toThrow(FORBIDDEN);

    const arg: any = vi.mocked(logAdminAction).mock.calls[0][0];
    expect(arg.detalhes.motivo).toBe('permissao');
    expect(arg.detalhes.recurso).toBe('micro_conteudos:c-1');
  });
});
