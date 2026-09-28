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

import { contextoEquipe, detalhePessoa, painelEquipe } from '@/lib/simulador-lideranca/equipe';
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
  PLANO,
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
/** Encontros concluídos a mais na jornada da Ana (só o teste da D1 usa). */
let extras: typeof concluido[] = [];
/** O que o banco devolveu para a consulta do painel. */
let lidoDoPainel: Record<string, unknown>[] = [];

/**
 * Avalia o `select` do PostgREST sobre uma linha: `alias:coluna->a->0->>b`.
 * `->>` devolve texto, `->` o JSON. Assim o mock entrega exatamente o que a
 * consulta pediria ao banco, e um `estado->concluidos` inteiro traz a conversa.
 */
function projetar(cols: string, linha: Record<string, any>) {
  const out: Record<string, unknown> = {};
  for (const campo of cols.split(',').map((c) => c.trim())) {
    const [alias, caminho] = campo.includes(':') ? campo.split(':') : [campo, campo];
    const partes = caminho.split(/->>?/);
    let v: any = linha[partes[0]];
    for (const p of partes.slice(1)) v = v == null ? undefined : v[/^\d+$/.test(p) ? Number(p) : p];
    const texto = /->>[^>]+$/.test(caminho);
    out[alias] = v === undefined ? null : texto && typeof v !== 'string' ? String(v) : v;
  }
  return out;
}
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
                concluidos: [concluido, ...extras],
              },
            }
          : null;
      }
      return null;
    },
    lista: (tabela, cols) => {
      if (tabela === 'colaboradores' && cols.includes('nome_completo'))
        return colabs;
      if (tabela === 'colaboradores')
        return colabs.map((c) => ({ id: c.id, gestor_email: c.gestor_email }));
      if (tabela === 'cargos_empresa')
        return [
          { id: 'c1', nome: 'Analista' },
          { id: 'c2', nome: 'Gerente' },
        ];
      if (tabela === 'sim_lideranca_jornadas') {
        // Responde à PERGUNTA feita: os caminhos JSON pedidos, e só eles.
        const linha = projetar(cols, {
          id: 'j-ana',
          colaborador_id: 'ana',
          updated_at: '2026-09-18T12:00:00Z',
          estado: { ...estado(), concluidos: [concluido], ativo: { ...episodio(1), plano: 'Plano particular do encontro em andamento.' } },
        });
        lidoDoPainel.push(linha);
        return [linha];
      }
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

  it('🔴 o painel não lê conversa, preparação nem reflexão do banco, só o que a síntese usa (27/09/2026)', async () => {
    sb = banco();
    lidoDoPainel = [];
    const r = await painelEquipe(await contextoEquipe(auth('rh', 'rh@x.test')));
    // A síntese continua saindo do mesmo encontro.
    expect(r.pessoas.find((p) => p.nome === 'Ana')).toMatchObject({ encontrosConcluidos: 1, emAndamento: 1 });
    expect(r.pessoas.find((p) => p.nome === 'Ana')?.sintese?.competencias.find((c) => c.avaliada)).toBeTruthy();
    const selects = sb.chamadas
      .filter((c) => c.tabela === 'sim_lideranca_jornadas' && c.metodo === 'select')
      .map((c) => String(c.args[0]));
    expect(selects.length).toBeGreaterThan(0);
    for (const s of selects) expect(s).not.toMatch(/mensagens|plano|reflexao|contexto/);
    // O que o banco devolveu: nada da conversa, da preparação ou da reflexão.
    const lido = JSON.stringify(lidoDoPainel);
    expect(lidoDoPainel.length).toBeGreaterThan(0);
    for (const privado of [
      'Minha reflexão particular',
      'Estou preocupada com os atrasos',
      'Posso trazer os pedidos para revisarmos juntos',
      'Plano particular do encontro em andamento',
    ])
      expect(lido).not.toContain(privado);
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

  it('🔴 D1 (27/09/2026): evidência da preparação e da reflexão chega à equipe SEM o texto; a da conversa segue citada', async () => {
    // Encontro 3: Autoconsciência é secundária, e a reflexão pode sustentá-la.
    const REFLEXAO_PRIVADA = 'Percebi que me irritei com a Camila e interrompi cedo demais.';
    const JUSTIFICATIVA_PRIVADA = 'Você reconheceu que se irritou com a Camila.';
    const linhas2 = linhasDoEncontro(matriz, 2);
    const a2 = avaliacao(2);
    const auto = a2.descritores.find((d) =>
      linhas2.find((l) => l.cod_desc === d.codigo)?.nome === 'Autoconsciência e Aprendizagem Contínua',
    )!;
    auto.nivel = 3;
    auto.justificativa = JUSTIFICATIVA_PRIVADA;
    auto.evidencias = [{ fonte: 'reflexao', turno: 0, trecho: REFLEXAO_PRIVADA }];
    const ep2 = { ...episodio(2), reflexao: REFLEXAO_PRIVADA };
    extras = [
      {
        ...ep2,
        id: '10000000-0000-4000-8000-000000000012',
        encerradoEm: '2026-09-19T12:00:00Z',
        avaliacao: gravarAvaliacao(a2, ep2, linhas2),
        consequencia: null as any,
      },
    ];
    try {
      sb = banco();
      const d = await detalhePessoa(await contextoEquipe(auth('gestor')), 'ana');
      expect(d.encontros).toHaveLength(2);
      const json = JSON.stringify(d);
      // Nem o texto literal nem a justificativa escrita a partir dele.
      for (const privado of [PLANO, REFLEXAO_PRIVADA, JUSTIFICATIVA_PRIVADA]) expect(json).not.toContain(privado);
      const evidencias = d.encontros.flatMap((e) => e.avaliacao!.descritores.flatMap((x) => x.evidencias));
      const reservadas = evidencias.filter((e) => e.fonte !== 'fala');
      // Fonte e nível continuam visíveis: a evidência existe, só o texto fica com a pessoa.
      expect(reservadas.map((e) => e.fonte).sort()).toEqual(['planejamento', 'planejamento', 'reflexao']);
      for (const e of reservadas) expect(e).not.toHaveProperty('trecho');
      const descritorReflexao = d.encontros[1].avaliacao!.descritores.find((x) => x.codigo === auto.codigo)!;
      expect(descritorReflexao).toMatchObject({ nivel: 3, justificativa: null });
      // A conversa segue citada, como antes.
      expect(evidencias.filter((e) => e.fonte === 'fala').map((e) => e.trecho)).toContain(FALA);
      // E a própria pessoa segue com tudo: a projeção não mexeu no estado gravado.
      expect(extras[0].avaliacao.descritores.find((x) => x.codigo === auto.codigo)!.evidencias[0].trecho).toBe(REFLEXAO_PRIVADA);
    } finally {
      extras = [];
    }
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

  it('falha ao ler a POPULAÇÃO (turma, colaboradores) é 503, nunca "ninguém na população" (27/09/2026)', async () => {
    sb = banco();
    const c = await contextoEquipe(auth('rh', 'rh@x.test'));
    sb.falharEm({ tabela: 'colaboradores', op: 'select', mensagem: 'timeout no pool' });
    await expect(painelEquipe(c)).rejects.toMatchObject({
      status: 503,
      message: 'Não foi possível consultar a população do programa.',
    });
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
