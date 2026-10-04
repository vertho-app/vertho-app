import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { criarSupabaseMock } from '../../helpers/supabase-mock';

/**
 * O CALENDÁRIO do Onboarding de 12 semanas (04/10/2026): como o gate sequencial,
 * a duração, a posição do painel do gestor, o atraso, a cadência e o lote tratam
 * o deslocamento.
 *
 * O desenho: a semana 1 é o Mapeamento, que nasce CONCLUÍDO, e a semana 2 abre na
 * data de início da trilha (a pessoa acabou de mapear; não fica uma semana inteira
 * parada). Para que a invariante "a semana N abre em `data_inicio` + (N-1)*7 dias"
 * siga valendo para TODAS as peças, a trilha grava `data_inicio` UMA SEMANA ANTES
 * do início do conteúdo (`persistirTrilha`, provado em `geracao-onboarding.test.ts`).
 * Aqui se prova o que cada consumidor faz com essa trilha, pelas funções que rodam
 * em produção.
 *
 * Datas de novembro de 2026, numa semana sem feriado nacional (ver
 * `cadencia-relogio-trilha.test.ts`). A semana 2 abre na segunda 16/11 às 06:00 UTC
 * (03:00 de Brasília), então `data_inicio` gravado é 09/11.
 */

const h = vi.hoisted(() => ({
  sb: null as any,
  templates: {} as Record<string, string | null>,
  envioTemplate: vi.fn(),
  envioPilula: vi.fn(),
  email: vi.fn(),
  push: vi.fn(),
  fila: vi.fn(),
}));

vi.mock('@/lib/tenant-db', () => ({ tenantDb: () => ({ ...h.sb.client, raw: h.sb.client }) }));
vi.mock('@/lib/degradacao', () => ({ registrarDegradacao: vi.fn(async () => {}), DEGRADACAO: new Proxy({}, { get: (_t, p) => String(p) }) }));
vi.mock('@/lib/whatsapp', () => ({ assertFilaDoProvedorLimpa: vi.fn(async () => {}) }));
vi.mock('@/lib/qstash-publish', () => ({ publicarWhatsappCis: h.fila }));
vi.mock('@/lib/notifications/push-core', () => ({ enviarPush: h.push }));
vi.mock('@/lib/season-engine/formato-anunciado', () => ({
  formatosEntregaveis: async () => ['texto'],
  escolherFormatoAnunciado: () => 'texto',
}));
vi.mock('@/lib/notifications/pilula-template', () => ({
  templateAtivo: (papel: string) => h.templates[papel] ?? null,
  enviarPorTemplate: h.envioTemplate,
  enviarPilulaPorTemplate: h.envioPilula,
}));
vi.mock('@/lib/notifications/pilula-envio', async (orig) => ({
  ...(await orig<any>()),
  enviarEmailPilula: h.email,
}));

import {
  avaliarAcessoSemana, primeiraSemanaAcessivel, semanaPorData, semanaLiberadaPorData,
} from '@/lib/season-engine/week-gating';
import { duracaoDaTrilha, ehUltimaSemanaDaTrilha } from '@/lib/season-engine/duracao-trilha';
import { semanaCenarioBDoPlano, totalSemanasDoPlano, qualitativaDoPlano, ehSemanaDeImplementacao } from '@/lib/season-engine/trilha-runtime';
import { derivarPosicaoJornada } from '@/lib/engajamento/posicao-jornada';
import { estaAtrasada, semanasDeAtraso } from '@/lib/season-engine/atraso';
import { processarEmpresaDiario } from '@/lib/fase4/trigger-diario-empresa';
import { PROGRAMA_ONBOARDING } from '@/lib/season-engine/programa-config';

const COMPETENCIAS = ['Comp A', 'Comp B', 'Comp C', 'Comp D', 'Comp E'];

/** A semana 2 abre em 16/11; `data_inicio` é a segunda ANTERIOR, a do Mapeamento. */
const DATA_INICIO = '2026-11-09';

const conteudo = (semana: number) => ({
  semana, tipo: 'conteudo', competencia: COMPETENCIAS[Math.floor((semana - 2) / 2)], descritor: `D${semana}`,
  conteudos_dia: [
    { descritor: `D${semana}`, conteudo: { titulo: `Tema ${semana}`, core_titulo: `Tema ${semana}` } },
    { descritor: `D${semana}b`, conteudo: { titulo: `Tema ${semana}b`, core_titulo: `Tema ${semana}b` } },
  ],
});
const PLANO_ONBOARDING: any[] = [
  { semana: 1, tipo: 'mapeamento', descritor: null, descritores_cobertos: [], competencias_cobertas: COMPETENCIAS, status: 'disponivel' },
  ...[2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(conteudo),
  { semana: 12, tipo: 'avaliacao', descritor: null, descritores_cobertos: [], status: 'bloqueada' },
];
/** A linha de progresso da semana 1, como o gerador a grava: concluída, tipo `avaliacao` (CHECK da coluna). */
const MAPEAMENTO_CONCLUIDO = { semana: 1, tipo: 'avaliacao', status: 'concluido', concluido_em: '2026-11-04T18:00:00Z' };
const concluida = (semana: number) => ({ semana, tipo: 'conteudo', status: 'concluido' });
const MON_16_NOV = new Date('2026-11-16T12:00:00Z');

describe('gate sequencial: a semana 2 abre na data de início, liberada pelo mapeamento concluído', () => {
  const gate = (semana: number, now: string, progresso: any[]) =>
    avaliarAcessoSemana({ dataInicio: DATA_INICIO, plano: PLANO_ONBOARDING, progresso, semana, now: new Date(now) });

  it('antes da segunda 16/11: a semana 2 está trancada POR DATA, e diz quando libera', () => {
    const a = gate(2, '2026-11-12T15:00:00Z', [MAPEAMENTO_CONCLUIDO]);
    expect(a.liberada).toBe(false);
    expect(a.motivo).toBe('data');
    expect(a.liberaEm).toBe('seg 16/11');
  });

  it('a partir de 16/11 03:00 de Brasília: a semana 2 abre, porque a 1 está concluída', () => {
    expect(gate(2, '2026-11-16T05:59:00Z', [MAPEAMENTO_CONCLUIDO]).liberada).toBe(false);
    expect(gate(2, '2026-11-16T06:00:00Z', [MAPEAMENTO_CONCLUIDO]).liberada).toBe(true);
  });

  it('🔴 é a linha concluída que libera: sem ela a semana 2 trancaria como no R-20 (semana 1 que nunca conclui)', () => {
    const a = gate(2, '2026-11-17T12:00:00Z', []);
    expect(a.liberada).toBe(false);
    expect(a.motivo).toBe('anterior');
    expect(a.semanaPendente).toBe(1);
    expect(gate(2, '2026-11-17T12:00:00Z', [{ ...MAPEAMENTO_CONCLUIDO, status: 'em_andamento' }]).liberada).toBe(false);
  });

  it('a semana 3 abre uma semana depois, e só com a 2 concluída (gate sequencial normal daqui em diante)', () => {
    const semConcluir = gate(3, '2026-11-24T12:00:00Z', [MAPEAMENTO_CONCLUIDO]);
    expect(semConcluir).toMatchObject({ liberada: false, motivo: 'anterior', semanaPendente: 2 });
    expect(gate(3, '2026-11-24T12:00:00Z', [MAPEAMENTO_CONCLUIDO, concluida(2)]).liberada).toBe(true);
    expect(gate(3, '2026-11-20T12:00:00Z', [MAPEAMENTO_CONCLUIDO, concluida(2)])).toMatchObject({ liberada: false, motivo: 'data', liberaEm: 'seg 23/11' });
  });

  it('as datas de liberação: semana 2 em 16/11, semana 12 a dez semanas depois', () => {
    expect(semanaLiberadaPorData(DATA_INICIO, 2, new Date('2026-11-16T06:00:00Z'))).toBe(true);
    expect(semanaLiberadaPorData(DATA_INICIO, 12, new Date('2027-01-24T05:59:00Z'))).toBe(false);
    expect(semanaLiberadaPorData(DATA_INICIO, 12, new Date('2027-01-25T06:00:00Z'))).toBe(true);
  });

  it('a semana acessível: antes do início é a 1 (mapeamento, concluído); depois, a 2; e atrasado desce até a primeira em aberto', () => {
    const base = { dataInicio: DATA_INICIO, plano: PLANO_ONBOARDING, progresso: [MAPEAMENTO_CONCLUIDO] };
    expect(primeiraSemanaAcessivel({ ...base, semana: 1, now: new Date('2026-11-12T12:00:00Z') })).toBe(1);
    expect(primeiraSemanaAcessivel({ ...base, semana: 2, now: MON_16_NOV })).toBe(2);
    // Calendário na semana 5, só a 1 concluída: a pessoa está presa na 2, não na 1.
    expect(primeiraSemanaAcessivel({ ...base, semana: 5, now: new Date('2026-12-07T12:00:00Z') })).toBe(2);
  });
});

describe('duração: UMA conta, a da config, e o plano concorda', () => {
  it('duracaoDaTrilha = 12, pelo carimbo e pelo snapshot', () => {
    expect(duracaoDaTrilha({ programa_modo: 'onboarding' })).toBe(12);
    expect(duracaoDaTrilha({ programa_modo: 'onboarding', temporada_plano: PLANO_ONBOARDING })).toBe(12);
    expect(PROGRAMA_ONBOARDING.semanas).toBe(PLANO_ONBOARDING.length);
  });

  it('o plano e a config contam o mesmo: última semana 12, avaliação final 12, sem conversa qualitativa separada', () => {
    expect(totalSemanasDoPlano(PLANO_ONBOARDING, 14)).toBe(12);
    expect(semanaCenarioBDoPlano(PLANO_ONBOARDING)).toBe(12);
    expect(semanaCenarioBDoPlano(PLANO_ONBOARDING)).toBe(PROGRAMA_ONBOARDING.semanaCenarioB);
    expect(qualitativaDoPlano(PLANO_ONBOARDING)).toBeNull();
  });

  it('o fim do plano é a semana 12: a 11 ainda tem próxima, a 12 é a última', () => {
    expect(ehUltimaSemanaDaTrilha({ programa_modo: 'onboarding' }, 11)).toBe(false);
    expect(ehUltimaSemanaDaTrilha({ programa_modo: 'onboarding' }, 12)).toBe(true);
  });

  it('nenhuma semana do Onboarding é "de implementação" (não há missão)', () => {
    for (let s = 1; s <= 12; s++) expect(ehSemanaDeImplementacao(PLANO_ONBOARDING, s), `semana ${s}`).toBe(false);
  });
});

describe('painel do gestor: "x de 12", a semana acessível e o atraso', () => {
  const posicao = (semanaCalendario: number, now: string, progresso: any[]) =>
    derivarPosicaoJornada({
      semanaCalendario, dataInicio: DATA_INICIO, plano: PLANO_ONBOARDING, progresso, confiavel: true, now: new Date(now),
    });

  it('o total é 12, e o mapeamento já conta como concluído (1 de 12 na largada)', () => {
    const p = posicao(2, '2026-11-17T12:00:00Z', [MAPEAMENTO_CONCLUIDO]);
    expect(p.totalSemanas).toBe(12);
    expect(p.semanaAcessivel).toBe(2);
    expect(p.atrasada).toBe(false);
    expect(p.jornadaConcluida).toBe(false);
  });

  it('antes do início: a posição é a 1 (mapeamento concluído, aguardando a 2), e NÃO é atraso', () => {
    const p = posicao(1, '2026-11-12T12:00:00Z', [MAPEAMENTO_CONCLUIDO]);
    expect(p.semanaAcessivel).toBe(1);
    expect(p.semanaConcluida).toBe(true);
    expect(p.atrasada).toBe(false);
  });

  it('quem parou na 2 com o calendário na 4 está ATRASADO, e a semana acessível é a 2', () => {
    const p = posicao(4, '2026-12-01T12:00:00Z', [MAPEAMENTO_CONCLUIDO]);
    expect(p.semanaAcessivel).toBe(2);
    expect(p.semanaAberta).toBe(4);
    expect(p.atrasada).toBe(true);
  });

  it('a jornada só termina com a semana 12 concluída', () => {
    const quase = [MAPEAMENTO_CONCLUIDO, ...[2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(concluida)];
    expect(posicao(12, '2027-02-01T12:00:00Z', quase).jornadaConcluida).toBe(false);
    expect(posicao(12, '2027-02-01T12:00:00Z', [...quase, concluida(12)]).jornadaConcluida).toBe(true);
  });

  it('o atraso em semanas: concluídas + 1 contra o calendário (o mapeamento entra na conta)', () => {
    // Em 16/11 o calendário está na 2 e a pessoa concluiu 1 semana (o mapeamento): na 2, em dia.
    expect(estaAtrasada({ dataInicio: DATA_INICIO, totalSemanas: 12, semanasConcluidas: 1, agora: MON_16_NOV })).toBe(false);
    expect(semanasDeAtraso({ dataInicio: DATA_INICIO, totalSemanas: 12, semanasConcluidas: 1, agora: MON_16_NOV })).toBe(0);
    // Em 30/11 o calendário está na 4: quem só tem o mapeamento está 2 semanas atrás.
    expect(semanasDeAtraso({ dataInicio: DATA_INICIO, totalSemanas: 12, semanasConcluidas: 1, agora: new Date('2026-11-30T12:00:00Z') })).toBe(2);
    // Antes do início o calendário aponta a 1 e a pessoa já está na 2: nunca negativo.
    expect(semanasDeAtraso({ dataInicio: DATA_INICIO, totalSemanas: 12, semanasConcluidas: 1, agora: new Date('2026-11-12T12:00:00Z') })).toBe(0);
  });
});

/**
 * O cron diário, exercitado de verdade (sem envio real: os canais são stubs).
 */
const EMPRESA = { id: 'emp-1', slug: 'escola', is_demo: false, sys_config: {} };
const SEGUNDA_DO_MAPEAMENTO = { hoje: 1, hojeUTC: '2026-11-09', agora: '2026-11-09T12:00:00Z' };
const QUINTA_DO_MAPEAMENTO = { hoje: 4, hojeUTC: '2026-11-12', agora: '2026-11-12T12:00:00Z' };
const SEGUNDA_DA_SEMANA_2 = { hoje: 1, hojeUTC: '2026-11-16', agora: '2026-11-16T12:00:00Z' };
const QUINTA_DA_SEMANA_2 = { hoje: 4, hojeUTC: '2026-11-19', agora: '2026-11-19T12:00:00Z' };

function cron(opts: { semanaAtual: number; plano?: any[]; progresso?: any[]; jaRolou?: boolean }) {
  h.sb = criarSupabaseMock({
    lista: (tabela) => {
      if (tabela === 'fase4_envios') {
        return [{
          id: 'env-1', colaborador_id: 'c1', semana_atual: opts.semanaAtual, status: 'ativo',
          ultima_evidencia_em: opts.jaRolou ? '2026-11-12T10:00:00Z' : null,
          colaboradores: { nome_completo: 'Maria Souza', whatsapp: '+5571999990000', email: 'maria@x.br', perfil_dominante: 'S', cargo: 'Professora' },
        }];
      }
      if (tabela === 'trilhas') return [{ id: 't1', colaborador_id: 'c1', numero_temporada: 1, temporada_plano: opts.plano ?? PLANO_ONBOARDING, competencia_foco: 'Comp A', data_inicio: DATA_INICIO, status: 'ativa' }];
      if (tabela === 'temporada_semana_progresso') {
        return (opts.progresso ?? [MAPEAMENTO_CONCLUIDO]).map((p) => ({ trilha_id: 't1', colaborador_id: 'c1', ...p }));
      }
      return [];
    },
  });
}
const atualizacoesDoEnvio = () => h.sb.escritas.filter((e: any) => e.tabela === 'fase4_envios' && e.op === 'update');

describe('cadência × semana de mapeamento', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    h.templates = {};
    for (const f of [h.envioTemplate, h.envioPilula, h.email, h.push, h.fila]) f.mockReset();
    h.envioTemplate.mockResolvedValue({ tentou: true, ok: true });
    h.envioPilula.mockResolvedValue({ tentou: true, ok: true });
    h.email.mockResolvedValue({ ok: true });
    h.push.mockResolvedValue({ entregues: 0, falhas: 0 });
  });
  afterEach(() => { vi.useRealTimers(); });

  it('🔴 segunda da semana do mapeamento: nenhuma pílula (não há conteúdo), e conta como quem aguarda o início', async () => {
    vi.setSystemTime(new Date(SEGUNDA_DO_MAPEAMENTO.agora));
    cron({ semanaAtual: 1 });
    const r = await processarEmpresaDiario(EMPRESA, SEGUNDA_DO_MAPEAMENTO);
    expect(r.aguardandoInicio).toBe(1);
    expect(h.envioPilula).not.toHaveBeenCalled();
    expect(h.envioTemplate).not.toHaveBeenCalled();
    expect(h.email).not.toHaveBeenCalled();
    expect(atualizacoesDoEnvio()).toHaveLength(0);
  });

  it('🔴 quinta da semana do mapeamento: nenhuma cobrança de evidências; o relógio anda EM SILÊNCIO (1 → 2)', async () => {
    vi.setSystemTime(new Date(QUINTA_DO_MAPEAMENTO.agora));
    cron({ semanaAtual: 1 });
    const r = await processarEmpresaDiario(EMPRESA, QUINTA_DO_MAPEAMENTO);
    expect(r.aguardandoInicio).toBe(1);
    expect(h.envioTemplate).not.toHaveBeenCalled();
    expect(h.email).not.toHaveBeenCalled();
    expect(h.push).not.toHaveBeenCalled();
    // O relógio gravado chega à segunda do início já na 2: quem o lê sem alinhar pela
    // data (o lote manual, o painel) não pode ver a semana de mapeamento como a atual.
    const avanco = atualizacoesDoEnvio().find((e: any) => 'semana_atual' in e.payload);
    expect(avanco?.payload.semana_atual).toBe(2);
    expect(Object.keys(avanco?.payload ?? {}).sort()).toEqual(['semana_atual', 'ultima_evidencia_em']);
  });

  it('o avanço silencioso é uma vez por quinta: a segunda passada do dia não avança de novo', async () => {
    vi.setSystemTime(new Date(QUINTA_DO_MAPEAMENTO.agora));
    cron({ semanaAtual: 1, jaRolou: true });
    await processarEmpresaDiario(EMPRESA, QUINTA_DO_MAPEAMENTO);
    expect(atualizacoesDoEnvio()).toHaveLength(0);
  });

  it('falha ao gravar o avanço: registra, conta o erro e não derruba o cron', async () => {
    vi.setSystemTime(new Date(QUINTA_DO_MAPEAMENTO.agora));
    cron({ semanaAtual: 1 });
    h.sb.falharEm({ tabela: 'fase4_envios', op: 'update', mensagem: 'timeout no pool' });
    const r = await processarEmpresaDiario(EMPRESA, QUINTA_DO_MAPEAMENTO);
    expect(r.erros).toBe(1);
    expect(r.aguardandoInicio).toBe(1);
  });

  it('na segunda 16/11 a semana 2 abre: o relógio alinha pela data (1 → 2) e a PRIMEIRA pílula sai', async () => {
    vi.setSystemTime(new Date(SEGUNDA_DA_SEMANA_2.agora));
    cron({ semanaAtual: 1 });
    const r = await processarEmpresaDiario(EMPRESA, SEGUNDA_DA_SEMANA_2);
    expect(r.aguardandoInicio).toBe(0);
    expect(h.envioPilula).toHaveBeenCalledTimes(1);
    expect(h.envioPilula.mock.calls[0][0]).toMatchObject({ semana: 2 });
  });

  it('quinta 19/11: cobra o desafio da semana 2 e avança o relógio a partir do alinhado (2 → 3), não do gravado (1)', async () => {
    vi.setSystemTime(new Date(QUINTA_DA_SEMANA_2.agora));
    cron({ semanaAtual: 1 });
    await processarEmpresaDiario(EMPRESA, QUINTA_DA_SEMANA_2);
    expect(h.envioTemplate.mock.calls.map((c: any[]) => c[0])).toEqual(['desafio']);
    expect(h.envioTemplate.mock.calls[0][1]).toMatchObject({ semana: 2 });
    const avanco = atualizacoesDoEnvio().find((e: any) => 'semana_atual' in e.payload);
    expect(avanco?.payload.semana_atual).toBe(3);
  });

  it('o pulo é do TIPO da semana: a Jornada, que não tem semana de mapeamento, recebe a pílula da 1', async () => {
    vi.setSystemTime(new Date(SEGUNDA_DO_MAPEAMENTO.agora));
    const jornada = [1, 2, 3, 4, 5, 6].map((s) => ({ ...conteudo(s + 1), semana: s })).concat([{ semana: 7, tipo: 'avaliacao' } as any]);
    cron({ semanaAtual: 1, plano: jornada, progresso: [] });
    const r = await processarEmpresaDiario(EMPRESA, SEGUNDA_DO_MAPEAMENTO);
    expect(r.aguardandoInicio).toBe(0);
    expect(h.envioPilula).toHaveBeenCalledTimes(1);
    expect(h.envioPilula.mock.calls[0][0]).toMatchObject({ semana: 1 });
  });
});

describe('a semana do clock da cadência na largada', () => {
  it('semanaPorData devolve a semana 1 (mapeamento) até a segunda do início e a 2 depois', () => {
    expect(semanaPorData(DATA_INICIO, new Date('2026-11-12T12:00:00Z'))).toBe(1);
    expect(semanaPorData(DATA_INICIO, new Date('2026-11-16T06:00:00Z'))).toBe(2);
    expect(semanaPorData(DATA_INICIO, new Date('2026-11-23T06:00:00Z'))).toBe(3);
  });
});

describe('o que a rota e a home não deixam passar (guard de fonte)', () => {
  it('o cron pula por TIPO da semana, antes de qualquer envio ou avanço de relógio', () => {
    const f = readFileSync('lib/fase4/trigger-diario-empresa.ts', 'utf-8');
    const pulo = f.indexOf("plan?.tipo === 'mapeamento'");
    expect(pulo).toBeGreaterThan(0);
    expect(f.indexOf('semana_atual: semanaCalendario + 1')).toBeGreaterThan(pulo);
    expect(f.indexOf('enviarPilulaDia = async')).toBeGreaterThan(pulo);
  });

  it('a home não anuncia pílula nem cobra prazo de evidência da semana de mapeamento', () => {
    const f = readFileSync('lib/home/loaders.ts', 'utf-8');
    expect(f).toContain('semanaAtualEhMapeamento');
    expect(f).toMatch(/if \(semanaAtual > 0 && !semanaAtualEhMapeamento\) \{\s*\/\/ Tenta achar curso/);
    expect(f).toMatch(/let evidencia = null;\s*if \(semanaAtual > 0 && !semanaAtualEhMapeamento\)/);
  });

  it('marcar conteúdo como consumido na semana de mapeamento não toca a linha dela', () => {
    const f = readFileSync('actions/temporadas.ts', 'utf-8');
    expect(f).toContain("(t.temporada_plano || []).find((s: any) => s.semana === semana)?.tipo === 'mapeamento') return { ok: true };");
  });
});
