import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bancoEmMemoria, type Tabelas } from '../../helpers/tabelas-em-memoria';

/**
 * R-82 (revisão de 02/10/2026): a ESCADA de regeneração até nota 80 (Sonnet com
 * feedback, GPT do zero auditado pelo Sonnet, Opus com feedback) só rodava no
 * LOTE; o modo "Agora" da tela repetia 3 vezes o 1º degrau. Agora a tela anda a
 * mesma escada, uma rodada por request (`regenerarCenarioNaEscada`), e cada
 * rodada aplica a régua do degrau: trava "nunca piora" com o auditor da task, e
 * "só vale se >= 80 na régua dele" com auditor próprio.
 */

let tabelas: Tabelas;
let sb: ReturnType<typeof bancoEmMemoria>;
const ia = { notaCheck: 0, chamadas: [] as Array<{ user: string; model?: string; task?: string }> };

function montar(cen: Record<string, any> = {}) {
  tabelas = {
    empresas: [{ id: 'emp', nome: 'Empresa', segmento: 'educacao', ppp_texto: null }],
    competencias: [{ id: 'c-1', empresa_id: 'emp', nome: 'Comunicação', cod_comp: 'C1', pilar: null, descricao: null, cargo: 'Professor' }],
    cargos_empresa: [{ empresa_id: 'emp', nome: 'Professor' }],
    banco_cenarios: [{
      id: 'cen-1', empresa_id: 'emp', cargo: 'Professor', competencia_id: 'c-1', ppp_escola_id: null,
      titulo: 'Título antigo', descricao: 'Contexto antigo', alternativas: {}, nota_check: 60,
      justificativa_check: 'JUSTIFICATIVA-DO-CAMPEAO', sugestao_check: null, alertas_check: {}, ...cen,
    }],
  };
  sb = bancoEmMemoria(tabelas);
}

vi.mock('@/lib/tenant-db', () => ({ tenantDb: () => sb.client }));
vi.mock('@/lib/admin-supabase', () => ({
  requireAdminSupabase: vi.fn(async () => sb.client),
  requireEmpresaSupabase: vi.fn(async () => sb.client),
  requireLinhaSupabase: vi.fn(),
}));
vi.mock('@/lib/auth/action-context', () => ({ requireAdminAction: vi.fn(async () => ({})) }));
vi.mock('@/lib/ia2-gabarito', () => ({
  buscarContextoPPP: vi.fn(async () => ''), buscarValores: vi.fn(async () => []),
  carregarContextoIA2: vi.fn(), montarPromptIA2: vi.fn(), validarGabaritoIA2: vi.fn(),
  persistirGabaritoIA2: vi.fn(), gerarGabaritosIA2Core: vi.fn(),
}));
vi.mock('@/lib/matriz-por-cargo', async (orig) => ({
  ...(await orig<typeof import('@/lib/matriz-por-cargo')>()),
  buscarDescritoresDaCompetencia: vi.fn(async () => []),
}));
vi.mock('@/lib/ai-tasks', async (orig) => ({
  ...(await orig<typeof import('@/lib/ai-tasks')>()),
  getModelForTask: vi.fn(async (_e: string, task: string) => (task === 'ia3_check' ? 'gpt-5.6-terra' : 'claude-sonnet-5-5')),
}));
vi.mock('@/actions/utils', () => ({ extractJSON: vi.fn(async (t: string) => JSON.parse(t)) }));
vi.mock('@/actions/ai-client', () => ({
  callAI: vi.fn(async (_s: string, user: string, cfg: any, _max: number, opts: any) => {
    ia.chamadas.push({ user, model: cfg?.model, task: opts?.taskKey });
    if (opts?.taskKey === 'ia3_check') return JSON.stringify({ nota: ia.notaCheck, justificativa: 'nova' });
    return JSON.stringify({
      cenario: { titulo: 'Título novo', contexto: 'Contexto novo' },
      perguntas: [1, 2, 3, 4].map((n) => ({ numero: n, texto: `P${n}`, descritores_primarios: [] })),
    });
  }),
}));

import { passoDaEscadaIA3, regenerarCenarioIA3ComTrava, ESCADA_IA3 } from '@/lib/ia3-cenarios';
import { regenerarCenarioNaEscada } from '@/actions/fase1';

const degrau = (id: string) => ESCADA_IA3.find((d) => d.id === id)!;
const cenarioAtual = () => tabelas.banco_cenarios[0];

beforeEach(() => {
  montar();
  ia.notaCheck = 0;
  ia.chamadas = [];
});

describe('passoDaEscadaIA3: a escada do lote achatada em rodadas', () => {
  it('8 passos: 3 Sonnet com feedback, 3 GPT do zero, 2 Opus; fora disso, acabou', () => {
    const ids = Array.from({ length: 8 }, (_, i) => passoDaEscadaIA3(i)!.degrau.id);
    expect(ids).toEqual(['sonnet-feedback', 'sonnet-feedback', 'sonnet-feedback', 'gpt-do-zero', 'gpt-do-zero', 'gpt-do-zero', 'opus-feedback', 'opus-feedback']);
    expect(passoDaEscadaIA3(0)!.total).toBe(8);
    expect(passoDaEscadaIA3(8)).toBeNull();
    expect(passoDaEscadaIA3(-1)).toBeNull();
    expect(passoDaEscadaIA3(1.5)).toBeNull();
  });
});

describe('regenerarCenarioIA3ComTrava com degrau', () => {
  it('auditor próprio (GPT auditado pelo Sonnet): 75 > 60 atual NÃO promove, porque não chega a 80 na régua dele', async () => {
    ia.notaCheck = 75;
    const r = await regenerarCenarioIA3ComTrava(sb.client, { cenarioId: 'cen-1', degrau: degrau('gpt-do-zero') });
    expect(r).toMatchObject({ success: true, aplicado: false });
    expect(cenarioAtual().titulo).toBe('Título antigo');
  });

  it('auditor próprio com 82: promove', async () => {
    ia.notaCheck = 82;
    const r = await regenerarCenarioIA3ComTrava(sb.client, { cenarioId: 'cen-1', degrau: degrau('gpt-do-zero') });
    expect(r).toMatchObject({ success: true, aplicado: true, nota: 82 });
    expect(cenarioAtual().titulo).toBe('Título novo');
  });

  it('degrau do zero: gerador do degrau, SEM o feedback do campeão; auditor do degrau', async () => {
    ia.notaCheck = 50;
    await regenerarCenarioIA3ComTrava(sb.client, { cenarioId: 'cen-1', degrau: degrau('gpt-do-zero') });
    const geracao = ia.chamadas.find((c) => c.task === 'ia3_cenarios')!;
    const check = ia.chamadas.find((c) => c.task === 'ia3_check')!;
    expect(geracao.model).toBe('gpt-6.1-sol');
    expect(geracao.user).not.toContain('JUSTIFICATIVA-DO-CAMPEAO');
    expect(check.model).toBe(degrau('gpt-do-zero').auditor);
  });

  it('degrau com feedback e auditor da task: a trava "nunca piora" (65 > 60 promove; 55 não)', async () => {
    ia.notaCheck = 55;
    expect(await regenerarCenarioIA3ComTrava(sb.client, { cenarioId: 'cen-1', degrau: degrau('sonnet-feedback') })).toMatchObject({ aplicado: false });
    expect(ia.chamadas.find((c) => c.task === 'ia3_cenarios')!.user).toContain('JUSTIFICATIVA-DO-CAMPEAO');
    ia.notaCheck = 65;
    expect(await regenerarCenarioIA3ComTrava(sb.client, { cenarioId: 'cen-1', degrau: degrau('sonnet-feedback') })).toMatchObject({ aplicado: true, nota: 65 });
  });
});

describe('regenerarCenarioNaEscada (a action do modo "Agora")', () => {
  it('cada passo roda o degrau certo e o último diz fim', async () => {
    ia.notaCheck = 50;
    const p0 = await regenerarCenarioNaEscada('cen-1', 0);
    expect(p0).toMatchObject({ degrau: 'sonnet-feedback', fim: false, totalPassos: 8 });
    const p3 = await regenerarCenarioNaEscada('cen-1', 3);
    expect(p3).toMatchObject({ degrau: 'gpt-do-zero', fim: false });
    const p7 = await regenerarCenarioNaEscada('cen-1', 7);
    expect(p7).toMatchObject({ degrau: 'opus-feedback', fim: true });
    const fora = await regenerarCenarioNaEscada('cen-1', 8);
    expect(fora).toMatchObject({ fim: true, aplicado: false });
  });

  it('exceção numa rodada (sessão caída) também diz se a escada acabou: a tela não fica presa no laço', async () => {
    const { requireAdminSupabase } = await import('@/lib/admin-supabase');
    vi.mocked(requireAdminSupabase).mockRejectedValueOnce(new Error('sem sessão'));
    expect(await regenerarCenarioNaEscada('cen-1', 4)).toMatchObject({ success: false, fim: false });
    vi.mocked(requireAdminSupabase).mockRejectedValueOnce(new Error('sem sessão'));
    expect(await regenerarCenarioNaEscada('cen-1', 7)).toMatchObject({ success: false, fim: true });
  });
});
