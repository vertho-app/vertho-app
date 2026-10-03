import { describe, it, expect, vi, beforeEach } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * R-137 (03/10/2026): o relatório que falha DEPOIS da nota.
 *
 * A nota do fechamento é gravada antes do Relatório de Evolução, e é o
 * relatório que conclui a trilha (e dispara o encadeamento). Se ele falhava:
 * só um `console.warn`, a semana concluída e a trilha ativa, e a pessoa via
 * "Avaliação concluída" com um "Ver relatório" que abria "Temporada ainda não
 * concluída". Uma nova chamada respondia "avaliado" sem refazer nada. A rota
 * tinha `generate_report`, sem nenhum consumidor na tela.
 *
 * Agora: `estadoDoRelatorio` distingue gerando / falhou / pronto, o
 * `fechamento_status` o devolve, e `generate_report` RETOMA só no `falhou`.
 */

const h = vi.hoisted(() => ({
  sb: null as any,
  trilha: null as any,
  progFinal: null as any,
  after: vi.fn(),
  report: vi.fn(),
  degradacao: vi.fn(),
}));

vi.mock('next/server', async (orig) => ({ ...(await orig<any>()), after: h.after }));
vi.mock('@/lib/csrf', () => ({ csrfCheck: () => null }));
vi.mock('@/lib/rate-limit', () => ({ aiLimiter: { check: async () => null } }));
vi.mock('@/lib/auth/request-context', () => ({
  requireUser: async () => ({ email: 'maria@escola.br', empresaId: 'emp-1', role: 'colaborador', isPlatformAdmin: false, colaborador: { id: 'col-1' } }),
  assertColabAccess: async () => null,
}));
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => h.sb.client }));
vi.mock('@/actions/ai-client', () => ({ callAI: vi.fn(), callAIChat: vi.fn() }));
vi.mock('@/lib/execucao-contexto', () => ({ comContexto: (_c: any, fn: any) => fn() }));
vi.mock('@/lib/season-engine/trilha-runtime', async () => {
  const { PROGRAMA_JORNADA } = await import('@/lib/season-engine/programa-config');
  return {
    resolverConfigDaTrilha: async () => PROGRAMA_JORNADA,
    checarGatesSemana: async () => null,
    gateAcumuladaPiloto: () => ({ pronto: true, redisparar: false }),
    qualitativaDoPlano: () => null,
  };
});
vi.mock('@/lib/season-engine/fechamento-core', () => ({ reservarFinalizacao: vi.fn(), finalizarFechamentoCore: vi.fn() }));
vi.mock('@/lib/season-engine/evolution-report-core', () => ({ gerarEvolutionReportCore: h.report }));
vi.mock('@/lib/degradacao', () => ({
  registrarDegradacao: h.degradacao,
  DEGRADACAO: { FECHAMENTO_RELATORIO_FALHOU: 'fechamento-relatorio-falhou' },
}));

import { estadoDoRelatorio, RELATORIO_JANELA_MS } from '@/lib/season-engine/estado-fechamento';
import { POST } from '@/app/api/temporada/evaluation/route';

const AGORA = Date.parse('2026-11-12T15:00:00Z');
const HA = (ms: number) => new Date(AGORA - ms).toISOString();

describe('estadoDoRelatorio', () => {
  const base = { statusSemana: 'concluido', trilhaStatus: 'ativa' };
  it('trilha concluída → pronto (o relatório é o ato que a conclui)', () => {
    expect(estadoDoRelatorio({ ...base, trilhaStatus: 'concluida', concluidoEm: HA(1000) }, AGORA)).toBe('pronto');
  });
  it('nota gravada há pouco, trilha aberta → gerando (o fechamento ainda roda)', () => {
    expect(estadoDoRelatorio({ ...base, concluidoEm: HA(5_000) }, AGORA)).toBe('gerando');
  });
  it('janela vencida, trilha aberta → falhou (retome)', () => {
    expect(estadoDoRelatorio({ ...base, concluidoEm: HA(RELATORIO_JANELA_MS + 1) }, AGORA)).toBe('falhou');
  });
  it('sem carimbo legível → falhou (retomar é idempotente)', () => {
    expect(estadoDoRelatorio({ ...base, concluidoEm: null }, AGORA)).toBe('falhou');
  });
  it('Cenário B ainda aberto → nao-avaliado', () => {
    expect(estadoDoRelatorio({ ...base, statusSemana: 'em_andamento', concluidoEm: null }, AGORA)).toBe('nao-avaliado');
  });
  it('trilha arquivada ou pausada não se retoma (gerar o relatório a CONCLUIRIA)', () => {
    expect(estadoDoRelatorio({ ...base, trilhaStatus: 'arquivada', concluidoEm: HA(RELATORIO_JANELA_MS * 2) }, AGORA)).toBe('nao-avaliado');
    expect(estadoDoRelatorio({ ...base, trilhaStatus: 'pausada', concluidoEm: HA(RELATORIO_JANELA_MS * 2) }, AGORA)).toBe('nao-avaliado');
  });
});

const TRILHA = {
  id: 'tr-1', colaborador_id: 'col-1', empresa_id: 'emp-1', status: 'ativa', competencia_foco: 'Planejamento',
  competencias_foco: ['Planejamento'], temporada_plano: [], descritores_selecionados: [],
  data_inicio: '2026-09-28', programa_modo: 'jornada', programa_config: null,
};

const req = (body: any) => new Request('http://escola.vertho.ai/api/temporada/evaluation', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trilhaId: 'tr-1', semana: 7, ...body }),
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(AGORA));
  for (const f of [h.after, h.report, h.degradacao]) f.mockReset();
  h.report.mockResolvedValue({ success: true });
  h.trilha = { ...TRILHA };
  h.progFinal = { id: 'p7', status: 'concluido', concluido_em: HA(10 * 60_000), feedback: { nota_media_pos: 2.5, resumo_avaliacao: {} } };
  h.sb = criarSupabaseMock({
    resolver: (tabela) => {
      if (tabela === 'trilhas') return h.trilha;
      if (tabela === 'colaboradores') return { nome_completo: 'Maria Souza', cargo: 'Professora', perfil_dominante: 'S' };
      if (tabela === 'temporada_semana_progresso') return h.progFinal;
      return null;
    },
  });
});

/** Roda o que a rota agendou em `after()`. */
const rodarAfter = async () => { for (const [fn] of h.after.mock.calls) await fn(); };

describe('generate_report: a retomada', () => {
  it('🔴 relatório que falhou (nota gravada há 10 min, trilha aberta): agenda a geração e responde 202', async () => {
    const res = await POST(req({ action: 'generate_report' }));
    expect(res.status).toBe(202);
    expect((await res.json()).relatorio).toBe('gerando');
    expect(h.after).toHaveBeenCalledTimes(1);
    expect(h.report).not.toHaveBeenCalled(); // fora do request
    await rodarAfter();
    // O tenant passado é o da SESSÃO (B5), nunca o do corpo.
    expect(h.report).toHaveBeenCalledWith('tr-1', { empresaId: 'emp-1' });
  });

  it('dentro da janela do fechamento: NÃO gera em paralelo', async () => {
    h.progFinal = { ...h.progFinal, concluido_em: HA(5_000) };
    const res = await POST(req({ action: 'generate_report' }));
    expect(res.status).toBe(200);
    expect((await res.json()).relatorio).toBe('gerando');
    expect(h.after).not.toHaveBeenCalled();
  });

  it('trilha já concluída: nada a refazer (não reescreve o relatório nem reencadeia)', async () => {
    h.trilha = { ...TRILHA, status: 'concluida' };
    const res = await POST(req({ action: 'generate_report' }));
    expect((await res.json()).relatorio).toBe('pronto');
    expect(h.after).not.toHaveBeenCalled();
  });

  it('avaliação final não concluída: 409, sem gerar', async () => {
    h.progFinal = { id: 'p7', status: 'em_andamento', feedback: {} };
    const res = await POST(req({ action: 'generate_report' }));
    expect(res.status).toBe(409);
    expect(h.after).not.toHaveBeenCalled();
  });

  it('a retomada que falha de novo vira degradação CRÍTICA, não só log', async () => {
    h.report.mockResolvedValue({ success: false, error: 'falha ao gravar o relatório' });
    await POST(req({ action: 'generate_report' }));
    await rodarAfter();
    expect(h.degradacao).toHaveBeenCalledWith(expect.objectContaining({
      tipo: 'fechamento-relatorio-falhou', chave: 'tr-1', severidade: 'critico',
    }));
  });

  it('falha ao ler a trilha é 500, não 404 ("trilha não existe")', async () => {
    h.sb.falharEm({ tabela: 'trilhas', op: 'select', mensagem: 'timeout no pool' });
    const res = await POST(req({ action: 'generate_report' }));
    expect(res.status).toBe(500);
  });
});

describe('fechamento_status devolve o estado do relatório', () => {
  it('avaliado com a trilha aberta e a janela vencida → relatorio "falhou"', async () => {
    const res = await POST(req({ action: 'fechamento_status' }));
    const s = await res.json();
    expect(s.estado).toBe('avaliado');
    expect(s.relatorio).toBe('falhou');
  });

  it('avaliado com a trilha concluída → relatorio "pronto"', async () => {
    h.trilha = { ...TRILHA, status: 'concluida' };
    const s = await (await POST(req({ action: 'fechamento_status' }))).json();
    expect(s.relatorio).toBe('pronto');
  });

  it('ainda respondendo → sem estado de relatório', async () => {
    h.progFinal = { id: 'p7', status: 'em_andamento', feedback: { cenario: 'c', perguntas: [{ texto: 'p' }], transcript_completo: [] } };
    const s = await (await POST(req({ action: 'fechamento_status' }))).json();
    expect(s.relatorio).toBeNull();
  });
});
