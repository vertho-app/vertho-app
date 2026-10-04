import { beforeEach, describe, expect, test, vi } from 'vitest';
import { abrirSessao, encerrar, encerrarSemRelatorio, visaoPublica } from '@/lib/recepcao/core';
import { cenario as legado } from '@/lib/recepcao/cenario.mjs';
import { cenarioSchema } from '@/lib/recepcao/schema';
import { RECEPCAO_SESSAO } from '@/lib/status';
import { bancoEmMemoria, type BancoEmMemoria } from '../helpers/tabelas-em-memoria';

/**
 * R-96 (04/10/2026): o atendimento que a equipe da Vertho encerrou sem relatório
 * (`interrompida`) precisa ficar fechado de verdade. Antes desta mudança o
 * `encerrar` do núcleo só olhava `concluida` e `respostas > 0`: um "Encerrar e
 * avaliar" sobre a sessão fechada pagaria uma avaliação de IA nova. A tela
 * também precisa deixar a conversa à vista e tirar o atendimento de "Retomar".
 */
const cenario = cenarioSchema.parse(legado);
const mock = vi.hoisted(() => ({ gerar: vi.fn(), sb: null as any }));
vi.mock('@/lib/recepcao/ai', () => ({
  geradorRecepcao: () => ({ gerar: mock.gerar, chamadas: [], validar: async () => {} }),
  textoParaTreino: (s: string) => s,
}));
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => mock.sb }));
vi.mock('@/lib/permissions', () => ({ can: async () => true }));
vi.mock('@/lib/recepcao/cenarios', () => ({
  catalogo: async () => [],
  cenarioPublicado: async () => ({ id: 'cenario', conteudo: cenario }),
}));
import { consultar, executar } from '@/lib/recepcao/service';

const EMPRESA = '10000000-0000-4000-8000-000000000001';
const ID = '20000000-0000-4000-8000-000000000001';
const REQUEST = '30000000-0000-4000-8000-000000000001';

function sessaoComResposta(status: string = RECEPCAO_SESSAO.EM_ANDAMENTO, respostas = 2) {
  const e: any = abrirSessao(cenario, 0);
  e.id = ID;
  e.status = status;
  e.respostas = respostas;
  for (let i = 1; i <= respostas; i++)
    e.historico.push({ id: `m${e.historico.length}`, role: 'user', content: `r${i}` }, { id: `m${e.historico.length + 1}`, role: 'assistant', content: `f${i}` });
  return e;
}

describe('encerrarSemRelatorio (núcleo)', () => {
  test('com resposta: interrompida, conversa intacta, revisão sobe, o original não é tocado', () => {
    const antes = sessaoComResposta();
    const copia = structuredClone(antes);
    const depois = encerrarSemRelatorio(antes);
    expect(depois).toMatchObject({ status: RECEPCAO_SESSAO.INTERROMPIDA, motivoFim: 'encerrada_pelo_suporte', revisao: antes.revisao + 1, respostas: 2, relatorio: null });
    expect(depois.historico).toEqual(copia.historico);
    expect(antes).toEqual(copia);
  });

  test('sem resposta: descartada, como o serviço faz ao iniciar outro atendimento', () => {
    expect(encerrarSemRelatorio(sessaoComResposta(RECEPCAO_SESSAO.EM_ANDAMENTO, 0))).toMatchObject({
      status: RECEPCAO_SESSAO.DESCARTADA,
      motivoFim: 'descartada_sem_resposta',
    });
  });

  test('esperando a avaliação (limite de respostas) também encerra', () => {
    expect(encerrarSemRelatorio(sessaoComResposta(RECEPCAO_SESSAO.AGUARDANDO_AVALIACAO, 12)).status).toBe(RECEPCAO_SESSAO.INTERROMPIDA);
  });

  test.each([RECEPCAO_SESSAO.CONCLUIDA, RECEPCAO_SESSAO.DESCARTADA, RECEPCAO_SESSAO.INTERROMPIDA])('recusa quem já terminou (%s)', (status) => {
    expect(() => encerrarSemRelatorio(sessaoComResposta(status))).toThrow('já foi encerrado');
  });

  test('a tela recebe o status e o motivo, e a conversa continua visível', () => {
    const v = visaoPublica(encerrarSemRelatorio(sessaoComResposta()));
    expect(v).toMatchObject({ status: 'interrompida', motivoFim: 'encerrada_pelo_suporte' });
    expect(v.historico.length).toBeGreaterThan(1);
  });
});

describe('uma sessão interrompida não paga avaliação nem aceita resposta', () => {
  test('🔴 `encerrar` do núcleo recusa antes de chamar a IA', async () => {
    const gerarTexto = vi.fn();
    const interrompida = encerrarSemRelatorio(sessaoComResposta());
    await expect(encerrar(interrompida, gerarTexto)).rejects.toThrow('encerrado sem relatório');
    expect(gerarTexto).not.toHaveBeenCalled();
  });

  let banco: BancoEmMemoria;
  const ctx = () => ({
    auth: { email: 'pessoa@example.test', empresaId: EMPRESA, isPlatformAdmin: false, role: 'colaborador', colaborador: { id: 'colab', empresa_id: EMPRESA } },
    empresaId: EMPRESA, owner: 'pessoa@example.test', ownerKey: 'colab:colab', empresaNome: 'Fictícia', habilitado: true, sb: mock.sb, dominio: 'recepcao_medica',
  }) as any;
  beforeEach(() => {
    mock.gerar.mockReset().mockResolvedValue(JSON.stringify({ fala: 'ok' }));
    banco = bancoEmMemoria({
      empresas: [{ id: EMPRESA, nome: 'Fictícia' }],
      recepcao_config: [{ empresa_id: EMPRESA, habilitado: true }],
      recepcao_sessoes: [
        { id: ID, empresa_id: EMPRESA, owner_email: 'pessoa@example.test', owner_key: 'colab:colab', estado: encerrarSemRelatorio(sessaoComResposta()), revisao: 3, lock_token: null, lock_until: null, created_at: '2026-09-20T12:00:00.000Z' },
      ],
    });
    banco.client.rpc = vi.fn(async () => ({ data: true, error: null }));
    mock.sb = banco.client;
  });

  test('🔴 "Encerrar e avaliar" sobre a sessão fechada: 409, sem lease e sem IA', async () => {
    await expect(executar(ctx(), { acao: 'encerrar', sessaoId: ID, revisao: 3 })).rejects.toMatchObject({ status: 409 });
    expect(mock.gerar).not.toHaveBeenCalled();
    expect(banco.client.rpc).not.toHaveBeenCalled();
    expect(banco.escritas).toHaveLength(0);
  });

  test('responder sobre a sessão fechada: 409, sem lease e sem IA', async () => {
    await expect(executar(ctx(), { acao: 'responder', sessaoId: ID, requestId: REQUEST, revisao: 3, mensagem: 'oi' })).rejects.toMatchObject({ status: 409 });
    expect(mock.gerar).not.toHaveBeenCalled();
    expect(banco.client.rpc).not.toHaveBeenCalled();
  });

  test('a conversa segue no histórico de quem treinou e sai de "Retomar"', async () => {
    const d = await consultar(ctx());
    expect(d.historico.map((h: any) => [h.id, h.status])).toEqual([[ID, 'interrompida']]);
    expect(d.abertos).toEqual([]);
    expect(d.sessao.historico.length).toBeGreaterThan(1);
    expect(d.sessao.status).toBe('interrompida');
  });
});
