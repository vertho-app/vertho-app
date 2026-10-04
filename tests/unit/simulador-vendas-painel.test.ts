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
import { maskTextPII } from '@/lib/pii-masker';
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
    primeira: 'vendedor',
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
    primeira: 'vendedor',
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
    primeira: 'vendedor',
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
/** Linhas a mais por teste, na forma da projeção (`primeira` = autor da 1ª mensagem). */
let extras: Array<(typeof sessoes)[number] | Record<string, unknown>> = [];
const aberta = (id: string, colaborador_id: string, primeira: string | null) => ({
  id,
  colaborador_id,
  created_at: '2026-09-13T12:00:00Z',
  resumo: { status: 'em_andamento', versaoRegua: 'pace-7' },
  primeira,
  pl: null,
  p: null,
  a: null,
  c: null,
  e: null,
  feedback: null,
});

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
        return [...sessoes, ...extras].filter((s) =>
          ids.includes(String(s.colaborador_id)),
        );
      }
      return [];
    },
  });
}

describe('painelEquipe: população, escopo e leitura', () => {
  beforeEach(() => {
    extras = [];
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

  it('começar = conversar: sessão aberta sem mensagem não tira de "Não começaram" (04/10/2026)', async () => {
    // Bia abriu e saiu; Davi abriu outra e falou com o cliente.
    extras = [aberta('s4', 'bia', null), aberta('s5', 'davi', 'vendedor')];
    const painel = await painelEquipe(c('rh'));
    expect(painel.naoComecaram.map((p) => p.id)).toEqual(['bia']);
    expect(painel.resumo).toMatchObject({ comecaram: 2, naoComecaram: 1 });
    expect(painel.pessoas.find((p) => p.id === 'davi')).toMatchObject({
      treinos: 2,
      emAndamento: true,
    });
    // O alias da fixture é o que a consulta pede: só o autor, nunca a conversa.
    const colunas = String(
      sb.chamadas.find(
        (x) => x.tabela === 'sim_vendas_sessoes' && x.metodo === 'select',
      )?.args[0],
    );
    expect(colunas).toContain('primeira:estado->mensagens->0->>autor');
    expect(colunas).not.toMatch(/estado->mensagens(,|$)/);
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
    conversou: false,
    competencias: null,
    feedback: null,
    ...extra,
  });

  it('descartado sem conversa não conta como treino; em andamento com conversa conta e aparece', () => {
    const p = agregarPainel(pessoas, [
      s('a', '2026-09-01', 'abandonada'),
      s('b', '2026-09-02', 'em_andamento', { conversou: true }),
    ]);
    expect(p.naoComecaram.map((x) => x.id)).toEqual(['a', 'c']);
    expect(p.pessoas.find((x) => x.id === 'b')).toMatchObject({
      treinos: 1,
      concluidos: 0,
      emAndamento: true,
    });
  });

  it('começar = conversar com o cliente, a régua do atendimento (04/10/2026)', () => {
    const p = agregarPainel(pessoas, [
      // Abriu a tela: a sessão nasce em `preparando`, sem mensagem.
      s('a', '2026-09-01', 'preparando'),
      // Cenário pronto (e talvez o plano), mas nenhuma fala ao cliente.
      s('a', '2026-09-02', 'em_andamento'),
      // Conversou e o treino foi encerrado sem relatório: treinou.
      s('b', '2026-09-03', 'abandonada', { conversou: true }),
      // Concluído sempre teve conversa, mesmo se a projeção não vier.
      s('c', '2026-09-04', 'concluida'),
    ]);
    expect(p.naoComecaram.map((x) => x.id)).toEqual(['a']);
    expect(p.resumo).toEqual({ pessoas: 3, comecaram: 2, concluiram: 1, naoComecaram: 1 });
    expect(p.pessoas.find((x) => x.id === 'a')).toMatchObject({ treinos: 0, emAndamento: false, ultimo: null });
    expect(p.pessoas.find((x) => x.id === 'b')).toMatchObject({ treinos: 1, concluidos: 0, emAndamento: false });
  });

  it('V-10: treino aberto sem atividade há mais de 3 dias é "parado", com a data da última atividade', () => {
    const agora = Date.parse('2026-09-27T12:00:00Z');
    const p = agregarPainel(
      pessoas,
      [
        s('a', '2026-09-16T12:00:00Z', 'em_andamento', { atualizadoEm: '2026-09-20T12:00:00Z', conversou: true }),
        s('b', '2026-09-16T12:00:00Z', 'em_andamento', { atualizadoEm: '2026-09-27T09:00:00Z', conversou: true }),
        // Sem `atualizadoEm`, vale a criação.
        s('c', '2026-09-23T11:00:00Z', 'em_andamento', { conversou: true }),
      ],
      Math.random,
      agora,
    );
    const linha = (id: string) => p.pessoas.find((x) => x.id === id)!;
    expect(linha('a')).toMatchObject({ emAndamento: true, paradoDesde: '2026-09-20T12:00:00Z' });
    expect(linha('b')).toMatchObject({ emAndamento: true, paradoDesde: null });
    expect(linha('c')).toMatchObject({ emAndamento: true, paradoDesde: '2026-09-23T11:00:00Z' });
    // Concluído não é parado, por mais antigo que seja.
    const concluido = agregarPainel(pessoas, [s('a', '2026-01-01T00:00:00Z', 'concluida')], Math.random, agora);
    expect(concluido.pessoas.find((x) => x.id === 'a')!.paradoDesde).toBeNull();
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

  it('pesquisa: médias ignoram nota inválida; comentários só de texto, com teto', () => {
    const autores = ['a', 'b', 'c', 'd', 'e'];
    const muitas = Array.from({ length: MAX_COMENTARIOS + 5 }, (_, i) =>
      s(
        autores[i % autores.length],
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
    expect(p.pesquisa.respondentes).toBe(5);
    expect(p.pesquisa.medias.realismo).toBe(4);
    expect(p.pesquisa.comentarios).toHaveLength(MAX_COMENTARIOS);
    expect(Object.keys(p.pesquisa.comentarios[0])).toEqual(['texto']);
  });
});

/**
 * V-2 da revisão de 27/09/2026 (decisão D3 do dono). O comentário "sem nome"
 * saía com a data do treino, igual à coluna "Último treino" de quem escreveu:
 * o cenário abaixo é a sonda da revisão, em que o comentário apontava a Ana.
 */
describe('V-2: comentário da pesquisa sem identificação', () => {
  const equipe = ['ana', 'bruno', 'carla', 'davi', 'eva', 'fabio'].map((id) => ({
    id,
    nome: id[0].toUpperCase() + id.slice(1),
    cargo: 'Vendedor',
  }));
  const resposta = (
    colaboradorId: string,
    criadoEm: string,
    comentario: string,
  ): SessaoPainel => ({
    colaboradorId,
    criadoEm,
    status: 'concluida',
    conversou: true,
    competencias: null,
    feedback: { realismo: 3, desafio: 3, interacao: 3, utilidade: 3, aprendizado: 3, comentario },
  });
  const sonda = [
    resposta('ana', '2026-09-20T13:00:00Z', 'Achei inútil e o gestor me obrigou.'),
    resposta('bruno', '2026-09-22T13:00:00Z', ''),
  ];
  const cinco = [
    ...sonda,
    resposta('carla', '2026-09-23T13:00:00Z', 'Me liga no (11) 91234-5678 ou escreve para ana@cliente.test hoje'),
    resposta('davi', '2026-09-24T13:00:00Z', 'Gostei do cliente difícil.'),
    resposta('eva', '2026-09-25T13:00:00Z', 'Queria mais tempo.'),
  ];

  it('com menos de 5 respondentes os comentários ficam retidos', () => {
    const p = agregarPainel(equipe, sonda);
    expect(p.pesquisa).toMatchObject({ respostas: 2, respondentes: 2, comentarios: [], comentariosRetidos: true });
    // Duas respostas da mesma pessoa não viram dois respondentes.
    const repetida = agregarPainel(equipe, [...sonda, resposta('ana', '2026-09-26T13:00:00Z', 'De novo.'), ...cinco.slice(2, 4)]);
    expect(repetida.pesquisa).toMatchObject({ respondentes: 4, comentariosRetidos: true, comentarios: [] });
  });

  it('a partir de 5, nenhum campo do comentário casa com uma pessoa da tabela', () => {
    const p = agregarPainel(equipe, cinco);
    expect(p.pesquisa.comentariosRetidos).toBe(false);
    expect(p.pesquisa.comentarios.length).toBe(4);
    const valoresDasPessoas = new Set(
      p.pessoas.flatMap((x) => [x.id, x.nome, x.ultimo].filter(Boolean) as string[]),
    );
    for (const c of p.pesquisa.comentarios) {
      expect(Object.keys(c)).toEqual(['texto']);
      for (const v of Object.values(c)) expect(valoresDasPessoas.has(v)).toBe(false);
    }
  });

  it('dados pessoais saem mascarados', () => {
    const textos = agregarPainel(equipe, cinco).pesquisa.comentarios.map((c) => c.texto);
    expect(textos).toContain('Me liga no [telefone] ou escreve para [email] hoje');
    expect(textos.join(' ')).not.toMatch(/91234|ana@cliente/);
  });

  it('a ordem é sorteada, não a de chegada', () => {
    const recentes = [...cinco]
      .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))
      .map((r) => maskTextPII(r.feedback!.comentario as string))
      .filter(Boolean);
    // Sorteio que sempre cai no primeiro: a ordem de chegada vira uma rotação.
    const exibidos = agregarPainel(equipe, cinco, () => 0).pesquisa.comentarios.map((c) => c.texto);
    expect(exibidos).toEqual([...recentes.slice(1), recentes[0]]);
    expect(exibidos).not.toEqual(recentes);
  });
});

it('inclui quem concluiu sem cobertura em Sem nível, sem misturar não iniciados e legado', () => {
  const pessoas = ['sem', 'com', 'legado', 'novo'].map((id) => ({
    id,
    nome: id,
    cargo: null,
  }));
  const base = { criadoEm: '2026-09-19', status: 'concluida', conversou: true, feedback: null };
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
