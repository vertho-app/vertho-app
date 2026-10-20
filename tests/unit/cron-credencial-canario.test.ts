import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * As duas actions do cron que provam o TTS NA VERCEL, chamadas pela rota de verdade, com o
 * check-in do Sentry observado.
 *
 * `Medido 19-20/10/2026`: o canário deu ERRO de credencial nas duas vozes e a rota respondeu 200;
 * para a Vercel e para o Sentry, o cron funcionou. E não havia nada que lesse a credencial da
 * Vercel fora do uso real. Aqui: erro de execução no canário = 500 + check-in `error`; voz que
 * só REPROVA segue 200 (quem alarma é a R19 do health); a credencial ruim derruba o
 * `credencial_google`.
 */

const h = vi.hoisted(() => ({
  captureCheckIn: vi.fn((..._args: any[]) => 'checkin-1'),
  flush: vi.fn(async () => true),
  canario: vi.fn(async () => [] as any[]),
  verificar: vi.fn(async () => ({ clientEmail: 'sa@teste', chave: 'fad6f76a' })),
}));

vi.mock('@sentry/nextjs', () => ({ captureCheckIn: h.captureCheckIn, flush: h.flush }));
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => ({}) }));
vi.mock('@/actions/cron-jobs', () => ({
  cleanupSessoes: vi.fn(), triggerSegunda: vi.fn(), triggerQuinta: vi.fn(),
  triggerDiario: vi.fn(), conarhFollowup: vi.fn(), conarhReenvioT0: vi.fn(),
}));
vi.mock('@/lib/tts/canario', () => ({ rodarCanarioTts: h.canario }));
vi.mock('@/lib/tts/google-token', () => ({ verificarCredencialGoogle: h.verificar }));

const chamar = async (action: string, schedule: string) => {
  const { GET } = await import('@/app/api/cron/route');
  return GET(new Request(`https://app.vertho.ai/api/cron?action=${action}`, {
    headers: { authorization: 'Bearer segredo-do-teste', 'x-vercel-cron-schedule': schedule },
  }));
};
const statusDosCheckIns = () => h.captureCheckIn.mock.calls.map((c: any[]) => c[0].status);

const voz = (v: string, extra: Record<string, unknown>) => ({ voz: v, ok: true, motivos: [], f0MedHz: 200, timbreVsRefSigma: 0.1, durS: 180, ...extra });

beforeEach(() => {
  vi.stubEnv('CRON_SECRET', 'segredo-do-teste');
  h.captureCheckIn.mockClear();
  h.canario.mockReset();
  h.verificar.mockReset();
});

describe('canario_tts', () => {
  it('🔴 voz que nem foi medida (o ERRO de credencial de 19/10): 500 e check-in de erro', async () => {
    const erro = 'GOOGLE_SERVICE_ACCOUNT_JSON inválido (não é JSON nem base64-JSON)';
    h.canario.mockResolvedValue([voz('Aoede', { ok: false, erro, timbreVsRefSigma: null }), voz('Algieba', { ok: false, erro, timbreVsRefSigma: null })]);
    const res = await chamar('canario_tts', '20 6 * * 1');
    expect(res.status).toBe(500);
    expect((await res.json()).error).toContain('Aoede ERRO GOOGLE_SERVICE_ACCOUNT_JSON inválido');
    expect(statusDosCheckIns()).toEqual(['in_progress', 'error']);
  });

  it('🔴 basta UMA voz com erro: a outra ter passado não esconde a falha', async () => {
    h.canario.mockResolvedValue([voz('Aoede', {}), voz('Algieba', { ok: false, erro: 'TTS 503 (vertex): indisponível', timbreVsRefSigma: null })]);
    const res = await chamar('canario_tts', '20 6 * * 1');
    expect(res.status).toBe(500);
    expect(statusDosCheckIns()).toEqual(['in_progress', 'error']);
  });

  it('voz que só REPROVA no portão segue 200: medir é o trabalho do cron, alarmar é da R19', async () => {
    h.canario.mockResolvedValue([voz('Aoede', {}), voz('Algieba', { ok: false, motivos: ['registro +5.7 st do alvo'] })]);
    const res = await chamar('canario_tts', '20 6 * * 1');
    expect(res.status).toBe(200);
    expect((await res.json()).message).toContain('Algieba REPROVA');
    expect(statusDosCheckIns()).toEqual(['in_progress', 'ok']);
  });
});

describe('credencial_google', () => {
  it('credencial boa: 200, com o e-mail e o prefixo da chave na mensagem (nunca o valor)', async () => {
    h.verificar.mockResolvedValue({ clientEmail: 'vertho-tts@x.iam.gserviceaccount.com', chave: 'fad6f76a' });
    const res = await chamar('credencial_google', '45 */6 * * *');
    expect(res.status).toBe(200);
    expect((await res.json()).message).toBe('Credencial do Google ok: vertho-tts@x.iam.gserviceaccount.com (chave fad6f76a)');
    expect(statusDosCheckIns()).toEqual(['in_progress', 'ok']);
  });

  it('🔴 credencial ruim: 500 e check-in de erro, que é o que faz o Sentry mandar o e-mail', async () => {
    h.verificar.mockRejectedValue(new Error('Google token 400: {"error":"invalid_grant"}'));
    const res = await chamar('credencial_google', '45 */6 * * *');
    expect(res.status).toBe(500);
    expect((await res.json()).error).toContain('invalid_grant');
    expect(statusDosCheckIns()).toEqual(['in_progress', 'error']);
  });
});
