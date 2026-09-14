import { getTenantSlug, resolveTenant } from '@/lib/tenant-resolver';
import { tenantDb } from '@/lib/tenant-db';
import {
  expandEngagementReportDate,
  verifyEngagementReportShortShareToken,
} from '@/lib/engajamento/report-share-link';

export const runtime = 'nodejs';

const NOT_FOUND = () => new Response('Relatório indisponível.', {
  status: 404,
  headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow, noarchive' },
});

export async function GET(request: Request, { params }: { params: Promise<{ date: string; token: string }> }) {
  try {
    const tenantSlug = getTenantSlug(request);
    if (!tenantSlug) return NOT_FOUND();

    const { date, token } = await params;
    const reportDate = expandEngagementReportDate(date);
    if (!reportDate) return NOT_FOUND();

    const tenant = await resolveTenant(tenantSlug);
    if (!tenant) return NOT_FOUND();
    const payload = verifyEngagementReportShortShareToken(token, tenantSlug, tenant.id, reportDate);
    if (!payload) return NOT_FOUND();

    const folder = `engajamento-rh/${tenantSlug}/${payload.reportDate}`;
    const storage = tenantDb(tenant.id).storage.from('relatorios-pdf');
    const { data: files, error: listError } = await storage.list(folder, { limit: 3 });
    const pdfs = (files || []).filter((file) => String(file.name).endsWith('.pdf'));
    if (listError || pdfs.length !== 1) {
      console.error('[engagement-report-short-share] relatório indisponível', {
        empresaId: tenant.id,
        folder,
        count: pdfs.length,
        error: listError?.message || null,
      });
      return NOT_FOUND();
    }

    const storagePath = `${folder}/${pdfs[0].name}`;
    const { data: file, error: downloadError } = await storage.download(storagePath);
    if (downloadError || !file) {
      console.error('[engagement-report-short-share] arquivo indisponível', {
        empresaId: tenant.id,
        storagePath,
        error: downloadError?.message || null,
      });
      return NOT_FOUND();
    }

    return new Response(new Uint8Array(await file.arrayBuffer()), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${pdfs[0].name}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'X-Robots-Tag': 'noindex, nofollow, noarchive',
      },
    });
  } catch (error) {
    console.error('[engagement-report-short-share] falha inesperada', error);
    return NOT_FOUND();
  }
}
