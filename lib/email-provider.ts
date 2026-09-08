import 'server-only';

import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { Resend } from 'resend';

export type EmailProviderName = 'ses' | 'resend';

export type EmailAttachment = {
  filename: string;
  /** Conteúdo em base64 (formato já usado pelos call-sites atuais). */
  content: string;
  contentType?: string;
};

export type SendEmailInput = {
  from: string;
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string | string[];
  subject: string;
  html?: string;
  text?: string;
  attachments?: EmailAttachment[];
};

export type SendEmailResult = {
  ok: boolean;
  provider: EmailProviderName;
  messageId?: string;
  error?: string;
  retryable?: boolean;
};

let sesClient: SESv2Client | null = null;
let sesClientRegion: string | null = null;

function configuredSes(): boolean {
  return Boolean(
    process.env.AWS_ACCESS_KEY_ID
    && process.env.AWS_SECRET_ACCESS_KEY
    && process.env.AWS_REGION,
  );
}

/**
 * Seleção deliberadamente reversível:
 * EMAIL_PROVIDER faz o corte explícito. O default continua no Resend para que
 * cadastrar credenciais AWS, sozinho, nunca troque o canal de produção.
 */
export function emailProviderName(): EmailProviderName {
  const selected = process.env.EMAIL_PROVIDER?.trim().toLowerCase();
  if (selected === 'ses' || selected === 'resend') return selected;
  return 'resend';
}

export function emailConfigurationError(): string | null {
  const provider = emailProviderName();
  if (provider === 'ses') {
    return configuredSes()
      ? null
      : 'Amazon SES não configurado (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY e AWS_REGION)';
  }
  return process.env.RESEND_API_KEY ? null : 'RESEND_API_KEY não configurada';
}

export function emailProviderConfigured(): boolean {
  return emailConfigurationError() === null;
}

function getSesClient(): SESv2Client {
  const region = process.env.AWS_REGION || 'sa-east-1';
  if (!sesClient || sesClientRegion !== region) {
    // Credenciais são lidas pela cadeia padrão do SDK (env vars na Vercel).
    // Não copiá-las para config/objeto evita que apareçam em inspeções e logs.
    sesClient = new SESv2Client({ region, maxAttempts: 3 });
    sesClientRegion = region;
  }
  return sesClient;
}

function list(value?: string | string[]): string[] | undefined {
  if (!value) return undefined;
  return Array.isArray(value) ? value : [value];
}

function attachmentContentType(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop();
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'csv') return 'text/csv';
  if (ext === 'xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (ext === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  return 'application/octet-stream';
}

function safeError(error: unknown): string {
  const e = error as { message?: unknown; name?: unknown } | null;
  return String(e?.message || e?.name || error || 'Falha desconhecida').slice(0, 300);
}

async function sendWithSes(input: SendEmailInput): Promise<SendEmailResult> {
  const provider: EmailProviderName = 'ses';
  const configError = emailConfigurationError();
  if (configError) return { ok: false, provider, error: configError };
  if (!input.html && !input.text) return { ok: false, provider, error: 'E-mail sem conteúdo' };

  try {
    const response = await getSesClient().send(new SendEmailCommand({
      FromEmailAddress: input.from,
      Destination: {
        ToAddresses: list(input.to),
        CcAddresses: list(input.cc),
        BccAddresses: list(input.bcc),
      },
      ReplyToAddresses: list(input.replyTo),
      Content: {
        Simple: {
          Subject: { Data: input.subject, Charset: 'UTF-8' },
          Body: {
            ...(input.html ? { Html: { Data: input.html, Charset: 'UTF-8' } } : {}),
            ...(input.text ? { Text: { Data: input.text, Charset: 'UTF-8' } } : {}),
          },
          ...(input.attachments?.length ? {
            Attachments: input.attachments.map((attachment) => ({
              FileName: attachment.filename,
              RawContent: Buffer.from(attachment.content, 'base64'),
              ContentType: attachment.contentType || attachmentContentType(attachment.filename),
              ContentDisposition: 'ATTACHMENT' as const,
            })),
          } : {}),
        },
      },
    }));
    return { ok: true, provider, messageId: response.MessageId };
  } catch (error: any) {
    const status = Number(error?.$metadata?.httpStatusCode || 0);
    return {
      ok: false,
      provider,
      error: safeError(error),
      retryable: Boolean(error?.$retryable) || status === 429 || status >= 500,
    };
  }
}

async function sendWithResend(input: SendEmailInput): Promise<SendEmailResult> {
  const provider: EmailProviderName = 'resend';
  const configError = emailConfigurationError();
  if (configError) return { ok: false, provider, error: configError };

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const response = await resend.emails.send({
      from: input.from,
      to: input.to,
      cc: input.cc,
      bcc: input.bcc,
      replyTo: input.replyTo,
      subject: input.subject,
      html: input.html,
      text: input.text,
      attachments: input.attachments,
    });
    if (response.error) {
      const status = Number((response.error as any)?.statusCode || 0);
      return {
        ok: false,
        provider,
        error: safeError(response.error),
        retryable: status === 429 || status >= 500,
      };
    }
    return { ok: true, provider, messageId: response.data?.id };
  } catch (error: any) {
    const status = Number(error?.statusCode || 0);
    return {
      ok: false,
      provider,
      error: safeError(error),
      retryable: status === 429 || status >= 500,
    };
  }
}

/** Envia uma vez. O SDK do SES já aplica retries de rede/throttling seguros. */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  return emailProviderName() === 'ses' ? sendWithSes(input) : sendWithResend(input);
}
