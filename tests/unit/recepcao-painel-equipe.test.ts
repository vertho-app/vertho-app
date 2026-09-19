import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  criarSupabaseMock,
  type Chamada,
  type SupabaseMock,
} from '../helpers/supabase-mock';

let sb: SupabaseMock;
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/permissions', () => ({ can: async () => true }));
import { populacaoAtendimento } from '@/lib/recepcao/equipe';
import { visaoPorCompetencia } from '@/lib/recepcao/painel';

/**
 * Visão da equipe do atendimento por competência (18/09/2026): quem tem acesso,
 * quem treinou no período e o maior nível de cada pessoa (só avanço).
 */
const EMPRESA = 'empresa-a';
const CODIGOS = [
  'acolhimento',
  'compreensao',
  'clareza',
  'resolucao',
  'procedimentos',
];
const sessao = (
  colaborador: string,
  data: string,
  notas: Record<string, number | null> | null,
  status = 'concluida',
) => ({
  colaborador_id: colaborador,
  created_at: data,
  estado: {
    status,
    relatorio: notas
      ? {
          escalaNota: '1-4',
          competencias: Object.entries(notas).map(([codigo, nota]) => ({
            codigo,
            nota,
          })),
        }
      : null,
  },
});

describe('visaoPorCompetencia', () => {
  const pessoas = [
    { id: 'ana', nome: 'Ana', cargo: 'Recepção' },
    { id: 'bia', nome: 'Bia', cargo: null },
    { id: 'caio', nome: 'Caio', cargo: 'Recepção' },
  ];

  it('maior nível por competência, só avanço; sem treino no período fica listado', () => {
    const v = visaoPorCompetencia(
      [
        sessao('ana', '2026-09-10', { acolhimento: 2.4, compreensao: 3.2 }),
        sessao('ana', '2026-09-15', { acolhimento: 3.1, compreensao: 2.0 }),
        sessao('bia', '2026-09-12', null, 'em_andamento'),
      ],
      pessoas,
      CODIGOS,
    );
    const ana = v.pessoas.find((p) => p.id === 'ana')!;
    expect(ana).toMatchObject({
      iniciadas: 2,
      concluidas: 2,
      ultimo: '2026-09-15',
    });
    expect(
      ana.competencias.find((c) => c.codigo === 'acolhimento'),
    ).toMatchObject({ nivelAlcancado: 3, subiu: true });
    expect(
      ana.competencias.find((c) => c.codigo === 'compreensao'),
    ).toMatchObject({ nivelAlcancado: 3, subiu: false });
    expect(v.naoTreinaram.map((p) => p.id)).toEqual(['caio']);
    expect(
      v.competencias.find((c) => c.codigo === 'acolhimento')!.niveis,
    ).toEqual([0, 0, 1, 0]);
  });

  it('relatório sem matriz (escala antiga) conta como treino, mas não dá nível', () => {
    const antigo = sessao('bia', '2026-09-12', null);
    antigo.estado.relatorio = {
      competencias: [{ codigo: 'acolhimento', nota: 3 }],
    } as any;
    const v = visaoPorCompetencia([antigo], pessoas, CODIGOS);
    const bia = v.pessoas.find((p) => p.id === 'bia')!;
    expect(bia.concluidas).toBe(1);
    expect(bia.competencias.every((c) => c.nivelAlcancado === null)).toBe(true);
  });
});

describe('populacaoAtendimento', () => {
  const colaboradores = [
    {
      id: 'ana',
      nome_completo: 'Ana',
      cargo: 'Recepção',
      email: 'ana@c.test',
      role: 'colaborador',
      gestor_email: 'g@c.test',
    },
    {
      id: 'bia',
      nome_completo: 'Bia',
      cargo: 'Recepção',
      email: 'bia@c.test',
      role: 'colaborador',
      gestor_email: 'outro@c.test',
    },
    {
      id: 'caio',
      nome_completo: 'Caio',
      cargo: 'Financeiro',
      email: 'caio@c.test',
      role: 'colaborador',
      gestor_email: 'g@c.test',
    },
    {
      id: 'gil',
      nome_completo: 'Gil',
      cargo: 'Recepção',
      email: 'g@c.test',
      role: 'gestor',
      gestor_email: null,
    },
    {
      id: 'sup',
      nome_completo: 'Suporte',
      cargo: 'Recepção',
      email: 'sup@vertho.ai',
      role: 'colaborador',
      gestor_email: 'g@c.test',
    },
  ].map((p) => ({ ...p, empresa_id: EMPRESA }));
  const valor = (cadeia: Chamada[], coluna: string) =>
    cadeia.find((e) => e.metodo === 'eq' && e.args[0] === coluna)?.args[1];
  const ctx = (role: string, admin = false) =>
    ({
      empresaId: EMPRESA,
      sb: sb.client,
      auth: {
        role,
        isPlatformAdmin: admin,
        empresaId: EMPRESA,
        email: 'g@c.test',
        colaborador: { id: 'gil', empresa_id: EMPRESA, email: 'g@c.test' },
      },
    }) as any;

  beforeEach(() => {
    sb = criarSupabaseMock({
      resolver: (t) =>
        t === 'empresas'
          ? {
              sys_config: {
                simuladores_por_cargo: {
                  'c-rec': { atendimento: true },
                  'c-fin': { atendimento: false },
                },
              },
            }
          : null,
      lista: (t, _c, cadeia) =>
        t === 'cargos_empresa'
          ? [
              { id: 'c-rec', nome: 'Recepção' },
              { id: 'c-fin', nome: 'Financeiro' },
            ]
          : t === 'colaboradores'
            ? colaboradores.filter(
                (p) => p.empresa_id === valor(cadeia, 'empresa_id'),
              )
            : [],
    });
  });

  it('gestor: liderados com o cargo liberado; gestor e contas internas não entram', async () => {
    expect(
      (await populacaoAtendimento(ctx('gestor'))).map((p) => p.id),
    ).toEqual(['ana']);
  });

  it('RH: a empresa com acesso', async () => {
    expect((await populacaoAtendimento(ctx('rh'))).map((p) => p.id)).toEqual([
      'ana',
      'bia',
    ]);
  });

  it('falha ao ler os cargos não vira equipe vazia', async () => {
    sb.falharEm({
      tabela: 'cargos_empresa',
      op: 'select',
      mensagem: 'timeout',
    });
    await expect(populacaoAtendimento(ctx('rh'))).rejects.toMatchObject({
      status: 503,
    });
  });

  it('cargo grafado de outro jeito segue a regra do cargo, não a liberação padrão (19/09/2026)', async () => {
    const caio = colaboradores.find((p) => p.id === 'caio')!;
    caio.cargo = 'financeiro';
    try {
      expect((await populacaoAtendimento(ctx('rh'))).map((p) => p.id)).toEqual([
        'ana',
        'bia',
      ]);
    } finally {
      caio.cargo = 'Financeiro';
    }
  });
});

it('Sem nível inclui avaliações integralmente sem cobertura e exclui legado/não iniciados', () => {
  const pessoas = ['sem', 'com', 'legado', 'novo'].map((id) => ({
    id,
    nome: id,
    cargo: null,
  }));
  const antigo = sessao('legado', '2026-09-19', null);
  const r = visaoPorCompetencia(
    [
      sessao(
        'sem',
        '2026-09-19',
        Object.fromEntries(CODIGOS.map((c) => [c, null])),
      ),
      sessao('com', '2026-09-19', { acolhimento: 3 }),
      antigo,
    ],
    pessoas,
    CODIGOS,
  );
  expect(r.competencias.find((c) => c.codigo === 'acolhimento')).toMatchObject({
    niveis: [0, 0, 1, 0],
    semNivel: 1,
  });
  expect(r.competencias.find((c) => c.codigo === 'clareza')?.semNivel).toBe(2);
});
