import 'server-only';

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { tenantUrl } from '@/lib/domain';

const TOKEN_VERSION = 1 as const;
const SIGNING_CONTEXT = 'vertho:engagement-report-share:v1';
const MAX_TOKEN_LENGTH = 2_048;
const MAX_SHORT_TOKEN_LENGTH = 64;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TENANT_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const COMPACT_DATE_RE = /^\d{8}$/;

export const ENGAGEMENT_REPORT_SHARE_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface EngagementReportSharePayload {
  v: typeof TOKEN_VERSION;
  tenant: string;
  empresaId: string;
  storagePath: string;
  iat: number;
  exp: number;
  nonce: string;
}

export interface IssueEngagementReportShareOptions {
  tenantSlug: string;
  empresaId: string;
  storagePath: string;
  nowSeconds?: number;
}

export interface IssueEngagementReportShortShareOptions {
  tenantSlug: string;
  empresaId: string;
  reportDate: string;
  nowSeconds?: number;
}

export interface EngagementReportShortSharePayload {
  tenant: string;
  empresaId: string;
  reportDate: string;
  exp: number;
}

function signingKey(): Buffer {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY ausente para assinar o relatório.');
  return createHmac('sha256', serviceKey).update(SIGNING_CONTEXT).digest();
}

function signature(encodedPayload: string): Buffer {
  return createHmac('sha256', signingKey()).update(encodedPayload).digest();
}

function shortSignature(tenantSlug: string, empresaId: string, reportDate: string, expiry: string): Buffer {
  return createHmac('sha256', signingKey())
    .update(`short|${tenantSlug}|${empresaId}|${reportDate}|${expiry}`)
    .digest()
    .subarray(0, 20);
}

function validReportDate(reportDate: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) return false;
  const parsed = new Date(`${reportDate}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === reportDate;
}

function validStoragePath(storagePath: unknown, tenantSlug: string): storagePath is string {
  return typeof storagePath === 'string'
    && storagePath.length <= 768
    && storagePath.startsWith(`engajamento-rh/${tenantSlug}/`)
    && /^[A-Za-z0-9/_.-]+$/.test(storagePath)
    && !storagePath.includes('..')
    && storagePath.endsWith('.pdf');
}

export function issueEngagementReportShareToken(options: IssueEngagementReportShareOptions): string {
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (!TENANT_RE.test(options.tenantSlug)) throw new Error('Slug do tenant inválido.');
  if (!UUID_RE.test(options.empresaId)) throw new Error('Empresa inválida.');
  if (!validStoragePath(options.storagePath, options.tenantSlug)) throw new Error('Caminho do relatório inválido.');

  const payload: EngagementReportSharePayload = {
    v: TOKEN_VERSION,
    tenant: options.tenantSlug,
    empresaId: options.empresaId,
    storagePath: options.storagePath,
    iat: now,
    exp: now + ENGAGEMENT_REPORT_SHARE_TTL_SECONDS,
    nonce: randomBytes(12).toString('base64url'),
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${encoded}.${signature(encoded).toString('base64url')}`;
}

export function issueEngagementReportLongShareUrl(options: IssueEngagementReportShareOptions): string {
  const token = issueEngagementReportShareToken(options);
  return tenantUrl(options.tenantSlug, `/relatorios/engajamento/${token}`);
}

export function issueEngagementReportShareUrl(options: IssueEngagementReportShareOptions): string {
  if (!validStoragePath(options.storagePath, options.tenantSlug)) throw new Error('Caminho do relatório inválido.');
  const reportDate = options.storagePath.split('/')[2] || '';
  return issueEngagementReportShortShareUrl({
    tenantSlug: options.tenantSlug,
    empresaId: options.empresaId,
    reportDate,
    nowSeconds: options.nowSeconds,
  });
}

export function compactEngagementReportDate(reportDate: string): string {
  if (!validReportDate(reportDate)) throw new Error('Data do relatório inválida.');
  return reportDate.replaceAll('-', '');
}

export function expandEngagementReportDate(compactDate: string): string | null {
  if (!COMPACT_DATE_RE.test(compactDate)) return null;
  const reportDate = `${compactDate.slice(0, 4)}-${compactDate.slice(4, 6)}-${compactDate.slice(6, 8)}`;
  return validReportDate(reportDate) ? reportDate : null;
}

export function issueEngagementReportShortShareUrl(options: IssueEngagementReportShortShareOptions): string {
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (!TENANT_RE.test(options.tenantSlug)) throw new Error('Slug do tenant inválido.');
  if (!UUID_RE.test(options.empresaId)) throw new Error('Empresa inválida.');
  const compactDate = compactEngagementReportDate(options.reportDate);
  const expiry = (now + ENGAGEMENT_REPORT_SHARE_TTL_SECONDS).toString(36);
  const mac = shortSignature(options.tenantSlug, options.empresaId, options.reportDate, expiry).toString('base64url');
  return tenantUrl(options.tenantSlug, `/r/e/${compactDate}/${expiry}.${mac}`);
}

export function verifyEngagementReportShortShareToken(
  rawToken: string | null | undefined,
  expectedTenantSlug: string,
  expectedEmpresaId: string,
  reportDate: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): EngagementReportShortSharePayload | null {
  if (
    !rawToken
    || rawToken.length > MAX_SHORT_TOKEN_LENGTH
    || !TENANT_RE.test(expectedTenantSlug)
    || !UUID_RE.test(expectedEmpresaId)
    || !validReportDate(reportDate)
  ) return null;
  const parts = rawToken.split('.');
  if (parts.length !== 2 || !/^[0-9a-z]+$/.test(parts[0]) || !parts[1]) return null;

  try {
    const exp = Number.parseInt(parts[0], 36);
    if (!Number.isSafeInteger(exp) || exp.toString(36) !== parts[0]) return null;
    if (exp <= nowSeconds || exp - nowSeconds > ENGAGEMENT_REPORT_SHARE_TTL_SECONDS) return null;

    const actual = Buffer.from(parts[1], 'base64url');
    const expected = shortSignature(expectedTenantSlug, expectedEmpresaId, reportDate, parts[0]);
    if (actual.toString('base64url') !== parts[1]) return null;
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    return { tenant: expectedTenantSlug, empresaId: expectedEmpresaId, reportDate, exp };
  } catch {
    return null;
  }
}

export function verifyEngagementReportShareToken(
  rawToken: string | null | undefined,
  expectedTenantSlug: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): EngagementReportSharePayload | null {
  if (!rawToken || rawToken.length > MAX_TOKEN_LENGTH || !TENANT_RE.test(expectedTenantSlug)) return null;
  const parts = rawToken.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;

  try {
    const actual = Buffer.from(parts[1], 'base64url');
    const expected = signature(parts[0]);
    if (actual.toString('base64url') !== parts[1]) return null;
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

    const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) as Partial<EngagementReportSharePayload>;
    if (
      payload.v !== TOKEN_VERSION
      || payload.tenant !== expectedTenantSlug
      || !UUID_RE.test(String(payload.empresaId || ''))
      || !validStoragePath(payload.storagePath, expectedTenantSlug)
      || !Number.isInteger(payload.iat)
      || !Number.isInteger(payload.exp)
      || typeof payload.nonce !== 'string'
      || !/^[A-Za-z0-9_-]{16}$/.test(payload.nonce)
    ) return null;
    if (payload.iat! > nowSeconds + 60 || payload.exp! <= nowSeconds) return null;
    if (payload.exp! <= payload.iat! || payload.exp! - payload.iat! > ENGAGEMENT_REPORT_SHARE_TTL_SECONDS) return null;
    return payload as EngagementReportSharePayload;
  } catch {
    return null;
  }
}
