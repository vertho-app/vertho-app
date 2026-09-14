import { getTenantSlug, resolveTenant } from '@/lib/tenant-resolver';
import { tenantDb } from '@/lib/tenant-db';
import { verifyEngagementReportShareToken } from '@/lib/engajamento/report-share-link';

export const runtime = 'nodejs';

const NOT_FOUND = () => new Response('Relatório indisponível.', {
  status: 404,
  headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow, noarchive' },
});

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const tenantSlug = getTenantSlug(request);
    if (!tenantSlug) return NOT_FOUND();

    const { token } = await params;
    const payload = verifyEngagementReportShareToken(token, tenantSlug);
    if (!payload) return NOT_FOUND();

    const tenant = await resolveTenant(tenantSlug);
    if (!tenant || tenant.id !== payload.empresaId) return NOT_FOUND();

    const { data: file, error } = await tenantDb(tenant.id).storage
      .from('relatorios-pdf')
      .download(payload.storagePath);
    if (error || !file) {
      console.error('[engagement-report-share] arquivo indisponível', {
        empresaId: tenant.id,
        storagePath: payload.storagePath,
        error: error?.message || null,
      });
      return NOT_FOUND();
    }

    const filename = payload.storagePath.split('/').at(-1) || 'relatorio-engajamento.pdf';
    return new Response(new Uint8Array(await file.arrayBuffer()), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'X-Robots-Tag': 'noindex, nofollow, noarchive',
      },
    });
  } catch (error) {
    console.error('[engagement-report-share] falha inesperada', error);
    return NOT_FOUND();
  }
}
