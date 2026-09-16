import { describe, it, expect, vi, beforeEach } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * Núcleo da pontuação do fechamento (Cenário B).
 *
 * 🔴 Por que existe (16/09/2026): a nota saía dentro do request da última fala
 * da arguição e abortava no teto de 120 s do `callAI`. Helmar ficou 8 dias com
 * a arguição concluída e sem nota; Marta só passou reenviando as respostas, o
 * que empurrou uma fala duplicada e pagou o scorer de novo. Estes testes travam
 * as três garantias do conserto: a reserva impede pontuação dupla, a falha fica
 * VISÍVEL (slot + degradação) em vez de parecer "não terminou", e a nota usa só
 * as N primeiras respostas.
 */

const h = vi.hoisted(() => ({
  sb: null as any,
  estado: { atual: null as any },
  pontuar: vi.fn(),
  report: vi.fn(),
  degradacao: vi.fn(),
}));

vi.mock('@/lib/tenant-db', () => ({
  tenantDb: () => ({ from: (t: string) => h.sb.client.from(t), raw: h.sb.client }),
}));
vi.mock('@/lib/season-engine/fechamento-scorer', () => ({ pontuarFechamento: h.pontuar }));
vi.mock('@/lib/season-engine/evolution-report-core', () => ({ gerarEvolutionReportCore: h.report }));
vi.mock('@/lib/season-engine/regua', () => ({
  enriquecerComRegua: async ({ descritores }: any) => descritores,
  sobreporNotaFresh: async (_db: any, _c: string, _comp: string, d: any[]) => d,
}));
vi.mock('@/lib/season-engine/evidencias-fechamento', () => ({
  agregarEvidenciasAteAcumulada: async () => 'evidências',
  normalizarAcumuladoPrimaria: () => null,
}));
vi.mock('@/lib/degradacao', () => ({
  DEGRADACAO: { FECHAMENTO_SCORER_FALHOU: 'fechamento-scorer-falhou' },
  registrarDegradacao: h.degradacao,
}));
vi.mock('@/lib/season-engine/trilha-runtime', async () => {
  const { PROGRAMA_REGULAR_DUO } = await import('@/lib/season-engine/programa-config');
  return {
    resolverConfigDaTrilha: async () => ({
      ...PROGRAMA_REGULAR_DUO, modo: 'regular', semanas: 9, semanaAcumulada: 8, semanaCenarioB: 9,
      arguicao: { ativa: true, maxTurnos: 8 },
    }),
    gateAcumuladaPiloto: () => ({ pronto: true, redisparar: false }),
  };
});

import { reservarFinalizacao, finalizarFechamentoCore } from '@/lib/season-engine/fechamento-core';

const AGORA = Date.parse('2026-09-16T15:00:00Z');
const TOKEN = new Date(AGORA).toISOString();
const PERGUNTAS = ['SITUAÇÃO', 'AÇÃO', 'RACIOCÍNIO', 'AUTOSSENSIBILIDADE'].map(d => ({ dimensao: d, texto: `pergunta ${d}` }));

function transcript(respostas: string[]) {
  const t: any[] = [{ role: 'assistant', content: '**SITUAÇÃO**' }];
  respostas.forEach((r, i) => {
    t.push({ role: 'user', content: r });
    if (i < 3) t.push({ role: 'assistant', content: `**p${i + 2}**` });
  });
  return t;
}

function progHelmar(extra: any = {}) {
  return {
    id: 'prog-9', status: 'em_andamento', iniciado_em: '2026-09-08T17:46:46Z',
    feedback: {
      cenario: '## Cenário', perguntas: PERGUNTAS, cenario_b_id: 'cb',
      transcript_completo: transcript(['r1', 'r2', 'r3', 'r4']),
      arguicao: { turno: 7, concluida: true, historico: [], extracao: { classificacao: 'sustentou' } },
      ...extra,
    },
  };
}

const TRILHA = {
  id: 'tr-1', colaborador_id: 'col-1', empresa_id: 'emp-1',
  competencia_foco: 'Planejamento', competencias_foco: ['Planejamento', 'Autocuidado'],
  descritores_selecionados: [{ descritor: 'D1', competencia: 'Planejamento' }],
  programa_modo: 'regular_duo', programa_config: {},
};

const PARSED = {
  avaliacao_por_descritor: [{ descritor: 'D1', nota_pre: 2, nota_pos: 2.5, justificativa: 'j' }],
  nota_media_pre: 2, nota_media_pos: 2.5, delta_medio: 0.5,
  resumo_avaliacao: { mensagem_geral: 'mensagem' },
};

beforeEach(() => {
  h.pontuar.mockReset();
  h.report.mockReset().mockResolvedValue({ success: true, evolution_report: { ok: 1 } });
  h.degradacao.mockReset();
  h.estado.atual = progHelmar();
  h.sb = criarSupabaseMock({
    resolver: (tabela, cols) => {
      if (tabela === 'trilhas') return TRILHA;
      if (tabela === 'colaboradores') return { nome_completo: 'Helmar Miranda da Silva', cargo: 'Gestão Escolar', perfil_dominante: 'S' };
      if (tabela === 'temporada_semana_progresso') {
        if (cols === 'feedback') return { feedback: { acumulado: null } }; // semana da acumulada
        return h.estado.atual;
      }
      return null;
    },
  });
});

const escritasProgresso = () => h.sb.escritas.filter((e: any) => e.tabela === 'temporada_semana_progresso');

describe('reservarFinalizacao', () => {
  it('Helmar (tudo respondido, sem nota): reserva com token e grava "processando"', async () => {
    const r = await reservarFinalizacao('tr-1', { empresaId: 'emp-1', agoraMs: AGORA });
    expect(r).toEqual({ ok: true, token: TOKEN });
    const [w] = escritasProgresso();
    expect(w.op).toBe('update');
    expect(w.payload.feedback.finalizacao).toEqual({ status: 'processando', iniciada_em: TOKEN });
    // o resto do slot sobrevive à reserva
    expect(w.payload.feedback.arguicao.concluida).toBe(true);
    expect(w.payload.feedback.transcript_completo).toHaveLength(8);
  });

  it('reserva fresca em curso: NÃO reserva de novo (dois cliques não pagam dois scorers)', async () => {
    h.estado.atual = progHelmar({ finalizacao: { status: 'processando', iniciada_em: new Date(AGORA - 30_000).toISOString() } });
    const r = await reservarFinalizacao('tr-1', { empresaId: 'emp-1', agoraMs: AGORA });
    expect(r).toMatchObject({ ok: false, estado: 'processando' });
    expect(escritasProgresso()).toHaveLength(0);
  });

  it('reserva vencida (função morreu): reserva de novo', async () => {
    h.estado.atual = progHelmar({ finalizacao: { status: 'processando', iniciada_em: new Date(AGORA - 400_000).toISOString() } });
    const r = await reservarFinalizacao('tr-1', { empresaId: 'emp-1', agoraMs: AGORA });
    expect(r.ok).toBe(true);
  });

  it('última tentativa falhou: reserva de novo (é o botão "Tentar de novo")', async () => {
    h.estado.atual = progHelmar({ finalizacao: { status: 'erro', iniciada_em: TOKEN, erro: 'aborted' } });
    expect((await reservarFinalizacao('tr-1', { empresaId: 'emp-1', agoraMs: AGORA })).ok).toBe(true);
  });

  it('já concluída: devolve a avaliação gravada sem escrever nada', async () => {
    h.estado.atual = { ...progHelmar({ nota_media_pos: 2.5 }), status: 'concluido' };
    const r = await reservarFinalizacao('tr-1', { empresaId: 'emp-1', agoraMs: AGORA });
    expect(r).toMatchObject({ ok: false, estado: 'avaliado', avaliacao: { nota_media_pos: 2.5 } });
    expect(escritasProgresso()).toHaveLength(0);
  });

  it('arguição em andamento: recusa sem escrever (nunca pontua sem a defesa)', async () => {
    h.estado.atual = progHelmar({ arguicao: { turno: 2, concluida: false, historico: [] } });
    const r = await reservarFinalizacao('tr-1', { empresaId: 'emp-1', agoraMs: AGORA });
    expect(r).toMatchObject({ ok: false, estado: 'arguindo' });
    expect(escritasProgresso()).toHaveLength(0);
  });

  it('falha ao ler a trilha NÃO vira "trilha não encontrada" silenciosa nem reserva', async () => {
    h.sb.falharEm({ tabela: 'trilhas', op: 'select', mensagem: 'timeout no pool' });
    const r = await reservarFinalizacao('tr-1', { empresaId: 'emp-1', agoraMs: AGORA });
    expect(r).toMatchObject({ ok: false, estado: 'falha' });
    expect((r as any).erro).toContain('timeout no pool');
    expect(escritasProgresso()).toHaveLength(0);
  });

  it('falha ao gravar a reserva: estado falha, não finge que reservou', async () => {
    h.sb.falharEm({ tabela: 'temporada_semana_progresso', op: 'update', mensagem: 'pool esgotado' });
    const r = await reservarFinalizacao('tr-1', { empresaId: 'emp-1', agoraMs: AGORA });
    expect(r).toMatchObject({ ok: false, estado: 'falha' });
  });
});

describe('finalizarFechamentoCore', () => {
  const reservado = (extra: any = {}) => progHelmar({ finalizacao: { status: 'processando', iniciada_em: TOKEN }, ...extra });

  it('sucesso: conclui a semana, remove a reserva, gera o relatório', async () => {
    h.estado.atual = reservado();
    h.pontuar.mockResolvedValue({ ok: true, parsed: { ...PARSED }, auditoria: { nota_auditoria: 90 }, meta: { warnings: [], tentativas: 1 } });
    const r = await finalizarFechamentoCore('tr-1', { empresaId: 'emp-1', token: TOKEN, prazoMs: AGORA + 285_000 });
    expect(r.ok).toBe(true);
    const concluiu = escritasProgresso().find((e: any) => e.payload.status === 'concluido');
    expect(concluiu).toBeTruthy();
    expect(concluiu.payload.semana).toBe(9);
    expect(concluiu.payload.feedback.finalizacao).toBeUndefined();
    expect(concluiu.payload.feedback.avaliacao_por_descritor).toHaveLength(1);
    expect(concluiu.payload.feedback.arguicao.concluida).toBe(true);
    expect(h.report).toHaveBeenCalledWith('tr-1', { empresaId: 'emp-1' });
    expect(h.degradacao).not.toHaveBeenCalled();
  });

  it('repassa prazo, atribuição de ledger e a extração da arguição ao scorer', async () => {
    h.estado.atual = reservado();
    h.pontuar.mockResolvedValue({ ok: true, parsed: { ...PARSED }, auditoria: null, meta: { warnings: [], tentativas: 1 } });
    await finalizarFechamentoCore('tr-1', { empresaId: 'emp-1', token: TOKEN, prazoMs: AGORA + 285_000 });
    const a = h.pontuar.mock.calls[0][0];
    expect(a.prazoMs).toBe(AGORA + 285_000);
    expect(a.ledger).toEqual({ empresaId: 'emp-1', colaboradorId: 'col-1' });
    expect(a.evidenciasArguicao).toEqual({ classificacao: 'sustentou' });
    expect(a.competencia).toBe('Planejamento + Autocuidado');
  });

  it('Marta: 5 falas (1 duplicada) → a nota usa só as 4 PRIMEIRAS', async () => {
    h.estado.atual = reservado({ transcript_completo: [...transcript(['r1', 'r2', 'r3', 'r4']), { role: 'user', content: 'r1-DUPLICADA' }] });
    h.pontuar.mockResolvedValue({ ok: true, parsed: { ...PARSED }, auditoria: null, meta: { warnings: [], tentativas: 1 } });
    await finalizarFechamentoCore('tr-1', { empresaId: 'emp-1', token: TOKEN });
    const resposta: string = h.pontuar.mock.calls[0][0].resposta;
    expect(resposta).toContain('→ r4');
    expect(resposta).not.toContain('DUPLICADA');
  });

  it('token de outra reserva: não chama o scorer nem escreve', async () => {
    h.estado.atual = progHelmar({ finalizacao: { status: 'processando', iniciada_em: '2026-09-16T15:05:00.000Z' } });
    const r = await finalizarFechamentoCore('tr-1', { empresaId: 'emp-1', token: TOKEN });
    expect(r).toMatchObject({ ok: false, erro: 'reserva-substituida' });
    expect(h.pontuar).not.toHaveBeenCalled();
    expect(escritasProgresso()).toHaveLength(0);
  });

  it('scorer ABORTADO (o caso de produção): marca erro no slot, registra degradação crítica, NÃO conclui', async () => {
    h.estado.atual = reservado();
    h.pontuar.mockRejectedValue(new Error('AI call failed (claude-sonnet-4-6): Request was aborted.'));
    const r = await finalizarFechamentoCore('tr-1', { empresaId: 'emp-1', token: TOKEN });
    expect(r.ok).toBe(false);
    expect(escritasProgresso().some((e: any) => e.payload.status === 'concluido')).toBe(false);
    const marcou = escritasProgresso().find((e: any) => e.payload.feedback?.finalizacao?.status === 'erro');
    expect(marcou.payload.feedback.finalizacao.erro).toContain('Request was aborted');
    expect(marcou.payload.feedback.arguicao.concluida).toBe(true); // o trabalho da pessoa fica
    expect(h.degradacao).toHaveBeenCalledTimes(1);
    expect(h.degradacao.mock.calls[0][0]).toMatchObject({
      tipo: 'fechamento-scorer-falhou', severidade: 'critico', chave: 'tr-1', empresaId: 'emp-1', colaboradorId: 'col-1',
    });
  });

  it('scorer devolve ok:false (parse vazio): mesmo tratamento do aborto', async () => {
    h.estado.atual = reservado();
    h.pontuar.mockResolvedValue({ ok: false, erro: 'parse/narrativa inválida', meta: { warnings: ['w'], tentativas: 2 } });
    const r = await finalizarFechamentoCore('tr-1', { empresaId: 'emp-1', token: TOKEN });
    expect(r).toMatchObject({ ok: false, erro: 'parse/narrativa inválida' });
    expect(h.degradacao).toHaveBeenCalledTimes(1);
    expect(escritasProgresso().some((e: any) => e.payload.status === 'concluido')).toBe(false);
  });

  it('gravação da nota falha: vira erro visível, não sucesso', async () => {
    h.estado.atual = reservado();
    h.pontuar.mockResolvedValue({ ok: true, parsed: { ...PARSED }, auditoria: null, meta: { warnings: [], tentativas: 1 } });
    h.sb.falharEm({ tabela: 'temporada_semana_progresso', op: 'update', mensagem: 'constraint', quando: (p: any) => p?.status === 'concluido' });
    const r = await finalizarFechamentoCore('tr-1', { empresaId: 'emp-1', token: TOKEN });
    expect(r.ok).toBe(false);
    expect(h.degradacao).toHaveBeenCalledTimes(1);
    expect(h.report).not.toHaveBeenCalled();
  });

  it('relatório não gerado: a nota fica, mas o motivo volta nos avisos', async () => {
    h.estado.atual = reservado();
    h.pontuar.mockResolvedValue({ ok: true, parsed: { ...PARSED }, auditoria: null, meta: { warnings: [], tentativas: 1 } });
    h.report.mockResolvedValue({ success: false, error: 'sem avaliação por descritor' });
    const r = await finalizarFechamentoCore('tr-1', { empresaId: 'emp-1', token: TOKEN });
    expect(r.ok).toBe(true);
    expect(r.warnings.some(w => w.includes('sem avaliação por descritor'))).toBe(true);
  });
});
