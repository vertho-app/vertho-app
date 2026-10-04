import { describe, it, expect } from 'vitest';
import { criarJobsEmMemoria } from '../helpers/ia-jobs-em-memoria';
import { reservarFaseDoLote, LEASE_RESERVA_IMEDIATA_MS, LEASE_RESERVA_LOTE_MS } from '@/lib/ia-jobs';

/**
 * RESERVA EXCLUSIVA de uma fase por empresa (04/10/2026, decisão 3 do dono: a
 * geração do Cenário B por célula não roda duas vezes ao mesmo tempo).
 *
 * O guard antigo LIA os jobs ativos e só depois INSERIA o seu: dois cliques juntos
 * passavam os dois, e cada um pagava a IA inteira (o índice único da mig 261 só
 * impede a SEGUNDA linha do B, não a segunda chamada). A reserva insere primeiro e
 * arbitra depois de ler: quem perde apaga a própria linha e recebe "já está gerando".
 */

const FASE = 'cenarios-b';
/** O relógio da reserva é o da tabela em memória (o `Date.now()` real não casa com o instante semeado). */
const reservar = (jobs: ReturnType<typeof criarJobsEmMemoria>, extra: Record<string, unknown> = {}) => reservarFaseDoLote(jobs.tdb, {
  fase: FASE, status: 'running', params: { modo: 'imediato' }, progress: { done: 0, total: 0 }, agoraMs: jobs.relogio.ms, ...extra,
} as any);

describe('o padrão ANTIGO (ler e só depois inserir) deixa dois disparos passarem: o defeito que a reserva fecha', () => {
  it('duas chamadas concorrentes: as DUAS acham a fase livre e inserem', async () => {
    const jobs = criarJobsEmMemoria();
    const padraoAntigo = async () => {
      const { data: ativos } = await jobs.tdb.from('ia_jobs').select('id').eq('fase', FASE).in('status', ['queued', 'running']);
      if (ativos.length) return 'ja-gerando';
      await jobs.tdb.from('ia_jobs').insert({ fase: FASE, status: 'running', params: {}, progress: {} }).select('id').single();
      return 'gerando';
    };
    const [a, b] = await Promise.all([padraoAntigo(), padraoAntigo()]);
    expect([a, b]).toEqual(['gerando', 'gerando']);
    expect(jobs.rows).toHaveLength(2);
  });
});

describe('reservarFaseDoLote: uma só reserva ganha, na corrida', () => {
  it('duas chamadas concorrentes: UMA recebe o jobId, a outra "já está gerando" apontando para o job que ganhou', async () => {
    const jobs = criarJobsEmMemoria();
    const [a, b] = await Promise.all([reservar(jobs), reservar(jobs)]);
    const vencedora = [a, b].find((r) => 'jobId' in r) as { jobId: string };
    const perdedora = [a, b].find((r) => 'jaGerando' in r) as { jaGerando: string };
    expect(vencedora).toBeTruthy();
    expect(perdedora.jaGerando).toBe(vencedora.jobId);
    // a perdedora apagou a própria linha: só a reserva vencedora segura a fase
    expect(jobs.rows.map((r) => r.id)).toEqual([vencedora.jobId]);
    expect(jobs.rows[0]).toMatchObject({ fase: FASE, status: 'running', params: { modo: 'imediato' } });
  });

  it('cinco chamadas concorrentes: exatamente uma ganha e as quatro apontam para ela', async () => {
    const jobs = criarJobsEmMemoria();
    const rs = await Promise.all(Array.from({ length: 5 }, () => reservar(jobs)));
    const ganhou = rs.filter((r) => 'jobId' in r) as Array<{ jobId: string }>;
    expect(ganhou).toHaveLength(1);
    for (const r of rs.filter((x) => 'jaGerando' in x) as Array<{ jaGerando: string }>) expect(r.jaGerando).toBe(ganhou[0].jobId);
    expect(jobs.rows).toHaveLength(1);
  });

  it('o mais antigo (created_at) vence, inclusive contra uma reserva que já existia', async () => {
    const jobs = criarJobsEmMemoria();
    const antiga = jobs.semear({ fase: FASE, status: 'queued', params: { modo: 'lote' } });
    const r = await reservar(jobs);
    expect(r).toEqual({ jaGerando: antiga.id });
    expect(jobs.rows.map((x) => x.id)).toEqual([antiga.id]);
  });

  it('depois que a reserva fecha (done/error), a fase está livre de novo', async () => {
    const jobs = criarJobsEmMemoria();
    const r1 = await reservar(jobs) as { jobId: string };
    expect(await reservar(jobs)).toEqual({ jaGerando: r1.jobId });
    await jobs.tdb.from('ia_jobs').update({ status: 'done' }).eq('id', r1.jobId);
    const r2 = await reservar(jobs);
    expect(r2).toHaveProperty('jobId');
  });

  it('só a MESMA fase e a mesma empresa se bloqueiam: o lote de IA4 não segura os Cenários B', async () => {
    const jobs = criarJobsEmMemoria();
    jobs.semear({ fase: 'ia4', status: 'running' });
    expect(await reservar(jobs)).toHaveProperty('jobId');
  });

  it('erro ao ler os ativos: devolve o erro e SOLTA a própria linha (não segura a fase)', async () => {
    const jobs = criarJobsEmMemoria();
    jobs.falharEm('select', 'timeout no pool');
    const r = await reservar(jobs);
    expect(r).toEqual({ erro: 'Não foi possível verificar as gerações ativas: timeout no pool' });
    expect(jobs.rows).toHaveLength(0);
  });

  it('erro ao inserir: devolve o erro, nada fica reservado', async () => {
    const jobs = criarJobsEmMemoria();
    jobs.falharEm('insert', 'pool esgotado');
    expect(await reservar(jobs)).toEqual({ erro: 'pool esgotado' });
    expect(jobs.rows).toHaveLength(0);
  });

  it('se nem apagar a linha duplicada der, ela é cancelada (não fica queued segurando a fase)', async () => {
    const jobs = criarJobsEmMemoria();
    const dono = jobs.semear({ fase: FASE, status: 'running' });
    jobs.falharEm('delete', 'sem permissão');
    expect(await reservar(jobs)).toEqual({ jaGerando: dono.id });
    expect(jobs.rows.filter((r) => r.id !== dono.id).map((r) => r.status)).toEqual(['cancelled']);
  });
});

describe('lease: reserva morta não prende a fase para sempre', () => {
  const minutosAtras = (jobs: ReturnType<typeof criarJobsEmMemoria>, min: number) => new Date(jobs.relogio.ms - min * 60_000).toISOString();

  it('geração IMEDIATA sem sinal há mais de 15 min (a action morreu): não conta, e é marcada como erro', async () => {
    const jobs = criarJobsEmMemoria();
    const morta = jobs.semear({ fase: FASE, status: 'running', params: { modo: 'imediato' }, updated_at: minutosAtras(jobs, 20) });
    const r = await reservar(jobs);
    expect(r).toHaveProperty('jobId');
    expect(jobs.rows.find((x) => x.id === morta.id)).toMatchObject({ status: 'error' });
    expect(jobs.rows.find((x) => x.id === morta.id)!.error).toContain('reserva expirada');
  });

  it('geração IMEDIATA dentro da lease: ainda segura a fase', async () => {
    const jobs = criarJobsEmMemoria();
    const viva = jobs.semear({ fase: FASE, status: 'running', params: { modo: 'imediato' }, updated_at: minutosAtras(jobs, 10) });
    expect(await reservar(jobs)).toEqual({ jaGerando: viva.id });
  });

  it('LOTE: 20 min sem sinal ainda é lote vivo (a lease é de 2 h); com 3 h, está morto', async () => {
    const jobs = criarJobsEmMemoria();
    const lote = jobs.semear({ fase: FASE, status: 'running', params: { modo: 'lote' }, updated_at: minutosAtras(jobs, 20) });
    expect(await reservar(jobs)).toEqual({ jaGerando: lote.id });
    lote.updated_at = minutosAtras(jobs, 180);
    expect(await reservar(jobs)).toHaveProperty('jobId');
    expect(jobs.rows.find((x) => x.id === lote.id)!.status).toBe('error');
  });

  it('as leases são as declaradas: 15 min para a imediata e 2 h para o lote', () => {
    expect(LEASE_RESERVA_IMEDIATA_MS).toBe(15 * 60_000);
    expect(LEASE_RESERVA_LOTE_MS).toBe(2 * 3600_000);
  });
});
