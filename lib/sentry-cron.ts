/**
 * Monitor de cron no Sentry (Cron Monitors): um por `action` agendada da rota `/api/cron`.
 *
 * 🔑 POR QUE ISTO EXISTE (19/10/2026). Os alarmes internos (pré-voo, pós-voo, health) rodam
 * DENTRO dos crons: se a Vercel deixa de chamar um deles, ninguém grita, porque quem gritaria é
 * justamente o que não rodou. E a própria Vercel avisa que a entrega do cron é "best effort": uma
 * chamada que não chega à função não deixa log nenhum. O Sentry fica do lado de fora. Ele espera
 * o check-in no horário e abre issue quando não chega ("missed"), quando a execução passa do teto
 * ("timeout") ou quando a rota responde fora de 2xx ("error").
 *
 * O HORÁRIO vem do cabeçalho `x-vercel-cron-schedule`, que a Vercel manda em toda chamada de cron
 * com a expressão que a disparou. A fonte é o `vercel.json` publicado, sem cópia aqui para
 * envelhecer, e o monitor nasce (upsert) no primeiro check-in. Sem o cabeçalho (curl, botão de
 * admin, replay) não há check-in: o monitor mede o AGENDAMENTO, não o disparo manual.
 *
 * Só entra a chamada cujo ÚNICO parâmetro é `action`. As crons fixas compartilham o caminho
 * `/api/cron`, então o monitor é por `action`; uma entrada com parâmetro extra (a avulsa da 4Life,
 * `&slug=`) é pontual e cairia no monitor da diária com outro horário.
 *
 * O chamador embrulha DEPOIS da autenticação: pedido falso não gera check-in de erro, e um
 * `CRON_SECRET` quebrado aparece como "missed", que é o alarme certo para ele.
 *
 * ⚠️ O `trigger_diario` é um DISPATCHER (fan-out QStash por empresa): o monitor dele prova que o
 * despacho rodou, não que cada empresa recebeu. A entrega segue com o pós-voo.
 */
import * as Sentry from '@sentry/nextjs';

export interface MonitorDoCron {
  slug: string;
  schedule: string;
}

/** Teto de uma execução, em minutos. O `maxDuration` da rota é 800 s (13,3 min). */
export const MAX_RUNTIME_MIN = 15;

/** Quanto o flush do check-in pode segurar a resposta: a lambda congela depois dela. */
const FLUSH_MS = 2000;

/**
 * O monitor desta chamada, ou null quando ela não é um agendamento monitorável.
 * Slug do Sentry: minúsculas, dígitos e hífen, até 50 caracteres.
 */
export function monitorDoCron(url: string, scheduleHeader: string | null | undefined): MonitorDoCron | null {
  const schedule = String(scheduleHeader || '').trim();
  if (!schedule) return null;
  let params: URLSearchParams;
  try {
    params = new URL(url).searchParams;
  } catch {
    return null;
  }
  const chaves = [...new Set(params.keys())];
  if (chaves.length !== 1 || chaves[0] !== 'action') return null;
  const action = String(params.get('action') || '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!action) return null;
  return { slug: `cron-${action}`.slice(0, 50), schedule };
}

/**
 * Configuração do monitor (upsert no check-in `in_progress`). O cron da Vercel é UTC. A Vercel
 * chama dentro do minuto agendado no plano pago: 5 min de margem bastam. No agendamento de N em N
 * minutos a margem fica abaixo do intervalo, e a issue só abre na 2ª falha seguida, porque uma
 * entrega perdida isolada ("best effort") não é defeito nosso.
 */
export function configDoMonitor(schedule: string) {
  const deNemN = /^\*\/(\d+)\s/.exec(schedule);
  const intervalo = deNemN ? Number(deNemN[1]) : null;
  return {
    schedule: { type: 'crontab' as const, value: schedule },
    timezone: 'UTC',
    checkinMargin: intervalo ? Math.max(1, Math.min(3, intervalo - 1)) : 5,
    maxRuntime: MAX_RUNTIME_MIN,
    failureIssueThreshold: intervalo ? 2 : 1,
    recoveryThreshold: 1,
  };
}

/**
 * Executa a action entre os check-ins `in_progress` e `ok`/`error`. Resposta fora de 2xx é `error`
 * (a rota traduz exceção em 500 e falta de autorização em 401). Falha do próprio Sentry nunca
 * derruba o cron.
 */
export async function comMonitorDeCron(req: Request, executar: () => Promise<Response>): Promise<Response> {
  const monitor = monitorDoCron(req.url, req.headers.get('x-vercel-cron-schedule'));
  if (!monitor) return executar();

  let checkInId: string | undefined;
  try {
    checkInId = Sentry.captureCheckIn({ monitorSlug: monitor.slug, status: 'in_progress' }, configDoMonitor(monitor.schedule));
  } catch (e: any) {
    console.warn(`[sentry-cron] check-in de início falhou (${monitor.slug}):`, e?.message);
  }

  let status: 'ok' | 'error' = 'error';
  try {
    const res = await executar();
    status = res.status >= 200 && res.status < 300 ? 'ok' : 'error';
    return res;
  } finally {
    try {
      Sentry.captureCheckIn({ checkInId, monitorSlug: monitor.slug, status });
      await Sentry.flush(FLUSH_MS);
    } catch (e: any) {
      console.warn(`[sentry-cron] check-in de fim falhou (${monitor.slug}):`, e?.message);
    }
  }
}
