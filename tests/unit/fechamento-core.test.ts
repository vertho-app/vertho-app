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
  estado: { atual: null as any, relatorio: null as any, trilha: null as any, locale: null as string | null, mapeamento: [] as any[] },
  pontuar: vi.fn(),
  evidencias: vi.fn(async (..._args: any[]) => 'evidências'),
  redigir: vi.fn(),
  report: vi.fn(),
  degradacao: vi.fn(),
  acumulado: null as any,
}));

vi.mock('@/lib/tenant-db', () => ({
  tenantDb: () => ({ from: (t: string) => h.sb.client.from(t), raw: h.sb.client }),
}));
vi.mock('@/lib/season-engine/fechamento-scorer', () => ({
  pontuarFechamento: h.pontuar,
  redigirDevolutivaFinal: h.redigir,
  citacoesDaArguicao: () => new Map(),
}));
vi.mock('@/lib/season-engine/evolution-report-core', () => ({ gerarEvolutionReportCore: h.report }));
vi.mock('@/lib/season-engine/regua', () => ({
  enriquecerComRegua: async ({ descritores }: any) => descritores,
  sobreporNotaFresh: async (_db: any, _c: string, _comp: string, d: any[]) => d,
}));
vi.mock('@/lib/season-engine/evidencias-fechamento', () => ({
  agregarEvidenciasAteAcumulada: (...args: any[]) => h.evidencias(...args),
  normalizarAcumuladoPrimaria: () => h.acumulado,
}));
vi.mock('@/lib/degradacao', () => ({
  DEGRADACAO: {
    FECHAMENTO_SCORER_FALHOU: 'fechamento-scorer-falhou',
    FECHAMENTO_REDACAO_FALHOU: 'fechamento-redacao-falhou',
    FECHAMENTO_VOCABULARIO_PROIBIDO: 'fechamento-vocabulario-proibido',
    FECHAMENTO_RELATORIO_FALHOU: 'fechamento-relatorio-falhou',
  },
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

import { reservarFinalizacao, finalizarFechamentoCore, refazerRedacaoFechamento } from '@/lib/season-engine/fechamento-core';

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
  h.redigir.mockReset();
  h.report.mockReset().mockResolvedValue({ success: true, evolution_report: { ok: 1 } });
  h.degradacao.mockReset();
  h.acumulado = null;
  h.estado.atual = progHelmar();
  h.estado.relatorio = null;
  h.estado.trilha = null;
  h.estado.locale = null;
  h.estado.mapeamento = [];
  h.evidencias.mockClear();
  h.sb = criarSupabaseMock({
    lista: (tabela) => (tabela === 'descriptor_assessments' ? h.estado.mapeamento : []),
    resolver: (tabela, cols) => {
      if (tabela === 'trilhas') return cols === 'evolution_report' ? { evolution_report: h.estado.relatorio } : (h.estado.trilha ?? TRILHA);
      if (tabela === 'colaboradores') return { nome_completo: 'Helmar Miranda da Silva', cargo: 'Gestão Escolar', perfil_dominante: 'S', locale: h.estado.locale };
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

  /**
   * 🔴 O prompt recebe o nome MASCARADO (`COLAB_xxxx`), então é isso que a IA
   * escreve — e o fecho de 17/09/2026 é escrito PARA a pessoa, pelo nome. Sem o
   * unmask desses campos o alias sai impresso na última frase do PDF que ela
   * leva para casa, sem erro em lugar nenhum.
   */
  it('o fecho e os passos saem com o nome REAL, não com o alias do prompt', async () => {
    // 1ª rodada só para capturar o alias que o mascarador deu a esta pessoa.
    h.estado.atual = reservado();
    h.pontuar.mockResolvedValue({ ok: true, parsed: { ...PARSED }, auditoria: null, meta: { warnings: [], tentativas: 1 } });
    await finalizarFechamentoCore('tr-1', { empresaId: 'emp-1', token: TOKEN, prazoMs: AGORA + 285_000 });
    const alias = h.pontuar.mock.calls[0][0].nomeColab;
    expect(alias).toMatch(/^COLAB_/);

    // 2ª rodada: a IA responde usando o alias, como responde de verdade.
    h.sb.escritas.length = 0;
    h.estado.atual = reservado();
    h.pontuar.mockResolvedValue({
      ok: true,
      parsed: {
        ...PARSED,
        resumo_avaliacao: {
          mensagem_geral: `${alias}, a leitura da sua avaliação.`,
          mensagem_final: `${alias}, você sai com um jeito próprio de conduzir o Conselho.`,
          proximos_passos: [`Retome com ${alias} o combinado da equipe`],
        },
      },
      auditoria: null,
      meta: { warnings: [], tentativas: 1 },
    });
    await finalizarFechamentoCore('tr-1', { empresaId: 'emp-1', token: TOKEN, prazoMs: AGORA + 285_000 });

    const r = escritasProgresso().find((e: any) => e.payload.status === 'concluido').payload.feedback.resumo_avaliacao;
    expect(r.mensagem_final).toBe('Helmar, você sai com um jeito próprio de conduzir o Conselho.');
    expect(r.proximos_passos).toEqual(['Retome com Helmar o combinado da equipe']);
    expect(r.mensagem_geral).toBe('Helmar, a leitura da sua avaliação.');
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
    // R-137 (03/10/2026): era só um console.warn; a trilha ficava aberta sem
    // ninguém saber. Agora é degradação CRÍTICA, com a trilha como chave.
    const d = h.degradacao.mock.calls.map((c: any[]) => c[0]).find((x: any) => x.tipo === 'fechamento-relatorio-falhou');
    expect(d).toMatchObject({ chave: 'tr-1', severidade: 'critico', empresaId: 'emp-1', colaboradorId: 'col-1' });
    expect(d.detalhe.erro).toContain('sem avaliação por descritor');
  });

  it('relatório gerado: nenhuma degradação de relatório', async () => {
    h.estado.atual = reservado();
    h.pontuar.mockResolvedValue({ ok: true, parsed: { ...PARSED }, auditoria: null, meta: { warnings: [], tentativas: 1 } });
    await finalizarFechamentoCore('tr-1', { empresaId: 'emp-1', token: TOKEN });
    expect(h.degradacao.mock.calls.some((c: any[]) => c[0]?.tipo === 'fechamento-relatorio-falhou')).toBe(false);
  });

  /**
   * Redação final (18/09/2026): quando a nota muda depois do texto e a redação
   * não reescreve, a nota fica gravada, mas o texto pode contradizê-la. Isso
   * não pode ser silencioso.
   */
  it.each(['falhou', 'pulada-sem-tempo'])('redação final %s: a nota é gravada e a degradação (aviso) é registrada', async (status) => {
    h.estado.atual = reservado();
    h.pontuar.mockResolvedValue({
      ok: true, parsed: { ...PARSED }, auditoria: null,
      meta: { warnings: [`redação final falhou (x); ficou o rascunho do scorer`], tentativas: 1, redacao: status },
    });
    const r = await finalizarFechamentoCore('tr-1', { empresaId: 'emp-1', token: TOKEN });
    expect(r.ok).toBe(true);
    expect(escritasProgresso().some((e: any) => e.payload.status === 'concluido')).toBe(true);
    expect(h.degradacao).toHaveBeenCalledTimes(1);
    expect(h.degradacao.mock.calls[0][0]).toMatchObject({
      tipo: 'fechamento-redacao-falhou', severidade: 'aviso', chave: 'tr-1',
      empresaId: 'emp-1', colaboradorId: 'col-1', detalhe: { motivo: status },
    });
  });

  it.each(['reescrita', 'desnecessaria'])('redação final %s: nenhuma degradação', async (status) => {
    h.estado.atual = reservado();
    h.pontuar.mockResolvedValue({ ok: true, parsed: { ...PARSED }, auditoria: null, meta: { warnings: [], tentativas: 1, redacao: status } });
    await finalizarFechamentoCore('tr-1', { empresaId: 'emp-1', token: TOKEN });
    expect(h.degradacao).not.toHaveBeenCalled();
  });

  /**
   * Alarme de vocabulário (R-37, 04/10/2026): o texto publicado falou em "regressão"
   * ou trouxe nota numérica. A nota e o texto ficam gravados; a degradação (aviso)
   * diz os TERMOS, nunca o texto.
   */
  it('vocabulário proibido no texto publicado: a nota é gravada e a degradação (aviso) leva os termos', async () => {
    h.estado.atual = reservado();
    h.pontuar.mockResolvedValue({
      ok: true, parsed: { ...PARSED, redacao_final: { texto_publicado: 'scorer' } }, auditoria: null,
      meta: { warnings: ['vocabulário proibido na devolutiva: regressão'], tentativas: 1, vocabularioProibido: ['regressão', 'nota numérica'] },
    });
    const r = await finalizarFechamentoCore('tr-1', { empresaId: 'emp-1', token: TOKEN });
    expect(r.ok).toBe(true);
    expect(escritasProgresso().some((e: any) => e.payload.status === 'concluido')).toBe(true);
    expect(h.degradacao).toHaveBeenCalledTimes(1);
    const d = h.degradacao.mock.calls[0][0];
    expect(d).toMatchObject({
      tipo: 'fechamento-vocabulario-proibido', severidade: 'aviso', chave: 'tr-1',
      empresaId: 'emp-1', colaboradorId: 'col-1',
      detalhe: { termos: ['regressão', 'nota numérica'], texto_publicado: 'scorer' },
    });
    expect(JSON.stringify(d)).not.toContain('mensagem');
  });

  it('texto limpo: nenhuma degradação de vocabulário', async () => {
    h.estado.atual = reservado();
    h.pontuar.mockResolvedValue({ ok: true, parsed: { ...PARSED }, auditoria: null, meta: { warnings: [], tentativas: 1 } });
    await finalizarFechamentoCore('tr-1', { empresaId: 'emp-1', token: TOKEN });
    expect(h.degradacao.mock.calls.some((c: any[]) => c[0]?.tipo === 'fechamento-vocabulario-proibido')).toBe(false);
  });

  it('a extração da arguição vai MASCARADA para o scorer; a gravada fica como está', async () => {
    const extracao = {
      resumo: { leitura_geral: 'escreveu para pessoa@exemplo.com', sustentacao_mais_forte: '', fragilidade_mais_relevante: '' },
      evidencias_por_descritor: [{ descritor: 'D1', sustentou: 'aprofundou', forca: 'forte', citacao: 'ligue 21 99999-8888' }],
    };
    h.estado.atual = reservado({ arguicao: { turno: 7, concluida: true, historico: [], extracao } });
    h.pontuar.mockResolvedValue({ ok: true, parsed: { ...PARSED }, auditoria: null, meta: { warnings: [], tentativas: 1 } });
    await finalizarFechamentoCore('tr-1', { empresaId: 'emp-1', token: TOKEN });
    const enviada = JSON.stringify(h.pontuar.mock.calls[0][0].evidenciasArguicao);
    expect(enviada).not.toContain('pessoa@exemplo.com');
    expect(enviada).not.toContain('99999-8888');
    expect(enviada).toContain('"sustentou":"aprofundou"');
    expect(extracao.evidencias_por_descritor[0].citacao).toBe('ligue 21 99999-8888');
  });

  it('nenhum campo autoral sai com o alias: avanço, atenção, evidências e o rascunho substituído', async () => {
    h.estado.atual = reservado();
    h.pontuar.mockResolvedValue({ ok: true, parsed: { ...PARSED }, auditoria: null, meta: { warnings: [], tentativas: 1 } });
    await finalizarFechamentoCore('tr-1', { empresaId: 'emp-1', token: TOKEN });
    const alias = h.pontuar.mock.calls[0][0].nomeColab;

    h.sb.escritas.length = 0;
    h.estado.atual = reservado();
    h.pontuar.mockResolvedValue({
      ok: true,
      parsed: {
        ...PARSED,
        resumo_avaliacao: {
          mensagem_geral: `${alias}, leitura.`,
          principal_avanco: `${alias} leu o comprador`,
          principal_ponto_de_atencao: `${alias} pode registrar`,
          evidencias_citadas: [`"${alias} disse"`],
          mensagem_final: 'Você leva isso.',
          proximos_passos: [],
        },
        resumo_avaliacao_rascunho: { mensagem_geral: `${alias}, rascunho.` },
      },
      auditoria: { resumo_auditoria: `${alias} ok`, alertas: [`${alias} alerta`] },
      meta: { warnings: [], tentativas: 1, redacao: 'reescrita' },
    });
    await finalizarFechamentoCore('tr-1', { empresaId: 'emp-1', token: TOKEN });
    const slot = escritasProgresso().find((e: any) => e.payload.status === 'concluido').payload.feedback;
    expect(JSON.stringify({ r: slot.resumo_avaliacao, q: slot.resumo_avaliacao_rascunho, a: slot.auditoria })).not.toContain(alias);
  });

  /**
   * 🔴 R-05 (03/10/2026): o acumulado é GRAVADO desmascarado (a pessoa lê o
   * resumo com o próprio nome) e ia assim ao scorer e ao auditor. As respostas
   * do cenário também: o primeiro nome solto não era mascarado.
   */
  it('acumulado gravado e respostas com o nome vão MASCARADOS ao scorer', async () => {
    h.estado.atual = reservado({
      transcript_completo: transcript(['Eu, Helmar, chamaria a família.', 'r2', 'r3', 'r4']),
    });
    h.acumulado = {
      resumo_geral: 'Helmar evoluiu na escuta.',
      avaliacao_acumulada: [{ descritor: 'D1', justificativa: 'Helmar Miranda da Silva sustentou\nHelmar repetiu', nota_acumulada: 2.5 }],
    };
    h.pontuar.mockResolvedValue({ ok: true, parsed: { ...PARSED }, auditoria: null, meta: { warnings: [], tentativas: 1 } });
    await finalizarFechamentoCore('tr-1', { empresaId: 'emp-1', token: TOKEN });
    const args = h.pontuar.mock.calls[0][0];
    const alias = args.nomeColab;
    expect(alias).toMatch(/^COLAB_/);
    expect(JSON.stringify(args.acumuladoPrimaria)).not.toContain('Helmar');
    expect(args.acumuladoPrimaria.resumo_geral).toBe(`${alias} evoluiu na escuta.`);
    expect(args.resposta).not.toContain('Helmar');
    expect(args.resposta).toContain(`Eu, ${alias}, chamaria`);
    // A nota numérica passa intacta.
    expect(args.acumuladoPrimaria.avaliacao_acumulada[0].nota_acumulada).toBe(2.5);
  });
});

/**
 * Recuperação da redação (19/09/2026). Quando a redação final falha, a pessoa
 * fica com a devolutiva mínima; `refazerRedacaoFechamento` produz a completa
 * pelas mesmas regras, SEM nova nota e SEM passar pelo núcleo do relatório
 * (que dispararia o encadeamento da jornada).
 */
describe('refazerRedacaoFechamento', () => {
  const slotComFalha = (redacao: any = { status: 'falhou', descritores_com_nota_alterada: 1, texto_publicado: 'devolutiva_minima', tentativas: 2 }) => ({
    id: 'prog-9', status: 'concluido', iniciado_em: '2026-09-08T17:46:46Z',
    feedback: {
      ...progHelmar().feedback,
      avaliacao_por_descritor: [{
        descritor: 'D1', nota_pre: 2, nota_base_cenario: 2.5, ajuste_arguicao: 0.5, nota_pos: 3,
        justificativa: 'Combinou por escrito em pessoa@exemplo.com.',
      }],
      resumo_avaliacao: { mensagem_geral: 'devolutiva mínima' },
      resumo_avaliacao_rascunho: { mensagem_geral: 'rascunho: ligue 21 99999-8888', proximos_passos: ['passo'] },
      redacao_final: redacao,
    },
  });
  const redigidoCom = (nome: string) => ({
    mensagem_geral: `${nome}, texto novo coerente.`, principal_avanco: 'a', principal_ponto_de_atencao: 'b',
    mensagem_final: `${nome}, você leva isto.`, evidencias_citadas: [], proximos_passos: ['passo'],
  });
  const redacaoOk = () => h.redigir.mockImplementation(async (args: any) => ({
    status: 'reescrita', resumo: redigidoCom(args.nomeColab), tentativas: 1, sanitizacaoAplicada: false, warnings: [],
  }));
  const escritasTrilha = () => h.sb.escritas.filter((e: any) => e.tabela === 'trilhas');

  it('prévia: devolve o texto com o nome real e não grava nada', async () => {
    h.estado.atual = slotComFalha();
    redacaoOk();
    const r = await refazerRedacaoFechamento('tr-1', { empresaId: 'emp-1' });
    if ('erro' in r) throw new Error(r.erro);
    expect(r).toMatchObject({ ok: true, aplicado: false, status: 'reescrita' });
    expect(JSON.stringify(r.resumo)).not.toContain('COLAB_');
    expect(h.sb.escritas).toHaveLength(0);
  });

  it('aplicar: troca o texto no slot e no relatório, sem passar pelo núcleo do relatório', async () => {
    h.estado.atual = slotComFalha();
    h.estado.relatorio = { descritores: [{ descritor: 'D1' }], resumo_avaliacao: { mensagem_geral: 'devolutiva mínima' } };
    redacaoOk();
    const r = await refazerRedacaoFechamento('tr-1', { empresaId: 'emp-1', aplicar: true });
    if ('erro' in r) throw new Error(r.erro);
    expect(r.aplicado).toBe(true);

    const slot = escritasProgresso().find((e: any) => e.op === 'update').payload.feedback;
    expect(slot.resumo_avaliacao.mensagem_geral).toMatch(/, texto novo coerente\.$/);
    expect(slot.resumo_avaliacao.mensagem_geral).not.toContain('COLAB_');
    expect(slot.redacao_final).toMatchObject({ status: 'reescrita', texto_publicado: 'redacao', status_anterior: 'falhou' });
    expect(slot.avaliacao_por_descritor[0].nota_pos).toBe(3); // a nota não muda

    const rel = escritasTrilha().find((e: any) => e.op === 'update').payload.evolution_report;
    expect(rel.resumo_avaliacao).toEqual(slot.resumo_avaliacao);
    expect(rel.descritores).toEqual([{ descritor: 'D1' }]);
    expect(h.report).not.toHaveBeenCalled(); // o núcleo dispararia o encadeamento
    expect(h.pontuar).not.toHaveBeenCalled(); // e não há nota nova
  });

  it('a redação recebe a MESMA base do fechamento, mascarada: nota de antes e final, rascunho e semanas', async () => {
    h.estado.atual = slotComFalha();
    redacaoOk();
    await refazerRedacaoFechamento('tr-1', { empresaId: 'emp-1' });
    const a = h.redigir.mock.calls[0][0];
    expect(a.nomeColab).toMatch(/^COLAB_/);
    expect(a.descritores[0]).toMatchObject({ descritor: 'D1', nota_pre: 2, nota_rascunho: 2.5, nota_final: 3 });
    expect(a.descritores[0].justificativa).not.toContain('pessoa@exemplo.com');
    expect(JSON.stringify(a.rascunho)).not.toContain('99999-8888');
    expect(a.evidenciasSemanas).toBe('evidências');
    expect(a.ledger).toEqual({ empresaId: 'emp-1', colaboradorId: 'col-1' });
  });

  it.each([
    [{ status: 'reescrita' }],
    [{ status: 'desnecessaria' }],
    [null], // fechamento anterior ao N09: sem carimbo
  ])('redação %j: nada a refazer, sem chamar a IA', async (redacao) => {
    h.estado.atual = slotComFalha(redacao);
    const r = await refazerRedacaoFechamento('tr-1', { empresaId: 'emp-1', aplicar: true });
    expect('erro' in r && r.erro).toMatch(/^nada a refazer/);
    expect(h.redigir).not.toHaveBeenCalled();
  });

  it('fechamento não concluído: recusa', async () => {
    h.estado.atual = { ...slotComFalha(), status: 'em_andamento' };
    const r = await refazerRedacaoFechamento('tr-1', { empresaId: 'emp-1', aplicar: true });
    expect('erro' in r && r.erro).toBe('fechamento não concluído');
  });

  it('a redação falha de novo: nada é gravado, a devolutiva mínima continua', async () => {
    h.estado.atual = slotComFalha();
    h.redigir.mockResolvedValue({ status: 'falhou', resumo: null, tentativas: 2, sanitizacaoAplicada: false, warnings: ['x'] });
    const r = await refazerRedacaoFechamento('tr-1', { empresaId: 'emp-1', aplicar: true });
    expect(r).toMatchObject({ ok: true, aplicado: false, status: 'falhou' });
    expect(h.sb.escritas).toHaveLength(0);
  });
});

describe('finalizarFechamentoCore: o fechamento do Onboarding (5 cenários, um por competência)', () => {
  const COMPS = ['Comp A', 'Comp B', 'Comp C', 'Comp D', 'Comp E'];
  const NOTAS = [1.0, 1.5, 2.0, 2.5, 3.0, 3.5]; // d1..d4 são os 4 de menor nota (os selecionados)
  const TRILHA_ONB = {
    id: 'tr-1', colaborador_id: 'col-1', empresa_id: 'emp-1', competencia_foco: COMPS[0], competencias_foco: COMPS,
    // a trilha seleciona 4 por competência (o conteúdo); o mapeamento (Cenário A) avaliou 6
    descritores_selecionados: COMPS.flatMap((c) => [1, 2, 3, 4].map((n) => ({ competencia: c, descritor: `${c.slice(-1)}-d${n}`, nota_atual: NOTAS[n - 1] }))),
    programa_modo: 'onboarding', programa_config: {},
  };
  const MAPEAMENTO = COMPS.flatMap((c) => [1, 2, 3, 4, 5, 6].map((n) => ({ competencia: c, descritor: `${c.slice(-1)}-d${n}`, nota: NOTAS[n - 1] })));
  /** O que a defesa oral de cada competência sustentou (a citação traz o nome da pessoa, para provar a máscara). */
  const EXT = (c: string) => ({
    resumo: { leitura_geral: `leitura de ${c}`, sustentacao_mais_forte: 'forte', fragilidade_mais_relevante: 'fraca' },
    evidencias_por_descritor: [{ descritor: `${c.slice(-1)}-d1`, sustentou: 'aprofundou', forca: 'forte', citacao: `Helmar defendeu ${c}` }],
  });
  /** `arguicoes[i]` troca a arguição do cenário i (`null` = não aberta); o default é concluída, com a extração dele. */
  const cenarios = (arguicoes: Record<number, any> = {}) => COMPS.map((competencia, i) => ({
    competencia, cenario_b_id: `b-${i}`, cenario: `## Caso ${competencia}\n\ntexto do caso`, perguntas: PERGUNTAS,
    transcript_completo: transcript([`${competencia} r1`, `${competencia} r2`, `${competencia} r3`, `${competencia} r4`]),
    ...(arguicoes[i] === null ? {} : { arguicao: arguicoes[i] ?? { turno: 6, concluida: true, historico: [], extracao: EXT(competencia) } }),
  }));
  const slotOnb = (extra: any = {}, arguicoes: Record<number, any> = {}) => ({
    id: 'prog-9', status: 'em_andamento', iniciado_em: '2026-10-04T17:46:46Z',
    feedback: {
      cenarios: cenarios(arguicoes), finalizacao: { status: 'processando', iniciada_em: TOKEN }, ...extra,
    },
  });
  const PARSED_ONB = {
    avaliacao_por_descritor: COMPS.flatMap((c) => [1, 2, 3, 4, 5, 6].map((n) => ({ competencia: c, descritor: `${c.slice(-1)}-d${n}`, nota_pre: 2, nota_pos: 2.5, justificativa: 'j' }))),
    nota_media_pre: 2, nota_media_pos: 2.5, delta_medio: 0.5, resumo_avaliacao: { mensagem_geral: 'mensagem' },
  };
  const ok = () => h.pontuar.mockResolvedValue({ ok: true, parsed: { ...PARSED_ONB }, auditoria: { nota_auditoria: 90 }, meta: { warnings: [], tentativas: 5 } });

  beforeEach(() => {
    h.estado.trilha = TRILHA_ONB;
    h.estado.atual = slotOnb();
    h.estado.mapeamento = MAPEAMENTO;
  });

  it('entrega ao scorer uma entrada por competência (os descritores, o cenário e as respostas DELA) e o conjunto para o auditor', async () => {
    ok();
    const r = await finalizarFechamentoCore('tr-1', { empresaId: 'emp-1', token: TOKEN, prazoMs: AGORA + 285_000 });
    expect(r.ok).toBe(true);
    const a = h.pontuar.mock.calls[0][0];
    expect(a.porCompetencia.map((e: any) => e.competencia)).toEqual(COMPS);
    expect(a.porCompetencia[2].descritores.map((d: any) => d.descritor)).toEqual(['C-d1', 'C-d2', 'C-d3', 'C-d4', 'C-d5', 'C-d6']);
    expect(a.porCompetencia[2].cenario).toBe('## Caso Comp C\n\ntexto do caso');
    expect(a.porCompetencia[2].resposta).toContain('→ Comp C r4');
    expect(a.porCompetencia[2].resposta).not.toContain('Comp B r1');
    expect(a.porCompetencia[2].evidenciasAcumuladas).toBe('evidências');
    // o conjunto: os 5 cenários, as 20 respostas, os 30 descritores (6 por competência) e o rótulo de sempre (`A + B`)
    expect(a.competencia).toBe(COMPS.join(' + '));
    expect(a.descritores).toHaveLength(30);
    expect(a.cenario.split('### Competência: ').length - 1).toBe(5);
    expect((a.resposta.match(/→ /g) || []).length).toBe(20);
    expect(a.resposta).toContain('### Comp E');
    expect(a.evidenciasAcumuladas).toBe(Array(5).fill('evidências').join('\n\n'));
    expect(a.prazoMs).toBe(AGORA + 285_000);
    // a defesa oral é de CADA competência: a extração dela vai na entrada, e o conjunto não leva uma extração única
    expect(a.evidenciasArguicao).toBeNull();
  });

  it('a arguição de cada competência chega ao scorer na entrada DELA, com a extração mascarada', async () => {
    ok();
    await finalizarFechamentoCore('tr-1', { empresaId: 'emp-1', token: TOKEN, prazoMs: AGORA + 285_000 });
    const a = h.pontuar.mock.calls[0][0];
    for (const [i, e] of a.porCompetencia.entries()) {
      expect(e.evidenciasArguicao.resumo.leitura_geral, COMPS[i]).toBe(`leitura de ${COMPS[i]}`);
      expect(e.evidenciasArguicao.evidencias_por_descritor, COMPS[i]).toHaveLength(1);
      expect(e.evidenciasArguicao.evidencias_por_descritor[0].descritor).toBe(`${COMPS[i].slice(-1)}-d1`);
      // o nome da pessoa não vai à IA: a citação sai mascarada
      expect(e.evidenciasArguicao.evidencias_por_descritor[0].citacao).not.toContain('Helmar');
    }
  });

  it('arguição de um cenário sem concluir, ou concluída sem extração: a entrada dele fica sem extração (sem fusão nele)', async () => {
    h.estado.atual = slotOnb({}, {
      1: { turno: 3, concluida: false, historico: [] },
      3: { turno: 6, concluida: true, historico: [], extracao: null },
      4: null,
    });
    ok();
    await finalizarFechamentoCore('tr-1', { empresaId: 'emp-1', token: TOKEN });
    const a = h.pontuar.mock.calls[0][0];
    expect(a.porCompetencia.map((e: any) => e.evidenciasArguicao?.resumo?.leitura_geral ?? null)).toEqual([
      'leitura de Comp A', null, 'leitura de Comp C', null, null,
    ]);
  });

  it('o slot gravado guarda a arguição de cada cenário (a conversa e a extração ficam no próprio cenário)', async () => {
    ok();
    await finalizarFechamentoCore('tr-1', { empresaId: 'emp-1', token: TOKEN });
    const fb = escritasProgresso().find((e: any) => e.payload.status === 'concluido').payload.feedback;
    expect(fb.cenarios.map((c: any) => c.arguicao?.extracao?.resumo?.leitura_geral)).toEqual(COMPS.map((c) => `leitura de ${c}`));
    expect(fb).not.toHaveProperty('arguicao');
  });

  it('o B pontua os 6 descritores de cada competência (os do Cenário A), não só os 4 selecionados para o conteúdo', async () => {
    ok();
    await finalizarFechamentoCore('tr-1', { empresaId: 'emp-1', token: TOKEN, prazoMs: AGORA + 285_000 });
    const a = h.pontuar.mock.calls[0][0];
    for (const [i, e] of a.porCompetencia.entries()) {
      const L = COMPS[i].slice(-1);
      expect(e.descritores, COMPS[i]).toHaveLength(6);
      expect(e.descritores.map((d: any) => d.descritor)).toEqual([1, 2, 3, 4, 5, 6].map((n) => `${L}-d${n}`));
      // os 4 da trilha chegam como a trilha os guarda; os 2 só do mapeamento, com a nota do mapeamento
      expect(e.descritores[3]).toEqual({ competencia: COMPS[i], descritor: `${L}-d4`, nota_atual: 2.5 });
      expect(e.descritores[4]).toEqual({ competencia: COMPS[i], descritor: `${L}-d5`, nota_atual: 3 });
      expect(e.descritores[5]).toEqual({ competencia: COMPS[i], descritor: `${L}-d6`, nota_atual: 3.5 });
    }
    expect(a.descritores.map((d: any) => d.descritor)).toEqual(a.porCompetencia.flatMap((e: any) => e.descritores.map((d: any) => d.descritor)));
  });

  it('as evidências das semanas são pedidas para os 6 descritores de cada competência', async () => {
    ok();
    await finalizarFechamentoCore('tr-1', { empresaId: 'emp-1', token: TOKEN, prazoMs: AGORA + 285_000 });
    expect(h.evidencias).toHaveBeenCalledTimes(5);
    for (const [i, chamada] of h.evidencias.mock.calls.entries()) {
      expect(chamada[2].map((d: any) => d.descritor), COMPS[i]).toEqual([1, 2, 3, 4, 5, 6].map((n) => `${COMPS[i].slice(-1)}-d${n}`));
    }
  });

  it('o mapeamento não pode ser lido: erro explícito, degradação crítica, NÃO conclui e NÃO paga o scorer', async () => {
    h.sb.falharEm({ tabela: 'descriptor_assessments', op: 'select', mensagem: 'pool esgotado' });
    ok();
    const r = await finalizarFechamentoCore('tr-1', { empresaId: 'emp-1', token: TOKEN });
    expect(r).toMatchObject({ ok: false });
    expect((r as any).erro).toContain('pool esgotado');
    expect(h.pontuar).not.toHaveBeenCalled();
    expect(escritasProgresso().some((e: any) => e.payload.status === 'concluido')).toBe(false);
    expect(escritasProgresso().find((e: any) => e.payload.feedback?.finalizacao?.status === 'erro')).toBeTruthy();
    expect(h.degradacao.mock.calls[0][0]).toMatchObject({ tipo: 'fechamento-scorer-falhou', severidade: 'critico' });
  });

  it('competência sem avaliação no mapeamento: pontua só com os selecionados dela e AVISA no resultado', async () => {
    h.estado.mapeamento = MAPEAMENTO.filter((l) => l.competencia !== 'Comp C');
    ok();
    const r: any = await finalizarFechamentoCore('tr-1', { empresaId: 'emp-1', token: TOKEN });
    expect(r.ok).toBe(true);
    const a = h.pontuar.mock.calls[0][0];
    expect(a.porCompetencia[2].descritores).toHaveLength(4);
    expect(a.porCompetencia[1].descritores).toHaveLength(6);
    expect(r.warnings).toContain('sem avaliação do mapeamento (Cenário A) em: Comp C; pontuadas só com os descritores da trilha');
  });

  it('grava o slot com os cenários, o cenário e a resposta dos cinco juntos, e SEM transcript_completo solto', async () => {
    ok();
    await finalizarFechamentoCore('tr-1', { empresaId: 'emp-1', token: TOKEN, prazoMs: AGORA + 285_000 });
    const concluiu = escritasProgresso().find((e: any) => e.payload.status === 'concluido');
    const fb = concluiu.payload.feedback;
    expect(fb.cenarios).toHaveLength(5);
    expect(fb.cenarios[4].transcript_completo.filter((m: any) => m.role === 'user')).toHaveLength(4);
    expect(fb.cenario.split('### Competência: ').length - 1).toBe(5);
    expect(fb.cenario_resposta).toContain('### Comp B');
    expect(fb.cenario_resposta).toContain('→ Comp B r2'); // as respostas gravadas ficam com o texto real, sem máscara
    expect(fb).not.toHaveProperty('transcript_completo');
    expect(fb.avaliacao_por_descritor).toHaveLength(30);
    expect(fb.finalizacao).toBeUndefined();
    expect(h.report).toHaveBeenCalledWith('tr-1', { empresaId: 'emp-1' });
  });

  it('descritor da trilha sem cenário (competência fora da lista): erro explícito, degradação crítica, NÃO conclui', async () => {
    h.estado.trilha = { ...TRILHA_ONB, descritores_selecionados: [...TRILHA_ONB.descritores_selecionados, { competencia: 'Outra', descritor: 'X-d1' }] };
    ok();
    const r = await finalizarFechamentoCore('tr-1', { empresaId: 'emp-1', token: TOKEN });
    expect(r).toMatchObject({ ok: false });
    expect((r as any).erro).toContain('sem cenário no fechamento');
    expect((r as any).erro).toContain('X-d1');
    expect(h.pontuar).not.toHaveBeenCalled();
    expect(escritasProgresso().some((e: any) => e.payload.status === 'concluido')).toBe(false);
    expect(h.degradacao.mock.calls[0][0]).toMatchObject({ tipo: 'fechamento-scorer-falhou', severidade: 'critico' });
  });

  it('descritores com o mesmo nome em competências diferentes: segue, com aviso no resultado', async () => {
    h.estado.trilha = { ...TRILHA_ONB, descritores_selecionados: [{ competencia: 'Comp A', descritor: 'Escuta' }, { competencia: 'Comp B', descritor: 'Escuta' }, { competencia: 'Comp C', descritor: 'C-d1' }, { competencia: 'Comp D', descritor: 'D-d1' }, { competencia: 'Comp E', descritor: 'E-d1' }] };
    ok();
    const r: any = await finalizarFechamentoCore('tr-1', { empresaId: 'emp-1', token: TOKEN });
    expect(r.ok).toBe(true);
    expect(r.warnings).toContain('descritores com o mesmo nome em competências diferentes: escuta');
  });

  it('o scorer devolve ok:false numa competência: mesmo tratamento do aborto (erro no slot, degradação, sem concluir)', async () => {
    h.pontuar.mockResolvedValue({ ok: false, erro: 'A avaliação automática falhou ao processar a resposta (parse/narrativa inválida) em: Comp D.', meta: { warnings: [], tentativas: 6 } });
    const r = await finalizarFechamentoCore('tr-1', { empresaId: 'emp-1', token: TOKEN });
    expect(r).toMatchObject({ ok: false });
    expect((r as any).erro).toContain('Comp D');
    expect(escritasProgresso().find((e: any) => e.payload.feedback?.finalizacao?.status === 'erro').payload.feedback.cenarios).toHaveLength(5);
    expect(escritasProgresso().some((e: any) => e.payload.status === 'concluido')).toBe(false);
  });

  it('refazer a redação: o rascunho junta uma devolutiva por competência, e o prompt é avisado', async () => {
    h.estado.atual = { ...slotOnb(), status: 'concluido', feedback: {
      cenarios: cenarios({ 2: null, 4: { turno: 6, concluida: true, historico: [], extracao: null } }),
      avaliacao_por_descritor: PARSED_ONB.avaliacao_por_descritor,
      resumo_avaliacao_rascunho: { mensagem_geral: 'Comp A: a\n\nComp B: b' }, redacao_final: { status: 'falhou' },
    } };
    h.redigir.mockResolvedValue({ status: 'reescrita', resumo: { mensagem_geral: 'Helmar, texto novo.' }, tentativas: 1, sanitizacaoAplicada: false, warnings: [] });
    await refazerRedacaoFechamento('tr-1', { empresaId: 'emp-1' });
    expect(h.redigir.mock.calls[0][0].variasCompetencias).toBe(true);
    expect(h.redigir.mock.calls[0][0].competencia).toBe(COMPS.join(' + '));
    // as evidências são as dos descritores PONTUADOS (os 30 gravados), não só os selecionados
    expect(h.evidencias.mock.calls[0][2]).toHaveLength(30);
    // a redação lê as defesas das competências que a tiveram, juntas e com a competência de cada uma
    const arg = h.redigir.mock.calls[0][0].evidenciasArguicao;
    expect(arg.resumo.leitura_geral).toBe('Comp A: leitura de Comp A\n\nComp B: leitura de Comp B\n\nComp D: leitura de Comp D');
    expect(arg.evidencias_por_descritor.map((e: any) => e.competencia)).toEqual(['Comp A', 'Comp B', 'Comp D']);
    expect(JSON.stringify(arg)).not.toContain('Helmar');
  });
});

describe('finalizarFechamentoCore: o fechamento de UMA competência não muda', () => {
  const reservado = () => progHelmar({ finalizacao: { status: 'processando', iniciada_em: TOKEN } });

  it('a pontuação recebe os args de sempre (sem porCompetencia) e o slot guarda o transcript_completo e a resposta agregada', async () => {
    h.estado.atual = reservado();
    h.pontuar.mockResolvedValue({ ok: true, parsed: { ...PARSED }, auditoria: null, meta: { warnings: [], tentativas: 1 } });
    await finalizarFechamentoCore('tr-1', { empresaId: 'emp-1', token: TOKEN });
    const a = h.pontuar.mock.calls[0][0];
    expect(a).not.toHaveProperty('porCompetencia');
    expect(a.descritores).toEqual(TRILHA.descritores_selecionados);
    expect(a.cenario).toBe('## Cenário');
    expect(a.evidenciasAcumuladas).toBe('evidências');
    const fb = escritasProgresso().find((e: any) => e.payload.status === 'concluido').payload.feedback;
    expect(fb.cenario).toBe('## Cenário');
    expect(fb.transcript_completo).toHaveLength(8);
    expect(fb.cenario_resposta).toBe('[SITUAÇÃO] pergunta SITUAÇÃO\n→ r1\n\n[AÇÃO] pergunta AÇÃO\n→ r2\n\n[RACIOCÍNIO] pergunta RACIOCÍNIO\n→ r3\n\n[AUTOSSENSIBILIDADE] pergunta AUTOSSENSIBILIDADE\n→ r4');
    expect(fb).not.toHaveProperty('cenarios');
  });

  it('os 6 descritores do mapeamento NÃO entram numa trilha de uma ou duas competências (quem decide é o slot com `cenarios`)', async () => {
    // a pessoa tem 6 linhas no mapeamento da competência, e o slot é o de sempre: só o selecionado é pontuado
    h.estado.mapeamento = [1, 2, 3, 4, 5, 6].map((n) => ({ competencia: 'Planejamento', descritor: `D${n}`, nota: 1 + n / 4 }));
    h.estado.atual = reservado();
    h.pontuar.mockResolvedValue({ ok: true, parsed: { ...PARSED }, auditoria: null, meta: { warnings: [], tentativas: 1 } });
    await finalizarFechamentoCore('tr-1', { empresaId: 'emp-1', token: TOKEN });
    expect(h.pontuar.mock.calls[0][0].descritores).toEqual([{ descritor: 'D1', competencia: 'Planejamento' }]);
    expect(h.evidencias.mock.calls[0][2]).toEqual([{ descritor: 'D1', competencia: 'Planejamento' }]);
  });

  it('refazer a redação não liga o aviso de várias competências', async () => {
    h.estado.atual = { ...progHelmar({ avaliacao_por_descritor: PARSED.avaliacao_por_descritor, resumo_avaliacao_rascunho: { mensagem_geral: 'r' }, redacao_final: { status: 'falhou' } }), status: 'concluido' };
    h.redigir.mockResolvedValue({ status: 'falhou', resumo: null, tentativas: 2, sanitizacaoAplicada: false, warnings: [] });
    await refazerRedacaoFechamento('tr-1', { empresaId: 'emp-1' });
    expect(h.redigir.mock.calls[0][0]).not.toHaveProperty('variasCompetencias');
    expect(h.evidencias.mock.calls[0][2]).toEqual(TRILHA.descritores_selecionados); // as evidências de sempre: os selecionados
  });
});

describe('o idioma da pessoa chega só à redação final (o scorer e o auditor não o recebem)', () => {
  const reservado = () => progHelmar({ finalizacao: { status: 'processando', iniciada_em: TOKEN } });
  const ok = () => h.pontuar.mockResolvedValue({ ok: true, parsed: { ...PARSED }, auditoria: null, meta: { warnings: [], tentativas: 1 } });

  it('o que a rota resolveu vale: `opts.locale` vai ao `pontuarFechamento`', async () => {
    h.estado.atual = reservado();
    ok();
    await finalizarFechamentoCore('tr-1', { empresaId: 'emp-1', token: TOKEN, locale: 'en-US' });
    expect(h.pontuar.mock.calls[0][0].locale).toBe('en-US');
  });

  it('o script de resgate não passa idioma: o núcleo resolve o da pessoa (colaboradores.locale), com pt-BR de último recurso', async () => {
    h.estado.atual = reservado();
    ok();
    h.estado.locale = 'es-ES';
    await finalizarFechamentoCore('tr-1', { empresaId: 'emp-1', token: TOKEN });
    expect(h.pontuar.mock.calls[0][0].locale).toBe('es-ES');

    h.pontuar.mockClear();
    h.estado.atual = reservado();
    h.estado.locale = null;
    await finalizarFechamentoCore('tr-1', { empresaId: 'emp-1', token: TOKEN });
    expect(h.pontuar.mock.calls[0][0].locale).toBe('pt-BR');
  });

  it('refazer a redação (recuperação) escreve no idioma da pessoa', async () => {
    h.estado.atual = { ...progHelmar({ avaliacao_por_descritor: PARSED.avaliacao_por_descritor, resumo_avaliacao_rascunho: { mensagem_geral: 'r' }, redacao_final: { status: 'falhou' } }), status: 'concluido' };
    h.estado.locale = 'pt-PT';
    h.redigir.mockResolvedValue({ status: 'falhou', resumo: null, tentativas: 2, sanitizacaoAplicada: false, warnings: [] });
    await refazerRedacaoFechamento('tr-1', { empresaId: 'emp-1' });
    expect(h.redigir.mock.calls[0][0].locale).toBe('pt-PT');
  });
});
