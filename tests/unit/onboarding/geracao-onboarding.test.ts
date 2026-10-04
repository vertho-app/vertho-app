import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock, type Chamada } from '../../helpers/supabase-mock';

/**
 * Geração do Onboarding pelo núcleo que roda em produção
 * (`gerarTemporadaCoreHeadless`), com o `buildSeason` substituído: o que se prova
 * aqui é a DECISÃO (quais competências, com que avaliação, com que meta), não a
 * montagem de cada semana (ver `plano-onboarding.test.ts`).
 *
 * R-100 (04/10/2026):
 *  - as 5 competências vêm do TOP 5 DO CARGO (`top5_workshop`), não do ranking
 *    de 10 da IA1, e menos de 5 falha alto (antes só recusava zero);
 *  - competência sem avaliação falha alto (antes entrava com o descritor
 *    "Descritor padrão" e uma nota 1,5 inventada);
 *  - a config EFETIVA (turma) vale, não só a da empresa;
 *  - o nível-meta 2 chega à seleção (o gap é medido contra 2, não contra 3).
 *
 * Mutação: ver o relatório do lote 11.
 */

let tdb = criarSupabaseMock();
vi.mock('@/lib/tenant-db', () => ({ tenantDb: () => tdb.client }));
const buildSeason = vi.hoisted(() => vi.fn());
vi.mock('@/lib/season-engine/build-season', () => ({ buildSeason }));
vi.mock('@/lib/degradacao', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/degradacao')>();
  return { ...mod, registrarDegradacao: vi.fn(async () => {}) };
});

import { gerarTemporadaCoreHeadless, resolverCompetenciasDoOnboarding } from '@/lib/season-engine/trilha-core';

const COLAB = {
  id: 'colab-1', nome_completo: 'Pessoa', cargo: 'Professor', empresa_id: 'emp-1',
  area_depto: null, programa_modo: null,
  pref_video_curto: null, pref_video_longo: null, pref_texto: null, pref_audio: null, pref_estudo_caso: null,
};

const TOP5 = ['Gestão de Sala', 'Planejamento de Aula', 'Avaliação', 'Comunicação', 'Postura'];

let top5: string[] = TOP5;
let foco: string[] = ['Gestão de Sala'];
/** Linhas de descriptor_assessments da pessoa: competência + descritor + nota. */
let avaliacoes: Array<{ competencia: string; descritor: string; nota: number }> = [];
let sysConfig: any = {};

const avaliacaoDe = (competencia: string, nota = 1.5) => [
  { competencia, descritor: `${competencia} D1`, nota },
  { competencia, descritor: `${competencia} D2`, nota: nota + 0.8 },
];

function montarTdb() {
  return criarSupabaseMock({
    resolver: (tabela) => {
      if (tabela === 'cargos_empresa') return { competencia_foco: foco[0] ?? null, competencias_foco: foco, top5_workshop: top5 };
      return null;
    },
    lista: (tabela) => (tabela === 'descriptor_assessments' ? avaliacoes : []),
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

beforeEach(() => {
  buildSeason.mockReset();
  buildSeason.mockImplementation(async ({ programaConfig }: any) =>
    Array.from({ length: programaConfig.semanas }, (_, i) => ({
      semana: i + 1,
      tipo: programaConfig.semanasAvaliacao.includes(i + 1) ? 'avaliacao' : 'conteudo',
    })),
  );
  top5 = TOP5;
  foco = ['Gestão de Sala'];
  avaliacoes = TOP5.flatMap((c) => avaliacaoDe(c));
  sysConfig = { programa_modo: 'onboarding' };
  tdb = montarTdb();
});

describe('Onboarding: as competências são o Top 5 do cargo', () => {
  it('gera a trilha das 5 competências do Top 5, na ordem, com a config do Onboarding', async () => {
    const r: any = await gerarTemporadaCoreHeadless(sbRaw(), { colaboradorId: 'colab-1' });
    expect(r.ok).toBe(true);
    expect(r.competencias).toEqual(TOP5);
    const args = buildSeason.mock.calls[0][0];
    expect(args.competencias).toEqual(TOP5);
    expect(args.programaConfig.modo).toBe('onboarding');
    expect(args.programaConfig.semanas).toBe(9);
    const t = upsertTrilha();
    expect(t.programa_modo).toBe('onboarding');
    expect(t.competencias_foco).toEqual(TOP5);
    expect(t.temporada_plano).toHaveLength(9);
  });

  it('não consulta mais o ranking de 10 da IA1 (top10_cargos)', async () => {
    await gerarTemporadaCoreHeadless(sbRaw(), { colaboradorId: 'colab-1' });
    expect(tdb.usou('top10_cargos', 'select')).toBe(false);
    expect(tdb.usou('cargos_empresa', 'select')).toBe(true);
  });

  it('o Top 5 casa com a avaliação sem depender de caixa, e o nome que vale é o da avaliação', async () => {
    top5 = ['gestão de sala', ...TOP5.slice(1)];
    const r: any = await gerarTemporadaCoreHeadless(sbRaw(), { colaboradorId: 'colab-1' });
    expect(r.ok).toBe(true);
    expect(r.competencias[0]).toBe('Gestão de Sala');
  });

  it('cargo SEM competência foco ainda gera: o Onboarding não usa o foco', async () => {
    foco = [];
    const r: any = await gerarTemporadaCoreHeadless(sbRaw(), { colaboradorId: 'colab-1' });
    expect(r.ok).toBe(true);
    expect(buildSeason).toHaveBeenCalledTimes(1);
  });

  it('a Jornada, essa sim, continua exigindo o foco', async () => {
    foco = [];
    sysConfig = { programa_modo: 'jornada' };
    const r: any = await gerarTemporadaCoreHeadless(sbRaw(), { colaboradorId: 'colab-1' });
    expect(r.error).toBe('Sem competência foco definida pra este colaborador');
    expect(buildSeason).not.toHaveBeenCalled();
  });
});

describe('Onboarding: falha ALTO em vez de montar uma trilha inventada', () => {
  it('Top 5 com menos de 5 competências: recusa, nada é gerado nem gravado', async () => {
    top5 = TOP5.slice(0, 3);
    const r: any = await gerarTemporadaCoreHeadless(sbRaw(), { colaboradorId: 'colab-1' });
    expect(r.codigo).toBe('onboarding_competencias_insuficientes');
    expect(r.error).toContain('3');
    expect(buildSeason).not.toHaveBeenCalled();
    expect(tdb.escritas).toEqual([]);
  });

  it('competência sem avaliação: recusa e diz QUAL, em vez de inventar o descritor padrão 1,5', async () => {
    avaliacoes = TOP5.slice(0, 4).flatMap((c) => avaliacaoDe(c));
    const r: any = await gerarTemporadaCoreHeadless(sbRaw(), { colaboradorId: 'colab-1' });
    expect(r.codigo).toBe('sem_assessment');
    expect(r.error).toContain('Postura');
    expect(buildSeason).not.toHaveBeenCalled();
    expect(tdb.escritas).toEqual([]);
  });

  it('falha de leitura das avaliações não vira "sem avaliação": volta o erro de leitura', async () => {
    tdb.falharEm({ tabela: 'descriptor_assessments', op: 'select', mensagem: 'timeout no pool' });
    const r: any = await gerarTemporadaCoreHeadless(sbRaw(), { colaboradorId: 'colab-1' });
    expect(r.codigo).toBe('onboarding_assessment_leitura');
    expect(r.error).toContain('timeout no pool');
    expect(buildSeason).not.toHaveBeenCalled();
  });

  it('falha de leitura do Top 5 também volta como erro de leitura, e não como "cargo sem Top 5"', async () => {
    tdb.falharEm({ tabela: 'cargos_empresa', op: 'select', mensagem: 'timeout no pool' });
    const r: any = await resolverCompetenciasDoOnboarding(tdb.client, { id: 'colab-1', cargo: 'Professor' }, {}, 5);
    expect(r.codigo).toBe('onboarding_top5_leitura');
    expect(r.error).toContain('timeout no pool');
  });
});

describe('Onboarding: nível-meta 2 chega à seleção', () => {
  it('o gap do descritor é medido contra o N2 (nota 1,5 → gap 0,5), e não contra o N3', async () => {
    await gerarTemporadaCoreHeadless(sbRaw(), { colaboradorId: 'colab-1' });
    const { descritoresSelecionados } = buildSeason.mock.calls[0][0];
    expect(descritoresSelecionados).toHaveLength(5);
    for (const d of descritoresSelecionados) {
      expect(d.nota_atual).toBe(1.5);
      expect(d.gap).toBeCloseTo(0.5, 5);
    }
  });
});

describe('resolverCompetenciasDoOnboarding', () => {
  const colab = { id: 'colab-1', cargo: 'Professor' };

  it('o override da config efetiva (turma) vem ANTES do Top 5 e o Top 5 completa', async () => {
    const r: any = await resolverCompetenciasDoOnboarding(tdb.client, colab, { competencias_onboarding: ['Postura', 'Comunicação'] }, 5);
    expect(r.competencias).toEqual(['Postura', 'Comunicação', 'Gestão de Sala', 'Planejamento de Aula', 'Avaliação']);
  });

  it('competência repetida (override e Top 5) conta uma vez', async () => {
    const r: any = await resolverCompetenciasDoOnboarding(tdb.client, colab, { competencias_onboarding: ['avaliação'] }, 5);
    expect(r.competencias).toHaveLength(5);
    expect(new Set(r.competencias.map((c: string) => c.toLowerCase())).size).toBe(5);
  });

  it('cargo sem Top 5 e sem override: onboarding_sem_competencias', async () => {
    top5 = [];
    const r: any = await resolverCompetenciasDoOnboarding(tdb.client, colab, {}, 5);
    expect(r.codigo).toBe('onboarding_sem_competencias');
  });

  it('lê o cargo pelo NOME do colaborador (competência é única por cargo)', async () => {
    await resolverCompetenciasDoOnboarding(tdb.client, colab, {}, 5);
    const eq = tdb.chamadas.find((c: Chamada) => c.tabela === 'cargos_empresa' && c.metodo === 'eq');
    expect(eq?.args).toEqual(['nome', 'Professor']);
  });
});
