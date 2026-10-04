import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bancoEmMemoria, type BancoEmMemoria } from '../helpers/tabelas-em-memoria';
import { estado as estadoVendasBase } from '../fixtures/simulador-vendas';
import { abrirSessao } from '@/lib/recepcao/core';
import { cenario as legado } from '@/lib/recepcao/cenario.mjs';
import { cenarioSchema } from '@/lib/recepcao/schema';
import { RECEPCAO_SESSAO, VENDAS_SESSAO } from '@/lib/status';

/**
 * R-96 (decisão do dono em 04/10/2026): "Encerrar sem devolutiva" para o treino
 * que ficou preso em andamento nos simuladores de vendas e de atendimento.
 *
 * O banco é em memória (`bancoEmMemoria`) com as quatro RPCs de lease emuladas
 * pela regra das migrations 249/250 (vendas) e 241 (atendimento). O `tenantDb`
 * é o REAL: o escopo por empresa que o código declara é o que a tabela filtra.
 * O que este teste NÃO prova é o SQL em si; a condição `SIM_ABERTA` é lida do
 * texto das migrations (ver "a pessoa volta a poder abrir treino").
 */
const mock = vi.hoisted(() => ({ sb: null as any, callAI: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => mock.sb.client }));
// Nenhuma IA pode ser chamada por este fluxo: se alguém importar o wrapper, o espião acusa.
vi.mock('@/actions/ai-client', () => ({ callAI: mock.callAI, callAIChat: mock.callAI }));

import {
  HORAS_SEM_ATIVIDADE,
  LIMITE_LISTA,
  encerrarSemDevolutiva,
  listarTreinosParados,
} from '@/lib/simuladores/treinos-parados';

const AGORA = Date.parse('2026-10-04T15:00:00.000Z');
const ha = (horas: number) => new Date(AGORA - horas * 3_600_000).toISOString();

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const E1 = id(1);
const E2 = id(2);
const C1 = id(11);
const C2 = id(12);
const C3 = id(13);
const cenarioAtendimento = cenarioSchema.parse(legado);

function estadoVendas(sessaoId: string, extra: Record<string, any> = {}, conversa = true) {
  const e: any = estadoVendasBase();
  e.id = sessaoId;
  e.revisao = 3;
  if (conversa)
    e.mensagens = [
      { id: 'r1:v', turno: 1, autor: 'vendedor', texto: 'Bom dia, Beatriz. Posso entender o prazo?', fase: 'preparar' },
      { id: 'r1:c', turno: 1, autor: 'cliente', texto: 'Claro. Hoje atrasa muito.', fase: 'analisar' },
    ];
  return Object.assign(e, extra);
}
function linhaVendas(n: number, over: Record<string, any> = {}, estadoExtra: Record<string, any> = {}, conversa = true) {
  const e = estadoVendas(id(100 + n), estadoExtra, conversa);
  return {
    id: e.id,
    empresa_id: E1,
    owner_key: `colab:${C1}`,
    colaborador_id: C1,
    estado: e,
    revisao: 3,
    lock_token: null,
    lock_until: null,
    created_at: ha(200),
    updated_at: ha(72),
    resumo: { status: e.status, nomeVendedor: 'Ana Souza' },
    ...over,
  };
}
function estadoAtendimento(sessaoId: string, respostas: number, status: string = RECEPCAO_SESSAO.EM_ANDAMENTO) {
  const e: any = abrirSessao(cenarioAtendimento, 0);
  e.id = sessaoId;
  e.revisao = 2;
  for (let i = 1; i <= respostas; i++)
    e.historico.push(
      { id: `m${e.historico.length}`, role: 'user', content: `resposta ${i}` },
      { id: `m${e.historico.length + 1}`, role: 'assistant', content: `fala ${i}` },
    );
  e.respostas = respostas;
  e.status = status;
  return e;
}
function linhaAtendimento(n: number, respostas: number, over: Record<string, any> = {}, status: string = RECEPCAO_SESSAO.EM_ANDAMENTO) {
  const e = estadoAtendimento(id(200 + n), respostas, status);
  return {
    id: e.id,
    empresa_id: E2,
    owner_key: `colab:${C2}`,
    owner_email: 'pessoa@example.test',
    colaborador_id: C2,
    estado: e,
    revisao: 2,
    lock_token: null,
    lock_until: null,
    created_at: ha(200),
    updated_at: ha(60),
    ...over,
  };
}

/** As quatro RPCs de lease, com a regra das migrations (revisão, dono, lease e revisão do estado). */
function emularRpcs(b: BancoEmMemoria) {
  b.client.rpc = vi.fn(async (nome: string, p: any) => {
    const vendas = nome.startsWith('sim_vendas');
    const tabela = vendas ? 'sim_vendas_sessoes' : 'recepcao_sessoes';
    const row = b.tabelas[tabela].find(
      (r) => r.id === p.p_id && r.empresa_id === p.p_empresa && r.owner_key === p.p_owner && r.revisao === p.p_revisao,
    );
    if (nome.endsWith('claim') || nome === 'recepcao_claim_v2') {
      if (!row || (row.lock_until && Date.parse(row.lock_until) >= Date.now())) return { data: false, error: null };
      row.lock_token = p.p_token;
      row.lock_until = new Date(Date.now() + 330_000).toISOString();
      return { data: true, error: null };
    }
    if (!vendas && (p.p_estado?.revisao ?? null) !== p.p_revisao + 1)
      return { data: null, error: { message: 'revisao invalida' } };
    if (!row || row.lock_token !== p.p_token || (vendas && Date.parse(row.lock_until) <= Date.now()))
      return { data: false, error: null };
    row.estado = structuredClone(p.p_estado);
    row.revisao += 1;
    row.lock_token = null;
    row.lock_until = null;
    row.updated_at = new Date().toISOString();
    return { data: true, error: null };
  });
}

let banco: BancoEmMemoria;
const vendasRows = () => banco.tabelas.sim_vendas_sessoes;
const atendimentoRows = () => banco.tabelas.recepcao_sessoes;
function montar(tabelas: Record<string, any[]> = {}) {
  banco = bancoEmMemoria({
    empresas: [
      { id: E1, nome: 'Alfa Comercial' },
      { id: E2, nome: 'Beta Clínicas' },
    ],
    colaboradores: [
      { id: C1, empresa_id: E1, nome_completo: 'Ana Souza' },
      { id: C2, empresa_id: E2, nome_completo: 'Bruno Lima' },
      { id: C3, empresa_id: E1, nome_completo: 'Carla Dias' },
    ],
    sim_vendas_sessoes: [],
    sim_vendas_tentativas: [],
    recepcao_sessoes: [],
    recepcao_tentativas: [],
    ...tabelas,
  });
  emularRpcs(banco);
  mock.sb = banco;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(AGORA);
  mock.callAI.mockReset();
  montar();
});
afterEach(() => vi.useRealTimers());

describe('lista: treinos em andamento sem atividade há mais de 48 horas', () => {
  it('traz só o que está parado de verdade, por empresa, e só campos não sensíveis', async () => {
    montar({
      sim_vendas_sessoes: [
        linhaVendas(1, { updated_at: ha(72) }), // parado, com conversa
        linhaVendas(2, { colaborador_id: C3, owner_key: `colab:${C3}`, updated_at: ha(60) }, {}, false), // parado, sem conversa
        linhaVendas(3, { updated_at: ha(10) }), // atividade recente
        linhaVendas(4, { updated_at: ha(100) }, { status: VENDAS_SESSAO.CONCLUIDA }), // já concluído
        linhaVendas(5, { updated_at: ha(100), owner_key: `admin:${id(900)}`, colaborador_id: null }), // teste de administrador
        linhaVendas(6, { updated_at: ha(100), lock_until: new Date(AGORA + 60_000).toISOString() }), // em processamento agora
      ],
      recepcao_sessoes: [
        linhaAtendimento(1, 3, { updated_at: ha(50) }),
        linhaAtendimento(2, 12, { updated_at: ha(90) }, RECEPCAO_SESSAO.AGUARDANDO_AVALIACAO),
        linhaAtendimento(3, 0, { updated_at: ha(90) }, RECEPCAO_SESSAO.DESCARTADA),
        linhaAtendimento(4, 5, { updated_at: ha(90) }, RECEPCAO_SESSAO.CONCLUIDA),
      ],
    });
    const r = await listarTreinosParados(banco.client, { agora: AGORA });

    expect(r.horas).toBe(HORAS_SEM_ATIVIDADE);
    expect(r.truncado).toBe(false);
    // Alfa antes de Beta; dentro da empresa, o mais antigo primeiro.
    expect(r.itens.map((i) => [i.empresa, i.simulador, i.sessaoId])).toEqual([
      ['Alfa Comercial', 'vendas', id(101)],
      ['Alfa Comercial', 'vendas', id(102)],
      ['Beta Clínicas', 'atendimento', id(202)],
      ['Beta Clínicas', 'atendimento', id(201)],
    ]);
    const porId = Object.fromEntries(r.itens.map((i) => [i.sessaoId, i]));
    expect(porId[id(101)]).toMatchObject({ pessoa: 'Ana Souza', temConversa: true, status: 'em_andamento', empresaId: E1 });
    expect(porId[id(102)]).toMatchObject({ pessoa: 'Carla Dias', temConversa: false });
    expect(porId[id(201)]).toMatchObject({ pessoa: 'Bruno Lima', temConversa: true });
    expect(porId[id(202)]).toMatchObject({ status: 'aguardando_avaliacao', temConversa: true });
    // Nada de conversa, briefing, estado ou dono: só o necessário para decidir.
    for (const item of r.itens)
      expect(Object.keys(item).sort()).toEqual(
        ['empresa', 'empresaId', 'pessoa', 'sessaoId', 'simulador', 'status', 'temConversa', 'ultimaAtividade'],
      );
    expect(JSON.stringify(r)).not.toMatch(/BRIEFING_PRIVADO|Posso entender o prazo|resposta 1/);
  });

  it('a fronteira é de 48 horas: 47 não aparece, 49 aparece', async () => {
    montar({
      sim_vendas_sessoes: [
        linhaVendas(1, { updated_at: ha(47) }),
        linhaVendas(2, { updated_at: ha(49) }),
      ],
    });
    const r = await listarTreinosParados(banco.client, { agora: AGORA });
    expect(r.itens.map((i) => i.sessaoId)).toEqual([id(102)]);
  });

  it('filtra por empresa quando pedido', async () => {
    montar({
      sim_vendas_sessoes: [linhaVendas(1)],
      recepcao_sessoes: [linhaAtendimento(1, 2)],
    });
    const soE2 = await listarTreinosParados(banco.client, { agora: AGORA, empresaId: E2 });
    expect(soE2.itens.map((i) => i.simulador)).toEqual(['atendimento']);
  });

  it('cadastro removido aparece sem nome, não some', async () => {
    montar({
      sim_vendas_sessoes: [linhaVendas(1, { colaborador_id: null })],
    });
    const r = await listarTreinosParados(banco.client, { agora: AGORA });
    expect(r.itens).toHaveLength(1);
    expect(r.itens[0].pessoa).toBeNull();
  });

  it('acima do teto avisa que truncou, em vez de parecer completa', async () => {
    montar({
      sim_vendas_sessoes: Array.from({ length: LIMITE_LISTA + 5 }, (_, i) => {
        const r = linhaVendas(i + 1, { updated_at: ha(100) }, {}, false);
        return { ...r, id: id(1000 + i), estado: { ...r.estado, id: id(1000 + i) } };
      }),
    });
    const r = await listarTreinosParados(banco.client, { agora: AGORA });
    expect(r.itens).toHaveLength(LIMITE_LISTA);
    expect(r.truncado).toBe(true);
  });

  it('🔴 falha de leitura LANÇA: nunca vira "nenhum treino parado"', async () => {
    // Cada tabela lida pela lista, uma de cada vez: a leitura de nomes só roda se houver linha.
    for (const tabela of ['empresas', 'sim_vendas_sessoes', 'recepcao_sessoes', 'colaboradores']) {
      montar({ sim_vendas_sessoes: [linhaVendas(1)] });
      banco.falharEm({ tabela, op: 'select', mensagem: 'timeout' });
      await expect(listarTreinosParados(banco.client, { agora: AGORA }), tabela).rejects.toThrow();
    }
  });
});

describe('vendas: encerrar sem devolutiva', () => {
  const alvo = () => ({ simulador: 'vendas' as const, empresaId: E1, sessaoId: id(101) });
  beforeEach(() => montar({ sim_vendas_sessoes: [linhaVendas(1)] }));

  it('encerra como "Encerrado sem relatório", preserva a conversa e NÃO chama IA', async () => {
    const antes = structuredClone(vendasRows()[0].estado);
    const r = await encerrarSemDevolutiva(alvo());

    expect(r).toMatchObject({
      ok: true,
      simulador: 'vendas',
      empresaId: E1,
      sessaoId: id(101),
      colaboradorId: C1,
      statusAnterior: VENDAS_SESSAO.EM_ANDAMENTO,
      statusNovo: VENDAS_SESSAO.ABANDONADA,
      temConversa: true,
      horasParado: 72,
    });
    const row = vendasRows()[0];
    expect(row.estado.status).toBe(VENDAS_SESSAO.ABANDONADA);
    expect(row.estado.encerradoEm).toBe(new Date(AGORA).toISOString());
    expect(row.estado.relatorio).toBeNull();
    // A conversa NÃO é apagada: só o estado muda.
    expect(row.estado.mensagens).toEqual(antes.mensagens);
    expect(row.estado.mensagens).toHaveLength(2);
    expect(row.revisao).toBe(4);
    expect(row.estado.revisao).toBe(4);
    expect(row.lock_token).toBeNull();
    expect(row.lock_until).toBeNull();
    // Sem IA e sem custo: nenhuma tentativa de geração, nenhuma chamada ao provedor.
    expect(mock.callAI).not.toHaveBeenCalled();
    expect(banco.tabelas.sim_vendas_tentativas).toHaveLength(0);
    expect(banco.escritas.filter((e) => e.tabela === 'sim_vendas_tentativas')).toHaveLength(0);
  });

  it('o claim e o commit usam a identidade da PESSOA (a sessão é dela), com a revisão lida', async () => {
    await encerrarSemDevolutiva(alvo());
    const chamadas = (banco.client.rpc as any).mock.calls;
    expect(chamadas.map((c: any[]) => c[0])).toEqual(['sim_vendas_claim', 'sim_vendas_commit']);
    const [claim, commit] = [chamadas[0][1], chamadas[1][1]];
    expect(claim).toMatchObject({ p_id: id(101), p_empresa: E1, p_owner: `colab:${C1}`, p_revisao: 3 });
    expect(commit).toMatchObject(claim);
    expect(commit.p_estado.revisao).toBe(4);
  });

  it('a pessoa volta a poder abrir treino: o estado novo não é um dos que o banco chama de "aberta"', async () => {
    const r: any = await encerrarSemDevolutiva(alvo());
    const abertas = (arquivo: string, ancora: RegExp) => {
      const sql = readFileSync(arquivo, 'utf-8');
      const trecho = sql.match(ancora);
      // Denominador: se a leitura do SQL quebrar, o teste não pode passar vazio.
      expect(trecho, `não achei a condição em ${arquivo}`).not.toBeNull();
      return [...trecho![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    };
    // `sim_vendas_criar` (mig 250) levanta SIM_ABERTA por esta condição...
    const naFuncao = abertas('migrations/250-simulador-vendas-prazo-versoes.sql', /estado->>'status' IN \(([^)]*)\)\) THEN RAISE EXCEPTION 'SIM_ABERTA'/);
    // ...e o índice único parcial (mig 249) garante o mesmo no armazenamento.
    const noIndice = abertas('migrations/249-simulador-vendas.sql', /sim_vendas_sessoes_aberta_ux[^;]*WHERE estado->>'status' IN \(([^)]*)\)/);
    for (const lista of [naFuncao, noIndice]) {
      expect(lista).toContain(r.statusAnterior);
      expect(lista).not.toContain(r.statusNovo);
    }
  });

  it('exatamente 48 horas já pode; um minuto antes, não', async () => {
    montar({ sim_vendas_sessoes: [linhaVendas(1, { updated_at: new Date(AGORA - 48 * 3_600_000 + 60_000).toISOString() })] });
    expect(await encerrarSemDevolutiva(alvo())).toMatchObject({ ok: false, codigo: 'recente' });
    montar({ sim_vendas_sessoes: [linhaVendas(1, { updated_at: new Date(AGORA - 48 * 3_600_000).toISOString() })] });
    expect(await encerrarSemDevolutiva(alvo())).toMatchObject({ ok: true });
  });

  it('sem conversa também encerra, e diz que não havia conversa', async () => {
    montar({ sim_vendas_sessoes: [linhaVendas(1, {}, {}, false)] });
    expect(await encerrarSemDevolutiva(alvo())).toMatchObject({ ok: true, temConversa: false, statusNovo: VENDAS_SESSAO.ABANDONADA });
  });

  it('🔴 sessão de OUTRA empresa não é encontrada e nada é escrito', async () => {
    const r = await encerrarSemDevolutiva({ simulador: 'vendas', empresaId: E2, sessaoId: id(101) });
    expect(r).toMatchObject({ ok: false, codigo: 'nao_encontrada' });
    expect(banco.escritas).toHaveLength(0);
    expect(banco.client.rpc).not.toHaveBeenCalled();
    expect(vendasRows()[0].estado.status).toBe(VENDAS_SESSAO.EM_ANDAMENTO);
  });

  it('sessão inexistente: não encontrada, sem escrita', async () => {
    const r = await encerrarSemDevolutiva({ simulador: 'vendas', empresaId: E1, sessaoId: id(999) });
    expect(r).toMatchObject({ ok: false, codigo: 'nao_encontrada' });
    expect(banco.escritas).toHaveLength(0);
  });

  it.each([
    ['teste de administrador', { owner_key: `admin:${id(900)}`, colaborador_id: null }, {}],
    ['já concluído', {}, { status: VENDAS_SESSAO.CONCLUIDA }],
    ['já encerrado', {}, { status: VENDAS_SESSAO.ABANDONADA }],
    ['interrompido por conduta', {}, { status: VENDAS_SESSAO.INTERROMPIDA }],
    ['em preparação (o banco recupera sozinho)', {}, { status: VENDAS_SESSAO.PREPARANDO }],
  ])('recusa e não escreve: %s', async (_nome, over, estadoExtra) => {
    montar({ sim_vendas_sessoes: [linhaVendas(1, over, estadoExtra)] });
    const r = await encerrarSemDevolutiva(alvo());
    expect(r).toMatchObject({ ok: false, codigo: 'nao_elegivel' });
    expect(banco.escritas).toHaveLength(0);
    expect(banco.client.rpc).not.toHaveBeenCalled();
  });

  it('lease viva (envio em processamento): não encerra', async () => {
    montar({ sim_vendas_sessoes: [linhaVendas(1, { lock_token: 'outro', lock_until: new Date(AGORA + 120_000).toISOString() })] });
    expect(await encerrarSemDevolutiva(alvo())).toMatchObject({ ok: false, codigo: 'em_processamento' });
    expect(banco.client.rpc).not.toHaveBeenCalled();
    expect(vendasRows()[0].lock_token).toBe('outro');
  });

  it('claim perdido na corrida: "mudou", sem commit e sem tocar a conversa', async () => {
    (banco.client.rpc as any).mockImplementation(async (nome: string) => ({ data: nome.endsWith('claim') ? false : true, error: null }));
    const antes = structuredClone(vendasRows()[0]);
    expect(await encerrarSemDevolutiva(alvo())).toMatchObject({ ok: false, codigo: 'mudou' });
    expect((banco.client.rpc as any).mock.calls.map((c: any[]) => c[0])).toEqual(['sim_vendas_claim']);
    expect(vendasRows()[0]).toEqual(antes);
  });

  it('commit recusado: "mudou", e a lease do próprio token é liberada', async () => {
    const original = banco.client.rpc as any;
    banco.client.rpc = vi.fn(async (nome: string, p: any) => (nome === 'sim_vendas_commit' ? { data: false, error: null } : original(nome, p)));
    expect(await encerrarSemDevolutiva(alvo())).toMatchObject({ ok: false, codigo: 'mudou' });
    expect(vendasRows()[0].lock_token).toBeNull();
    expect(vendasRows()[0].estado.status).toBe(VENDAS_SESSAO.EM_ANDAMENTO);
    expect(vendasRows()[0].revisao).toBe(3);
  });

  it('erro do banco no claim ou na leitura vira "falha", nunca sucesso', async () => {
    banco.client.rpc = vi.fn(async () => ({ data: null, error: { message: 'boom' } }));
    expect(await encerrarSemDevolutiva(alvo())).toMatchObject({ ok: false, codigo: 'falha' });
    montar({ sim_vendas_sessoes: [linhaVendas(1)] });
    banco.falharEm({ tabela: 'sim_vendas_sessoes', op: 'select', mensagem: 'timeout' });
    expect(await encerrarSemDevolutiva(alvo())).toMatchObject({ ok: false, codigo: 'falha' });
  });

  it('erro no commit (não só "false") vira "falha" e libera a lease', async () => {
    const original = banco.client.rpc as any;
    banco.client.rpc = vi.fn(async (nome: string, p: any) => (nome === 'sim_vendas_commit' ? { data: null, error: { message: 'boom' } } : original(nome, p)));
    expect(await encerrarSemDevolutiva(alvo())).toMatchObject({ ok: false, codigo: 'falha' });
    expect(vendasRows()[0].lock_token).toBeNull();
  });
});

describe('atendimento: encerrar sem devolutiva', () => {
  const alvo = (n: number) => ({ simulador: 'atendimento' as const, empresaId: E2, sessaoId: id(200 + n) });

  it('com resposta: "interrompida", conversa preservada, sem relatório e sem IA', async () => {
    montar({ recepcao_sessoes: [linhaAtendimento(1, 3)] });
    const antes = structuredClone(atendimentoRows()[0].estado);
    const r = await encerrarSemDevolutiva(alvo(1));

    expect(r).toMatchObject({ ok: true, statusAnterior: RECEPCAO_SESSAO.EM_ANDAMENTO, statusNovo: RECEPCAO_SESSAO.INTERROMPIDA, temConversa: true, colaboradorId: C2 });
    const row = atendimentoRows()[0];
    expect(row.estado.status).toBe(RECEPCAO_SESSAO.INTERROMPIDA);
    expect(row.estado.motivoFim).toBe('encerrada_pelo_suporte');
    expect(row.estado.relatorio).toBeNull();
    expect(row.estado.historico).toEqual(antes.historico);
    expect(row.estado.historico.length).toBeGreaterThan(1);
    expect(row.estado.respostas).toBe(3);
    expect(row.revisao).toBe(3);
    expect(mock.callAI).not.toHaveBeenCalled();
    expect(banco.tabelas.recepcao_tentativas).toHaveLength(0);
    const commit = (banco.client.rpc as any).mock.calls.find((c: any[]) => c[0] === 'recepcao_commit_v2')[1];
    expect(commit).toMatchObject({ p_empresa: E2, p_owner: `colab:${C2}`, p_revisao: 2, p_chamadas: [] });
  });

  it('esperando a avaliação que não fecha (limite de respostas): também encerra', async () => {
    montar({ recepcao_sessoes: [linhaAtendimento(1, 12, {}, RECEPCAO_SESSAO.AGUARDANDO_AVALIACAO)] });
    expect(await encerrarSemDevolutiva(alvo(1))).toMatchObject({
      ok: true,
      statusAnterior: RECEPCAO_SESSAO.AGUARDANDO_AVALIACAO,
      statusNovo: RECEPCAO_SESSAO.INTERROMPIDA,
    });
  });

  it('sem nenhuma resposta: vira "descartada", como o serviço já faz ao iniciar outro', async () => {
    montar({ recepcao_sessoes: [linhaAtendimento(1, 0)] });
    expect(await encerrarSemDevolutiva(alvo(1))).toMatchObject({ ok: true, statusNovo: RECEPCAO_SESSAO.DESCARTADA, temConversa: false });
    expect(atendimentoRows()[0].estado.motivoFim).toBe('descartada_sem_resposta');
  });

  it.each([
    ['concluído', RECEPCAO_SESSAO.CONCLUIDA],
    ['descartado', RECEPCAO_SESSAO.DESCARTADA],
    ['já interrompido', RECEPCAO_SESSAO.INTERROMPIDA],
  ])('recusa e não escreve: %s', async (_nome, status) => {
    montar({ recepcao_sessoes: [linhaAtendimento(1, 2, {}, status)] });
    expect(await encerrarSemDevolutiva(alvo(1))).toMatchObject({ ok: false, codigo: 'nao_elegivel' });
    expect(banco.escritas).toHaveLength(0);
  });

  it('🔴 sessão de outra empresa não é encontrada; teste de administrador e recente também recusam', async () => {
    montar({
      recepcao_sessoes: [
        linhaAtendimento(1, 2),
        linhaAtendimento(2, 2, { owner_key: `admin:${id(900)}`, colaborador_id: null }),
        linhaAtendimento(3, 2, { updated_at: ha(5) }),
      ],
    });
    expect(await encerrarSemDevolutiva({ simulador: 'atendimento', empresaId: E1, sessaoId: id(201) })).toMatchObject({ ok: false, codigo: 'nao_encontrada' });
    expect(await encerrarSemDevolutiva(alvo(2))).toMatchObject({ ok: false, codigo: 'nao_elegivel' });
    expect(await encerrarSemDevolutiva(alvo(3))).toMatchObject({ ok: false, codigo: 'recente' });
    expect(banco.escritas).toHaveLength(0);
    expect(banco.client.rpc).not.toHaveBeenCalled();
  });
});
