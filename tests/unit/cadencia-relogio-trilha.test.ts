import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * R-15 (03/10/2026): a cadência semanal e o calendário da TRILHA.
 *
 * Três defeitos com a mesma raiz, o relógio da cadência (`fase4_envios.
 * semana_atual`) descolado da trilha:
 *  1. o encadeamento criava a jornada 2 sem tocar na cadência (coberto em
 *     `jornada-encadeamento.test.ts`, onde a reativação é provada);
 *  2. "Iniciar envios" regravava `semana_atual: 1` em todo mundo com trilha
 *     ativa, rebobinando quem estava no meio;
 *  3. o cron cobrava e avançava o relógio de trilha que ainda não começou, e
 *     não tinha como alinhar quem foi reinscrito no meio.
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

import { semanaPorData } from '@/lib/season-engine/week-gating';
import { inscreverNaCadencia, reativarCadencia } from '@/lib/envios/inscricao-core';
import { processarEmpresaDiario } from '@/lib/fase4/trigger-diario-empresa';

describe('semanaPorData: a semana do calendário da trilha, pela data', () => {
  // A semana N abre na segunda às 06:00 UTC (03:00 de Brasília).
  const INICIO = '2026-10-19';
  it('antes da abertura da semana 1 → 0 (a trilha não começou)', () => {
    expect(semanaPorData(INICIO, new Date('2026-10-19T05:59:00Z'))).toBe(0);
    expect(semanaPorData(INICIO, new Date('2026-10-15T12:00:00Z'))).toBe(0);
  });
  it('na abertura e durante a semana → 1', () => {
    expect(semanaPorData(INICIO, new Date('2026-10-19T06:00:00Z'))).toBe(1);
    expect(semanaPorData(INICIO, new Date('2026-10-25T23:00:00Z'))).toBe(1);
  });
  it('quatro segundas depois → 4', () => {
    expect(semanaPorData(INICIO, new Date('2026-11-09T12:00:00Z'))).toBe(4);
  });
  it('sem data (ou data ilegível) → null, e quem chama decide', () => {
    expect(semanaPorData(null)).toBeNull();
    expect(semanaPorData('não é data')).toBeNull();
  });
});

describe('inscreverNaCadencia: "Iniciar envios" não rebobina quem já está ativo', () => {
  const AGORA = new Date('2026-11-09T12:00:00Z');
  const mock = (envios: any[]) => criarSupabaseMock({
    lista: (tabela) => {
      if (tabela === 'trilhas') {
        return [
          { colaborador_id: 'ativa', numero_temporada: 1, data_inicio: '2026-10-19' },
          { colaborador_id: 'concluida', numero_temporada: 2, data_inicio: '2026-10-19' },
          { colaborador_id: 'nova', numero_temporada: 1, data_inicio: '2026-11-16' },
        ];
      }
      if (tabela === 'colaboradores') {
        return ['ativa', 'concluida', 'nova'].map((id) => ({ id, nome_completo: id, email: `${id}@x.br`, cargo: 'P', whatsapp: null }));
      }
      if (tabela === 'fase4_envios') return envios;
      return [];
    },
  });

  it('a linha ATIVA fica de fora do upsert; a concluída e a nova entram no relógio da trilha', async () => {
    const sb = mock([
      { email: 'ativa@x.br', status: 'ativo' },
      { email: 'concluida@x.br', status: 'concluido' },
    ]);
    const r = await inscreverNaCadencia(sb.client, { agora: AGORA });
    expect(r.success).toBe(true);
    expect(r.inscritos).toBe(2);
    const up = sb.escritas.find((e) => e.tabela === 'fase4_envios' && e.op === 'upsert');
    const porEmail = Object.fromEntries((up?.payload || []).map((row: any) => [row.email, row]));
    expect(porEmail['ativa@x.br']).toBeUndefined();
    // Trilha começou em 19/10: na segunda 09/11 está na semana 4, não na 1.
    expect(porEmail['concluida@x.br']).toMatchObject({ status: 'ativo', semana_atual: 4, data_inicio: '2026-10-19' });
    // Trilha que ainda não começou: relógio 1.
    expect(porEmail['nova@x.br']).toMatchObject({ semana_atual: 1, data_inicio: '2026-11-16' });
    expect(r.message).toContain('1 já estava(m) ativo(s)');
  });

  it('a leitura das linhas existentes é paginada e ordenada (o corte de 1.000 não vira "ninguém ativo")', async () => {
    const sb = mock([]);
    await inscreverNaCadencia(sb.client, { agora: AGORA });
    expect(sb.usou('fase4_envios', 'range')).toBe(true);
    expect(sb.usou('fase4_envios', 'order', 'id')).toBe(true);
  });

  it('falha ao ler quem já está ativo: NÃO grava nada (gravar às cegas seria rebobinar)', async () => {
    const sb = mock([]);
    sb.falharEm({ tabela: 'fase4_envios', op: 'select', mensagem: 'timeout no pool' });
    const r = await inscreverNaCadencia(sb.client, { agora: AGORA });
    expect(r.success).toBe(false);
    expect(sb.escritas.filter((e) => e.tabela === 'fase4_envios')).toHaveLength(0);
  });
});

describe('reativarCadencia', () => {
  it('só linhas ativo/concluido da pessoa; pausado é decisão de operador', async () => {
    const sb = criarSupabaseMock({ escrita: () => [{ id: 'e1' }] });
    const r = await reativarCadencia(sb.client, 'c1', { dataInicio: '2026-11-16' });
    expect(r).toEqual({ linhas: 1 });
    expect(sb.escritas[0].payload).toEqual({ status: 'ativo', semana_atual: 1, data_inicio: '2026-11-16' });
    const filtro = sb.chamadas.find((c) => c.metodo === 'in');
    expect(filtro?.args).toEqual(['status', ['ativo', 'concluido']]);
  });

  it('erro do banco volta como erro, nunca como "0 linhas"', async () => {
    const sb = criarSupabaseMock();
    sb.falharEm({ tabela: 'fase4_envios', op: 'update', mensagem: 'timeout no pool' });
    expect(await reativarCadencia(sb.client, 'c1')).toEqual({ erro: 'timeout no pool' });
  });
});

/**
 * O cron diário, exercitado de verdade (sem envio real: os canais são stubs).
 * Datas em novembro de 2026, numa semana sem feriado nacional.
 */
const SEGUNDA = { hoje: 1, hojeUTC: '2026-11-09', agora: '2026-11-09T12:00:00Z' };
const QUINTA = { hoje: 4, hojeUTC: '2026-11-12', agora: '2026-11-12T12:00:00Z' };
const EMPRESA = { id: 'emp-1', slug: 'escola', is_demo: false, sys_config: {} };

const conteudo = (semana: number) => ({
  semana, tipo: 'conteudo', descritor: `D${semana}`,
  conteudos_dia: [{ descritor: `D${semana}`, conteudo: { titulo: `Tema ${semana}` } }, { descritor: `D${semana}b`, conteudo: { titulo: `Tema ${semana}b` } }],
});
const PLANO_JORNADA = [1, 2, 3, 4, 5, 6].map(conteudo).concat([{ semana: 7, tipo: 'avaliacao' } as any]);

function cron(opts: { semanaAtual: number; dataInicio: string; concluidas: number[]; progresso?: any[] }) {
  h.sb = criarSupabaseMock({
    lista: (tabela) => {
      if (tabela === 'fase4_envios') {
        return [{
          id: 'env-1', colaborador_id: 'c1', semana_atual: opts.semanaAtual, status: 'ativo',
          colaboradores: { nome_completo: 'Maria Souza', whatsapp: '+5571999990000', email: 'maria@x.br', perfil_dominante: 'S', cargo: 'Professora' },
        }];
      }
      if (tabela === 'trilhas') return [{ id: 't1', colaborador_id: 'c1', numero_temporada: 1, temporada_plano: PLANO_JORNADA, competencia_foco: 'Planejamento', data_inicio: opts.dataInicio }];
      if (tabela === 'temporada_semana_progresso') {
        return opts.progresso ?? opts.concluidas.map((s) => ({ trilha_id: 't1', colaborador_id: 'c1', semana: s, status: 'concluido' }));
      }
      return [];
    },
  });
}

const atualizacoesDoEnvio = () => h.sb.escritas.filter((e: any) => e.tabela === 'fase4_envios' && e.op === 'update');

describe('cron diário × calendário da trilha', () => {
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

  it('🔴 trilha que ainda NÃO começou: nenhuma mensagem e o relógio não anda (quinta antes da segunda do início)', async () => {
    vi.setSystemTime(new Date(QUINTA.agora));
    // Jornada 2 reativada pelo encadeamento: relógio 1, começa na segunda 16/11.
    cron({ semanaAtual: 1, dataInicio: '2026-11-16', concluidas: [] });
    const r = await processarEmpresaDiario(EMPRESA, QUINTA);
    expect(r.aguardandoInicio).toBe(1);
    expect(h.envioTemplate).not.toHaveBeenCalled();
    expect(h.email).not.toHaveBeenCalled();
    // Sem isto, a quinta antes do início escreveria `semana_atual: 2`.
    expect(atualizacoesDoEnvio()).toHaveLength(0);
  });

  it('a mesma pessoa, na segunda do início: a semana 1 sai', async () => {
    vi.setSystemTime(new Date('2026-11-16T12:00:00Z'));
    cron({ semanaAtual: 1, dataInicio: '2026-11-16', concluidas: [] });
    const r = await processarEmpresaDiario(EMPRESA, { hoje: 1, hojeUTC: '2026-11-16' });
    expect(r.aguardandoInicio).toBe(0);
    expect(h.envioPilula).toHaveBeenCalledTimes(1);
    expect(h.envioPilula.mock.calls[0][0]).toMatchObject({ semana: 1 });
  });

  it('🔴 relógio ATRÁS da data (reinscrito no meio): o cron alinha pela trilha e manda a semana certa', async () => {
    vi.setSystemTime(new Date(SEGUNDA.agora));
    // Trilha começou em 19/10 → segunda 09/11 é a semana 4; semanas 1 a 3 concluídas.
    cron({ semanaAtual: 1, dataInicio: '2026-10-19', concluidas: [1, 2, 3] });
    await processarEmpresaDiario(EMPRESA, SEGUNDA);
    expect(h.envioPilula).toHaveBeenCalledTimes(1);
    expect(h.envioPilula.mock.calls[0][0]).toMatchObject({ semana: 4 });
  });

  it('quinta: o avanço parte do relógio ALINHADO, não do gravado', async () => {
    vi.setSystemTime(new Date(QUINTA.agora));
    cron({ semanaAtual: 1, dataInicio: '2026-10-19', concluidas: [1, 2, 3] });
    await processarEmpresaDiario(EMPRESA, QUINTA);
    const avanco = atualizacoesDoEnvio().find((e: any) => 'semana_atual' in e.payload);
    expect(avanco?.payload.semana_atual).toBe(5);
  });

  it('relógio à FRENTE da data (o avanço normal de quinta) fica como está', async () => {
    vi.setSystemTime(new Date(QUINTA.agora));
    cron({ semanaAtual: 5, dataInicio: '2026-10-19', concluidas: [1, 2, 3, 4] });
    await processarEmpresaDiario(EMPRESA, QUINTA);
    const avanco = atualizacoesDoEnvio().find((e: any) => 'semana_atual' in e.payload);
    expect(avanco?.payload.semana_atual).toBe(6);
  });
});
