import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';
import { recortarElencoDemo } from '@/lib/demo/elenco-visivel';

/**
 * Listas de pessoas em tenant de demonstração mostram o ELENCO, e só ele.
 *
 * `Medido 16/09/2026:` a visão de RH da sala de apresentação, que todo prospect
 * da degustação abre, listava pelo nome os convidados que tinham degustado antes
 * (9 no `acme-demo`, 3 no `gruposinal`). Duas telas faziam isso pessoa por
 * pessoa: a Equipe (`resolverEscopoDoGestor`, coberta em
 * `degustacao-convidado-sem-gestor.test.ts`) e a Equipe em evolução, coberta
 * aqui. As visões agregadas já excluem conta interna e ficam de fora.
 */

const PERSONA = {
  id: 'bruna-id',
  nome_completo: 'Bruna Costa',
  email: 'bruna.demo@vertho.ai',
  cargo: 'Representante Comercial',
  area_depto: 'Comercial',
  gestor_email: 'carla.demo@vertho.ai',
  role: 'colaborador',
};
const CONVIDADO_ACME = {
  id: 'convidado-acme-id',
  nome_completo: 'Lucianna Prospect',
  email: 'convidado.acme.0123456789abcdef0123@vertho.ai',
  cargo: 'Representante Comercial',
  area_depto: 'Comercial',
  gestor_email: null,
  role: 'colaborador',
};
const CONVIDADO_SINAL = {
  ...CONVIDADO_ACME,
  id: 'convidado-sinal-id',
  nome_completo: 'Convidado do Sinal',
  email: 'convidado.gruposinal.0123456789abcdef0123@vertho.ai',
};
const CADASTRO_EXTERNO = {
  id: 'externo-id',
  nome_completo: 'Pessoa Externa',
  email: 'pessoa@empresa-real.com.br',
  cargo: 'Analista Financeiro',
  area_depto: 'Financeiro',
  gestor_email: null,
  role: 'colaborador',
};

let isDemo = true;

const sb = criarSupabaseMock({
  resolver: (tabela) => (tabela === 'empresas' ? { is_demo: isDemo, sys_config: {} } : null),
  lista: (tabela) => (tabela === 'colaboradores'
    ? [PERSONA, CONVIDADO_ACME, CONVIDADO_SINAL, CADASTRO_EXTERNO]
    : []),
});

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/auth/action-context', () => ({
  getAuthenticatedEmailFromAction: async () => 'helena.demo@vertho.ai',
}));
vi.mock('@/lib/authz', () => ({
  getUserContext: async () => ({
    colaborador: { id: 'helena-id', email: 'helena.demo@vertho.ai', empresa_id: 'acme-id' },
    role: 'rh',
    isPlatformAdmin: false,
  }),
  mesmoEmail: (a: unknown, b: unknown) =>
    String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase(),
  canViewColabJourney: vi.fn(),
  findColabByEmail: vi.fn(),
}));
vi.mock('@/actions/temporada-concluida', () => ({ loadTemporadaConcluida: vi.fn() }));

import { listarEquipeEvolucao } from '@/app/dashboard/gestor/equipe-evolucao/actions';
import { resetEnvioGuardCache } from '@/lib/demo/envio-guard';

async function nomesDaEquipeEmEvolucao() {
  const r: any = await listarEquipeEvolucao();
  expect(r.ok).toBe(true);
  return (r.rows || []).map((row: any) => row.colab);
}

describe('Equipe em evolução, visão de RH', () => {
  beforeEach(() => {
    isDemo = true;
    sb.reset();
    resetEnvioGuardCache();
  });

  it('🔴 em tenant demo lista só o elenco: convidados de qualquer ambiente e cadastro externo ficam fora', async () => {
    expect(await nomesDaEquipeEmEvolucao()).toEqual(['Bruna Costa']);
  });

  it('controle: em tenant de cliente a lista é a empresa inteira', async () => {
    isDemo = false;
    expect(await nomesDaEquipeEmEvolucao()).toEqual([
      'Bruna Costa',
      'Lucianna Prospect',
      'Convidado do Sinal',
      'Pessoa Externa',
    ]);
  });

  it('falha ao ler o ambiente não esconde a empresa de um cliente (degrada para a lista inteira)', async () => {
    // `isTenantDemo` é fail-open e registra a degradação: travar a tela de todo
    // cliente por uma leitura instável seria pior do que a janela de exposição.
    sb.falharEm({ tabela: 'empresas', op: 'select', mensagem: 'timeout no pool' });
    expect(await nomesDaEquipeEmEvolucao()).toHaveLength(4);
  });
});

describe('recortarElencoDemo (régua pura)', () => {
  it('tenant demo: fica quem é do elenco, por pertencimento', () => {
    const pessoas = [PERSONA, CONVIDADO_ACME, CONVIDADO_SINAL, CADASTRO_EXTERNO, { email: null }, { email: 'staff@vertho.ai' }];
    expect(recortarElencoDemo(pessoas, true)).toEqual([PERSONA]);
  });

  it('tenant de cliente: devolve todo mundo, numa lista nova', () => {
    const pessoas = [PERSONA, CADASTRO_EXTERNO];
    const r = recortarElencoDemo(pessoas, false);
    expect(r).toEqual(pessoas);
    expect(r).not.toBe(pessoas);
  });
});
