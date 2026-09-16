import { describe, it, expect, vi, beforeEach } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * `/api/temporada/evaluation`: as portas do fechamento (Cenário B).
 *
 * 🔴 Por que existe (16/09/2026). Duas falhas medidas em Ibipeba:
 *  1. A nota saía DENTRO do request da última fala da arguição e morria no teto
 *     de 120 s do scorer. Agora a rota só reserva e dispara em `after()`.
 *  2. Quem reabria a tela sem nota reenviava as 4 respostas: cada `send`
 *     empurrava uma fala nova e rodava o scorer de novo (Marta ficou com 5
 *     falas). Agora `send` com respostas completas é 409 e não grava nada.
 */

const h = vi.hoisted(() => ({
  sb: null as any,
  prog: null as any,
  config: null as any,
  after: vi.fn(),
  reservar: vi.fn(),
  finalizar: vi.fn(),
  turno: vi.fn(),
  extrair: vi.fn(),
  abrir: vi.fn(),
}));

vi.mock('next/server', async (orig) => ({ ...(await orig<any>()), after: h.after }));
vi.mock('@/lib/csrf', () => ({ csrfCheck: () => null }));
vi.mock('@/lib/rate-limit', () => ({ aiLimiter: { check: async () => null } }));
vi.mock('@/lib/auth/request-context', () => ({
  requireUser: async () => ({ email: 'helmar@escola.br', empresaId: 'emp-1', role: 'colaborador' }),
  assertColabAccess: async () => null,
}));
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => h.sb.client }));
vi.mock('@/actions/ai-client', () => ({ callAI: vi.fn(), callAIChat: vi.fn() }));
vi.mock('@/lib/execucao-contexto', () => ({ comContexto: (_c: any, fn: any) => fn() }));
vi.mock('@/lib/season-engine/trilha-runtime', () => ({
  resolverConfigDaTrilha: async () => h.config,
  checarGatesSemana: async () => null,
  gateAcumuladaPiloto: () => ({ pronto: true, redisparar: false }),
  qualitativaDoPlano: () => null,
}));
vi.mock('@/lib/season-engine/fechamento-core', () => ({
  reservarFinalizacao: h.reservar,
  finalizarFechamentoCore: h.finalizar,
}));
vi.mock('@/lib/season-engine/arguicao', () => ({
  abrirArguicao: h.abrir,
  turnoArguicao: h.turno,
  extrairEvidenciasArguicao: h.extrair,
}));

import { POST } from '@/app/api/temporada/evaluation/route';
import { PROGRAMA_REGULAR_DUO } from '@/lib/season-engine/programa-config';

const PERGUNTAS = ['SITUAÇÃO', 'AÇÃO', 'RACIOCÍNIO', 'AUTOSSENSIBILIDADE'].map(d => ({ dimensao: d, texto: `pergunta ${d}` }));
function transcript(n: number) {
  const t: any[] = [{ role: 'assistant', content: '**SITUAÇÃO**' }];
  for (let i = 0; i < n; i++) {
    t.push({ role: 'user', content: `resposta ${i + 1}` });
    if (i < 3) t.push({ role: 'assistant', content: `**p${i + 2}**` });
  }
  return t;
}

const TRILHA = {
  id: 'tr-1', colaborador_id: 'col-1', empresa_id: 'emp-1', competencia_foco: 'Planejamento',
  competencias_foco: ['Planejamento'], temporada_plano: [], descritores_selecionados: [{ descritor: 'D1' }],
  data_inicio: '2026-07-01', programa_modo: 'regular_duo', programa_config: {},
};

const req = (body: any) => new Request('http://ibipeba.vertho.ai/api/temporada/evaluation', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trilhaId: 'tr-1', semana: 9, ...body }),
});

const escritasProgresso = () => h.sb.escritas.filter((e: any) => e.tabela === 'temporada_semana_progresso');

beforeEach(() => {
  for (const f of [h.after, h.reservar, h.finalizar, h.turno, h.extrair, h.abrir]) f.mockReset();
  h.reservar.mockResolvedValue({ ok: true, token: '2026-09-16T15:00:00.000Z' });
  h.finalizar.mockResolvedValue({ ok: true });
  h.config = { ...PROGRAMA_REGULAR_DUO, modo: 'regular', semanas: 9, semanaAcumulada: 8, semanaCenarioB: 9, arguicao: { ativa: true, maxTurnos: 8 } };
  h.sb = criarSupabaseMock({
    resolver: (tabela) => {
      if (tabela === 'trilhas') return TRILHA;
      if (tabela === 'colaboradores') return { nome_completo: 'Helmar Miranda', cargo: 'Gestão Escolar', perfil_dominante: 'S' };
      if (tabela === 'temporada_semana_progresso') return h.prog;
      return null;
    },
  });
});

describe('send com respostas completas', () => {
  it('Helmar reabrindo a tela (arguição concluída, sem nota): 409, sem fala nova, sem pontuação', async () => {
    h.prog = { id: 'p9', status: 'em_andamento', feedback: { cenario: '## C', perguntas: PERGUNTAS, transcript_completo: transcript(4), arguicao: { turno: 7, concluida: true, historico: [] } } };
    const res = await POST(req({ action: 'send', message: 'resposta 1' }));
    expect(res.status).toBe(409);
    expect((await res.json()).fechamento).toBe('pronto-para-pontuar');
    expect(escritasProgresso()).toHaveLength(0);
    expect(h.reservar).not.toHaveBeenCalled();
    expect(h.after).not.toHaveBeenCalled();
  });

  it('arguição ligada e ainda não aberta: abre a arguição SEM empurrar outra fala', async () => {
    h.prog = { id: 'p9', status: 'em_andamento', feedback: { cenario: '## C', perguntas: PERGUNTAS, transcript_completo: transcript(4) } };
    h.abrir.mockResolvedValue({ estado: { turno: 1, concluida: false, historico: [] }, reply: 'Vamos conversar.' });
    const res = await POST(req({ action: 'send', message: 'resposta 4' }));
    expect(res.status).toBe(200);
    expect((await res.json()).arguindo).toBe(true);
    const [w] = escritasProgresso();
    expect(w.payload.feedback.transcript_completo.filter((m: any) => m.role === 'user')).toHaveLength(4);
  });
});

describe('fim do cenário e da arguição: a nota sai em after(), não no request', () => {
  it('última fala da arguição: grava a arguição, reserva, agenda after() e responde "finalizando"', async () => {
    h.prog = { id: 'p9', status: 'em_andamento', feedback: { cenario: '## C', perguntas: PERGUNTAS, transcript_completo: transcript(4), arguicao: { turno: 7, concluida: false, historico: [] } } };
    h.turno.mockResolvedValue({ estado: { turno: 8, concluida: true, historico: [] }, reply: 'Obrigado.', concluida: true });
    h.extrair.mockResolvedValue({ classificacao: 'sustentou' });
    const res = await POST(req({ action: 'arguir', message: 'minha defesa' }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ arguicaoConcluida: true, finalizando: true, message: 'Obrigado.' });
    expect(escritasProgresso()[0].payload.feedback.arguicao.extracao).toEqual({ classificacao: 'sustentou' });
    expect(h.reservar).toHaveBeenCalledWith('tr-1', { empresaId: 'emp-1' });
    expect(h.after).toHaveBeenCalledTimes(1);
    expect(h.finalizar).not.toHaveBeenCalled(); // só roda quando o after() executar

    await h.after.mock.calls[0][0]();
    expect(h.finalizar).toHaveBeenCalledTimes(1);
    const [, opts] = h.finalizar.mock.calls[0];
    expect(opts.token).toBe('2026-09-16T15:00:00.000Z');
    expect(opts.prazoMs - Date.now()).toBeLessThanOrEqual(285_000);
  });

  it('arguição DESLIGADA: a 4ª resposta é gravada e a pontuação disparada pelo mesmo caminho', async () => {
    h.config = { ...h.config, arguicao: { ativa: false, maxTurnos: 0 } };
    h.prog = { id: 'p9', status: 'em_andamento', feedback: { cenario: '## C', perguntas: PERGUNTAS, transcript_completo: transcript(3) } };
    const res = await POST(req({ action: 'send', message: 'resposta 4' }));
    const body = await res.json();
    expect(body).toMatchObject({ finalizando: true, finished: false });
    expect(escritasProgresso()[0].payload.feedback.transcript_completo.filter((m: any) => m.role === 'user')).toHaveLength(4);
    expect(h.reservar).toHaveBeenCalledTimes(1);
    expect(h.after).toHaveBeenCalledTimes(1);
  });

  it('reserva recusada (já processando): não agenda outra pontuação', async () => {
    h.prog = { id: 'p9', status: 'em_andamento', feedback: { cenario: '## C', perguntas: PERGUNTAS, transcript_completo: transcript(4), arguicao: { turno: 7, concluida: true, historico: [] } } };
    h.reservar.mockResolvedValue({ ok: false, estado: 'processando' });
    const res = await POST(req({ action: 'finalizar' }));
    expect(res.status).toBe(202);
    expect(h.after).not.toHaveBeenCalled();
  });
});

describe('ações novas', () => {
  it('finalizar em estado que não pontua (arguindo): 409 com o estado', async () => {
    h.prog = { id: 'p9', status: 'em_andamento', feedback: {} };
    h.reservar.mockResolvedValue({ ok: false, estado: 'arguindo' });
    const res = await POST(req({ action: 'finalizar' }));
    expect(res.status).toBe(409);
    expect((await res.json()).estado).toBe('arguindo');
  });

  it('fechamento_status é só leitura: devolve o estado e a avaliação quando concluída', async () => {
    h.prog = { id: 'p9', status: 'concluido', feedback: { cenario: '## C', perguntas: PERGUNTAS, transcript_completo: transcript(4), nota_media_pos: 2.5 } };
    const res = await POST(req({ action: 'fechamento_status' }));
    const body = await res.json();
    expect(body).toMatchObject({ estado: 'avaliado', avaliacao: { nota_media_pos: 2.5 } });
    expect(escritasProgresso()).toHaveLength(0);
    expect(h.reservar).not.toHaveBeenCalled();
  });
});
