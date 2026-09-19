import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  criarSupabaseMock,
  type Chamada,
  type SupabaseMock,
} from '../helpers/supabase-mock';
import type { Contexto } from '@/lib/simulador-vendas/access';
let sb: SupabaseMock;
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/permissions', () => ({ can: vi.fn(async () => true) }));
import { can } from '@/lib/permissions';
import { tenantDb } from '@/lib/tenant-db';
import { painelEquipe } from '@/lib/simulador-vendas/equipe';
import {
  agregarPainel,
  MAX_COMENTARIOS,
  type SessaoPainel,
} from '@/lib/simulador-vendas/painel';

/**
 * Visão da equipe do vendas (18/09/2026): quem tem acesso e não começou, maior
 * nível por competência e a pesquisa de experiência, sem nome nos comentários.
 */
const empresa = 'empresa-a';
const valorDe = (cadeia: Chamada[], metodo: string, coluna: string) =>
  cadeia.find((e) => e.metodo === metodo && e.args[0] === coluna)?.args[1];

const colaboradores = [
  {
    id: 'ana',
    nome_completo: 'Ana',
    cargo: 'Vendedor',
    email: 'ana@cliente.test',
    role: 'colaborador',
    gestor_email: 'gestor@cliente.test',
  },
  {
    id: 'bia',
    nome_completo: 'Bia',
    cargo: 'Vendedor',
    email: 'bia@cliente.test',
    role: 'colaborador',
    gestor_email: 'outro@cliente.test',
  },
  {
    id: 'caio',
    nome_completo: 'Caio',
    cargo: 'Financeiro',
    email: 'caio@cliente.test',
    role: 'colaborador',
    gestor_email: 'gestor@cliente.test',
  },
  {
    id: 'davi',
    nome_completo: 'Davi',
    cargo: 'Vendedor',
    email: 'davi@cliente.test',
    role: 'colaborador',
    gestor_email: 'gestor@cliente.test',
  },
  {
    id: 'gil',
    nome_completo: 'Gil',
    cargo: 'Vendedor',
    email: 'gestor@cliente.test',
    role: 'gestor',
    gestor_email: null,
  },
  {
    id: 'rute',
    nome_completo: 'Rute',
    cargo: 'Vendedor',
    email: 'rh@cliente.test',
    role: 'rh',
    gestor_email: null,
  },
  {
    id: 'suporte',
    nome_completo: 'Suporte',
    cargo: 'Vendedor',
    email: 'suporte@vertho.ai',
    role: 'colaborador',
    gestor_email: 'gestor@cliente.test',
  },
].map((p) => ({ ...p, empresa_id: empresa }));
const outroTenant = {
  id: 'fora',
  empresa_id: 'empresa-b',
  nome_completo: 'Fora',
  cargo: 'Vendedor',
  email: 'f@b.test',
  role: 'colaborador',
  gestor_email: 'gestor@cliente.test',
};

const sessoes = [
  {
    id: 's1',
    colaborador_id: 'ana',
    created_at: '2026-09-10T12:00:00Z',
    resumo: { status: 'concluida', versaoRegua: 'pace-7' },
    pl: 2.5,
    p: 2.6,
    a: 3.1,
    c: null,
    e: 3.2,
    feedback: {
      realismo: 4,
      desafio: 3,
      interacao: 4,
      utilidade: 5,
      aprendizado: 4,
      comentario: 'Faltou pressão no preço.',
    },
  },
  {
    id: 's2',
    colaborador_id: 'ana',
    created_at: '2026-09-12T12:00:00Z',
    resumo: { status: 'concluida', versaoRegua: 'pace-7' },
    pl: 3.2,
    p: 3.0,
    a: 2.4,
    c: 3.0,
    e: 3.1,
    feedback: null,
  },
  {
    id: 's3',
    colaborador_id: 'davi',
    created_at: '2026-09-11T12:00:00Z',
    resumo: { status: 'concluida', versaoRegua: 'pace-5' },
    pl: null,
    p: 7.5,
    a: 7.5,
    c: 7.5,
    e: 7.5,
    feedback: {
      realismo: 5,
      desafio: 5,
      interacao: 5,
      utilidade: 5,
      aprendizado: 5,
      comentario: '',
    },
  },
];

const c = (role = 'gestor', admin = false) =>
  ({
    empresaId: empresa,
    empresaNome: 'Fictícia',
    ownerKey: 'colab:gil',
    tdb: tenantDb(empresa),
    config: { habilitado: true },
    auth: {
      role,
      email: 'gestor@cliente.test',
      isPlatformAdmin: admin,
      empresaId: empresa,
      colaborador: {
        id: 'gil',
        empresa_id: empresa,
        email: 'gestor@cliente.test',
      },
    },
  }) as unknown as Contexto;

function mock(sysConfig: Record<string, unknown> | null = null) {
  sb = criarSupabaseMock({
    resolver: (t) => (t === 'empresas' ? { sys_config: sysConfig } : null),
    lista: (t, _cols, cadeia) => {
      if (t === 'cargos_empresa')
        return [
          { id: 'cargo-vendas', nome: 'Vendedor' },
          { id: 'cargo-fin', nome: 'Financeiro' },
        ];
      // O tenantDb filtra por empresa no banco; aqui o filtro vem da própria cadeia.
      if (t === 'colaboradores')
        return [...colaboradores, outroTenant].filter(
          (p) => p.empresa_id === valorDe(cadeia, 'eq', 'empresa_id'),
        );
      if (t === 'sim_vendas_sessoes') {
        const ids = (valorDe(cadeia, 'in', 'colaborador_id') as string[]) || [];
        return sessoes.filter((s) => ids.includes(s.colaborador_id));
      }
      return [];
    },
  });
}

describe('painelEquipe: população, escopo e leitura', () => {
  beforeEach(() => {
    mock({
      simuladores_por_cargo: {
        'cargo-vendas': { vendas: true },
        'cargo-fin': { vendas: false },
      },
    });
    vi.mocked(can).mockResolvedValue(true);
  });

  it('gestor vê os liderados com o cargo liberado; gestor, RH e contas internas não entram', async () => {
    const painel = await painelEquipe(c('gestor'));
    // Caio: cargo sem vendas. Bia: outro gestor. Gil/Rute: só acompanham. Suporte: interno.
    expect(painel.pessoas.map((p) => p.id)).toEqual(['ana', 'davi']);
    expect(painel.resumo).toEqual({
      pessoas: 2,
      comecaram: 2,
      concluiram: 2,
      naoComecaram: 0,
    });
  });

  it('RH vê a empresa inteira com acesso; quem não começou aparece como tal', async () => {
    const painel = await painelEquipe(c('rh'));
    expect(painel.pessoas.map((p) => p.id)).toEqual(['ana', 'bia', 'davi']);
    expect(painel.naoComecaram.map((p) => p.id)).toEqual(['bia']);
  });

  it('nunca lê outro tenant, nem como administrador da plataforma', async () => {
    const painel = await painelEquipe(c('colaborador', true));
    expect(painel.pessoas.map((p) => p.id)).not.toContain('fora');
    expect(sb.usou('colaboradores', 'eq', 'empresa_id')).toBe(true);
    expect(sb.usou('sim_vendas_sessoes', 'eq', 'empresa_id')).toBe(true);
  });

  it('treino na escala antiga (0 a 10) não entra no nível; a pesquisa dele entra', async () => {
    const painel = await painelEquipe(c('rh'));
    const davi = painel.pessoas.find((p) => p.id === 'davi')!;
    expect(davi.concluidos).toBe(1);
    expect(davi.competencias.every((x) => x.nivelAlcancado === null)).toBe(
      true,
    );
    expect(painel.pesquisa.respostas).toBe(2);
    expect(painel.pesquisa.medias.realismo).toBe(4.5);
  });

  it('sem regra por cargo, todo cargo segue liberado (mesma régua do gate)', async () => {
    mock(null);
    const painel = await painelEquipe(c('rh'));
    expect(painel.pessoas.map((p) => p.id)).toEqual([
      'ana',
      'bia',
      'caio',
      'davi',
    ]);
  });

  it('cargo grafado de outro jeito segue a regra do cargo, não a liberação padrão (19/09/2026)', async () => {
    const caio = colaboradores.find((p) => p.id === 'caio')!;
    caio.cargo = ' FINANCEIRO ';
    try {
      const painel = await painelEquipe(c('rh'));
      expect(painel.pessoas.map((p) => p.id)).toEqual(['ana', 'bia', 'davi']);
    } finally {
      caio.cargo = 'Financeiro';
    }
  });

  it('perfil sem permissão de acompanhar não lê nada', async () => {
    vi.mocked(can).mockImplementation(
      async (_a, p) => p !== 'journey.team.view',
    );
    await expect(painelEquipe(c('gestor'))).rejects.toMatchObject({
      status: 403,
    });
    expect(sb.chamadas).toHaveLength(0);
  });

  it('falha de leitura dos treinos não vira equipe que não começou', async () => {
    sb.falharEm({
      tabela: 'sim_vendas_sessoes',
      op: 'select',
      mensagem: 'timeout',
    });
    await expect(painelEquipe(c('rh'))).rejects.toMatchObject({ status: 503 });
  });
});

describe('agregarPainel', () => {
  const pessoas = [
    { id: 'a', nome: 'Ana', cargo: null },
    { id: 'b', nome: 'Bruno', cargo: null },
    { id: 'c', nome: 'Carla', cargo: null },
  ];
  const s = (
    colaboradorId: string,
    criadoEm: string,
    status: string,
    extra: Partial<SessaoPainel> = {},
  ): SessaoPainel => ({
    colaboradorId,
    criadoEm,
    status,
    competencias: null,
    feedback: null,
    ...extra,
  });

  it('descartado não conta como treino; em andamento conta e aparece', () => {
    const p = agregarPainel(pessoas, [
      s('a', '2026-09-01', 'abandonada'),
      s('b', '2026-09-02', 'em_andamento'),
    ]);
    expect(p.naoComecaram.map((x) => x.id)).toEqual(['a', 'c']);
    expect(p.pessoas.find((x) => x.id === 'b')).toMatchObject({
      treinos: 1,
      concluidos: 0,
      emAndamento: true,
    });
  });

  it('distribuição por competência usa o maior nível de cada pessoa', () => {
    const p = agregarPainel(pessoas, [
      s('a', '2026-09-01', 'concluida', { competencias: { P: 2.2, A: 3.6 } }),
      s('a', '2026-09-05', 'concluida', { competencias: { P: 3.1, A: 2.0 } }),
      s('b', '2026-09-03', 'concluida', { competencias: { P: 1.5 } }),
    ]);
    const P = p.competencias.find((x) => x.codigo === 'P')!;
    expect(P.niveis).toEqual([1, 0, 1, 0]);
    const A = p.competencias.find((x) => x.codigo === 'A')!;
    expect(A).toMatchObject({ niveis: [0, 0, 0, 1], semNivel: 1 });
    expect(
      p.pessoas
        .find((x) => x.id === 'a')!
        .competencias.find((x) => x.codigo === 'P')!.subiu,
    ).toBe(true);
  });

  it('pesquisa: médias ignoram nota inválida; comentários sem nome, mais recentes primeiro e com teto', () => {
    const muitas = Array.from({ length: MAX_COMENTARIOS + 5 }, (_, i) =>
      s(
        'a',
        `2026-09-${String((i % 28) + 1).padStart(2, '0')}T${String(i % 24).padStart(2, '0')}:00:00Z`,
        'concluida',
        {
          feedback: {
            realismo: i === 0 ? 9 : 4,
            comentario: `Comentário ${i}`,
          },
        },
      ),
    );
    const p = agregarPainel(pessoas, muitas);
    expect(p.pesquisa.respostas).toBe(MAX_COMENTARIOS + 5);
    expect(p.pesquisa.medias.realismo).toBe(4);
    expect(p.pesquisa.comentarios).toHaveLength(MAX_COMENTARIOS);
    expect(Object.keys(p.pesquisa.comentarios[0]).sort()).toEqual([
      'em',
      'texto',
    ]);
    const datas = p.pesquisa.comentarios.map((x) => x.em);
    expect([...datas].sort().reverse()).toEqual(datas);
  });
});

it('inclui quem concluiu sem cobertura em Sem nível, sem misturar não iniciados e legado', () => {
  const pessoas = ['sem', 'com', 'legado', 'novo'].map((id) => ({
    id,
    nome: id,
    cargo: null,
  }));
  const base = { criadoEm: '2026-09-19', status: 'concluida', feedback: null };
  const r = agregarPainel(pessoas, [
    {
      ...base,
      colaboradorId: 'sem',
      competencias: { PL: null, P: null, A: null, C: null, E: null },
    },
    {
      ...base,
      colaboradorId: 'com',
      competencias: { PL: 3, P: null, A: null, C: null, E: null },
    },
    { ...base, colaboradorId: 'legado', competencias: null },
  ]);
  expect(r.competencias.find((c) => c.codigo === 'PL')).toMatchObject({
    niveis: [0, 0, 1, 0],
    semNivel: 1,
  });
  expect(r.competencias.find((c) => c.codigo === 'P')?.semNivel).toBe(2);
});
