import { NextResponse } from 'next/server';
import { cleanupSessoes, triggerSegunda, triggerQuinta } from '@/actions/cron-jobs';

/**
 * GET /api/cron?action=cleanup_sessoes|trigger_segunda|trigger_quinta
 *
 * Executado automaticamente pelo Vercel Cron:
 *   - cleanup_sessoes: diário às 02:00 UTC (05:00 BRT)
 *   - trigger_segunda: segunda-feira às 08:00 UTC (11:00 BRT)
 *   - trigger_quinta:  quinta-feira às 08:00 UTC (11:00 BRT)
 *
 * Protegido por CRON_SECRET (header Authorization ou query param).
 */
export async function GET(req) {
  // Autenticação: Vercel envia Authorization: Bearer <CRON_SECRET>
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret) {
    const token = authHeader?.replace('Bearer ', '');
    if (token !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');

  try {
    let result;

    switch (action) {
      case 'cleanup_sessoes':
        result = await cleanupSessoes();
        // Aproveita o cron diário pra recalcular taxa_conclusao dos micro-conteúdos
        try {
          const { recalcularTaxaConclusao } = await import('@/actions/conteudos-metrics');
          const taxa = await recalcularTaxaConclusao();
          result.message = `${result.message || 'cleanup ok'} · taxa: ${taxa.message}`;
        } catch (e) {
          console.warn('[cron] taxa_conclusao falhou:', e.message);
        }
        break;

      case 'recalcular_taxa': {
        const { recalcularTaxaConclusao } = await import('@/actions/conteudos-metrics');
        result = await recalcularTaxaConclusao();
        break;
      }

      case 'backup_diario': {
        const { executarBackupDiario } = await import('@/actions/backup');
        result = await executarBackupDiario();
        break;
      }

      case 'trigger_segunda':
        result = await triggerSegunda();
        break;

      case 'trigger_quinta':
        result = await triggerQuinta();
        break;

      default:
        return NextResponse.json({ error: `Action desconhecida: ${action}` }, { status: 400 });
    }

    console.log(`[cron] ${action}:`, result.message);
    return NextResponse.json({ ok: true, action, ...result });

  } catch (err) {
    console.error(`[cron] ${action} falhou:`, err.message);
    return NextResponse.json({ ok: false, action, error: err.message }, { status: 500 });
  }
}
