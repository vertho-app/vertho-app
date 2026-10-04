import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * R-101: o formato de uma GERAÇÃO respeita a precedência documentada, pelo
 * núcleo que roda em produção (`gerarTemporadaCoreHeadless`).
 *
 * participação → turma → override do colaborador (legado) → empresa → Jornada.
 *
 * Antes, o núcleo resolvia empresa, turma e participação e depois aplicava o
 * `programa_modo` gravado NA PESSOA por cima do resultado, como se aquilo fosse a
 * "empresa". O override da pessoa vencia a turma: quem a turma pusesse no
 * Personalizado ficava na Jornada (ou o contrário) por um valor que ninguém
 * mais lembrava de ter gravado. Aqui a pessoa tem `programa_modo: 'jornada'` e a
 * turma escolhe o Personalizado; o carimbo da trilha diz quem venceu.
 *
 * Validado por mutação (ver o relatório): voltar a chamar
 * `resolverModoDaTurma({ empresa: cfg, colaboradorLegado: colab })` em
 * `trilha-core` derruba o caso da turma.
 */

let tdb = criarSupabaseMock();
vi.mock('@/lib/tenant-db', () => ({ tenantDb: () => tdb.client }));
const buildSeason = vi.hoisted(() => vi.fn());
vi.mock('@/lib/season-engine/build-season', () => ({ buildSeason }));
vi.mock('@/lib/degradacao', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/degradacao')>();
  return { ...mod, registrarDegradacao: vi.fn(async () => {}) };
});

import { gerarTemporadaCoreHeadless } from '@/lib/season-engine/trilha-core';

let colab: any;
let sysConfig: any;
let turmaSysConfig: any = null;
let participacaoOverride: any = {};

const baseColab = {
  id: 'colab-1', nome_completo: 'Pessoa', cargo: 'Coordenador', empresa_id: 'emp-1', area_depto: null,
  pref_video_curto: null, pref_video_longo: null, pref_texto: null, pref_audio: null, pref_estudo_caso: null,
};

function montarTdb() {
  return criarSupabaseMock({
    resolver: (tabela, cols) => {
      if (tabela === 'cargos_empresa') return { competencia_foco: 'Liderança', competencias_foco: ['Liderança'] };
      if (tabela === 'trilhas' && cols.startsWith('competencia_foco')) return null;
      return null;
    },
    lista: (tabela) => (tabela === 'descriptor_assessments'
      ? [{ descritor: 'D1', nota: 1.8 }, { descritor: 'D2', nota: 2.1 }, { descritor: 'D3', nota: 2.4 }]
      : []),
    escritaUnica: (tabela, _op, payload) => (tabela === 'trilhas' ? { id: 'trilha-nova' } : payload),
  });
}

function sbRaw() {
  return criarSupabaseMock({
    resolver: (tabela) => {
      if (tabela === 'colaboradores') return colab;
      if (tabela === 'empresas') return { segmento: 'educacao', sys_config: sysConfig };
      if (tabela === 'turma_membros') {
        return turmaSysConfig ? { id: 'membro-1', turma_id: 'turma-1', config_override: participacaoOverride } : null;
      }
      if (tabela === 'turmas') return { id: 'turma-1', nome: 'Safra', sys_config: turmaSysConfig, data_inicio: null, status: 'ativa' };
      return null;
    },
  }).client;
}

const upsertTrilha = () => tdb.escritas.find((e) => e.tabela === 'trilhas' && e.op === 'upsert')?.payload;

beforeEach(() => {
  buildSeason.mockReset();
  buildSeason.mockImplementation(async ({ programaConfig }: any) =>
    Array.from({ length: programaConfig.semanas }, (_, i) => ({
      semana: i + 1,
      tipo: programaConfig.semanasAvaliacao.includes(i + 1) ? 'avaliacao' : 'conteudo',
    })),
  );
  colab = { ...baseColab, programa_modo: null };
  sysConfig = { programa_modo: 'jornada', programa_custom: { semanas: 3, numCompetencias: 1, fechamento: false } };
  turmaSysConfig = null;
  participacaoOverride = {};
  tdb = montarTdb();
});

describe('geração: a turma vence o override legado da pessoa', () => {
  it('🔴 a pessoa tem `jornada` gravado e a turma escolhe o Personalizado: vale o da turma', async () => {
    colab = { ...baseColab, programa_modo: 'jornada' };
    turmaSysConfig = { programa_modo: 'custom' };
    const r: any = await gerarTemporadaCoreHeadless(sbRaw(), { colaboradorId: 'colab-1' });
    expect(r.ok).toBe(true);
    const t = upsertTrilha();
    expect(t.programa_modo).toBe('custom');
    expect(t.programa_config.semanas).toBe(3);
    expect(t.turma_membro_id).toBe('membro-1');
  });

  it('a participação vence a turma e o legado', async () => {
    colab = { ...baseColab, programa_modo: 'custom' };
    turmaSysConfig = { programa_modo: 'custom' };
    participacaoOverride = { programa_modo: 'jornada' };
    const r: any = await gerarTemporadaCoreHeadless(sbRaw(), { colaboradorId: 'colab-1' });
    expect(r.ok).toBe(true);
    expect(upsertTrilha().programa_modo).toBe('jornada');
  });

  it('sem turma, o override da pessoa vence a empresa (comportamento de sempre)', async () => {
    colab = { ...baseColab, programa_modo: 'custom' };
    const r: any = await gerarTemporadaCoreHeadless(sbRaw(), { colaboradorId: 'colab-1' });
    expect(r.ok).toBe(true);
    expect(upsertTrilha().programa_modo).toBe('custom');
  });

  it('sem turma e sem override, vale a empresa', async () => {
    const r: any = await gerarTemporadaCoreHeadless(sbRaw(), { colaboradorId: 'colab-1' });
    expect(r.ok).toBe(true);
    expect(upsertTrilha().programa_modo).toBe('jornada');
  });
});
