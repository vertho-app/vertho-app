import { describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock, type SupabaseMock } from '../helpers/supabase-mock';

/**
 * Acompanhamento do Simulador de liderança (decisão do dono, 18/09/2026): RH e
 * gestor veem quem faz e os resultados, pela régua da jornada. Aqui se prova
 * quem vê quem e que o detalhe não carrega a conversa, a preparação nem a
 * reflexão da pessoa (só a devolutiva, com seus trechos de evidência).
 */
let sb: SupabaseMock;
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/permissions', () => ({ can: vi.fn(async () => true) }));
const modulo = { ligado: true };
vi.mock('@/lib/prontidao-lideranca/habilitado', () => ({
  prontidaoLiderancaHabilitada: vi.fn(async () => modulo.ligado),
}));

import {
  competenciasDaJornada,
  contextoEquipe,
  detalhePessoa,
  painelEquipe,
  revisarJornada,
} from '@/lib/simulador-lideranca/equipe';
import { referenciaEncontros } from '@/lib/simulador-lideranca/revisao-contexto';
import { can } from '@/lib/permissions';
import {
  gravarAvaliacao,
  linhasDoEncontro,
} from '@/lib/simulador-lideranca/avaliacao';
import {
  estado,
  episodio,
  avaliacao,
  FALA,
} from '../fixtures/simulador-lideranca';

const EMP = '10000000-0000-4000-8000-000000000001';
const colabs = [
  {
    id: 'ana',
    nome_completo: 'Ana',
    cargo: 'Analista',
    email: 'ana@x.test',
    role: 'colaborador',
    gestor_email: 'gestor@x.test',
  },
  {
    id: 'bia',
    nome_completo: 'Bia',
    cargo: 'Analista',
    email: 'bia@x.test',
    role: 'colaborador',
    gestor_email: 'outra@x.test',
  },
  {
    id: 'rh',
    nome_completo: 'RH',
    cargo: 'RH',
    email: 'rh@x.test',
    role: 'rh',
    gestor_email: null,
  },
];
const matriz = estado().matriz;
const concluido = {
  ...episodio(0),
  encerradoEm: '2026-09-18T12:00:00Z',
  reflexao: 'Minha reflexão particular sobre como conduzi a conversa.',
  avaliacao: gravarAvaliacao(
    avaliacao(),
    episodio(0),
    linhasDoEncontro(matriz, 0),
  ),
  consequencia: {
    narrativa: 'A equipe combinou revisar os pedidos.',
    acordos: [
      { descricao: 'Revisar os pedidos amanhã.', turno: 1, trecho: FALA },
    ],
    pendencias: [],
  },
};

let regras: Record<string, unknown> | undefined;
let semDevolutiva = false;
const revisoesGravadas = [
  {
    id: 'r1',
    parecer: 'discordo',
    motivo: 'A análise foi melhor do que a nota.',
    dimensoes: [],
    revisor_nome: 'Rute',
    created_at: '2026-09-18T15:00:00Z',
  },
];
function banco() {
  return criarSupabaseMock({
    resolver: (tabela, _cols, cadeia) => {
      if (tabela === 'empresas')
        return {
          id: EMP,
          nome: 'Fictícia',
          sys_config: {
            prontidao_lideranca: { cargo_alvo: 'Gerente' },
            ...(regras ? { simuladores_por_cargo: regras } : {}),
          },
        };
      if (tabela === 'sim_lideranca_jornadas') {
        const eq = (col: string) =>
          cadeia.find((c) => c.metodo === 'eq' && c.args[0] === col)?.args[1];
        return eq('colaborador_id') === 'ana' || eq('id') === 'j-ana'
          ? {
              id: 'j-ana',
              colaborador_id: 'ana',
              updated_at: '2026-09-18T12:00:00Z',
              estado: {
                ...estado(),
                concluidos: semDevolutiva ? [] : [concluido],
              },
            }
          : null;
      }
      if (tabela === 'platform_admins') return { id: 'adm-1' };
      return null;
    },
    lista: (tabela, cols) => {
      if (tabela === 'sim_lideranca_revisoes') return revisoesGravadas;
      if (tabela === 'colaboradores' && cols.includes('nome_completo'))
        return colabs;
      if (tabela === 'colaboradores')
        return colabs.map((c) => ({ id: c.id, gestor_email: c.gestor_email }));
      if (tabela === 'cargos_empresa')
        return [
          { id: 'c1', nome: 'Analista' },
          { id: 'c2', nome: 'Gerente' },
        ];
      if (tabela === 'sim_lideranca_jornadas')
        return [
          {
            id: 'j-ana',
            colaborador_id: 'ana',
            updated_at: '2026-09-18T12:00:00Z',
            concluidos: [concluido],
            ativoIndice: '1',
            cargoMatriz: 'Líder',
          },
        ];
      return [];
    },
  });
}
const auth = (role: string, email = 'gestor@x.test') =>
  ({
    role,
    email,
    isPlatformAdmin: false,
    empresaId: EMP,
    colaborador: { id: 'eu', empresa_id: EMP, email },
  }) as any;

describe('acompanhamento do simulador de liderança', () => {
  it('gestor vê só os liderados; RH vê a população do programa (sem o próprio RH)', async () => {
    sb = banco();
    const g = await painelEquipe(await contextoEquipe(auth('gestor')));
    expect(g.pessoas.map((p) => p.nome)).toEqual(['Ana']);
    expect(g.pessoas[0]).toMatchObject({
      encontrosConcluidos: 1,
      emAndamento: 1,
      variante: 'lider',
    });
    expect(g.pessoas[0].sintese?.encontrosConcluidos).toBe(1);
    const r = await painelEquipe(await contextoEquipe(auth('rh', 'rh@x.test')));
    expect(r.pessoas.map((p) => p.nome)).toEqual(['Ana', 'Bia']);
    expect(r).toMatchObject({ populacao: 2, iniciaram: 1, concluiram: 0 });
    // Todas as leituras de tenant vão escopadas pela empresa.
    expect(sb.usou('colaboradores', 'eq', 'empresa_id')).toBe(true);
    expect(sb.usou('sim_lideranca_jornadas', 'eq', 'empresa_id')).toBe(true);
  });

  it('quem não acompanha é recusado, e o módulo desligado também', async () => {
    sb = banco();
    await expect(contextoEquipe(auth('colaborador'))).rejects.toMatchObject({
      status: 403,
    });
    modulo.ligado = false;
    await expect(contextoEquipe(auth('rh', 'rh@x.test'))).rejects.toMatchObject(
      { status: 403 },
    );
    modulo.ligado = true;
  });

  it('o detalhe entrega a devolutiva, nunca a conversa, a preparação ou a reflexão', async () => {
    sb = banco();
    const d = await detalhePessoa(await contextoEquipe(auth('gestor')), 'ana');
    expect(d.encontros).toHaveLength(1);
    const e = d.encontros[0] as Record<string, unknown>;
    for (const campo of [
      'mensagens',
      'plano',
      'reflexao',
      'antecedentes',
      'contexto',
    ])
      expect(e).not.toHaveProperty(campo);
    expect(JSON.stringify(d)).not.toContain('Minha reflexão particular');
    expect(d.encontros[0].consequencia?.acordos).toEqual([
      'Revisar os pedidos amanhã.',
    ]);
    expect(d.matriz[0]).not.toHaveProperty('perguntas_alvo');
  });

  it('gestor não abre quem está fora da equipe dele', async () => {
    sb = banco();
    await expect(
      detalhePessoa(await contextoEquipe(auth('gestor')), 'bia'),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('falha de leitura vira erro, nunca "equipe vazia"', async () => {
    sb = banco();
    sb.falharEm({
      tabela: 'sim_lideranca_jornadas',
      op: 'select',
      mensagem: 'timeout no pool',
    });
    await expect(
      painelEquipe(await contextoEquipe(auth('rh', 'rh@x.test'))),
    ).rejects.toMatchObject({ status: 503 });
  });

  it('cargo grafado de outro jeito segue a regra do cargo na população (19/09/2026)', async () => {
    // Analista fora do simulador; Bia está cadastrada com o cargo em outra caixa e espaçamento.
    regras = { c1: { vendas: true, atendimento: true, lideranca: false } };
    const bia = colabs.find((p) => p.id === 'bia')!;
    bia.cargo = '  ANALISTA ';
    try {
      sb = banco();
      const r = await painelEquipe(
        await contextoEquipe(auth('rh', 'rh@x.test')),
      );
      expect(r.pessoas).toEqual([]);
      expect(r.populacao).toBe(0);
    } finally {
      bia.cargo = 'Analista';
      regras = undefined;
    }
  });
});

describe('revisão humana da liderança (18/09/2026, mig 264)', () => {
  const REQ = '30000000-0000-4000-8000-000000000001';
  const comando = (extra: Record<string, unknown> = {}) =>
    ({
      acao: 'revisar',
      requestId: REQ,
      alvoId: 'j-ana',
      referencia: referenciaEncontros([concluido]),
      parecer: 'discordo',
      motivo: 'A análise foi melhor do que a nota.',
      dimensoes: [],
      ...extra,
    }) as any;
  const gestor = () => {
    const a = auth('gestor');
    a.colaborador.nome_completo = 'Gil Gestor';
    return a;
  };

  it('o detalhe traz a jornada, as revisões, quem pode revisar e as competências da matriz', async () => {
    vi.mocked(can).mockResolvedValue(true);
    sb = banco();
    const d = await detalhePessoa(await contextoEquipe(gestor()), 'ana');
    expect(d).toMatchObject({
      jornadaId: 'j-ana',
      revisoes: revisoesGravadas,
      podeRevisar: true,
    });
    expect(d.competencias).toEqual(competenciasDaJornada(matriz));
    expect(d.competencias.length).toBeGreaterThan(0);
    expect(sb.usou('sim_lideranca_revisoes', 'eq', 'empresa_id')).toBe(true);
  });

  it('grava o parecer na jornada, com a chave e o nome de quem revisa', async () => {
    sb = banco();
    const foco = competenciasDaJornada(matriz)[0].codigo;
    expect(
      await revisarJornada(
        await contextoEquipe(gestor()),
        comando({ dimensoes: [foco] }),
      ),
    ).toEqual({ ok: true });
    const w = sb.escritas.find((e) => e.tabela === 'sim_lideranca_revisoes')!;
    expect(w.payload).toMatchObject({
      id: REQ,
      empresa_id: EMP,
      jornada_id: 'j-ana',
      revisor_key: 'colab:eu',
      revisor_nome: 'Gil Gestor',
      parecer: 'discordo',
      dimensoes: [foco],
    });
  });

  it('administrador da plataforma revisa com a chave do cadastro dele na plataforma', async () => {
    sb = banco();
    const admin = {
      ...auth('rh', 'suporte@vertho.ai'),
      isPlatformAdmin: true,
      colaborador: null,
    };
    expect(
      await revisarJornada(await contextoEquipe(admin, EMP), comando()),
    ).toEqual({ ok: true });
    expect(
      sb.escritas.find((e) => e.tabela === 'sim_lideranca_revisoes')!.payload,
    ).toMatchObject({
      revisor_key: 'admin:adm-1',
      revisor_nome: 'Administração Vertho',
    });
  });

  it('🔴 a própria pessoa não revisa a sua jornada', async () => {
    sb = banco();
    const ana = {
      ...auth('gestor', 'ana@x.test'),
      colaborador: { id: 'ana', empresa_id: EMP, email: 'ana@x.test' },
    };
    expect(
      (await detalhePessoa(await contextoEquipe(ana), 'ana')).podeRevisar,
    ).toBe(false);
    await expect(
      revisarJornada(await contextoEquipe(ana), comando()),
    ).rejects.toMatchObject({ status: 403 });
    expect(sb.escritas).toHaveLength(0);
  });

  it('jornada sem devolutiva ainda não recebe revisão', async () => {
    semDevolutiva = true;
    try {
      sb = banco();
      expect(
        (await detalhePessoa(await contextoEquipe(gestor()), 'ana'))
          .podeRevisar,
      ).toBe(false);
      await expect(
        revisarJornada(await contextoEquipe(gestor()), comando()),
      ).rejects.toMatchObject({ status: 409 });
      expect(sb.escritas).toHaveLength(0);
    } finally {
      semDevolutiva = false;
    }
  });

  it('fora da equipe, sem permissão de registro ou com competência de fora: nada grava', async () => {
    sb = banco();
    // Bia não é liderada deste gestor: a jornada dela não existe para ele.
    const outraEquipe = {
      ...gestor(),
      email: 'outro@x.test',
      colaborador: { id: 'eu', empresa_id: EMP, email: 'outro@x.test' },
    };
    await expect(
      revisarJornada(await contextoEquipe(outraEquipe), comando()),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      revisarJornada(
        await contextoEquipe(gestor()),
        comando({ dimensoes: ['NAO_EXISTE'] }),
      ),
    ).rejects.toMatchObject({ status: 400 });
    vi.mocked(can).mockImplementation(
      async (_a, p) => p !== 'assessments.answer',
    );
    try {
      await expect(
        revisarJornada(await contextoEquipe(gestor()), comando()),
      ).rejects.toMatchObject({ status: 403 });
    } finally {
      vi.mocked(can).mockImplementation(async () => true);
    }
    expect(sb.escritas).toHaveLength(0);
  });
});

it('recorte desatualizado é recusado antes de gravar; recorte atual guarda somente devolutivas públicas', async () => {
 vi.mocked(can).mockResolvedValue(true);sb=banco();
 const ctx=await contextoEquipe(auth('gestor'));
 const d=await detalhePessoa(ctx,'ana');
 const cmd={acao:'revisar' as const,requestId:'30000000-0000-4000-8000-000000000009',alvoId:'j-ana',parecer:'concordo' as const,motivo:'Conferi os exemplos.',dimensoes:[],referencia:'f'.repeat(64)};
 await expect(revisarJornada(ctx,cmd)).rejects.toMatchObject({status:409});expect(sb.escritas).toHaveLength(0);
 await revisarJornada(ctx,{...cmd,referencia:d.referencia!});
 const contexto=sb.escritas[0].payload.contexto;
 expect(contexto.referencia).toBe(d.referencia);expect(contexto.encontros[0].avaliacao).toEqual(concluido.avaliacao);
 expect(JSON.stringify(contexto)).not.toContain('Minha reflexão particular');expect(contexto.encontros[0]).not.toHaveProperty('mensagens');
});
