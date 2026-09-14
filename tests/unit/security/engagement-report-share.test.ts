import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ENGAGEMENT_REPORT_SHARE_TTL_SECONDS,
  expandEngagementReportDate,
  issueEngagementReportShareToken,
  issueEngagementReportShareUrl,
  issueEngagementReportShortShareUrl,
  verifyEngagementReportShareToken,
  verifyEngagementReportShortShareToken,
} from '@/lib/engajamento/report-share-link';

const EMPRESA = '44b632ae-b7b9-440d-bc74-92cead889d52';
const NOW = 1_789_000_000;
const PATH = 'engajamento-rh/projetomacae/2026-09-14/engajamento-macae-rh-2026-09-14.pdf';

beforeEach(() => {
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'segredo-de-teste-que-nao-vai-para-o-token');
});

describe('link público do relatório de engajamento', () => {
  it('gera um link curto no domínio do tenant', () => {
    const url = issueEngagementReportShortShareUrl({
      tenantSlug: 'projetomacae', empresaId: EMPRESA, reportDate: '2026-09-14', nowSeconds: NOW,
    });
    expect(url).toMatch(/^https:\/\/projetomacae\.vertho\.ai\/r\/e\/20260914\/[0-9a-z]+\.[A-Za-z0-9_-]+$/);
    expect(url.length).toBeLessThan(100);
    const token = new URL(url).pathname.split('/').at(-1)!;
    expect(verifyEngagementReportShortShareToken(token, 'projetomacae', EMPRESA, '2026-09-14', NOW))
      .toMatchObject({ tenant: 'projetomacae', empresaId: EMPRESA, reportDate: '2026-09-14' });
  });

  it('recusa o link curto expirado, adulterado ou aberto em outro tenant', () => {
    const url = issueEngagementReportShortShareUrl({
      tenantSlug: 'projetomacae', empresaId: EMPRESA, reportDate: '2026-09-14', nowSeconds: NOW,
    });
    const token = new URL(url).pathname.split('/').at(-1)!;
    expect(verifyEngagementReportShortShareToken(token, 'ibipeba', EMPRESA, '2026-09-14', NOW)).toBeNull();
    expect(verifyEngagementReportShortShareToken(token, 'projetomacae', EMPRESA, '2026-09-15', NOW)).toBeNull();
    expect(verifyEngagementReportShortShareToken(`${token.slice(0, -1)}x`, 'projetomacae', EMPRESA, '2026-09-14', NOW)).toBeNull();
    expect(verifyEngagementReportShortShareToken(
      token, 'projetomacae', EMPRESA, '2026-09-14', NOW + ENGAGEMENT_REPORT_SHARE_TTL_SECONDS,
    )).toBeNull();
  });

  it('expande somente datas reais no caminho curto', () => {
    expect(expandEngagementReportDate('20260914')).toBe('2026-09-14');
    expect(expandEngagementReportDate('20260231')).toBeNull();
    expect(expandEngagementReportDate('260914')).toBeNull();
  });

  it('usa o domínio do tenant e valida o token durante sete dias', () => {
    const options = { tenantSlug: 'projetomacae', empresaId: EMPRESA, storagePath: PATH, nowSeconds: NOW };
    const url = issueEngagementReportShareUrl(options);
    expect(url).toMatch(/^https:\/\/projetomacae\.vertho\.ai\/relatorios\/engajamento\//);
    const token = new URL(url).pathname.split('/').at(-1)!;
    expect(verifyEngagementReportShareToken(token, 'projetomacae', NOW + ENGAGEMENT_REPORT_SHARE_TTL_SECONDS - 1))
      .toMatchObject({ tenant: 'projetomacae', empresaId: EMPRESA, storagePath: PATH });
    expect(verifyEngagementReportShareToken(token, 'projetomacae', NOW + ENGAGEMENT_REPORT_SHARE_TTL_SECONDS)).toBeNull();
  });

  it('recusa assinatura alterada e uso no subdomínio de outro cliente', () => {
    const token = issueEngagementReportShareToken({
      tenantSlug: 'projetomacae', empresaId: EMPRESA, storagePath: PATH, nowSeconds: NOW,
    });
    expect(verifyEngagementReportShareToken(`${token.slice(0, -1)}x`, 'projetomacae', NOW)).toBeNull();
    expect(verifyEngagementReportShareToken(token, 'ibipeba', NOW)).toBeNull();
  });

  it('não assina caminho de outro tenant nem travessia de diretório', () => {
    expect(() => issueEngagementReportShareToken({
      tenantSlug: 'projetomacae', empresaId: EMPRESA,
      storagePath: 'engajamento-rh/ibipeba/2026-09-14/relatorio.pdf', nowSeconds: NOW,
    })).toThrow('Caminho do relatório inválido');
    expect(() => issueEngagementReportShareToken({
      tenantSlug: 'projetomacae', empresaId: EMPRESA,
      storagePath: 'engajamento-rh/projetomacae/../segredo.pdf', nowSeconds: NOW,
    })).toThrow('Caminho do relatório inválido');
  });
});
