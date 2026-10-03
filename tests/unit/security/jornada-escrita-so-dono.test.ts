import { describe, it, expect, vi, beforeEach } from 'vitest';
import { criarSupabaseMock } from '../../helpers/supabase-mock';

/**
 * R-72 (03/10/2026): as rotas que ESCREVEM na jornada autorizavam com a régua
 * de LEITURA (`assertColabAccess`), que libera o RH da empresa e o gestor da
 * área. Com ela, RH e gestor podiam responder as Evidências no lugar do
 * liderado, escolher a missão, perguntar no Tira-Dúvidas, abrir o Cenário B,
 * conduzir a arguição e disparar a nota final.
 *
 * Aqui a régua de leitura é simulada como APROVADA (é o caso real: mesma
 * empresa, mesma área), para provar que quem barra é a régua de posse, e que
 * a barreira vem ANTES de qualquer escrita e de qualquer IA paga.
 */

const h = vi.hoisted(() => ({
  sb: null as any,
  auth: null as any,
  prog: null as any,
  callAI: vi.fn(),
  callAIChat: vi.fn(),
  reservar: vi.fn(),
  report: vi.fn(),
}));

vi.mock('next/server', async (orig) => ({ ...(await orig<any>()), after: vi.fn() }));
vi.mock('@/lib/csrf', () => ({ csrfCheck: () => null }));
vi.mock('@/lib/rate-limit', () => ({ aiLimiter: { check: async () => null } }));
vi.mock('@/lib/auth/request-context', () => ({
  requireUser: async () => h.auth,
  // Leitura aprovada de propósito: RH e gestor da área LEEM a jornada.
  assertColabAccess: async () => null,
}));
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => h.sb.client }));
vi.mock('@/actions/ai-client', () => ({ callAI: h.callAI, callAIChat: h.callAIChat }));
vi.mock('@/lib/execucao-contexto', () => ({ comContexto: (_c: any, fn: any) => fn() }));
vi.mock('@/lib/rag', () => ({ retrieveContext: async () => [], formatGroundingBlock: () => '' }));
vi.mock('@/lib/season-engine/trilha-runtime', async () => {
  const { PROGRAMA_REGULAR_DUO } = await import('@/lib/season-engine/programa-config');
  return {
    resolverConfigDaTrilha: async () => ({
      ...PROGRAMA_REGULAR_DUO, modo: 'regular', semanas: 9, semanaAcumulada: 8, semanaCenarioB: 9,
      arguicao: { ativa: true, maxTurnos: 8 },
    }),
    checarGatesSemana: async () => null,
    gateAcumuladaPiloto: () => ({ pronto: true, redisparar: false }),
    qualitativaDoPlano: () => null,
  };
});
vi.mock('@/lib/season-engine/fechamento-core', () => ({
  reservarFinalizacao: h.reservar,
  finalizarFechamentoCore: vi.fn(),
}));
vi.mock('@/lib/season-engine/evolution-report-core', () => ({ gerarEvolutionReportCore: h.report }));

import { POST as reflection } from '@/app/api/temporada/reflection/route';
import { POST as evaluation } from '@/app/api/temporada/evaluation/route';
import { POST as missao } from '@/app/api/temporada/missao/route';
import { POST as tiraDuvidas } from '@/app/api/temporada/tira-duvidas/route';

const DONO = 'col-dono';
const TRILHA = {
  id: 'tr-1', colaborador_id: DONO, empresa_id: 'emp-1', competencia_foco: 'Planejamento',
  competencias_foco: ['Planejamento'], descritores_selecionados: [{ descritor: 'D1', competencia: 'Planejamento' }],
  temporada_plano: [
    { semana: 1, tipo: 'conteudo', competencia: 'Planejamento', descritor: 'D1' },
    { semana: 4, tipo: 'aplicacao', competencia: 'Planejamento', descritores_cobertos: ['D1'] },
  ],
  data_inicio: '2026-07-01', programa_modo: 'regular', programa_config: {},
};

const sessao = (role: string, extra: any = {}) => ({
  email: `${role}@escola.br`, empresaId: 'emp-1', role, isPlatformAdmin: false,
  colaborador: { id: `col-${role}`, empresa_id: 'emp-1', area_depto: 'Pedagógico' },
  ...extra,
});

const req = (rota: string, body: any) => new Request(`http://escola.vertho.ai/api/temporada/${rota}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trilhaId: 'tr-1', ...body }),
});

const ESCRITAS: Array<[string, (b: any) => Promise<Response>, any]> = [
  ['Evidências (reflexão)', reflection, { semana: 1, action: 'send', message: 'respondo por ela' }],
  ['abertura da conversa (init)', reflection, { semana: 1, action: 'init' }],
  ['Tira-Dúvidas', tiraDuvidas, { semana: 1, message: 'pergunta' }],
  ['missão', missao, { semana: 4, modo: 'pratica', compromisso: 'escolho por ela' }],
  ['resposta do Cenário B', evaluation, { semana: 9, action: 'send', message: 'resposta' }],
  ['abertura do Cenário B', evaluation, { semana: 9, action: 'init' }],
  ['arguição', evaluation, { semana: 9, action: 'arguir', message: 'defendo por ela' }],
  ['finalizar (nota)', evaluation, { semana: 9, action: 'finalizar' }],
  ['relatório de evolução', evaluation, { semana: 9, action: 'generate_report' }],
];

beforeEach(() => {
  for (const f of [h.callAI, h.callAIChat, h.reservar, h.report]) f.mockReset();
  h.prog = { id: 'p1', empresa_id: 'emp-1', conteudo_consumido: true, feedback: {}, reflexao: { transcript_completo: [] } };
  h.sb = criarSupabaseMock({
    resolver: (tabela) => {
      if (tabela === 'trilhas') return TRILHA;
      if (tabela === 'colaboradores') return { nome_completo: 'Dona da Trilha', cargo: 'Professora', perfil_dominante: 'S' };
      if (tabela === 'temporada_semana_progresso') return h.prog;
      return null;
    },
  });
});

describe.each([
  ['RH', () => sessao('rh')],
  ['gestor da mesma área', () => sessao('gestor')],
])('%s não escreve na jornada de outra pessoa', (_quem, montar) => {
  it.each(ESCRITAS)('%s → 403, sem escrita e sem IA', async (_acao, rota, body) => {
    h.auth = montar();
    const res = await rota(req('x', body));
    expect(res.status).toBe(403);
    expect(h.sb.escritas).toHaveLength(0);
    expect(h.callAI).not.toHaveBeenCalled();
    expect(h.callAIChat).not.toHaveBeenCalled();
    expect(h.reservar).not.toHaveBeenCalled();
    expect(h.report).not.toHaveBeenCalled();
  });
});

describe('a leitura continua aberta a quem acompanha', () => {
  it('RH lê o andamento da pontuação (fechamento_status)', async () => {
    h.auth = sessao('rh');
    h.prog = { id: 'p9', status: 'em_andamento', feedback: { cenario: 'c', perguntas: [] } };
    const res = await evaluation(req('evaluation', { semana: 9, action: 'fechamento_status' }));
    expect(res.status).toBe(200);
    expect(h.sb.escritas).toHaveLength(0);
  });

  it('gestor lê o status da acumulada (status)', async () => {
    h.auth = sessao('gestor');
    const res = await evaluation(req('evaluation', { semana: 9, action: 'status' }));
    expect(res.status).toBe(200);
  });
});

describe('a dona da trilha escreve', () => {
  it('a própria pessoa passa da régua de posse (missão gravada)', async () => {
    h.auth = sessao('colaborador', { colaborador: { id: DONO, empresa_id: 'emp-1' } });
    const res = await missao(req('missao', { semana: 4, modo: 'pratica', compromisso: 'vou aplicar na segunda' }));
    expect(res.status).toBe(200);
    expect(h.sb.escritas.some((e: any) => e.tabela === 'temporada_semana_progresso')).toBe(true);
  });

  it('platform admin segue como exceção (a mesma de assertColabAccess hoje)', async () => {
    h.auth = sessao('rh', { isPlatformAdmin: true, colaborador: null });
    const res = await missao(req('missao', { semana: 4, modo: 'cenario' }));
    expect(res.status).toBe(200);
  });
});
