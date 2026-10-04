import { describe, it, expect, vi, beforeEach } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * `/api/temporada/evaluation` serve TODAS as perguntas do Cenário B (R-21, 04/10/2026).
 *
 * A rota lia só `p1..p4` (uma lista fixa de rótulos). O integrador do Onboarding tem
 * uma pergunta POR COMPETÊNCIA (5), e a 5ª nunca chegaria à pessoa: a avaliação final
 * mediria 4 das 5 competências, sem erro nenhum na tela. A dimensão de cada pergunta
 * do integrador é o nome da competência, que é o que o scorer lê junto da resposta.
 */

const h = vi.hoisted(() => ({
  sb: null as any,
  prog: null as any,
  config: null as any,
  after: vi.fn(),
  reservar: vi.fn(),
  finalizar: vi.fn(),
  abrir: vi.fn(),
  bRows: [] as any[],
}));

vi.mock('next/server', async (orig) => ({ ...(await orig<any>()), after: h.after }));
vi.mock('@/lib/csrf', () => ({ csrfCheck: () => null }));
vi.mock('@/lib/rate-limit', () => ({ aiLimiter: { check: async () => null } }));
vi.mock('@/lib/auth/request-context', () => ({
  requireUser: async () => ({ email: 'ana@acme.br', empresaId: 'emp-1', role: 'colaborador', isPlatformAdmin: false, colaborador: { id: 'col-1' } }),
  assertColabAccess: async () => null,
}));
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => h.sb.client }));
vi.mock('@/actions/ai-client', () => ({ callAI: vi.fn(), callAIChat: vi.fn() }));
vi.mock('@/lib/execucao-contexto', () => ({ comContexto: (_c: any, fn: any) => fn() }));
vi.mock('@/lib/degradacao', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/degradacao')>();
  return { ...mod, registrarDegradacao: vi.fn(async () => {}) };
});
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
  turnoArguicao: vi.fn(),
  extrairEvidenciasArguicao: vi.fn(),
}));

import { POST } from '@/app/api/temporada/evaluation/route';
import { PROGRAMA_ONBOARDING } from '@/lib/season-engine/programa-config';
import { montarDadosCenarioBIntegrador, normalizarCenarioBIntegrador } from '@/lib/cenario-b-integrador';

const COMPS = ['Comunicação', 'Planejamento', 'Liderança de Equipes', 'Gestão do Tempo', 'Resiliência'];

function integrador() {
  const dados = {
    titulo: 'A entrega que mudou de dono',
    descricao: `Na sexta-feira a coordenadora Marina avisa que a entrega passou para o seu time. ${Array.from({ length: 80 }, (_, i) => `texto${i}`).join(' ')}`,
    perguntas: COMPS.map((c) => ({ competencia: c, pergunta: `Pergunta sobre ${c}?` })),
  };
  const r: any = normalizarCenarioBIntegrador(dados, COMPS, []);
  return { id: 'b-int', created_at: '2026-10-04T00:00:00Z', ...montarDadosCenarioBIntegrador('Analista', COMPS, r.cenario) };
}

const TRILHA = {
  id: 'tr-1', colaborador_id: 'col-1', empresa_id: 'emp-1', competencia_foco: COMPS[0],
  competencias_foco: COMPS, temporada_plano: [], descritores_selecionados: COMPS.map((c) => ({ descritor: `D de ${c}`, competencia: c })),
  data_inicio: '2026-07-01', programa_modo: 'onboarding', programa_config: {},
};

const req = (body: any) => new Request('http://acme.vertho.ai/api/temporada/evaluation', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trilhaId: 'tr-1', semana: 9, ...body }),
});
const escritasProgresso = () => h.sb.escritas.filter((e: any) => e.tabela === 'temporada_semana_progresso');

beforeEach(() => {
  for (const f of [h.after, h.reservar, h.finalizar, h.abrir]) f.mockReset();
  h.reservar.mockResolvedValue({ ok: true, token: '2026-10-04T15:00:00.000Z' });
  h.finalizar.mockResolvedValue({ ok: true });
  h.config = { ...PROGRAMA_ONBOARDING, semanaCenarioB: 9, semanaAcumulada: 8, arguicao: { ativa: true, maxTurnos: 6 } };
  h.prog = null;
  h.bRows = [integrador()];
  h.sb = criarSupabaseMock({
    resolver: (tabela) => {
      if (tabela === 'trilhas') return TRILHA;
      if (tabela === 'colaboradores') return { nome_completo: 'Ana Souza', cargo: 'Analista', perfil_dominante: 'S' };
      if (tabela === 'temporada_semana_progresso') return h.prog;
      return null;
    },
    lista: (tabela) => (tabela === 'banco_cenarios' ? h.bRows : []),
  });
});

describe('init do fechamento do Onboarding', () => {
  it('serve as 5 perguntas do integrador, cada uma com a competência como dimensão, e grava as 5 no slot', async () => {
    const res = await POST(req({ action: 'init' }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.cenario_b_id).toBe('b-int');
    expect(body.perguntas).toHaveLength(5);
    expect(body.perguntas.map((p: any) => p.dimensao)).toEqual(COMPS);
    expect(body.perguntas[4]).toEqual({ dimensao: 'Resiliência', texto: 'Pergunta sobre Resiliência?' });
    expect(body.cenario).toContain('A entrega que mudou de dono');

    const [w] = escritasProgresso();
    expect(w.payload.feedback.perguntas).toHaveLength(5);
    expect(w.payload.feedback.cenario_b_id).toBe('b-int');
  });

  it('sem o integrador, o fechamento do Onboarding responde 424 (e não serve o B de uma competência)', async () => {
    h.bRows = COMPS.map((_, i) => ({ id: `b-${i}`, titulo: 't', descricao: 'd', cargo: 'Analista', competencia_id: `cp-${i}`, created_at: '2026-09-01T00:00:00Z', alternativas: { p1: 'x?', p2: 'y?', p3: 'z?', p4: 'w?' } }));
    const res = await POST(req({ action: 'init' }));
    expect(res.status).toBe(424);
    expect((await res.json()).error).toContain('Cenário B não cadastrado');
    expect(escritasProgresso()).toHaveLength(0);
  });

  it('um B de 4 perguntas (célula ou integrador antigo) continua servindo as 4 de sempre, com os mesmos rótulos', async () => {
    h.config = { ...h.config, programa_modo: 'jornada' };
    h.bRows = [{ id: 'b-1', titulo: 'Caso', descricao: 'Texto', cargo: 'Analista', competencia_id: null, created_at: '2026-09-01T00:00:00Z', alternativas: { p1: 'a?', p2: 'b?', p3: 'c?', p4: 'd?', competencias_integradas: COMPS } }];
    const res = await POST(req({ action: 'init' }));
    const body = await res.json();
    expect(body.perguntas.map((p: any) => p.dimensao)).toEqual(['SITUAÇÃO', 'AÇÃO', 'RACIOCÍNIO', 'AUTOSSENSIBILIDADE']);
  });
});

describe('send com 5 perguntas', () => {
  const PERGUNTAS = COMPS.map((c) => ({ dimensao: c, texto: `Pergunta sobre ${c}?` }));
  const transcript = (respondidas: number) => {
    const t: any[] = [{ role: 'assistant', content: `**${COMPS[0]}**` }];
    for (let i = 0; i < respondidas; i++) {
      t.push({ role: 'user', content: `resposta ${i + 1}` });
      if (i < 4) t.push({ role: 'assistant', content: `**${COMPS[i + 1]}**` });
    }
    return t;
  };

  it('a 4ª resposta NÃO fecha: serve a 5ª pergunta (a competência que antes ficava sem evidência)', async () => {
    h.prog = { id: 'p9', status: 'em_andamento', feedback: { cenario: '## C', perguntas: PERGUNTAS, transcript_completo: transcript(3) } };
    const res = await POST(req({ action: 'send', message: 'resposta 4' }));
    const body = await res.json();
    expect(body).toMatchObject({ finished: false, dimensao: 'Resiliência' });
    expect(body.message).toContain('Pergunta sobre Resiliência?');
    expect(h.abrir).not.toHaveBeenCalled();
    expect(h.reservar).not.toHaveBeenCalled();
  });

  it('a 5ª resposta fecha: abre a arguição (arguição ligada no Onboarding)', async () => {
    h.prog = { id: 'p9', status: 'em_andamento', feedback: { cenario: '## C', perguntas: PERGUNTAS, transcript_completo: transcript(4) } };
    h.abrir.mockResolvedValue({ estado: { turno: 1, concluida: false, historico: [] }, reply: 'Vamos conversar.' });
    const res = await POST(req({ action: 'send', message: 'resposta 5' }));
    expect((await res.json()).arguindo).toBe(true);
    const [w] = escritasProgresso();
    expect(w.payload.feedback.transcript_completo.filter((m: any) => m.role === 'user')).toHaveLength(5);
  });
});
