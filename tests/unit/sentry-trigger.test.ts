import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Falha final de task do Trigger.dev no Sentry (19/10/2026, lib/sentry-trigger.ts): sem payload,
 * só produção, sem OpenTelemetry próprio, e no-op avisado quando falta o DSN.
 */

const h = vi.hoisted(() => ({
  init: vi.fn(),
  captureException: vi.fn(),
  flush: vi.fn(async () => true),
}));
vi.mock('@sentry/node', () => ({ init: h.init, captureException: h.captureException, flush: h.flush }));

import { iniciarSentryNoTrigger, reportarFalhaDaTask, __reiniciarParaTeste } from '@/lib/sentry-trigger';

const CTX = {
  task: { id: 'render-video' },
  run: { id: 'run_abc' },
  attempt: { number: 3 },
  environment: { type: 'PRODUCTION' },
  machine: { name: 'medium-1x' },
};

describe('sentry no Trigger.dev', () => {
  beforeEach(() => {
    __reiniciarParaTeste();
    for (const f of [h.init, h.captureException, h.flush]) f.mockClear();
  });

  it('sem DSN não liga e não captura nada (e avisa no log)', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await iniciarSentryNoTrigger(undefined)).toBe(false);
    await reportarFalhaDaTask({ error: new Error('x'), ctx: CTX });
    expect(h.init).not.toHaveBeenCalled();
    expect(h.captureException).not.toHaveBeenCalled();
    expect(aviso).toHaveBeenCalledWith(expect.stringContaining('SENTRY_DSN ausente'));
    aviso.mockRestore();
  });

  it('🔴 Sentry que quebra ao ligar NÃO lança (o worker relança erro do init.ts e derrubaria todas as tasks)', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.init.mockImplementationOnce(() => { throw new Error('OpenTelemetry quebrado'); });
    await expect(iniciarSentryNoTrigger('https://chave@o1.ingest.us.sentry.io/1')).resolves.toBe(false);
    await reportarFalhaDaTask({ error: new Error('x'), ctx: CTX });
    expect(h.captureException).not.toHaveBeenCalled();
    expect(erro).toHaveBeenCalledWith(expect.stringContaining('não consegui ligar o Sentry'), 'OpenTelemetry quebrado');
    erro.mockRestore();
  });

  it('🔴 o @sentry/node não é importado no topo do módulo (só sob demanda, dentro do try)', () => {
    const codigo = readFileSync('lib/sentry-trigger.ts', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(codigo).not.toMatch(/^import\s+[^'"]*from\s+'@sentry\/node'/m);
    expect(codigo).toMatch(/await import\('@sentry\/node'\)/);
  });

  it('🔴 liga sem integrações padrão e sem OpenTelemetry (o Trigger tem a telemetria dele), com o scrub de PII', async () => {
    await iniciarSentryNoTrigger('https://chave@o1.ingest.us.sentry.io/1');
    const opcoes = h.init.mock.calls[0][0];
    expect(opcoes).toMatchObject({ defaultIntegrations: false, skipOpenTelemetrySetup: true, sendDefaultPii: false, tracesSampleRate: 0 });
    // o beforeSend é o scrub: credencial de URL sai redigida
    const ev = opcoes.beforeSend({ message: 'falhou em https://x/entrar?t=SEGREDO' }, {});
    expect(ev.message).not.toContain('SEGREDO');
  });

  it('🔴 a falha vai SEM o payload: só task, run, tentativa e máquina', async () => {
    await iniciarSentryNoTrigger('https://chave@o1.ingest.us.sentry.io/1');
    const payload = { nome: 'Maria Souza', respostas: ['texto da pessoa'] };
    await reportarFalhaDaTask({ error: new Error('render falhou'), ctx: { ...CTX, payload } as any });
    expect(h.captureException).toHaveBeenCalledTimes(1);
    const [erro, extra] = h.captureException.mock.calls[0];
    expect((erro as Error).message).toBe('render falhou');
    expect(extra).toEqual({
      tags: { origem: 'trigger.dev', task: 'render-video' },
      contexts: { trigger: { run: 'run_abc', tentativa: 3, maquina: 'medium-1x' } },
    });
    expect(JSON.stringify(h.captureException.mock.calls)).not.toContain('Maria');
    expect(h.flush).toHaveBeenCalledTimes(1);
  });

  it('ambiente que não é produção (o `trigger dev` local) não vai ao Sentry', async () => {
    await iniciarSentryNoTrigger('https://chave@o1.ingest.us.sentry.io/1');
    await reportarFalhaDaTask({ error: new Error('x'), ctx: { ...CTX, environment: { type: 'DEVELOPMENT' } } });
    expect(h.captureException).not.toHaveBeenCalled();
  });

  it('o init.ts liga o Sentry e registra o gancho da falha FINAL (tasks.onFailure), sem repassar o payload', () => {
    // Só o CÓDIGO: o comentário do arquivo pode (e deve) dizer que o payload não vai.
    const codigo = readFileSync('trigger/init.ts', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(codigo).toMatch(/iniciarSentryNoTrigger\(\)/);
    expect(codigo).toMatch(/tasks\.onFailure\(\(\{ error, ctx \}\) => reportarFalhaDaTask\(\{ error, ctx \}\)\)/);
    expect(codigo).not.toMatch(/payload/);
  });
});
