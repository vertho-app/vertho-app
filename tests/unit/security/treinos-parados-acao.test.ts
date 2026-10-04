import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bancoEmMemoria, type BancoEmMemoria } from '../../helpers/tabelas-em-memoria';
import { estado as estadoVendasBase } from '../../fixtures/simulador-vendas';
import { abrirSessao } from '@/lib/recepcao/core';
import { cenario as legado } from '@/lib/recepcao/cenario.mjs';
import { cenarioSchema } from '@/lib/recepcao/schema';
import { BASE_ROLE_PERMISSIONS, PERMISSIONS, hasBasePermission, type SystemRole } from '@/lib/permissions';

/**
 * R-96 (04/10/2026): a ação "Encerrar sem devolutiva" é operação da Vertho sobre
 * o dado de um cliente. Os gates aqui são os REAIS (`requireAdminAction`,
 * `requirePlataformaSupabase`, `can` com `BASE_ROLE_PERMISSIONS`); só a sessão e
 * o contexto são simulados, e `permission_overrides` volta vazio: o teste mede o
 * CÓDIGO. O banco é em memória, com o `tenantDb` e o `logAdminAction` reais.
 *
 * O que se prova:
 *  · só platform admin COM `simulador.sessoes.manage` encerra: RH (da empresa dona
 *    da sessão e de outra), gestor, colaborador e Sócio recebem FORBIDDEN e NADA é
 *    lido da sessão nem escrito, nem a auditoria;
 *  · motivo vazio recusa, sem tocar a sessão, e a RECUSA fica na auditoria;
 *  · a empresa e a sessão do pedido são confrontadas: sessão de outra empresa não
 *    é encontrada, e a linha de auditoria não leva um `empresa_id` forjado;
 *  · o encerramento grava quem, quando, qual sessão, qual empresa e o motivo;
 *  · nenhuma chamada de IA em nenhum ramo.
 */
const estado = vi.hoisted(() => ({ ctx: null as any, sb: null as any, callAI: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => estado.sb.client }));
vi.mock('@/lib/auth/supabase-server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { email: estado.ctx?.email } }, error: null }) },
  }),
}));
vi.mock('@/lib/authz', () => ({
  getUserContext: async () => estado.ctx,
  isPlatformAdmin: async () => !!estado.ctx?.isPlatformAdmin,
}));
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': '200.1.2.3', 'user-agent': 'vitest' }),
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock('@/actions/ai-client', () => ({ callAI: estado.callAI, callAIChat: estado.callAI }));

import { carregarTreinosParados, encerrarTreinoSemDevolutiva } from '@/app/admin/treinos-parados/actions';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const E1 = id(1);
const E2 = id(2);
const C1 = id(11);
const AGORA = Date.parse('2026-10-04T15:00:00.000Z');
const ha = (horas: number) => new Date(AGORA - horas * 3_600_000).toISOString();
const VENDAS = id(101);
const ATENDIMENTO = id(201);
const FORBIDDEN = /FORBIDDEN/;
const ACAO = 'simulador.sessao.encerrar_sem_devolutiva';

const contextos = {
  master: { email: 'master@vertho.ai', colaborador: null, role: 'colaborador', empresaId: null, isPlatformAdmin: true, platformAdminRole: 'master' },
  socio: { email: 'socio@vertho.ai', colaborador: null, role: 'colaborador', empresaId: null, isPlatformAdmin: true, platformAdminRole: 'socio' },
  rhDaEmpresa: { email: 'rh@alfa.com', colaborador: { id: 'rh1', empresa_id: E1 }, role: 'rh', empresaId: E1, isPlatformAdmin: false, platformAdminRole: null },
  rhDeOutra: { email: 'rh@beta.com', colaborador: { id: 'rh2', empresa_id: E2 }, role: 'rh', empresaId: E2, isPlatformAdmin: false, platformAdminRole: null },
  gestor: { email: 'gestor@alfa.com', colaborador: { id: 'g1', empresa_id: E1 }, role: 'gestor', empresaId: E1, isPlatformAdmin: false, platformAdminRole: null },
  colaborador: { email: 'ana@alfa.com', colaborador: { id: C1, empresa_id: E1 }, role: 'colaborador', empresaId: E1, isPlatformAdmin: false, platformAdminRole: null },
};

function sessaoDeVendas() {
  const e: any = estadoVendasBase();
  e.id = VENDAS;
  e.revisao = 3;
  e.mensagens = [
    { id: 'r1:v', turno: 1, autor: 'vendedor', texto: 'Bom dia, Beatriz.', fase: 'preparar' },
    { id: 'r1:c', turno: 1, autor: 'cliente', texto: 'Bom dia.', fase: 'analisar' },
  ];
  return {
    id: VENDAS, empresa_id: E1, owner_key: `colab:${C1}`, colaborador_id: C1, estado: e, revisao: 3,
    lock_token: null, lock_until: null, created_at: ha(200), updated_at: ha(72),
    resumo: { status: e.status, nomeVendedor: 'Ana Souza' },
  };
}
function sessaoDeAtendimento() {
  const e: any = abrirSessao(cenarioSchema.parse(legado), 0);
  e.id = ATENDIMENTO;
  e.revisao = 2;
  e.historico.push({ id: 'm1', role: 'user', content: 'oi' }, { id: 'm2', role: 'assistant', content: 'olá' });
  e.respostas = 1;
  return {
    id: ATENDIMENTO, empresa_id: E2, owner_key: `colab:${id(12)}`, owner_email: 'b@x.test', colaborador_id: id(12), estado: e,
    revisao: 2, lock_token: null, lock_until: null, created_at: ha(200), updated_at: ha(60),
  };
}

let banco: BancoEmMemoria;
const vendas = () => banco.tabelas.sim_vendas_sessoes[0];
const auditoria = () => banco.tabelas.admin_audit_log;
const escritasFora = () => banco.escritas.filter((e) => e.tabela !== 'admin_audit_log');

function montar() {
  banco = bancoEmMemoria({
    empresas: [{ id: E1, nome: 'Alfa Comercial' }, { id: E2, nome: 'Beta Clínicas' }],
    colaboradores: [
      { id: C1, empresa_id: E1, nome_completo: 'Ana Souza' },
      { id: id(12), empresa_id: E2, nome_completo: 'Bruno Lima' },
    ],
    sim_vendas_sessoes: [sessaoDeVendas()],
    sim_vendas_tentativas: [],
    recepcao_sessoes: [sessaoDeAtendimento()],
    recepcao_tentativas: [],
    permission_overrides: [],
    admin_audit_log: [],
  });
  banco.client.rpc = vi.fn(async (nome: string, p: any) => {
    const tabela = nome.startsWith('sim_vendas') ? 'sim_vendas_sessoes' : 'recepcao_sessoes';
    const row = banco.tabelas[tabela].find((r) => r.id === p.p_id && r.empresa_id === p.p_empresa && r.owner_key === p.p_owner && r.revisao === p.p_revisao);
    if (nome.endsWith('claim') || nome === 'recepcao_claim_v2') {
      if (!row) return { data: false, error: null };
      row.lock_token = p.p_token;
      row.lock_until = new Date(Date.now() + 330_000).toISOString();
      return { data: true, error: null };
    }
    if (!row || row.lock_token !== p.p_token) return { data: false, error: null };
    row.estado = structuredClone(p.p_estado);
    row.revisao += 1;
    row.lock_token = null;
    row.lock_until = null;
    return { data: true, error: null };
  });
  estado.sb = banco;
}

const pedido = (extra: Record<string, unknown> = {}) => ({
  simulador: 'vendas', empresaId: E1, sessaoId: VENDAS, motivo: 'A avaliação falhou três vezes e a pessoa pediu ajuda.', ...extra,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(AGORA);
  estado.callAI.mockReset();
  estado.ctx = contextos.master;
  montar();
});
afterEach(() => vi.useRealTimers());

describe('a chave simulador.sessoes.manage', () => {
  it('existe, é de risco médio, e só o master a tem no papel base', () => {
    const def = PERMISSIONS.find((p) => p.key === 'simulador.sessoes.manage');
    expect(def).toMatchObject({ risk: 'medium', domain: 'Simuladores' });
    expect(hasBasePermission('platform_admin', 'simulador.sessoes.manage')).toBe(true);
    // O Sócio lê, não opera; o RH, o gestor e o colaborador não chegam à plataforma.
    for (const papel of ['socio', 'rh', 'gestor', 'colaborador'] as SystemRole[])
      expect(hasBasePermission(papel, 'simulador.sessoes.manage'), papel).toBe(false);
    // Nenhum papel base além do master a lista (a lista é a fonte; ver "cobertura se lê no arquivo").
    const comAChave = (Object.keys(BASE_ROLE_PERMISSIONS) as SystemRole[]).filter((r) => (BASE_ROLE_PERMISSIONS[r] as string[]).includes('simulador.sessoes.manage'));
    expect(comAChave).toEqual(['platform_admin']);
  });
});

describe('quem pode encerrar', () => {
  it.each(['socio', 'rhDaEmpresa', 'rhDeOutra', 'gestor', 'colaborador'] as const)(
    '🔴 %s recebe FORBIDDEN e nada é lido, escrito nem auditado',
    async (quem) => {
      estado.ctx = contextos[quem];
      await expect(encerrarTreinoSemDevolutiva(pedido())).rejects.toThrow(FORBIDDEN);
      await expect(encerrarTreinoSemDevolutiva(pedido({ simulador: 'atendimento', empresaId: E2, sessaoId: ATENDIMENTO }))).rejects.toThrow(FORBIDDEN);
      expect(banco.escritas).toHaveLength(0);
      expect(banco.client.rpc).not.toHaveBeenCalled();
      // A única leitura permitida é a do próprio gate (overrides de permissão).
      expect(banco.chamadas.filter((c) => c.tabela !== 'permission_overrides')).toHaveLength(0);
      expect(vendas().estado.status).toBe('em_andamento');
      expect(estado.callAI).not.toHaveBeenCalled();
    },
  );

  it('sem sessão autenticada: não passa do gate', async () => {
    estado.ctx = null;
    await expect(encerrarTreinoSemDevolutiva(pedido())).rejects.toThrow(/UNAUTHORIZED/);
    expect(banco.escritas).toHaveLength(0);
  });

  it('master encerra (controle positivo)', async () => {
    const r = await encerrarTreinoSemDevolutiva(pedido());
    expect(r).toMatchObject({ success: true, statusNovo: 'abandonada', temConversa: true, auditoria: true });
    expect(vendas().estado.status).toBe('abandonada');
  });

  it('a permissão é decidida pelo `can`: sem ela, até um platform admin é recusado', async () => {
    // Um override de `deny` no papel master (a mesma tabela que o app lê) tira a chave.
    banco.tabelas.permission_overrides.push({ scope_type: 'role', scope_key: 'role:platform_admin', permission_key: 'simulador.sessoes.manage', effect: 'deny' });
    await expect(encerrarTreinoSemDevolutiva(pedido())).rejects.toThrow(FORBIDDEN);
    expect(escritasFora()).toHaveLength(0);
    expect(banco.client.rpc).not.toHaveBeenCalled();
  });
});

describe('quem pode ler a lista', () => {
  it('o Sócio lê (e o servidor não lhe dá o botão: ver o teste acima)', async () => {
    estado.ctx = contextos.socio;
    const r = await carregarTreinosParados();
    expect(r.success).toBe(true);
    if (r.success) expect(r.itens.map((i) => i.sessaoId).sort()).toEqual([VENDAS, ATENDIMENTO].sort());
  });

  it('master lê, e o filtro por empresa vale', async () => {
    const r = await carregarTreinosParados(E2);
    expect(r.success && r.itens.map((i) => i.simulador)).toEqual(['atendimento']);
  });

  it.each(['rhDaEmpresa', 'rhDeOutra', 'gestor', 'colaborador'] as const)('🔴 %s não lê a lista de outras empresas', async (quem) => {
    estado.ctx = contextos[quem];
    await expect(carregarTreinosParados()).rejects.toThrow(FORBIDDEN);
    expect(banco.chamadas.filter((c) => c.tabela !== 'permission_overrides')).toHaveLength(0);
  });

  it('empresa que não é UUID: recusa sem ler', async () => {
    const r = await carregarTreinosParados('nao-e-uuid');
    expect(r).toMatchObject({ success: false });
    expect(banco.chamadas.filter((c) => c.tabela === 'sim_vendas_sessoes')).toHaveLength(0);
  });

  it('falha de leitura volta como ERRO, não como lista vazia', async () => {
    banco.falharEm({ tabela: 'sim_vendas_sessoes', op: 'select', mensagem: 'timeout' });
    const r = await carregarTreinosParados();
    expect(r).toMatchObject({ success: false });
    expect((r as any).itens).toBeUndefined();
  });
});

describe('motivo obrigatório', () => {
  it.each([
    ['vazio', ''],
    ['só espaços', '          '],
    ['curto demais', 'falhou'],
    ['ausente', undefined],
    ['não é texto', 12345678901],
  ])('🔴 %s: recusa, não toca a sessão e a RECUSA fica na auditoria', async (_nome, motivo) => {
    const r = await encerrarTreinoSemDevolutiva(pedido({ motivo }) as any);
    expect(r).toMatchObject({ success: false, codigo: 'motivo_obrigatorio' });
    expect(escritasFora()).toHaveLength(0);
    expect(banco.client.rpc).not.toHaveBeenCalled();
    expect(vendas().estado.status).toBe('em_andamento');
    expect(auditoria()).toHaveLength(1);
    expect(auditoria()[0]).toMatchObject({
      admin_email: 'master@vertho.ai',
      acao: ACAO,
      resultado: 'erro',
      alvo: `vendas:${VENDAS}`,
      empresa_id: null,
    });
    expect(auditoria()[0].detalhes).toMatchObject({ recusa: 'motivo_obrigatorio', sessao_id_pedida: VENDAS, empresa_id_pedida: E1, simulador: 'vendas' });
    expect(estado.callAI).not.toHaveBeenCalled();
  });

  it('motivo gigante também recusa (teto de 500)', async () => {
    const r = await encerrarTreinoSemDevolutiva(pedido({ motivo: 'x'.repeat(501) }) as any);
    expect(r).toMatchObject({ success: false, codigo: 'motivo_obrigatorio' });
    expect(escritasFora()).toHaveLength(0);
  });
});

describe('o pedido é confrontado, nunca confiado', () => {
  it('🔴 sessão de OUTRA empresa: não encontrada, nada escrito, e o empresa_id forjado NÃO vai à coluna da auditoria', async () => {
    const r = await encerrarTreinoSemDevolutiva(pedido({ empresaId: E2 }));
    expect(r).toMatchObject({ success: false, codigo: 'nao_encontrada' });
    expect(escritasFora()).toHaveLength(0);
    expect(banco.client.rpc).not.toHaveBeenCalled();
    expect(vendas().estado.status).toBe('em_andamento');
    expect(auditoria()).toHaveLength(1);
    expect(auditoria()[0]).toMatchObject({ resultado: 'erro', empresa_id: null });
    expect(auditoria()[0].detalhes).toMatchObject({ recusa: 'nao_encontrada', empresa_id_pedida: E2, sessao_id_pedida: VENDAS });
  });

  it('atendimento com a empresa de vendas: também não encontrada', async () => {
    const r = await encerrarTreinoSemDevolutiva(pedido({ simulador: 'atendimento', empresaId: E1, sessaoId: ATENDIMENTO }));
    expect(r).toMatchObject({ success: false, codigo: 'nao_encontrada' });
    expect(escritasFora()).toHaveLength(0);
  });

  it('o simulador é uma lista fechada, e o id tem de ser UUID', async () => {
    for (const ruim of [{ simulador: 'lideranca' }, { simulador: 'recepcao_sessoes' }, { sessaoId: 'x; drop table' }, { empresaId: 'e1' }, { extra: 1 }]) {
      const r = await encerrarTreinoSemDevolutiva(pedido(ruim));
      expect(r).toMatchObject({ success: false, codigo: 'entrada_invalida' });
    }
    expect(escritasFora()).toHaveLength(0);
    expect(banco.client.rpc).not.toHaveBeenCalled();
    expect(auditoria()).toHaveLength(5);
  });

  it('treino com atividade recente: recusa e audita', async () => {
    banco.tabelas.sim_vendas_sessoes[0].updated_at = ha(3);
    const r = await encerrarTreinoSemDevolutiva(pedido());
    expect(r).toMatchObject({ success: false, codigo: 'recente' });
    expect(auditoria()[0]).toMatchObject({ resultado: 'erro', empresa_id: E1 });
    expect(vendas().estado.status).toBe('em_andamento');
  });
});

describe('o que fica registrado e o que NÃO acontece', () => {
  it('vendas: grava quem, quando, qual sessão, qual empresa e o motivo; sem IA; conversa intacta', async () => {
    const antes = structuredClone(vendas().estado.mensagens);
    const r = await encerrarTreinoSemDevolutiva(pedido({ motivo: '   Avaliação falhou três vezes; a pessoa pediu ajuda.   ' }));
    expect(r).toMatchObject({ success: true, auditoria: true });

    expect(auditoria()).toHaveLength(1);
    const linha = auditoria()[0];
    expect(linha).toMatchObject({
      admin_email: 'master@vertho.ai', // quem
      acao: ACAO,
      empresa_id: E1, // qual empresa
      alvo: `vendas:${VENDAS}`, // qual sessão
      resultado: 'ok',
      ip: '200.1.2.3',
    });
    expect(linha.detalhes).toMatchObject({
      motivo: 'Avaliação falhou três vezes; a pessoa pediu ajuda.', // o motivo, sem os espaços das pontas
      simulador: 'vendas',
      sessao_id: VENDAS,
      colaborador_id: C1,
      status_anterior: 'em_andamento',
      status_novo: 'abandonada',
      tem_conversa: true,
      horas_parado: 72,
    });
    // Sem IA e sem custo; a conversa continua onde estava.
    expect(estado.callAI).not.toHaveBeenCalled();
    expect(banco.tabelas.sim_vendas_tentativas).toHaveLength(0);
    expect(vendas().estado.mensagens).toEqual(antes);
    expect(vendas().estado.status).toBe('abandonada');
  });

  it('atendimento: interrompido com a conversa preservada, auditado com a empresa da sessão', async () => {
    const r = await encerrarTreinoSemDevolutiva(pedido({ simulador: 'atendimento', empresaId: E2, sessaoId: ATENDIMENTO }));
    expect(r).toMatchObject({ success: true, statusNovo: 'interrompida', temConversa: true });
    const row = banco.tabelas.recepcao_sessoes[0];
    expect(row.estado.status).toBe('interrompida');
    expect(row.estado.historico).toHaveLength(3);
    expect(auditoria()[0]).toMatchObject({ acao: ACAO, empresa_id: E2, alvo: `atendimento:${ATENDIMENTO}`, resultado: 'ok' });
    expect(estado.callAI).not.toHaveBeenCalled();
  });

  it('a mesma sessão não encerra duas vezes (a segunda é recusada e auditada)', async () => {
    await encerrarTreinoSemDevolutiva(pedido());
    const r = await encerrarTreinoSemDevolutiva(pedido());
    expect(r).toMatchObject({ success: false, codigo: 'nao_elegivel' });
    expect(auditoria().map((a) => a.resultado)).toEqual(['ok', 'erro']);
    expect(vendas().revisao).toBe(4);
  });

  it('🔴 auditoria que falha NÃO desfaz o encerramento, mas a tela é avisada (auditoria: false)', async () => {
    banco.falharEm({ tabela: 'admin_audit_log', op: 'insert', mensagem: 'relation does not exist' });
    const r = await encerrarTreinoSemDevolutiva(pedido());
    expect(r).toMatchObject({ success: true, auditoria: false });
    expect(vendas().estado.status).toBe('abandonada');
  });

  it('erro do banco no meio vira recusa auditada, nunca sucesso', async () => {
    banco.client.rpc = vi.fn(async () => ({ data: null, error: { message: 'boom' } }));
    const r = await encerrarTreinoSemDevolutiva(pedido());
    expect(r).toMatchObject({ success: false, codigo: 'falha' });
    expect(vendas().estado.status).toBe('em_andamento');
    expect(auditoria()[0]).toMatchObject({ resultado: 'erro' });
  });
});
