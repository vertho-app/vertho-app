import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
 * Onboarding de 12 semanas (04/10/2026):
 *  - 4 descritores DISTINTOS por competência (2 por semana, 2 semanas), e falta de
 *    descritor falha ALTO, com a conta de cada competência;
 *  - a semana 1 (Mapeamento) NASCE concluída, na data em que a ÚLTIMA competência
 *    foi avaliada, e a semana 2 nasce em andamento;
 *  - o calendário recua uma semana: `data_inicio` é a segunda anterior ao início
 *    do conteúdo, e a semana 2 abre na data de início da trilha.
 *
 * Mutação: ver o relatório do lote 11 e o do lote d-onb.
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
let avaliacoes: Array<{ competencia: string; descritor: string; nota: number; assessment_date?: string | null }> = [];
let sysConfig: any = {};

/** 4 descritores por competência: o que o Onboarding de 12 semanas exige (2 por semana x 2 semanas). */
const avaliacaoDe = (competencia: string, nota = 1.5, quando: string | null = '2026-09-20T12:00:00Z') => [
  { competencia, descritor: `${competencia} D1`, nota, assessment_date: quando },
  { competencia, descritor: `${competencia} D2`, nota: nota + 0.2, assessment_date: quando },
  { competencia, descritor: `${competencia} D3`, nota: nota + 0.5, assessment_date: quando },
  { competencia, descritor: `${competencia} D4`, nota: nota + 0.8, assessment_date: quando },
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
/** Os upserts de progresso, na ordem: o dos que nascem pendentes/em andamento e o dos que nascem concluídos. */
const upsertsProgresso = () => tdb.escritas.filter((e) => e.tabela === 'temporada_semana_progresso' && e.op === 'upsert').map((e) => e.payload);

beforeEach(() => {
  buildSeason.mockReset();
  buildSeason.mockImplementation(async ({ programaConfig }: any) =>
    Array.from({ length: programaConfig.semanas }, (_, i) => ({
      semana: i + 1,
      tipo: (programaConfig.semanasMapeamento ?? []).includes(i + 1)
        ? 'mapeamento'
        : programaConfig.semanasAvaliacao.includes(i + 1) ? 'avaliacao' : 'conteudo',
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
    expect(args.programaConfig.semanas).toBe(12);
    const t = upsertTrilha();
    expect(t.programa_modo).toBe('onboarding');
    expect(t.competencias_foco).toEqual(TOP5);
    expect(t.temporada_plano).toHaveLength(12);
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
    // 4 descritores por competência (nota 1,5; 1,7; 2,0; 2,3): o de nota 1,5 tem gap 0,5 contra o N2.
    expect(descritoresSelecionados).toHaveLength(20);
    const primeiros = descritoresSelecionados.filter((d: any) => d.nota_atual === 1.5);
    expect(primeiros).toHaveLength(5);
    for (const d of primeiros) expect(d.gap).toBeCloseTo(0.5, 5);
    // Nota acima do N2 não vira gap negativo.
    expect(descritoresSelecionados.every((d: any) => d.gap >= 0)).toBe(true);
  });
});

describe('Onboarding de 12 semanas: 4 descritores distintos por competência', () => {
  it('seleciona 4 por competência, 2 em cada semana, nas semanas 2 a 11', async () => {
    await gerarTemporadaCoreHeadless(sbRaw(), { colaboradorId: 'colab-1' });
    const { descritoresSelecionados } = buildSeason.mock.calls[0][0];
    expect(descritoresSelecionados).toHaveLength(20);
    for (const comp of TOP5) {
      expect(descritoresSelecionados.filter((d: any) => d.competencia === comp)).toHaveLength(4);
    }
    const semanas = descritoresSelecionados.flatMap((d: any) => d.semanas_ids).sort((a: number, b: number) => a - b);
    expect(semanas).toEqual([2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11]);
  });

  it('competência com 3 descritores avaliados: falha ALTO, diz qual e quantos, e nada é gravado', async () => {
    avaliacoes = [...TOP5.slice(0, 4).flatMap((c) => avaliacaoDe(c)), ...avaliacaoDe('Postura').slice(0, 3)];
    const r: any = await gerarTemporadaCoreHeadless(sbRaw(), { colaboradorId: 'colab-1' });
    expect(r.codigo).toBe('onboarding_descritores_insuficientes');
    expect(r.error).toContain('Postura (3 de 4)');
    expect(r.error).not.toContain('Gestão de Sala');
    expect(buildSeason).not.toHaveBeenCalled();
    expect(tdb.escritas).toEqual([]);
  });

  it('várias competências curtas aparecem todas na mensagem, na ordem do Top 5', async () => {
    avaliacoes = [
      ...avaliacaoDe('Gestão de Sala').slice(0, 2),
      ...TOP5.slice(1, 4).flatMap((c) => avaliacaoDe(c)),
      ...avaliacaoDe('Postura').slice(0, 3),
    ];
    const r: any = await gerarTemporadaCoreHeadless(sbRaw(), { colaboradorId: 'colab-1' });
    expect(r.codigo).toBe('onboarding_descritores_insuficientes');
    expect(r.error.indexOf('Gestão de Sala (2 de 4)')).toBeGreaterThan(-1);
    expect(r.error.indexOf('Postura (3 de 4)')).toBeGreaterThan(r.error.indexOf('Gestão de Sala (2 de 4)'));
  });
});

describe('Onboarding de 12 semanas: a semana do Mapeamento nasce concluída', () => {
  const quarta = new Date('2026-10-07T15:00:00Z');

  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(quarta); });
  afterEach(() => { vi.useRealTimers(); });

  /** A linha de progresso que o upsert gravou para a semana, em qualquer dos dois lotes. */
  const linhaDaSemana = (semana: number) => upsertsProgresso().flat().find((l: any) => l.semana === semana);

  it('a semana 1 é gravada CONCLUÍDA, com a data da última competência mapeada, num lote à parte', async () => {
    avaliacoes = [
      ...TOP5.slice(0, 4).flatMap((c) => avaliacaoDe(c, 1.5, '2026-09-20T12:00:00Z')),
      ...avaliacaoDe('Postura', 1.5, '2026-09-24T18:30:00Z'),
    ];
    const r: any = await gerarTemporadaCoreHeadless(sbRaw(), { colaboradorId: 'colab-1' });
    expect(r.ok).toBe(true);
    const lotes = upsertsProgresso();
    expect(lotes).toHaveLength(2);
    const nascidasConcluidas = lotes.find((l: any[]) => l.some((x: any) => x.status === 'concluido'))!;
    expect(nascidasConcluidas).toHaveLength(1);
    expect(nascidasConcluidas[0]).toMatchObject({
      semana: 1, status: 'concluido',
      iniciado_em: '2026-09-24T18:30:00.000Z',
      concluido_em: '2026-09-24T18:30:00.000Z',
    });
  });

  it('a linha dela grava o tipo `mapeamento` (a CHECK da coluna o aceita desde a mig 275), igual ao do plano', async () => {
    await gerarTemporadaCoreHeadless(sbRaw(), { colaboradorId: 'colab-1' });
    expect(linhaDaSemana(1)?.tipo).toBe('mapeamento');
    const plano = upsertTrilha().temporada_plano;
    expect(plano[0].tipo).toBe('mapeamento');
  });

  it('em TODAS as semanas a linha espelha o tipo do slot do plano (a avaliação final segue `avaliacao`, o resto `conteudo`)', async () => {
    await gerarTemporadaCoreHeadless(sbRaw(), { colaboradorId: 'colab-1' });
    const plano = upsertTrilha().temporada_plano;
    expect(plano).toHaveLength(12);
    for (const slot of plano) expect(linhaDaSemana(slot.semana)?.tipo, `semana ${slot.semana}`).toBe(slot.tipo);
    expect(plano.map((s: any) => s.tipo)).toEqual(
      ['mapeamento', ...Array(10).fill('conteudo'), 'avaliacao'],
    );
  });

  it('a semana 2 nasce em andamento (libera sozinha, como se a 1 tivesse acabado de concluir) e as outras, pendentes', async () => {
    await gerarTemporadaCoreHeadless(sbRaw(), { colaboradorId: 'colab-1' });
    expect(linhaDaSemana(2)?.status).toBe('em_andamento');
    for (let n = 3; n <= 12; n++) expect(linhaDaSemana(n)?.status, `semana ${n}`).toBe('pendente');
    expect(upsertsProgresso().flat()).toHaveLength(12);
  });

  it('o lote comum não grava datas (só o das linhas que nascem concluídas)', async () => {
    await gerarTemporadaCoreHeadless(sbRaw(), { colaboradorId: 'colab-1' });
    const comum = upsertsProgresso().find((l: any[]) => !l.some((x: any) => x.status === 'concluido'))!;
    expect(comum).toHaveLength(11);
    expect(comum.every((l: any) => !('concluido_em' in l) && !('iniciado_em' in l))).toBe(true);
  });

  it('sem data nas avaliações (importadas sem carimbo): a semana nasce concluída AGORA', async () => {
    avaliacoes = TOP5.flatMap((c) => avaliacaoDe(c, 1.5, null));
    await gerarTemporadaCoreHeadless(sbRaw(), { colaboradorId: 'colab-1' });
    expect(linhaDaSemana(1)).toMatchObject({ status: 'concluido', concluido_em: quarta.toISOString() });
  });

  it('o calendário recua uma semana: a semana 2 abre na PRÓXIMA segunda, a data de início da trilha', async () => {
    await gerarTemporadaCoreHeadless(sbRaw(), { colaboradorId: 'colab-1' });
    // Quarta 07/10: a próxima segunda é 12/10, e `data_inicio` é a segunda ANTERIOR, 05/10.
    expect(upsertTrilha().data_inicio).toBe('2026-10-05');
    const { semanaLiberadaEm } = await import('@/lib/season-engine/week-gating');
    expect(semanaLiberadaEm(upsertTrilha().data_inicio, 2)?.toISOString()).toBe('2026-10-12T06:00:00.000Z');
    expect(semanaLiberadaEm(upsertTrilha().data_inicio, 3)?.toISOString()).toBe('2026-10-19T06:00:00.000Z');
    expect(semanaLiberadaEm(upsertTrilha().data_inicio, 12)?.toISOString()).toBe('2026-12-21T06:00:00.000Z');
  });

  it('a Jornada NÃO recua o calendário nem tem semana concluída no nascimento', async () => {
    sysConfig = { programa_modo: 'jornada' };
    avaliacoes = avaliacaoDe('Gestão de Sala');
    const r: any = await gerarTemporadaCoreHeadless(sbRaw(), { colaboradorId: 'colab-1' });
    expect(r.error).toBeUndefined();
    expect(upsertTrilha().data_inicio).toBe('2026-10-12');
    expect(upsertsProgresso().flat().some((l: any) => l.status === 'concluido')).toBe(false);
    expect(upsertsProgresso().flat().find((l: any) => l.semana === 1)?.status).toBe('em_andamento');
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
