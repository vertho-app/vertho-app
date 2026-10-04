import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../../helpers/supabase-mock';

/**
 * A acumulada PARCIAL do Onboarding (missões integradoras) com STATUS (R-100,
 * 04/10/2026).
 *
 * Antes ela rodava dentro de um `after()` "no escuro": sem status, sem registro
 * de falha (só um `console.error`), e a gravação do resultado nem lia o `{ error }`
 * do banco, então a leitura podia "concluir" sem ter gravado nada. Agora a linha
 * da semana da missão carrega `acumulada_status` (`processing` → `done` | `error`)
 * e a falha vira linha em `degradacao_log`.
 *
 * Mutação: ver o relatório do lote 11.
 */

let sbRaw = criarSupabaseMock();
let tdb = criarSupabaseMock();
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sbRaw.client }));
vi.mock('@/lib/tenant-db', () => ({ tenantDb: () => tdb.client }));
const callAI = vi.hoisted(() => vi.fn());
vi.mock('@/actions/ai-client', () => ({ callAI }));
vi.mock('@/lib/season-engine/regua', () => ({
  enriquecerComRegua: async ({ descritores }: any) => descritores,
  sobreporNotaFresh: async (_tdb: any, _colab: string, _comp: string, descritores: any[]) => descritores,
}));
const registrarDegradacao = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('@/lib/degradacao', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/degradacao')>();
  return { ...mod, registrarDegradacao };
});

import { rodarAcumuladaParcialComStatus, gerarAvaliacaoAcumuladaParcialCore } from '@/lib/season-engine/avaliacao-acumulada-core';
import { DEGRADACAO } from '@/lib/degradacao';

const TRILHA = {
  id: 'tr-1', empresa_id: 'emp-1', colaborador_id: 'colab-1', competencia_foco: 'Comp A',
  descritores_selecionados: [
    { descritor: 'D-A', competencia: 'Comp A', semanas_ids: [1] },
    { descritor: 'D-B', competencia: 'Comp B', semanas_ids: [2] },
  ],
  temporada_plano: [], programa_modo: 'onboarding', programa_config: null,
};

const RESPOSTA_IA = JSON.stringify({
  avaliacao_acumulada: [{ descritor: 'D', nota_acumulada: 2.4, justificativa: 'ok' }],
  resumo_geral: 'leitura parcial',
});

const statusGravados = () => tdb.escritas
  .filter((e) => e.tabela === 'temporada_semana_progresso' && e.op === 'update' && 'acumulada_status' in e.payload)
  .map((e) => e.payload.acumulada_status);

function montar() {
  sbRaw = criarSupabaseMock({
    resolver: (tabela) => (tabela === 'trilhas' ? TRILHA : null),
  });
  tdb = criarSupabaseMock({
    resolver: (tabela) => {
      if (tabela === 'colaboradores') return { nome_completo: 'Pessoa Teste', cargo: 'Professor' };
      if (tabela === 'temporada_semana_progresso') return { id: 'prog-3', feedback: {} };
      return null;
    },
    lista: () => [],
  });
}

beforeEach(() => {
  callAI.mockReset();
  registrarDegradacao.mockClear();
  callAI.mockResolvedValue(RESPOSTA_IA);
  montar();
});

describe('rodarAcumuladaParcialComStatus', () => {
  it('sucesso: processing, depois done, e a leitura fica gravada na semana da missão', async () => {
    const r = await rodarAcumuladaParcialComStatus('tr-1', ['Comp A', 'Comp B'], 3, { empresaId: 'emp-1' });
    expect(r.ok).toBe(true);
    expect(statusGravados()).toEqual(['processing', 'done']);
    const gravacao = tdb.escritas.find((e) => e.tabela === 'temporada_semana_progresso' && e.op === 'update' && 'feedback' in e.payload);
    expect(gravacao?.payload.feedback.acumulado.parcial).toBe(true);
    expect(gravacao?.payload.feedback.acumulado.competencias).toEqual(['Comp A', 'Comp B']);
    expect(registrarDegradacao).not.toHaveBeenCalled();
  });

  it('o status vai para a linha DA SEMANA da missão (trilha + semana), não para outra', async () => {
    await rodarAcumuladaParcialComStatus('tr-1', ['Comp A'], 3, { empresaId: 'emp-1' });
    const eqs = tdb.chamadas.filter((c) => c.tabela === 'temporada_semana_progresso' && c.metodo === 'eq').map((c) => c.args);
    expect(eqs).toContainEqual(['trilha_id', 'tr-1']);
    expect(eqs).toContainEqual(['semana', 3]);
  });

  it('a 1ª IA falha numa competência: status error com a causa, e a falha fica REGISTRADA', async () => {
    callAI.mockImplementation(async (_s: string, user: string) => {
      if (String(user).includes('Comp B')) throw new Error('modelo fora do ar');
      return RESPOSTA_IA;
    });
    const r = await rodarAcumuladaParcialComStatus('tr-1', ['Comp A', 'Comp B'], 3, { empresaId: 'emp-1' });
    expect(r.ok).toBe(false);
    expect(r.erro).toContain('Comp B');
    expect(r.erro).toContain('modelo fora do ar');
    expect(statusGravados()).toEqual(['processing', 'error']);
    const erroGravado = tdb.escritas.filter((e) => 'acumulada_erro' in e.payload).pop()?.payload.acumulada_erro;
    expect(erroGravado).toContain('Comp B');
    expect(registrarDegradacao).toHaveBeenCalledTimes(1);
    const chamada = (registrarDegradacao.mock.calls[0] as any)[0];
    expect(chamada.tipo).toBe(DEGRADACAO.ACUMULADA_PARCIAL_FALHOU);
    expect(chamada.chave).toBe('tr-1:3');
    expect(chamada.empresaId).toBe('emp-1');
  });

  it('a gravação do resultado falha no banco: NÃO é "done", é error', async () => {
    // Antes o `{ error }` do update nunca era lido: a leitura "concluía" sem gravar.
    tdb.falharEm({ tabela: 'temporada_semana_progresso', op: 'update', mensagem: 'timeout no pool', quando: (p) => 'feedback' in p });
    const r = await rodarAcumuladaParcialComStatus('tr-1', ['Comp A'], 3, { empresaId: 'emp-1' });
    expect(r.ok).toBe(false);
    expect(r.erro).toContain('timeout no pool');
    expect(statusGravados()).toEqual(['processing', 'error']);
    expect(registrarDegradacao).toHaveBeenCalledTimes(1);
  });

  it('trilha que não existe: error, sem lançar', async () => {
    sbRaw = criarSupabaseMock({ resolver: () => null });
    const r = await rodarAcumuladaParcialComStatus('tr-x', ['Comp A'], 3, { empresaId: 'emp-1' });
    expect(r.ok).toBe(false);
    expect(r.erro).toContain('trilha');
    expect(statusGravados()).toEqual(['processing', 'error']);
  });

  it('falha em gravar o STATUS não derruba a leitura (é observabilidade, não gate)', async () => {
    tdb.falharEm({ tabela: 'temporada_semana_progresso', op: 'update', mensagem: 'sem conexão', quando: (p) => 'acumulada_status' in p });
    const r = await rodarAcumuladaParcialComStatus('tr-1', ['Comp A'], 3, { empresaId: 'emp-1' });
    expect(r.ok).toBe(true);
    const gravacao = tdb.escritas.find((e) => e.tabela === 'temporada_semana_progresso' && 'feedback' in e.payload);
    expect(gravacao).toBeTruthy();
  });
});

describe('gerarAvaliacaoAcumuladaParcialCore: erro do banco não vira sucesso', () => {
  it('falha ao LER a semana da missão: devolve erro (não insere uma linha por cima)', async () => {
    tdb.falharEm({ tabela: 'temporada_semana_progresso', op: 'select', mensagem: 'timeout no pool' });
    const r: any = await gerarAvaliacaoAcumuladaParcialCore('tr-1', ['Comp A'], 3, { empresaId: 'emp-1' });
    expect(r.error).toContain('timeout no pool');
    expect(tdb.escritas.filter((e) => e.tabela === 'temporada_semana_progresso')).toEqual([]);
  });

  it('o ledger recebe o dono da chamada (empresa e colaborador)', async () => {
    await gerarAvaliacaoAcumuladaParcialCore('tr-1', ['Comp A'], 3, { empresaId: 'emp-1' });
    const opts = callAI.mock.calls[0][4];
    expect(opts).toMatchObject({ taskKey: 'acumulada_primaria', empresaId: 'emp-1', colaboradorId: 'colab-1' });
  });
});

describe('a rota /reflection dispara a parcial pelo caminho com status', () => {
  const rota = readFileSync('app/api/temporada/reflection/route.ts', 'utf-8');

  it('chama `rodarAcumuladaParcialComStatus` dentro do `after()`, e não o núcleo "no escuro"', () => {
    expect(rota).toContain('rodarAcumuladaParcialComStatus(trilhaId, compsCobertas');
    expect(rota).not.toContain('gerarAvaliacaoAcumuladaParcialCore(');
  });

  it('usa as competências do select do topo (sem uma leitura extra, sem `error` lido)', () => {
    expect(rota).toContain('trilha.competencias_foco');
    expect(rota).not.toMatch(/\.from\('trilhas'\)\s*\.select\('competencias_foco'\)/);
  });
});
