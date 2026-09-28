import { beforeEach, describe, expect, test, vi } from 'vitest';
import { abrirSessao } from '@/lib/recepcao/core';
import { cenario as legado } from '@/lib/recepcao/cenario.mjs';
import { cenarioSchema } from '@/lib/recepcao/schema';
import { bancoEmMemoria, type BancoEmMemoria } from '../helpers/tabelas-em-memoria';
const cenario = cenarioSchema.parse(legado);

// Banco: o mock OFICIAL (`criarSupabaseMock`) com tabelas em memória por cima. O mock à
// mão que existia aqui tinha `limit: () => q`, que ignorava o argumento: "o histórico lê
// só 20 sessões" e a janela da sugestão de degrau não eram observáveis (27/09/2026).
const mock = vi.hoisted(() => ({ gerar: vi.fn(), auth: null as any, sb: null as any, permitido: true }));
vi.mock('@/lib/recepcao/ai', () => ({ geradorRecepcao: () => ({ gerar: mock.gerar, chamadas: [], validar: async () => {} }), textoParaTreino: (s: string) => s }));
vi.mock('@/lib/auth/request-context', () => ({ requireUser: async () => mock.auth }));
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => mock.sb }));
vi.mock('@/lib/permissions', () => ({ can: async () => mock.permitido }));
vi.mock('@/lib/recepcao/cenarios', () => ({ catalogo: async()=>[], cenarioPublicado: async(_c: unknown, id?: string)=>({id: id || 'cenario',conteudo:cenario}) }));
import { executar, consultar, consultarHistorico } from '@/lib/recepcao/service';
import { empresaDaSessao, contextoRecepcao } from '@/lib/recepcao/access';

const EMPRESA = '10000000-0000-4000-8000-000000000001';
const OUTRA = '10000000-0000-4000-8000-000000000002';
const ID = '20000000-0000-4000-8000-000000000001';
const REQUEST = '30000000-0000-4000-8000-000000000001';
let rows: any[], ctx: any, banco: BancoEmMemoria, relogio = 0;

/** Tabelas em memória + as duas RPCs de lease, com a regra das migrations 240/241. */
function novoBanco(config: any = { empresa_id: EMPRESA, habilitado: true }) {
  const b = bancoEmMemoria(
    { empresas: [{ id: EMPRESA, nome: 'Fictícia' }], recepcao_config: [config], recepcao_sessoes: rows },
    { recepcao_sessoes: () => ({ revisao: 0, lock_token: null, lock_until: null, created_at: new Date(Date.UTC(2026, 8, 20) + ++relogio * 1000).toISOString() }) },
  );
  // A tabela tem PK em `id`: insert repetido é 23505 (o serviço trata como "já criei").
  b.falharEm({ tabela: 'recepcao_sessoes', op: 'insert', mensagem: 'duplicate key', code: '23505', quando: (p) => b.tabelas.recepcao_sessoes.some((r) => r.id === p.id) });
  b.client.rpc = async (name: string, p: any) => {
    const row = b.tabelas.recepcao_sessoes.find(r => r.id === p.p_id && r.empresa_id === p.p_empresa && r.owner_key === p.p_owner && r.revisao === p.p_revisao);
    if (!row) return { data: false, error: null };
    if (name === 'recepcao_claim_v2') {
      if (row.lock_token) return { data: false, error: null };
      row.lock_token = p.p_token; return { data: true, error: null };
    }
    if (row.lock_token !== p.p_token) return { data: false, error: null };
    row.estado = structuredClone(p.p_estado); row.revisao++; row.lock_token = null;
    return { data: true, error: null };
  };
  return b;
}
beforeEach(() => {
  relogio = 0;
  const estado = abrirSessao(cenario); estado.id = ID;
  rows = [{ id: ID, empresa_id: EMPRESA, owner_email: 'pessoa@example.test', owner_key:'colab:colab', estado, revisao: 0, lock_token: null, created_at: '2026-09-05' }];
  banco = novoBanco(); mock.sb = banco.client; mock.permitido = true;
  mock.auth = { email: 'pessoa@example.test', empresaId: EMPRESA, isPlatformAdmin: false, role: 'colaborador', colaborador: { id: 'colab', empresa_id: EMPRESA } };
  ctx = { auth: mock.auth, empresaId: EMPRESA, owner: mock.auth.email, ownerKey:'colab:colab', empresaNome: 'Fictícia', habilitado: true, sb: mock.sb, dominio: 'recepcao_medica' };
  mock.gerar.mockReset().mockResolvedValue(JSON.stringify({ fala: 'Prefiro a Dra. Helena.' }));
});
const comando = () => ({ acao: 'responder' as const, sessaoId: ID, requestId: REQUEST, revisao: 0, mensagem: 'Qual horário funciona?' });
const sessoes = () => banco.tabelas.recepcao_sessoes;

test('tenant vem da sessão; colaborador não pode trocar a empresa', () => {
  expect(empresaDaSessao(mock.auth)).toBe(EMPRESA);
  expect(() => empresaDaSessao(mock.auth, OUTRA)).toThrow('não autorizada');
  expect(() => empresaDaSessao({ ...mock.auth, colaborador: null })).toThrow('cadastro');
});
test('contexto preserva 401 e aplica permissão para mutações', async () => {
  mock.auth = new Response(null, { status: 401 });
  expect((await contextoRecepcao(new Request('http://local'))) as Response).toHaveProperty('status', 401);
  mock.auth = ctx.auth; mock.permitido = false;
  await expect(contextoRecepcao(new Request('http://local'), undefined, true)).rejects.toThrow('perfil');
});
test('flag fechada bloqueia colaborador inclusive por API', async () => {
  mock.sb = novoBanco({ empresa_id: EMPRESA, habilitado: false }).client;
  await expect(contextoRecepcao(new Request('http://local'))).rejects.toThrow('não está habilitado');
});
test('sessões de outra empresa ou outro proprietário não podem ser lidas nem alteradas', async () => {
  for (const change of [{ empresaId: OUTRA }, { ownerKey: 'colab:outro' }]) {
    const outro = { ...ctx, ...change };
    await expect(consultar(outro, ID)).rejects.toThrow('não encontrado');
    await expect(executar(outro, comando())).rejects.toThrow('não encontrado');
  }
  expect(mock.gerar).not.toHaveBeenCalled();
});
test('retry do mesmo turno com revisão antiga devolve resultado salvo, sem cobrar outra chamada', async () => {
  const a = await executar(ctx, comando());
  const b = await executar(ctx, comando());
  expect(b).toEqual(a); expect(mock.gerar).toHaveBeenCalledTimes(1);
  expect(sessoes()[0].estado.historico).toHaveLength(3);
});
test('criação é idempotente e fica vinculada à identidade do servidor', async () => {
  const cmd = { acao: 'iniciar' as const, requestId: REQUEST };
  await executar(ctx, cmd); await executar(ctx, cmd);
  expect(sessoes().filter(r => r.id === REQUEST)).toHaveLength(1);
  const criada = sessoes().find(r => r.id === REQUEST)!;
  expect(criada.owner_email).toBe(ctx.owner);
  expect(criada.empresa_id).toBe(EMPRESA);
});
test('falha de IA preserva estado e libera lease', async () => {
  mock.gerar.mockRejectedValue(new Error('provedor indisponível'));
  await expect(executar(ctx, comando())).rejects.toThrow('preservado');
  expect(sessoes()[0].revisao).toBe(0); expect(sessoes()[0].estado.historico).toHaveLength(1);
  expect(sessoes()[0].lock_token).toBeNull();
});

test('falha do relatório preserva conversa e informa a operação correta', async () => {
  await executar(ctx, comando());
  const antes = structuredClone(sessoes()[0].estado);
  mock.gerar.mockRejectedValue(new Error('provedor indisponível: conteúdo privado'));
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    await expect(executar(ctx, { acao: 'encerrar', sessaoId: ID, revisao: 1 })).rejects.toThrow('validar o relatório');
    expect(sessoes()[0].estado).toEqual(antes);
    expect(sessoes()[0].revisao).toBe(1);
    expect(sessoes()[0].lock_token).toBeNull();
    expect(JSON.stringify(log.mock.calls)).not.toContain('conteúdo privado');
    expect(log).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ sessaoId: ID, acao: 'encerrar' }));
  } finally { log.mockRestore(); }
});
test('concorrência na mesma revisão permite só um gerador', async () => {
  let release: (s: string) => void;
  mock.gerar.mockImplementation(() => new Promise<string>(resolve => { release = resolve; }));
  const primeiro = executar(ctx, comando());
  await vi.waitFor(() => expect(mock.gerar).toHaveBeenCalledTimes(1));
  await expect(executar(ctx, { ...comando(), requestId: ID })).rejects.toThrow('processamento');
  release!(JSON.stringify({ fala: 'Obrigada.' })); await primeiro;
  expect(sessoes()[0].revisao).toBe(1);
});
test('revisão stale sem recibo não sobrescreve conversa', async () => {
  sessoes()[0].revisao = 3;
  await expect(executar(ctx, comando())).rejects.toThrow('outra aba');
  expect(mock.gerar).not.toHaveBeenCalled();
});

test('gestor e RH só acompanham: a leitura avisa a tela para abrir na equipe (17/09/2026)', async () => {
  const gestor = { ...ctx, auth: { ...mock.auth, role: 'gestor' }, soAcompanha: true };
  expect(await consultar(gestor)).toMatchObject({ soAcompanha: true, podeEquipe: true });
  expect(await consultar({ ...ctx, soAcompanha: false })).toMatchObject({ soAcompanha: false });
});

/** Sessão fictícia no banco, com data e estado controlados. */
function linha(id: string, data: string, ajustar: (e: any) => void = () => {}) {
  const estado: any = abrirSessao(cenario, 0);
  estado.id = id;
  ajustar(estado);
  return { id, empresa_id: EMPRESA, owner_key: 'colab:colab', owner_email: 'pessoa@example.test', estado, revisao: 0, lock_token: null, created_at: data };
}
const concluido = (nivel: string, nota: number, competencias?: Record<string, number | null>) => (e: any) => {
  e.status = 'concluida';
  e.respostas = 2;
  e.cenario.publico.nivel = nivel;
  e.relatorio = { escalaNota: '1-4', nota, competencias: competencias && Object.entries(competencias).map(([codigo, n]) => ({ codigo, nota: n })) };
};
const dia = (n: number) => `2026-09-${String(n).padStart(2, '0')}T12:00:00.000Z`;

test('quem treina vê a evolução por competência, só com avanço, a partir de dois treinos com matriz (18/09/2026)', async () => {
  // Um treino só: ainda sem evolução.
  rows = [linha('s1', dia(10), concluido('introducao', 2.4, { acolhimento: 2.4 }))];
  banco = novoBanco();
  expect((await consultar({ ...ctx, sb: banco.client })).evolucao).toBeNull();
  // Dois treinos: o melhor nível vale, e uma queda depois não aparece.
  rows = [
    linha('s2', dia(15), concluido('introducao', 2.5, { acolhimento: 3.1, clareza: 2.0 })),
    linha('s1', dia(10), concluido('introducao', 2.8, { acolhimento: 2.4, clareza: 3.2 })),
  ];
  banco = novoBanco();
  const { evolucao } = await consultar({ ...ctx, sb: banco.client });
  expect(evolucao.competencias.find((c: any) => c.codigo === 'acolhimento')).toMatchObject({ nivelAlcancado: 3, subiu: true });
  expect(evolucao.competencias.find((c: any) => c.codigo === 'clareza')).toMatchObject({ nivelAlcancado: 3, subiu: false });
  expect(evolucao.nomes.acolhimento).toBeTruthy();
});

describe('A-5: histórico paginado e sessões abandonadas (27/09/2026)', () => {
  /**
   * 22 sessões: as 20 recentes são Introduções com nota baixa; a 21ª é um Limite
   * concluído com nota alta (a linha a mais que a leitura traz para saber se há outra
   * página, e que NÃO pode entrar na sugestão); a 22ª, a mais antiga, é um atendimento
   * aberto com resposta.
   */
  function vinteEUma() {
    rows = [
      linha('limite-antigo', dia(1), concluido('limite', 3.6)),
      ...Array.from({ length: 20 }, (_, i) => linha(`recente-${i}`, dia(2 + i), concluido('introducao', 2.0))),
      linha('antiga-aberta', '2026-08-30T12:00:00.000Z', (e) => { e.respostas = 2; e.cenario.publico.nivel = 'limite'; }),
    ];
    banco = novoBanco();
    return { ...ctx, sb: banco.client };
  }

  test('a primeira página tem 20 itens e avisa que há mais; a segunda traz os antigos', async () => {
    const c = vinteEUma();
    const d = await consultar(c);
    expect(d.historico).toHaveLength(20);
    expect(d.historico[0].id).toBe('recente-19');
    expect(d.historicoTemMais).toBe(true);
    const p1 = await consultarHistorico(c, 1);
    expect(p1.historico.map((h: any) => h.id)).toEqual(['limite-antigo', 'antiga-aberta']);
    expect(p1.temMais).toBe(false);
  });

  test('atendimento aberto com resposta é sempre localizável para retomar, mesmo fora da página', async () => {
    const d = await consultar(vinteEUma());
    expect(d.historico.map((h: any) => h.id)).not.toContain('antiga-aberta');
    expect(d.abertos.map((h: any) => h.id)).toEqual(['antiga-aberta']);
  });

  test('a sugestão de degrau continua usando só os 20 treinos mais recentes', async () => {
    // O Limite com 3,6 está fora da janela: a sugestão não sobe para o Limite por causa dele.
    expect((await consultar(vinteEUma())).nivelSugerido).toBe('introducao');
  });

  test('iniciar outro atendimento descarta a sessão aberta SEM resposta; a com resposta fica', async () => {
    rows = [
      linha('vazia', dia(20)),
      linha('com-resposta', dia(19), (e) => { e.respostas = 1; }),
      { ...linha('vazia-em-uso', dia(18)), lock_token: 'outro-processo', lock_until: '2999-01-01T00:00:00Z' },
    ];
    banco = novoBanco();
    const c = { ...ctx, sb: banco.client };
    const NOVA = '30000000-0000-4000-8000-000000000099';
    await executar(c, { acao: 'iniciar', requestId: NOVA });
    const status = Object.fromEntries(banco.tabelas.recepcao_sessoes.map((r) => [r.id, r.estado.status]));
    expect(status).toEqual({ vazia: 'descartada', 'com-resposta': 'em_andamento', 'vazia-em-uso': 'em_andamento', [NOVA]: 'em_andamento' });
    const vazia = banco.tabelas.recepcao_sessoes.find((r) => r.id === 'vazia')!;
    expect(vazia.revisao).toBe(1);
    expect(vazia.estado).toMatchObject({ revisao: 1, motivoFim: 'descartada_sem_resposta' });
    // Descartada some da tela de quem treina (histórico e abertos).
    const d = await consultar(c);
    expect(d.historico.map((h: any) => h.id)).not.toContain('vazia');
    expect(d.abertos.map((h: any) => h.id)).toEqual(['com-resposta']);
  });

  test('falha ao descartar não impede o início', async () => {
    rows = [linha('vazia', dia(20))];
    banco = novoBanco();
    banco.falharEm({ tabela: 'recepcao_sessoes', op: 'update', mensagem: 'timeout' });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const r = await executar({ ...ctx, sb: banco.client }, { acao: 'iniciar', requestId: REQUEST });
      expect(r.sessao.id).toBe(REQUEST);
      expect(banco.tabelas.recepcao_sessoes.find((x) => x.id === 'vazia')!.estado.status).toBe('em_andamento');
    } finally { log.mockRestore(); }
  });
});
