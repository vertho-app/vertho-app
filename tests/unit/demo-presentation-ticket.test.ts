import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  DEMO_PRESENTATION_TICKET_TTL_SECONDS,
  issueDemoPresentationTicket,
  verifyDemoPresentationTicket,
} from '@/lib/demo/presentation-ticket';

const originalServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

describe('passe assinado da sala de apresentação', () => {
  beforeEach(() => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key-used-only-by-unit-test';
  });

  afterAll(() => {
    if (originalServiceKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceKey;
  });

  it('aceita o passe íntegro dentro da janela de quatro horas', () => {
    const issuedAt = 1_800_000_000;
    const ticket = issueDemoPresentationTicket(issuedAt);
    const payload = verifyDemoPresentationTicket(ticket, issuedAt + 60);

    expect(payload).toMatchObject({
      v: 1,
      tenant: 'acme-demo',
      iat: issuedAt,
      exp: issuedAt + DEMO_PRESENTATION_TICKET_TTL_SECONDS,
    });
  });

  it('nega passe adulterado ou assinado com outro segredo', () => {
    const ticket = issueDemoPresentationTicket(1_800_000_000);
    const [payload, assinatura] = ticket.split('.');
    const adulterado = `${payload}.${assinatura[0] === 'a' ? 'b' : 'a'}${assinatura.slice(1)}`;
    expect(verifyDemoPresentationTicket(adulterado, 1_800_000_010)).toBeNull();

    process.env.SUPABASE_SERVICE_ROLE_KEY = 'different-service-role-key';
    expect(verifyDemoPresentationTicket(ticket, 1_800_000_010)).toBeNull();
  });

  it('nega passe expirado', () => {
    const issuedAt = 1_800_000_000;
    const ticket = issueDemoPresentationTicket(issuedAt);
    expect(verifyDemoPresentationTicket(ticket, issuedAt + DEMO_PRESENTATION_TICKET_TTL_SECONDS)).toBeNull();
  });
});
