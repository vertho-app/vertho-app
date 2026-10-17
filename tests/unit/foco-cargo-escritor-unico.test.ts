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

describe('competência PRÓPRIA da pessoa (mig 287, Amazon 15/10/2026)', () => {
  it('a trilha usa a competência DA PESSOA, que vence o foco do cargo', async () => {
    tabelas.colaboradores[0].foco_individual = ['Didática'];
    const r: any = await gerarTemporadaCoreHeadless(sb.client, { colaboradorId: 'col' });
    expect(r.error).toBeTruthy();
    expect(r.error).toContain('Didática');
    expect(r.error).not.toContain('Comunicação');
  });

  it('cargo SEM foco: com a competência própria a trilha tem alvo; sem ela, recusa por falta de foco', async () => {
    tabelas.cargos_empresa[0].competencias_foco = [];
    tabelas.cargos_empresa[0].competencia_foco = null;
    const sem: any = await gerarTemporadaCoreHeadless(sb.client, { colaboradorId: 'col' });
    expect(sem.error).toMatch(/Sem competência foco/);
    tabelas.colaboradores[0].foco_individual = ['Antiga'];
    const com: any = await gerarTemporadaCoreHeadless(sb.client, { colaboradorId: 'col' });
    expect(com.error).toContain('"Antiga"');
  });
});

/**
 * Jornada nova (17/10/2026, Ibipeba Temporada 2). Sem competência explícita, a geração herdava a da trilha MAIS
 * RECENTE da pessoa, que era a da Temporada 1: a trilha da Temporada 2 nasceria na competência antiga. E o blueprint
 * da Temporada 1 montaria as semanas da nova. Os dois passam a ser os da jornada ATUAL.
 */
describe('a trilha de uma jornada NOVA não herda a da anterior', () => {
  const MARCO = '2026-10-07T12:22:33Z';
  const comT1 = () => {
    tabelas.trilhas = [{
      id: 'tr1', empresa_id: 'emp', colaborador_id: 'col', competencia_foco: 'Antiga', status: 'encerrada',
      numero_temporada: 1, criado_em: '2026-07-13T00:00:00Z', turma_membro_id: 'p1', programa_modo: 'jornada', programa_config: null,
    }];
  };

  it('participação nova com marco: a competência vem do foco (Comunicação), não da trilha da Temporada 1', async () => {
    comT1();
    tabelas.turma_membros = [
      { id: 'p1', empresa_id: 'emp', turma_id: 't1', colaborador_id: 'col', status: 'concluido', created_at: '2026-07-13T00:00:00Z', marco_jornada: null },
      { id: 'p2', empresa_id: 'emp', turma_id: 't2', colaborador_id: 'col', status: 'ativo', created_at: MARCO, marco_jornada: MARCO },
    ];
    tabelas.turmas = [
      { id: 't1', empresa_id: 'emp', nome: 'Turma 1', status: 'concluida', data_inicio: '2026-07-13', sys_config: {} },
      { id: 't2', empresa_id: 'emp', nome: 'Temporada 2', status: 'diagnostico', data_inicio: '2026-10-26', sys_config: { programa_modo: 'jornada' } },
    ];
    const r: any = await gerarTemporadaCoreHeadless(sb.client, { colaboradorId: 'col' });
    expect(r.error).toBeTruthy();
    expect(r.error).toContain('Comunicação');
    expect(r.error).not.toContain('Antiga');
  });

  it('sem turma (a conta de sempre): regerar segue a competência da trilha existente', async () => {
    comT1();
    tabelas.trilhas[0].status = 'ativa';
    const r: any = await gerarTemporadaCoreHeadless(sb.client, { colaboradorId: 'col' });
    expect(r.error).toContain('Antiga');
  });

  it('blueprint de ANTES do marco conta como ausente: degrada registrando "jornada anterior"', async () => {
    vi.mocked(registrarDegradacao).mockClear();
    tabelas.turma_membros = [
      { id: 'p2', empresa_id: 'emp', turma_id: 't2', colaborador_id: 'col', status: 'ativo', created_at: MARCO, marco_jornada: MARCO },
    ];
    tabelas.turmas = [{ id: 't2', empresa_id: 'emp', nome: 'Temporada 2', status: 'diagnostico', data_inicio: '2026-10-26', sys_config: { programa_modo: 'jornada' } }];
    tabelas.development_blueprints = [{
      empresa_id: 'emp', colaborador_id: 'col', gerado_em: '2026-10-02T12:19:04Z',
      blueprint: { competencias: [{ nome: 'Comunicação' }], trilha: { semanas: [{ semana: 1, descritor: 'Escuta', conexao_com_pdi: ['x'] }] } },
    }];
    tabelas.descriptor_assessments = [{ empresa_id: 'emp', colaborador_id: 'col', competencia: 'Comunicação', descritor: 'Escuta', nota: 2 }];
    tabelas.competencias = [{ empresa_id: 'emp', nome: 'Comunicação', nome_curto: 'Escuta', cargo: 'Professor' }];
    await gerarTemporadaCoreHeadless(sb.client, { colaboradorId: 'col' });
    expect(vi.mocked(registrarDegradacao)).toHaveBeenCalledWith(expect.objectContaining({
      tipo: DEGRADACAO.BLUEPRINT_ADAPTER_FALLBACK,
      detalhe: expect.objectContaining({ error: 'blueprint de uma jornada anterior', competencia: 'Comunicação' }),
    }));
  });
});
