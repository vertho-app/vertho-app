import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';
import { aplicarEscopoDeTurma, manterDaTrilhaAlvo } from '@/lib/engajamento/escopo-turma';
import type { EscopoDeLeitura } from '@/lib/turmas/escopo-leitura';

/**
 * Engajamento por TURMA (07/10/2026). A pessoa que passou da "Turma 1" para a
 * "Temporada 2" tem duas trilhas, e `fase4_envios` é UMA linha por pessoa que a
 * jornada nova reescreve. Cada turma tem que olhar a trilha DA PARTICIPAÇÃO, e a
 * linha de envio só vale para a turma cuja trilha é a mais recente da pessoa.
 */

const MARCO = Date.parse('2026-10-07T12:22:33.000Z');
const HOJE = new Date('2026-10-20T12:00:00Z');

const envio = (id: string) => ({
  colaborador_id: id, semana_atual: 3, status: 'ativo', data_inicio: '2026-10-12',
  ultima_evidencia_em: '2026-10-18T10:00:00Z', ultima_pilula1_em: '2026-10-19T10:00:00Z', ultima_pilula2_em: '2026-10-19T11:00:00Z',
  colaboradores: { nome_completo: id.toUpperCase(), cargo: 'Gestão', pref_video_curto: 5 },
});
const trilha = (id: string, colab: string, temporada: number, membro: string | null, inicio: string) => ({
  id, colaborador_id: colab, numero_temporada: temporada, turma_membro_id: membro, data_inicio: inicio,
  criado_em: `${inicio}T00:00:00Z`, temporada_plano: [{ semana: 1, descritor: 'd1' }],
});

const escopoAntigo = (ids: string[]): EscopoDeLeitura => ({
  turmaId: 'T1', turmaNome: 'Turma 1', turmaStatus: 'em_jornada', colaboradorIds: ids,
  participacaoPorColab: new Map(ids.map((id) => [id, { id: `a-${id}`, ativa: false, janela: { de: null, ate: MARCO } }])),
});
const escopoNovo = (ids: string[]): EscopoDeLeitura => ({
  turmaId: 'T2', turmaNome: 'Temporada 2', turmaStatus: 'diagnostico', colaboradorIds: ids,
  participacaoPorColab: new Map(ids.map((id) => [id, { id: `n-${id}`, ativa: true, janela: { de: MARCO, ate: null } }])),
});

describe('aplicarEscopoDeTurma', () => {
  it('Ibipeba hoje: a turma NOVA ainda não tem jornada, então tem 0 inscritos (e a antiga mantém os dela)', () => {
    const envios = [envio('ana'), envio('bia')];
    const trilhas = [trilha('t-ana', 'ana', 1, 'a-ana', '2026-07-13'), trilha('t-bia', 'bia', 1, 'a-bia', '2026-07-13')];
    const nova = aplicarEscopoDeTurma({ envios, trilhas, escopo: escopoNovo(['ana', 'bia']), hoje: HOJE });
    expect(nova.envios).toEqual([]);
    const antiga = aplicarEscopoDeTurma({ envios, trilhas, escopo: escopoAntigo(['ana', 'bia']), hoje: HOJE });
    expect(antiga.envios.map((e) => e.colaborador_id)).toEqual(['ana', 'bia']);
    // A trilha atual de cada um É a da turma antiga: a linha de envio é dela, intacta.
    expect(antiga.envios[0].ultima_pilula1_em).toBe('2026-10-19T10:00:00Z');
    expect(antiga.comJornadaSeguinte).toBe(0);
  });

  it('jornada nova em curso: a linha é da turma NOVA; a antiga a recebe com o relógio neutralizado', () => {
    const envios = [envio('ana')];
    const trilhas = [
      trilha('t1', 'ana', 1, 'a-ana', '2026-07-13'),
      trilha('t2', 'ana', 2, 'n-ana', '2026-10-12'),
    ];
    const nova = aplicarEscopoDeTurma({ envios, trilhas, escopo: escopoNovo(['ana']), hoje: HOJE });
    expect(nova.trilhaPorColab.get('ana')!.id).toBe('t2');
    expect(nova.envios[0].ultima_pilula1_em).toBe('2026-10-19T10:00:00Z');
    expect(nova.comJornadaSeguinte).toBe(0);

    const antiga = aplicarEscopoDeTurma({ envios, trilhas, escopo: escopoAntigo(['ana']), hoje: HOJE });
    expect(antiga.trilhaPorColab.get('ana')!.id).toBe('t1');
    // O ✓ de envio e o relógio da jornada 2 não podem aparecer como se fossem da jornada 1.
    expect(antiga.envios[0]).toMatchObject({
      status: 'concluido', data_inicio: '2026-07-13',
      ultima_evidencia_em: null, ultima_pilula1_em: null, ultima_pilula2_em: null,
    });
    expect(antiga.envios[0].semana_atual).toBe(15);   // 13/07 a 20/10: semana 15 do calendário
    expect(antiga.comJornadaSeguinte).toBe(1);
  });

  it('quem não tem participação nesta turma, ou não tem trilha nela, fica de fora', () => {
    const envios = [envio('ana'), envio('bia'), envio('zeca')];
    const trilhas = [trilha('t-ana', 'ana', 1, 'a-ana', '2026-07-13'), trilha('t-zeca', 'zeca', 1, 'a-zeca', '2026-07-13')];
    const r = aplicarEscopoDeTurma({ envios, trilhas, escopo: escopoAntigo(['ana', 'bia']), hoje: HOJE });
    // zeca nem é da turma; bia é, mas não tem trilha.
    expect(r.envios.map((e) => e.colaborador_id)).toEqual(['ana']);
  });

  it('trilha carimbada com a participação de OUTRA turma não conta aqui', () => {
    const r = aplicarEscopoDeTurma({
      envios: [envio('ana')],
      trilhas: [trilha('t1', 'ana', 1, 'outra-participacao', '2026-07-13')],
      escopo: escopoAntigo(['ana']), hoje: HOJE,
    });
    expect(r.envios).toEqual([]);
  });
});

describe('manterDaTrilhaAlvo', () => {
  const alvo = new Map([['ana', { id: 't1' }]]);
  const janelas = new Map([['ana', { de: null, ate: MARCO }]]);
  const instante = (r: any) => r.criado_em;

  it('mantém só as linhas da trilha-alvo da pessoa', () => {
    const linhas = [
      { colaborador_id: 'ana', trilha_id: 't1', semana: 1 },
      { colaborador_id: 'ana', trilha_id: 't2', semana: 1 },
    ];
    expect(manterDaTrilhaAlvo(linhas, alvo, janelas, instante)).toEqual([linhas[0]]);
  });

  it('linha legada (sem trilha_id) entra só se o instante cai na janela da participação', () => {
    const antes = { colaborador_id: 'ana', trilha_id: null, criado_em: '2026-08-01T00:00:00Z' };
    const depois = { colaborador_id: 'ana', trilha_id: null, criado_em: '2026-10-09T00:00:00Z' };
    expect(manterDaTrilhaAlvo([antes, depois], alvo, janelas, instante)).toEqual([antes]);
  });

  it('pessoa sem trilha-alvo não deixa linha nenhuma passar', () => {
    expect(manterDaTrilhaAlvo([{ colaborador_id: 'bia', trilha_id: 't9' }], alvo, janelas, instante)).toEqual([]);
  });
});

// ── roll-up de ponta a ponta, com o banco falso ────────────────────────────────────
let ENVIOS = [envio('ana'), envio('bia')];
let TRILHAS: any[] = [];
const PROGRESSO = [
  { trilha_id: 't1', colaborador_id: 'ana', semana: 1, tipo: 'conteudo', status: 'concluido', qualidade: null, conteudo_consumido: true },
];
const EVENTO_T1 = { trilha_id: 't1', colaborador_id: 'ana', pilula: 1, semana: 1, formato: 'texto', tipo: 'formato', criado_em: '2026-07-20T10:00:00Z' };
let EVENTOS: any[] = [EVENTO_T1];

let VIDEOS: any[] = [];

const sb = criarSupabaseMock({
  lista: (tabela, cols) => {
    if (tabela === 'fase4_envios') return ENVIOS;
    if (tabela === 'trilhas') return TRILHAS;
    if (tabela === 'trilha_eventos') return EVENTOS;
    if (tabela === 'videos_watched') return VIDEOS;
    if (tabela === 'temporada_semana_progresso') return cols.includes('tipo') ? PROGRESSO : [];
    return [];
  },
});

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/tenant-db', () => ({ tenantDb: () => ({ from: (tabela: string) => sb.client.from(tabela), raw: sb.client }) }));

describe('rollUpEngajamento com turma', () => {
  beforeEach(() => {
    sb.reset();
    VIDEOS = [];
    ENVIOS = [envio('ana'), envio('bia')];
    TRILHAS = [trilha('t1', 'ana', 1, 'a-ana', '2026-07-13'), trilha('t1b', 'bia', 1, 'a-bia', '2026-07-13')];
  });

  it('SEM turma nada muda: as duas pessoas, na trilha mais recente (controle)', async () => {
    const { rollUpEngajamento } = await import('@/lib/engajamento/roll-up');
    const r: any = await rollUpEngajamento('emp');
    expect(r.resumo.inscritos).toBe(2);
    expect(r.resumo.turma).toBeUndefined();
  });

  it('a turma antiga mostra as duas; a turma nova, 0 inscritos', async () => {
    const { rollUpEngajamento } = await import('@/lib/engajamento/roll-up');
    const antiga: any = await rollUpEngajamento('emp', null, null, null, escopoAntigo(['ana', 'bia']));
    expect(antiga.resumo.inscritos).toBe(2);
    expect(antiga.resumo.turma).toEqual({ id: 'T1', nome: 'Turma 1', jornadaSeguinte: 0 });
    const nova: any = await rollUpEngajamento('emp', null, null, null, escopoNovo(['ana', 'bia']));
    expect(nova.resumo.inscritos).toBe(0);
  });

  it('turma vazia é NINGUÉM, nunca a empresa toda (fail-closed)', async () => {
    const { rollUpEngajamento } = await import('@/lib/engajamento/roll-up');
    const vazio = { ...escopoNovo([]), colaboradorIds: [] };
    const r: any = await rollUpEngajamento('emp', null, null, null, vazio);
    expect(r.resumo.inscritos).toBe(0);
    expect(r.colaboradores).toEqual([]);
    // E nem chega a LER a cadência da empresa: o filtro por participação descartaria todo
    // mundo depois e a saída seria a mesma, mas a leitura da empresa inteira já teria saído.
    expect(sb.chamadas.some((c) => c.tabela === 'fase4_envios')).toBe(false);
  });

  it('com a jornada 2 em curso, a antiga conta a pessoa na trilha 1 e avisa que a cadência é de outra turma', async () => {
    TRILHAS = [trilha('t1', 'ana', 1, 'a-ana', '2026-07-13'), trilha('t2', 'ana', 2, 'n-ana', '2026-10-12'), trilha('t1b', 'bia', 1, 'a-bia', '2026-07-13')];
    const { rollUpEngajamento } = await import('@/lib/engajamento/roll-up');
    const antiga: any = await rollUpEngajamento('emp', null, null, null, escopoAntigo(['ana', 'bia']));
    expect(antiga.resumo.turma.jornadaSeguinte).toBe(1);
    const ana = antiga.colaboradores.find((c: any) => c.colaboradorId === 'ana');
    // O envio da jornada 2 não vira "recebeu" da jornada 1.
    expect(ana.recebeuP1).not.toBe(true);
    // A pessoa é lida na trilha 1: ela fechou a única semana do plano da jornada 1.
    expect(ana.jornadaConcluida).toBe(true);
    const nova: any = await rollUpEngajamento('emp', null, null, null, escopoNovo(['ana', 'bia']));
    expect(nova.resumo.inscritos).toBe(1);
    expect(nova.colaboradores[0].colaboradorId).toBe('ana');
    // E na turma nova ela é lida na trilha 2, que ainda não tem nenhuma semana concluída.
    expect(nova.colaboradores[0].jornadaConcluida).toBe(false);
  });

  it('o play de vídeo da jornada SEGUINTE não conta na turma antiga (videos_watched não tem trilha_id)', async () => {
    TRILHAS = [trilha('t1', 'ana', 1, 'a-ana', '2026-07-13'), trilha('t2', 'ana', 2, 'n-ana', '2026-10-12'), trilha('t1b', 'bia', 1, 'a-bia', '2026-07-13')];
    // A jornada 2 está na semana 1 do relógio; a jornada 1 (fechada) lê a semana 2 dos sinais.
    ENVIOS = [{ ...envio('ana'), semana_atual: 1 }, envio('bia')];
    // Cada play bate com a semana de UMA das leituras, e os dois são posteriores ao início da
    // trilha 1: o que impede o play da semana 2 de contar na turma antiga é só o fim da janela.
    VIDEOS = [
      { colaborador_id: 'ana', semana: 1, event_type: 'play_finished', seconds_watched: 250, video_length: 250, created_at: '2026-10-15T10:00:00Z' },
      { colaborador_id: 'ana', semana: 2, event_type: 'play_finished', seconds_watched: 250, video_length: 250, created_at: '2026-10-15T11:00:00Z' },
    ];
    const { rollUpEngajamento } = await import('@/lib/engajamento/roll-up');
    const antiga: any = await rollUpEngajamento('emp', null, null, null, escopoAntigo(['ana', 'bia']));
    const anaAntiga = antiga.colaboradores.find((c: any) => c.colaboradorId === 'ana');
    expect(anaAntiga.semanaDoSinal).toBe(2);        // a semana do play que NÃO pode contar
    expect(anaAntiga.terminouVideo).toBe(false);
    const nova: any = await rollUpEngajamento('emp', null, null, null, escopoNovo(['ana', 'bia']));
    expect(nova.colaboradores[0].semanaDoSinal).toBe(1);
    expect(nova.colaboradores[0].terminouVideo).toBe(true);
  });

  it('erro ao ler as trilhas da turma sobe como erro, não como "ninguém"', async () => {
    sb.falharEm({ tabela: 'trilhas', op: 'select', mensagem: 'timeout no pool' });
    const { rollUpEngajamento } = await import('@/lib/engajamento/roll-up');
    const r: any = await rollUpEngajamento('emp', null, null, null, escopoAntigo(['ana', 'bia']));
    expect(r.resumo.erro).toBe('timeout no pool');
  });
});

describe('carregarEvolucaoEngajamento com turma', () => {
  beforeEach(() => {
    sb.reset();
    ENVIOS = [envio('ana'), envio('bia')];
    TRILHAS = [trilha('t1', 'ana', 1, 'a-ana', '2026-07-13'), trilha('t1b', 'bia', 1, 'a-bia', '2026-07-13')];
    EVENTOS = [EVENTO_T1];
  });

  it('os sinais de cada semana são os da trilha da turma: o evento da jornada 2 não ativa a semana 2 da jornada 1', async () => {
    TRILHAS = [trilha('t1', 'ana', 1, 'a-ana', '2026-07-13'), trilha('t2', 'ana', 2, 'n-ana', '2026-10-12'), trilha('t1b', 'bia', 1, 'a-bia', '2026-07-13')];
    EVENTOS = [EVENTO_T1, { ...EVENTO_T1, trilha_id: 't2', semana: 2, criado_em: '2026-10-15T10:00:00Z' }];
    const { carregarEvolucaoEngajamento } = await import('@/lib/engajamento/evolucao');
    const ativadosNaSemana = (r: any, semana: number) => r.data.semanas.find((s: any) => s.semana === semana)?.ativados;

    const antiga: any = await carregarEvolucaoEngajamento('emp', null, escopoAntigo(['ana', 'bia']));
    expect(ativadosNaSemana(antiga, 1)).toBe(1);   // o evento da trilha 1
    expect(ativadosNaSemana(antiga, 2)).toBe(0);   // o da trilha 2 é de outra turma

    const nova: any = await carregarEvolucaoEngajamento('emp', null, escopoNovo(['ana', 'bia']));
    expect(ativadosNaSemana(nova, 2)).toBe(1);
    expect(ativadosNaSemana(nova, 1)).toBe(0);     // e o da trilha 1 não é desta
  });

  it('sem turma, a empresa inteira (controle); com turma, só a população dela', async () => {
    const { carregarEvolucaoEngajamento } = await import('@/lib/engajamento/evolucao');
    const todas: any = await carregarEvolucaoEngajamento('emp');
    expect(todas.ok).toBe(true);
    expect(todas.data.inscritos).toBe(2);
    const antiga: any = await carregarEvolucaoEngajamento('emp', null, escopoAntigo(['ana', 'bia']));
    expect(antiga.data.inscritos).toBe(2);
    const nova: any = await carregarEvolucaoEngajamento('emp', null, escopoNovo(['ana', 'bia']));
    expect(nova.data.inscritos).toBe(0);
  });
});
