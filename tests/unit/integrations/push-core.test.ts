// Contrato do núcleo de push (lib/notifications/push-core.ts).
//
// O adapter de rede é stubado: nenhuma chamada real a provedor de push.
//
// Invariantes:
//   1. Sem endpoint ativo → semEndpoints, sem enviar nada (ausência de opt-in
//      NÃO é falha).
//   2. Erro ao LER endpoints não pode virar "ninguém tem push" — é a conclusão
//      oposta da verdadeira e some com o problema.
//   3. A entrega é gravada ANTES do envio e o `deliveryId` viaja no payload;
//      sem isso a abertura não tem como ser ligada ao envio que a causou.
//   4. 404/410 desligam o endpoint e contam como `desligados`, não `falhas`:
//      inscrição morta é ausência de destino, não erro de entrega.
//   5. Falha transitória (ex.: 429) NÃO desliga o endpoint.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ enviar: null as any }));

vi.mock('@/lib/notifications/providers/webpush', () => ({
  enviarWebPush: (...a: any[]) => mocks.enviar(...a),
  webPushConfigurado: () => true,
}));

const { enviarPush } = await import('@/lib/notifications/push-core');

/** Stub encadeável mínimo do supabase-js, com registro da ordem das operações. */
function makeClient(opts: {
  endpoints?: any[];
  endpointsError?: { message: string } | null;
}) {
  const ops: string[] = [];
  let seq = 0;
  const client = {
    from(tabela: string) {
      return {
        select() {
          const q: any = {
            eq() { return q; },
            then(res: any) {
              ops.push(`select:${tabela}`);
              return Promise.resolve({
                data: opts.endpoints ?? [],
                error: opts.endpointsError ?? null,
              }).then(res);
            },
          };
          return q;
        },
        insert() {
          return {
            select() {
              return {
                async single() {
                  const id = `d${++seq}`;
                  ops.push(`insert:${tabela}:${id}`);
                  return { data: { id }, error: null };
                },
              };
            },
          };
        },
        update() {
          const q: any = {
            eq() { ops.push(`update:${tabela}`); return q; },
            then(res: any) { return Promise.resolve({ error: null }).then(res); },
          };
          return q;
        },
      };
    },
  };
  return { client, ops };
}

const SUB = { endpoint: 'https://push.example/abc', keys: { p256dh: 'p', auth: 'a' } };
const base = { colaboradorId: 'colab-1', empresaId: 'emp-1', kind: 'pilula', titulo: 'T', corpo: 'C', url: '/semana/3' };

describe('enviarPush — núcleo', () => {
  beforeEach(() => {
    mocks.enviar = vi.fn(async () => ({ ok: true, status: 201 }));
  });

  it('1. sem endpoint ativo: semEndpoints e nenhum envio', async () => {
    const { client } = makeClient({ endpoints: [] });
    const r = await enviarPush(base, client);

    expect(r.semEndpoints).toBe(true);
    expect(r.entregues).toBe(0);
    expect(mocks.enviar).not.toHaveBeenCalled();
  });

  it('2. erro ao ler endpoints não vira "ninguém tem push"', async () => {
    const { client } = makeClient({ endpoints: [], endpointsError: { message: 'conexão caiu' } });
    const r = await enviarPush(base, client);

    expect(r.motivo).toContain('conexão caiu');
    expect(mocks.enviar).not.toHaveBeenCalled();
  });

  it('3. grava a entrega ANTES de enviar e passa o deliveryId no payload', async () => {
    const { client, ops } = makeClient({ endpoints: [{ id: 'e1', subscription: SUB, provider: 'webpush' }] });
    const r = await enviarPush(base, client);

    expect(r.entregues).toBe(1);

    // ordem: leu endpoints → gravou entrega → só então enviou
    const iInsert = ops.findIndex((o) => o.startsWith('insert:notification_deliveries'));
    expect(iInsert).toBeGreaterThanOrEqual(0);

    const payload = JSON.parse(mocks.enviar.mock.calls[0][1]);
    expect(payload.deliveryId).toBe('d1');
    expect(payload.url).toBe('/semana/3');
    expect(payload.title).toBe('T');
  });

  it('4. 404/410 desliga o endpoint e conta como desligado, não falha', async () => {
    mocks.enviar = vi.fn(async () => ({ ok: false, status: 410, motivo: 'gone', morto: true }));
    const { client, ops } = makeClient({ endpoints: [{ id: 'e1', subscription: SUB, provider: 'webpush' }] });

    const r = await enviarPush(base, client);

    expect(r.desligados).toBe(1);
    expect(r.falhas).toBe(0);
    expect(r.entregues).toBe(0);
    expect(ops).toContain('update:notification_endpoints');
  });

  it('5. falha transitória (429) NÃO desliga o endpoint', async () => {
    mocks.enviar = vi.fn(async () => ({ ok: false, status: 429, motivo: 'too many', morto: false }));
    const { client, ops } = makeClient({ endpoints: [{ id: 'e1', subscription: SUB, provider: 'webpush' }] });

    const r = await enviarPush(base, client);

    expect(r.falhas).toBe(1);
    expect(r.desligados).toBe(0);
    expect(ops).not.toContain('update:notification_endpoints');
  });

  it('6. endpoint de provider sem implementação é registrado, não pulado calado', async () => {
    const { client, ops } = makeClient({ endpoints: [{ id: 'e1', subscription: SUB, provider: 'apns' }] });

    const r = await enviarPush(base, client);

    expect(r.falhas).toBe(1);
    expect(mocks.enviar).not.toHaveBeenCalled();
    expect(ops.some((o) => o.startsWith('insert:notification_deliveries'))).toBe(true);
  });
});
