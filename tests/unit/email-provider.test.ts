import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sesSend: vi.fn(),
  resendSend: vi.fn(),
}));

vi.mock('@aws-sdk/client-sesv2', () => ({
  SESv2Client: class {
    send = mocks.sesSend;
  },
  SendEmailCommand: class {
    input: any;
    constructor(input: any) { this.input = input; }
  },
}));

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: mocks.resendSend };
  },
}));

import {
  emailConfigurationError,
  emailProviderName,
  sendEmail,
} from '@/lib/email-provider';

const ENV_KEYS = [
  'EMAIL_PROVIDER',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_REGION',
  'RESEND_API_KEY',
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of ENV_KEYS) delete process.env[key];
});

describe('email-provider', () => {
  it('usa SES quando a flag e as três credenciais AWS estão presentes', async () => {
    process.env.EMAIL_PROVIDER = 'ses';
    process.env.AWS_ACCESS_KEY_ID = 'AKIA_TEST';
    process.env.AWS_SECRET_ACCESS_KEY = 'secret';
    process.env.AWS_REGION = 'sa-east-1';
    mocks.sesSend.mockResolvedValue({ MessageId: 'ses-1' });

    const result = await sendEmail({
      from: 'Vertho <noreply@vertho.ai>',
      to: 'pessoa@cliente.com',
      subject: 'Relatório',
      html: '<p>Pronto</p>',
      attachments: [{
        filename: 'relatorio.pdf',
        content: Buffer.from('pdf').toString('base64'),
      }],
    });

    expect(emailProviderName()).toBe('ses');
    expect(result).toEqual({ ok: true, provider: 'ses', messageId: 'ses-1' });
    const command = mocks.sesSend.mock.calls[0][0];
    expect(command.input.FromEmailAddress).toContain('noreply@vertho.ai');
    expect(command.input.Content.Simple.Attachments[0]).toMatchObject({
      FileName: 'relatorio.pdf',
      ContentType: 'application/pdf',
    });
    expect(Buffer.from(command.input.Content.Simple.Attachments[0].RawContent).toString()).toBe('pdf');
    expect(mocks.resendSend).not.toHaveBeenCalled();
  });

  it('EMAIL_PROVIDER=resend funciona como rollback mesmo com SES configurado', async () => {
    process.env.EMAIL_PROVIDER = 'resend';
    process.env.AWS_ACCESS_KEY_ID = 'AKIA_TEST';
    process.env.AWS_SECRET_ACCESS_KEY = 'secret';
    process.env.AWS_REGION = 'sa-east-1';
    process.env.RESEND_API_KEY = 're_test';
    mocks.resendSend.mockResolvedValue({ data: { id: 're-1' }, error: null });

    const result = await sendEmail({
      from: 'noreply@vertho.ai',
      to: 'pessoa@cliente.com',
      subject: 'Acesso',
      html: '<p>Link</p>',
    });

    expect(result).toEqual({ ok: true, provider: 'resend', messageId: 're-1' });
    expect(mocks.sesSend).not.toHaveBeenCalled();
  });

  it('sem flag mantém o Resend mesmo se as credenciais AWS já existirem', () => {
    process.env.AWS_ACCESS_KEY_ID = 'AKIA_TEST';
    process.env.AWS_SECRET_ACCESS_KEY = 'secret';
    process.env.AWS_REGION = 'sa-east-1';
    process.env.RESEND_API_KEY = 're_test';

    expect(emailProviderName()).toBe('resend');
  });

  it('falha antes do envio quando SES foi forçado sem credenciais completas', async () => {
    process.env.EMAIL_PROVIDER = 'ses';
    process.env.AWS_REGION = 'sa-east-1';

    expect(emailConfigurationError()).toMatch(/Amazon SES não configurado/);
    const result = await sendEmail({
      from: 'noreply@vertho.ai',
      to: 'pessoa@cliente.com',
      subject: 'Acesso',
      html: '<p>Link</p>',
    });
    expect(result.ok).toBe(false);
    expect(result.provider).toBe('ses');
    expect(mocks.sesSend).not.toHaveBeenCalled();
  });
});
