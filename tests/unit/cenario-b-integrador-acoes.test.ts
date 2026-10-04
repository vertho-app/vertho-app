import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * As actions do Cenário B integrador (R-21, 04/10/2026) e o que elas mudam nas
 * actions do B por célula.
 *
 * Num arquivo `'use server'` todo export é endpoint e todo parâmetro é escolhido
 * pelo CLIENTE: o cargo e as competências do alvo, o modelo e o `substituir` chegam
 * de fora. O servidor só gera para um alvo que ele mesmo resolve para o Onboarding da
 * empresa, e só repassa ao gerador o que é da geração.
 */

const h = vi.hoisted(() => ({
  sbRaw: null as any,
  tdb: null as any,
  listar: vi.fn(),
  gerar: vi.fn(),
  callAI: vi.fn(),
  gate: vi.fn(),
}));

vi.mock('@/lib/admin-supabase', () => ({
  requireEmpresaSupabase: async (...args: any[]) => { h.gate(...args); return h.sbRaw.client; },
  requireAdminSupabase: async (...args: any[]) => { h.gate(...args); return h.sbRaw.client; },
}));
vi.mock('@/lib/auth/action-context', () => ({ requireAdminAction: async () => ({}) }));
vi.mock('@/lib/tenant-db', () => ({ tenantDb: () => h.tdb.client }));
vi.mock('@/actions/ai-client', () => ({ callAI: h.callAI, callAIChat: vi.fn() }));
vi.mock('@/lib/ai-tasks', async (importOriginal) => ({ ...(await importOriginal<any>()), getModelForTask: async () => 'gpt-5.6-terra' }));
vi.mock('@/lib/cenario-b-integrador', () => ({ listarAlvosDoIntegrador: h.listar, gerarCenarioBIntegradorCore: h.gerar }));

import {
  listarAlvosCenarioBIntegrador, gerarCenarioBIntegrador, checkCenarioBUm, checkCenariosBLote,
} from '@/actions/fase5/cenarios-b';

const COMPS = ['Comunicação', 'Planejamento', 'Liderança de Equipes', 'Gestão do Tempo', 'Resiliência'];
const ALVO = { cargo: 'Analista', competencias: COMPS, pessoas: 3, jaTem: false, cenarioId: null };
const INTEGRADOR_ALT = { p1: 'a?', competencias_integradas: COMPS, cobertura_exata: true };

beforeEach(() => {
  for (const f of [h.listar, h.gerar, h.callAI, h.gate]) f.mockReset();
  h.sbRaw = criarSupabaseMock();
  h.tdb = criarSupabaseMock();
  h.listar.mockResolvedValue({ ok: true, alvos: [ALVO], avisos: [], pessoasOnboarding: 3 });
  h.gerar.mockResolvedValue({ ok: true, status: 'gerado', cenarioId: 'b-1', titulo: 'Caso', perguntas: 5, tentativas: 1 });
});

describe('listarAlvosCenarioBIntegrador', () => {
  it('passa pelo gate de TENANT da empresa pedida, com a permissão de regenerar IA', async () => {
    const r: any = await listarAlvosCenarioBIntegrador('emp-1');
    expect(h.gate).toHaveBeenCalledWith('emp-1', 'ai.audit.regenerate', 'listarAlvosCenarioBIntegrador');
    expect(r).toMatchObject({ success: true, alvos: [ALVO], pessoasOnboarding: 3 });
  });

  it('devolve o erro da leitura (não uma lista vazia que pareceria "ninguém em Onboarding")', async () => {
    h.listar.mockResolvedValue({ ok: false, erro: 'Falha ao ler os colaboradores: timeout' });
    expect(await listarAlvosCenarioBIntegrador('emp-1')).toEqual({ success: false, error: 'Falha ao ler os colaboradores: timeout' });
  });

  it('sem empresa: recusa antes de qualquer leitura', async () => {
    expect(await listarAlvosCenarioBIntegrador('')).toMatchObject({ success: false });
    expect(h.gate).not.toHaveBeenCalled();
  });
});

describe('gerarCenarioBIntegrador', () => {
  it('só gera para um alvo que a empresa resolveria para o Onboarding: pedido avulso não paga IA', async () => {
    const r: any = await gerarCenarioBIntegrador('emp-1', { cargo: 'Diretor', competencias: COMPS });
    expect(r).toMatchObject({ success: false, motivo: 'alvo-desconhecido' });
    const r2: any = await gerarCenarioBIntegrador('emp-1', { cargo: 'Analista', competencias: COMPS.slice(0, 4) });
    expect(r2.motivo).toBe('alvo-desconhecido');
    expect(h.gerar).not.toHaveBeenCalled();
  });

  it('o alvo casa sem caixa e fora de ordem, e o gerador recebe o nome CANÔNICO do servidor, não o do cliente', async () => {
    const r: any = await gerarCenarioBIntegrador('emp-1', { cargo: ' analista ', competencias: [...COMPS].reverse().map((c) => c.toUpperCase()) });
    expect(r).toMatchObject({ success: true, status: 'gerado', cenarioId: 'b-1', perguntas: 5, cargo: 'Analista', competencias: COMPS });
    const [, args] = h.gerar.mock.calls[0];
    expect(args).toMatchObject({ empresaId: 'emp-1', cargo: 'Analista', competencias: COMPS });
  });

  it('do picker só o MODELO vai ao gerador (modo, checkModel e o resto não são da geração)', async () => {
    await gerarCenarioBIntegrador('emp-1', ALVO, { model: 'claude-sonnet-5-5', checkModel: 'gpt-5.6-terra', modo: 'lote' } as any);
    expect(h.gerar.mock.calls[0][1].aiConfig).toEqual({ model: 'claude-sonnet-5-5' });
    await gerarCenarioBIntegrador('emp-1', ALVO, {});
    expect(h.gerar.mock.calls[1][1].aiConfig).toEqual({});
  });

  it('`substituir` só vale quando é exatamente true (um "true" de texto vindo do cliente não substitui)', async () => {
    await gerarCenarioBIntegrador('emp-1', ALVO);
    await gerarCenarioBIntegrador('emp-1', ALVO, {}, { substituir: 'true' as any });
    await gerarCenarioBIntegrador('emp-1', ALVO, {}, { substituir: true });
    expect(h.gerar.mock.calls.map((c) => c[1].substituir)).toEqual([false, false, true]);
  });

  it('a falha do gerador volta com o motivo e o texto (o admin vê o que faltou)', async () => {
    h.gerar.mockResolvedValue({ ok: false, motivo: 'validacao', erro: 'O cenário gerado não passou na validação: Faltam perguntas para: Resiliência', erros: ['Faltam perguntas para: Resiliência'] });
    const r: any = await gerarCenarioBIntegrador('emp-1', ALVO);
    expect(r).toMatchObject({ success: false, motivo: 'validacao', erros: ['Faltam perguntas para: Resiliência'] });
    expect(r.error).toContain('Faltam perguntas para: Resiliência');
  });

  it('a falha da lista de alvos barra a geração com o erro', async () => {
    h.listar.mockResolvedValue({ ok: false, erro: 'Falha ao ler a empresa' });
    const r: any = await gerarCenarioBIntegrador('emp-1', ALVO);
    expect(r).toEqual({ success: false, error: 'Falha ao ler a empresa' });
    expect(h.gerar).not.toHaveBeenCalled();
  });

  it('passa pelo gate de tenant ANTES de listar e de gerar', async () => {
    await gerarCenarioBIntegrador('emp-1', ALVO);
    expect(h.gate).toHaveBeenCalledWith('emp-1', 'ai.audit.regenerate', 'gerarCenarioBIntegrador');
  });
});

describe('o check do B por célula não toca o integrador', () => {
  it('checkCenarioBUm recusa o integrador com o motivo (o auditor avalia UMA competência) e não chama a IA', async () => {
    h.sbRaw = criarSupabaseMock({ resolver: (t) => (t === 'banco_cenarios' ? { id: 'b-int', empresa_id: 'emp-1', titulo: 't', descricao: 'd', cargo: 'Analista', competencia_id: null, alternativas: INTEGRADOR_ALT } : null) });
    const r: any = await checkCenarioBUm('b-int');
    expect(r).toMatchObject({ success: false, integrador: true });
    expect(r.error).toContain('não há auditoria por IA');
    expect(h.callAI).not.toHaveBeenCalled();
  });

  it('checkCenariosBLote deixa o integrador de fora: não vira "erro" a cada rodada nem gasta IA com ele', async () => {
    h.tdb = criarSupabaseMock({
      lista: (t) => (t === 'banco_cenarios'
        ? [{ id: 'b-int', empresa_id: 'emp-1', titulo: 't', descricao: 'd', cargo: 'Analista', competencia_id: null, alternativas: INTEGRADOR_ALT, nota_check: null }]
        : []),
    });
    const r: any = await checkCenariosBLote('emp-1');
    expect(r.success).toBe(true);
    expect(r.message).toContain('Nenhum cenário B por célula para checar');
    expect(r.message).toContain('1 integrador(es) do Onboarding sem auditoria por IA');
    expect(h.callAI).not.toHaveBeenCalled();
  });

  it('com o B por célula já checado ao lado, o resumo conta cada um no seu grupo', async () => {
    h.tdb = criarSupabaseMock({
      lista: (t) => (t === 'banco_cenarios'
        ? [
          { id: 'b-int', empresa_id: 'emp-1', cargo: 'Analista', competencia_id: null, alternativas: INTEGRADOR_ALT, nota_check: null },
          { id: 'b-1', empresa_id: 'emp-1', cargo: 'Analista', competencia_id: 'c1', alternativas: { p1: 'x' }, nota_check: 92 },
        ]
        : []),
    });
    const r: any = await checkCenariosBLote('emp-1');
    expect(r.message).toBe('Todos os 1 cenários B já foram checados (1 integrador(es) do Onboarding sem auditoria por IA)');
  });
});
