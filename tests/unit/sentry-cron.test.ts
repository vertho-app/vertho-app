import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Monitor de cron no Sentry (19/10/2026, lib/sentry-cron.ts): um monitor por `action` agendada,
 * com o horário do cabeçalho `x-vercel-cron-schedule`, e check-in só depois da autenticação.
 */

const h = vi.hoisted(() => ({
  captureCheckIn: vi.fn((..._args: any[]) => 'checkin-1'),
  flush: vi.fn(async () => true),
  triggerDiario: vi.fn(async () => ({ message: 'despachado' })),
}));

vi.mock('@sentry/nextjs', () => ({ captureCheckIn: h.captureCheckIn, flush: h.flush }));
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => ({}) }));
vi.mock('@/actions/cron-jobs', () => ({
  cleanupSessoes: vi.fn(), triggerSegunda: vi.fn(), triggerQuinta: vi.fn(),
  triggerDiario: h.triggerDiario, conarhFollowup: vi.fn(), conarhReenvioT0: vi.fn(),
}));

import { monitorDoCron, configDoMonitor, comMonitorDeCron, MAX_RUNTIME_MIN } from '@/lib/sentry-cron';

const BASE = 'https://app.vertho.ai';
const VERCEL = JSON.parse(readFileSync('vercel.json', 'utf8')) as { crons: { path: string; schedule: string }[] };

describe('monitorDoCron: um monitor por action agendada, com o horário que a Vercel mandou', () => {
  it('toda entrada do vercel.json só com `action` vira monitor com o MESMO horário e slug válido', () => {
    const soAction = VERCEL.crons.filter((c) => [...new URL(BASE + c.path).searchParams.keys()].join() === 'action');
    expect(soAction.length).toBeGreaterThan(10);
    const slugs = new Set<string>();
    for (const c of soAction) {
      const m = monitorDoCron(BASE + c.path, c.schedule);
      expect(m, c.path).not.toBeNull();
      expect(m!.schedule).toBe(c.schedule);
      expect(m!.slug).toMatch(/^cron-[a-z0-9-]{1,45}$/);
      slugs.add(m!.slug);
    }
    // Dois agendamentos da mesma action com horários diferentes brigariam pelo mesmo monitor.
    expect(slugs.size).toBe(soAction.length);
  });

  it('entrada com parâmetro além de `action` (a avulsa da 4Life, `&slug=`) NÃO vira monitor', () => {
    const comExtra = VERCEL.crons.filter((c) => [...new URL(BASE + c.path).searchParams.keys()].length > 1);
    for (const c of comExtra) expect(monitorDoCron(BASE + c.path, c.schedule), c.path).toBeNull();
    expect(monitorDoCron(`${BASE}/api/cron?action=avisar_planos&slug=4life-educacao`, '30 10 19 10 *')).toBeNull();
  });

  it('sem o cabeçalho de agendamento (curl, botão de admin) não há monitor', () => {
    expect(monitorDoCron(`${BASE}/api/cron?action=trigger_diario`, null)).toBeNull();
    expect(monitorDoCron(`${BASE}/api/cron?action=trigger_diario`, '  ')).toBeNull();
    expect(monitorDoCron(`${BASE}/api/cron`, '0 11 * * *')).toBeNull();
  });

  it('o slug troca `_` por `-` e respeita 50 caracteres', () => {
    expect(monitorDoCron(`${BASE}/api/cron?action=dre_fechamento_semanal`, '30 7 * * 1')!.slug).toBe('cron-dre-fechamento-semanal');
    expect(monitorDoCron(`${BASE}/api/cron?action=${'x'.repeat(80)}`, '0 1 * * *')!.slug.length).toBe(50);
  });
});

describe('configDoMonitor', () => {
  it('diário: UTC, 5 min de margem, teto acima do maxDuration da rota, issue na 1ª falha', () => {
    expect(configDoMonitor('0 11 * * *')).toEqual({
      schedule: { type: 'crontab', value: '0 11 * * *' }, timezone: 'UTC',
      checkinMargin: 5, maxRuntime: MAX_RUNTIME_MIN, failureIssueThreshold: 1, recoveryThreshold: 1,
    });
    const fonte = readFileSync('app/api/cron/route.ts', 'utf8');
    const maxDuration = Number(/export const maxDuration = (\d+)/.exec(fonte)?.[1]);
    expect(maxDuration).toBeGreaterThan(0);
    expect(MAX_RUNTIME_MIN * 60).toBeGreaterThanOrEqual(maxDuration);
  });

  it('de 5 em 5 minutos: margem abaixo do intervalo e issue só na 2ª falha seguida (entrega é best effort)', () => {
    const c = configDoMonitor('*/5 * * * *');
    expect(c.checkinMargin).toBeLessThan(5);
    expect(c.failureIssueThreshold).toBe(2);
  });
});

describe('comMonitorDeCron', () => {
  const req = (action: string, schedule?: string) => new Request(`${BASE}/api/cron?action=${action}`, {
    headers: schedule ? { 'x-vercel-cron-schedule': schedule } : {},
  });

  beforeEach(() => { h.captureCheckIn.mockClear(); h.flush.mockClear(); });

  it('🔴 in_progress com a config, depois ok, e espera o flush antes de devolver', async () => {
    const res = await comMonitorDeCron(req('trigger_diario', '0 11 * * *'), async () => new Response('{}', { status: 200 }));
    expect(res.status).toBe(200);
    expect(h.captureCheckIn).toHaveBeenCalledTimes(2);
    expect(h.captureCheckIn.mock.calls[0][0]).toEqual({ monitorSlug: 'cron-trigger-diario', status: 'in_progress' });
    expect(h.captureCheckIn.mock.calls[0][1]).toMatchObject({ schedule: { type: 'crontab', value: '0 11 * * *' } });
    expect(h.captureCheckIn.mock.calls[1][0]).toEqual({ checkInId: 'checkin-1', monitorSlug: 'cron-trigger-diario', status: 'ok' });
    expect(h.flush).toHaveBeenCalledTimes(1);
  });

  it('🔴 resposta fora de 2xx vira check-in de erro', async () => {
    await comMonitorDeCron(req('backup_diario', '0 4 * * *'), async () => new Response('{}', { status: 500 }));
    expect(h.captureCheckIn.mock.calls[1][0]).toMatchObject({ status: 'error' });
  });

  it('exceção vira check-in de erro e continua subindo', async () => {
    await expect(comMonitorDeCron(req('reset_demo', '0 7 * * *'), async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(h.captureCheckIn.mock.calls[1][0]).toMatchObject({ status: 'error' });
  });

  it('falha do próprio Sentry não derruba o cron', async () => {
    h.captureCheckIn.mockImplementationOnce(() => { throw new Error('sentry fora'); });
    const res = await comMonitorDeCron(req('trigger_diario', '0 11 * * *'), async () => new Response('{}', { status: 200 }));
    expect(res.status).toBe(200);
  });

  it('sem o cabeçalho de agendamento, executa sem check-in nenhum', async () => {
    await comMonitorDeCron(req('trigger_diario'), async () => new Response('{}', { status: 200 }));
    expect(h.captureCheckIn).not.toHaveBeenCalled();
  });
});

describe('a rota de verdade: o check-in só sai DEPOIS da autenticação', () => {
  beforeEach(() => {
    h.captureCheckIn.mockClear();
    h.triggerDiario.mockClear();
    vi.stubEnv('CRON_SECRET', 'segredo-do-teste');
  });

  const chamada = (auth: string) => new Request(`${BASE}/api/cron?action=trigger_diario`, {
    headers: { authorization: auth, 'x-vercel-cron-schedule': '0 11 * * *' },
  });

  it('🔴 pedido sem o segredo certo: 401 e NENHUM check-in (senão qualquer um forjaria "error")', async () => {
    const { GET } = await import('@/app/api/cron/route');
    const res = await GET(chamada('Bearer errado'));
    expect(res.status).toBe(401);
    expect(h.captureCheckIn).not.toHaveBeenCalled();
    expect(h.triggerDiario).not.toHaveBeenCalled();
  });

  it('pedido autenticado da Vercel: roda a action entre in_progress e ok', async () => {
    const { GET } = await import('@/app/api/cron/route');
    const res = await GET(chamada('Bearer segredo-do-teste'));
    expect(res.status).toBe(200);
    expect(h.triggerDiario).toHaveBeenCalledTimes(1);
    expect(h.captureCheckIn.mock.calls.map((c: any[]) => c[0].status)).toEqual(['in_progress', 'ok']);
  });
});
