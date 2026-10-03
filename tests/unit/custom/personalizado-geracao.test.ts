import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock, type Chamada } from '../../helpers/supabase-mock';

/**
 * Geração do Personalizado (03/10/2026), pelo núcleo que roda em produção
 * (`gerarTemporadaCoreHeadless`): 2 competências EM SEQUÊNCIA, uma trilha por
 * competência, a seleção da Jornada, e falha ALTA quando o programa pedido não
 * cabe (nunca rebaixar para 1 competência em silêncio, que era o que o gerador
 * anterior fazia).
 *
 * O `buildSeason` é substituído: o que se prova aqui é a DECISÃO (que
 * competência, que config, que carimbo, que snapshot), não a montagem de cada
 * semana, que é a mesma da Jornada e tem os testes dela.
 *
 * Validado por mutação (ver o relatório da onda 2): trocar o `return` de
 * `custom_segunda_competencia` por seguir com 1 competência derruba o teste
 * "falha alto"; tirar a checagem de mapeamento da 2ª derruba "exige o
 * mapeamento das duas"; não preservar `sequenciaExistente` na regeração
 * derruba "regerar a 2ª".
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
import { derivarConfigCustom } from '@/lib/season-engine/programa-custom';

const COLAB = {
  id: 'colab-1', nome_completo: 'Pessoa', cargo: 'Coordenador', empresa_id: 'emp-1',
  area_depto: null, programa_modo: null,
  pref_video_curto: null, pref_video_longo: null, pref_texto: null, pref_audio: null, pref_estudo_caso: null,
};

/** Mapeamento por competência. Ausente = a pessoa não foi avaliada nela. */
let mapeamento: Record<string, { descritor: string; nota: number }[]> = {};
let focoDoCargo: string[] = ['Liderança', 'Comunicação'];
let trilhaAtual: any = null;
let sysConfig: any = {};

const competenciaDaCadeia = (cadeia: Chamada[]) =>
  cadeia.find((c) => c.metodo === 'eq' && c.args[0] === 'competencia')?.args[1];

function montarTdb() {
  return criarSupabaseMock({
    resolver: (tabela, cols) => {
      if (tabela === 'cargos_empresa') return { competencia_foco: focoDoCargo[0] ?? null, competencias_foco: focoDoCargo };
      if (tabela === 'trilhas' && cols.startsWith('competencia_foco')) return trilhaAtual ? { competencia_foco: trilhaAtual.competencia_foco } : null;
      if (tabela === 'trilhas') return trilhaAtual;
      return null;
    },
    lista: (tabela, _cols, cadeia) => {
      if (tabela === 'descriptor_assessments') return mapeamento[competenciaDaCadeia(cadeia)] || [];
      return [];
    },
    escritaUnica: (tabela, _op, payload) => (tabela === 'trilhas' ? { id: 'trilha-nova' } : payload),
  });
}

function sbRaw() {
  return criarSupabaseMock({
    resolver: (tabela) => {
      if (tabela === 'colaboradores') return COLAB;
      if (tabela === 'empresas') return { segmento: 'educacao', sys_config: sysConfig };
      return null;
    },
  }).client;
}

const upsertTrilha = () => tdb.escritas.find((e) => e.tabela === 'trilhas' && e.op === 'upsert')?.payload;
const D = (n: number, nota = 1.8) => ({ descritor: `D${n}`, nota });

beforeEach(() => {
  buildSeason.mockReset();
  buildSeason.mockImplementation(async ({ programaConfig }: any) =>
    Array.from({ length: programaConfig.semanas }, (_, i) => ({
      semana: i + 1,
      tipo: programaConfig.semanasAvaliacao.includes(i + 1) ? 'avaliacao' : 'conteudo',
    })),
  );
  mapeamento = { Liderança: [D(1), D(2), D(3)], Comunicação: [D(4), D(5)] };
  focoDoCargo = ['Liderança', 'Comunicação'];
  trilhaAtual = null;
  sysConfig = { programa_modo: 'custom', programa_custom: { semanas: 4, numCompetencias: 2, fechamento: true } };
  tdb = montarTdb();
});

describe('Personalizado com 2 competências: a 1ª trilha', () => {
  it('gera a trilha da 1ª competência com o snapshot da sequência inteira', async () => {
    const r: any = await gerarTemporadaCoreHeadless(sbRaw(), { colaboradorId: 'colab-1' });
    expect(r.ok).toBe(true);
    expect(r.competencia).toBe('Liderança');
    expect(r.competencias).toEqual(['Liderança', 'Comunicação']);

    const t = upsertTrilha();
    expect(t.programa_modo).toBe('custom');
    expect(t.competencia_foco).toBe('Liderança');
    expect(t.competencias_foco).toEqual(['Liderança']);           // UMA competência por trilha
    expect(t.programa_config.modo).toBe('regular');               // programa completo
    expect(t.programa_config.semanas).toBe(5);                    // 4 de conteúdo + fechamento
    expect(t.programa_config.sequenciaPersonalizado).toEqual({ competencias: ['Liderança', 'Comunicação'], posicao: 1 });
    expect(t.temporada_plano).toHaveLength(5);
  });

  it('a seleção é a da Jornada: 4 semanas com 3 descritores, sem exigir um distinto por pílula', async () => {
    // O gerador anterior exigia semanas × 2 descritores DISTINTOS (8 aqui) e
    // falhava com `piloto_descritores_insuficientes`. Medido em 03/10: 646 de
    // 739 pares pessoa e competência têm só 6 descritores.
    const r: any = await gerarTemporadaCoreHeadless(sbRaw(), { colaboradorId: 'colab-1' });
    expect(r.ok).toBe(true);
    const { descritoresSelecionados } = buildSeason.mock.calls[0][0];
    const semanasCobertas = descritoresSelecionados.flatMap((d: any) => d.semanas_ids).sort();
    expect(semanasCobertas).toEqual([1, 2, 3, 4]);
    expect(descritoresSelecionados.length).toBeLessThan(8);
  });

  it('🔴 falha ALTO, com erro acionável, se o cargo não tem 2ª competência (não rebaixa para 1)', async () => {
    focoDoCargo = ['Liderança'];
    const r: any = await gerarTemporadaCoreHeadless(sbRaw(), { colaboradorId: 'colab-1' });
    expect(r.ok).toBeUndefined();
    expect(r.codigo).toBe('custom_segunda_competencia');
    expect(r.error).toMatch(/2 competências/);
    expect(r.error).toMatch(/configure o Personalizado com 1 competência/);
    expect(upsertTrilha()).toBeUndefined();
    expect(buildSeason).not.toHaveBeenCalled();
  });

  it('🔴 exige o mapeamento das DUAS antes de gerar a primeira', async () => {
    delete mapeamento['Comunicação'];
    const r: any = await gerarTemporadaCoreHeadless(sbRaw(), { colaboradorId: 'colab-1' });
    expect(r.codigo).toBe('sem_assessment');
    expect(r.error).toContain('"Comunicação"');
    expect(upsertTrilha()).toBeUndefined();
  });
});

describe('Personalizado com 1 competência', () => {
  it('snapshot sem sequência (não encadeia) e fechamento opcional respeitado', async () => {
    sysConfig = { programa_modo: 'custom', programa_custom: { semanas: 1, numCompetencias: 1, fechamento: false } };
    const r: any = await gerarTemporadaCoreHeadless(sbRaw(), { colaboradorId: 'colab-1' });
    expect(r.ok).toBe(true);
    const t = upsertTrilha();
    expect(t.programa_config.sequenciaPersonalizado).toBeUndefined();
    expect(t.programa_config.semanasAvaliacao).toEqual([]);
    expect(t.temporada_plano).toHaveLength(1);
  });
});

describe('a 2ª competência (encadeamento) e a regeração', () => {
  const congelada = () => ({
    ...derivarConfigCustom({ semanas: 4, numCompetencias: 2, fechamento: true }),
    sequenciaPersonalizado: { competencias: ['Liderança', 'Comunicação'], posicao: 2 },
  });

  it('o encadeamento gera a 2ª competência com as regras CONGELADAS, mesmo que a tela tenha mudado', async () => {
    // A empresa trocou a tela para Jornada no meio do programa: a 2ª
    // competência segue o programa em andamento, não o que a tela diz hoje.
    sysConfig = { programa_modo: 'jornada' };
    trilhaAtual = { status: 'concluida', programa_modo: 'custom', competencia_foco: 'Liderança', numero_temporada: 1 };
    const r: any = await gerarTemporadaCoreHeadless(sbRaw(), {
      colaboradorId: 'colab-1', competencia: 'Comunicação', novaJornada: true, configPersonalizado: congelada(),
    });
    expect(r.ok).toBe(true);
    const t = upsertTrilha();
    expect(t.programa_modo).toBe('custom');
    expect(t.competencia_foco).toBe('Comunicação');
    expect(t.numero_temporada).toBe(2);                            // trilha NOVA, a 1ª fica intacta
    expect(t.programa_config.sequenciaPersonalizado.posicao).toBe(2);
    expect(t.programa_config.semanas).toBe(5);
  });

  it('regerar a 2ª trilha mantém a posição dela (não vira a 1ª de uma sequência nova)', async () => {
    trilhaAtual = {
      status: 'ativa', programa_modo: 'custom', competencia_foco: 'Comunicação', numero_temporada: 2,
      programa_config: congelada(),
    };
    const r: any = await gerarTemporadaCoreHeadless(sbRaw(), { colaboradorId: 'colab-1' });
    expect(r.ok).toBe(true);
    const t = upsertTrilha();
    expect(t.competencia_foco).toBe('Comunicação');
    expect(t.numero_temporada).toBe(2);
    expect(t.programa_config.sequenciaPersonalizado).toEqual({ competencias: ['Liderança', 'Comunicação'], posicao: 2 });
  });
});

describe('empresa NOVA (sem programa_modo) nasce na Jornada', () => {
  it('carimbo jornada, 7 semanas, sem snapshot', async () => {
    sysConfig = {};
    const r: any = await gerarTemporadaCoreHeadless(sbRaw(), { colaboradorId: 'colab-1' });
    expect(r.ok).toBe(true);
    const t = upsertTrilha();
    expect(t.programa_modo).toBe('jornada');
    expect(t.programa_config).toBeNull();
    expect(t.temporada_plano).toHaveLength(7);
  });
});
