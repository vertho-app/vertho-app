import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bancoEmMemoria, type Tabelas } from '../helpers/tabelas-em-memoria';
import { colunasDoFoco, focoComPrincipal, focoDoCargo } from '@/lib/foco-cargo';

/**
 * R-85 (revisão de 02/10/2026): o foco do cargo tinha dois escritores. O seletor
 * do pipeline gravava só `competencia_foco`; `/admin/cargos` gravava as duas
 * colunas. PDI e blueprint leem `focoDoCargo` (o array primeiro) e a trilha da
 * Jornada lia a coluna simples: a mesma pessoa podia ter PDI de uma competência
 * e trilha de outra. Agora os dois escritores passam por `colunasDoFoco`, e a
 * trilha lê por `focoDoCargo`.
 */

let tabelas: Tabelas;
let sb: ReturnType<typeof bancoEmMemoria>;

vi.mock('@/lib/admin-supabase', () => ({
  requireAdminSupabase: vi.fn(async () => sb.client),
  requireEmpresaSupabase: vi.fn(async () => sb.client),
}));
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/tenant-db', () => ({ tenantDb: () => sb.client }));
// Nenhuma IA de verdade: se a geração passar do ponto que o teste observa, ela falha aqui.
vi.mock('@/actions/ai-client', () => ({ callAI: vi.fn(async () => { throw new Error('IA desligada no teste'); }), callAIChat: vi.fn() }));
vi.mock('@/lib/degradacao', async (orig) => ({
  ...(await orig<typeof import('@/lib/degradacao')>()),
  registrarDegradacao: vi.fn(async () => {}),
}));

import { salvarCompetenciaFoco, loadCompetenciasFoco } from '@/actions/fase4';
import { gerarTemporadaCoreHeadless } from '@/lib/season-engine/trilha-core';
import { registrarDegradacao, DEGRADACAO } from '@/lib/degradacao';

beforeEach(() => {
  tabelas = {
    cargos_empresa: [{ id: 'cg', empresa_id: 'emp', nome: 'Professor', competencia_foco: 'Antiga', competencias_foco: ['Comunicação', 'Didática'], top5_workshop: ['Comunicação', 'Didática', 'Antiga'] }],
    colaboradores: [{ id: 'col', empresa_id: 'emp', nome_completo: 'Ana', cargo: 'Professor' }],
    empresas: [{ id: 'emp', segmento: 'educacao', sys_config: {} }],
  };
  sb = bancoEmMemoria(tabelas);
});

describe('colunasDoFoco / focoComPrincipal (puras)', () => {
  it('as duas colunas saem juntas: a simples é sempre a 1ª do array', () => {
    expect(colunasDoFoco([' Didática ', 'Comunicação', 'Didática', ''])).toEqual({ competencias_foco: ['Didática', 'Comunicação'], competencia_foco: 'Didática' });
    expect(colunasDoFoco([])).toEqual({ competencias_foco: [], competencia_foco: null });
  });
  it('trocar o principal preserva o 2º; "sem foco" limpa', () => {
    const atual = { competencias_foco: ['Comunicação', 'Didática'], competencia_foco: 'Comunicação' };
    expect(focoComPrincipal(atual, 'Didática')).toEqual(['Didática', 'Comunicação']);
    expect(focoComPrincipal(atual, 'Liderança')).toEqual(['Liderança', 'Comunicação']);
    expect(focoComPrincipal(atual, null)).toEqual([]);
  });
});

describe('salvarCompetenciaFoco (o seletor do pipeline)', () => {
  it('grava as DUAS colunas, e o que PDI e trilha leem passa a ser o escolhido', async () => {
    const r: any = await salvarCompetenciaFoco('emp', 'Professor', 'Didática');
    expect(r.success).toBe(true);
    const cargo = tabelas.cargos_empresa[0];
    expect(cargo.competencia_foco).toBe('Didática');
    expect(cargo.competencias_foco).toEqual(['Didática', 'Comunicação']);
    expect(focoDoCargo(cargo)[0]).toBe('Didática');
  });

  it('cargo inexistente: falha alto, nada gravado', async () => {
    const r: any = await salvarCompetenciaFoco('emp', 'Cargo fantasma', 'Didática');
    expect(r.success).toBe(false);
    expect(sb.escritas).toHaveLength(0);
  });

  it('o pipeline MOSTRA o foco que PDI e trilha usam, não a coluna simples crua', async () => {
    const r: any = await loadCompetenciasFoco('emp');
    expect(r.data[0].competencia_foco).toBe('Comunicação');
  });
});

describe('a trilha da Jornada escolhe o foco pela mesma régua do PDI', () => {
  it('sem trilha anterior, a competência-alvo é focoDoCargo(...)[0], não a coluna simples', async () => {
    const r: any = await gerarTemporadaCoreHeadless(sb.client, { colaboradorId: 'col' });
    // Sem assessment a geração para cedo, e a mensagem nomeia a competência escolhida.
    expect(r.error).toBeTruthy();
    expect(r.error).toContain('Comunicação');
    expect(r.error).not.toContain('Antiga');
  });
});

describe('sem blueprint, a geração degrada REGISTRANDO (R-85)', () => {
  it('Jornada sem blueprint cai em selectDescriptors e deixa a linha em degradacao_log', async () => {
    vi.mocked(registrarDegradacao).mockClear();
    tabelas.descriptor_assessments = [{ empresa_id: 'emp', colaborador_id: 'col', competencia: 'Comunicação', descritor: 'Escuta', nota: 2 }];
    tabelas.competencias = [{ empresa_id: 'emp', nome: 'Comunicação', nome_curto: 'Escuta', cargo: 'Professor' }];
    await gerarTemporadaCoreHeadless(sb.client, { colaboradorId: 'col' });
    expect(vi.mocked(registrarDegradacao)).toHaveBeenCalledWith(expect.objectContaining({
      fluxo: 'trilha',
      tipo: DEGRADACAO.BLUEPRINT_ADAPTER_FALLBACK,
      detalhe: expect.objectContaining({ error: 'sem blueprint', competencia: 'Comunicação' }),
    }));
  });
});
