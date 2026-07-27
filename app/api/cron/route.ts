import { NextResponse } from 'next/server';
import { cleanupSessoes, triggerSegunda, triggerQuinta, triggerDiario } from '@/actions/cron-jobs';
import { safeSecretEqual } from '@/lib/secure-compare';

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
    if (!safeSecretEqual(token, cronSecret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === 'production') {
    // FAIL-CLOSED: sem CRON_SECRET em produção, o endpoint dispararia backups e
    // envios em massa para qualquer um. Recusa em vez de ficar aberto.
    console.error('[cron] FAIL-CLOSED: CRON_SECRET ausente em produção');
    return NextResponse.json({ error: 'Cron não configurado' }, { status: 503 });
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

      // Reset noturno do ambiente de demonstração (tenant acme-demo) ao estado
      // inicial. Falha → 500 (observável no log do Vercel). Tenant-safe.
      case 'reset_demo': {
        const { resetAcmeDemo } = await import('@/lib/demo/reset-acme-demo');
        const r = await resetAcmeDemo();
        try {
          const { logAdminAction } = await import('@/lib/audit');
          await logAdminAction({ adminEmail: 'system:cron', acao: 'demo.reset', alvo: 'acme-demo', detalhes: r.ok ? { counts: r.counts } : { error: r.error } });
        } catch { /* auditoria best-effort */ }
        if (!r.ok) throw new Error(r.error || 'reset do demo falhou');
        result = { message: `demo resetada · ${JSON.stringify(r.counts)}`, counts: r.counts };
        break;
      }

      // Motor único da cadência (lê dia da pílula 1/2/evidência por empresa).
      case 'trigger_diario':
        result = await triggerDiario();
        // PÓS-VOO imediato: confere se o que acabou de rodar realmente saiu. Roda
        // depois do envio, no mesmo request, para não depender de outro agendamento.
        // Best-effort: um problema no check NUNCA pode derrubar o envio em si.
        try {
          const { executarHealthCheck } = await import('@/lib/pipeline-health/core');
          const h = await executarHealthCheck('postflight');
          result.message = `${result.message || 'envio ok'} · saúde: ${h.message}`;
        } catch (e) {
          console.error('[cron] postflight falhou:', e.message);
        }
        break;

      // PRÉ-VOO: avalia a entrega de AMANHÃ. Roda 10:00 UTC = ~25h antes do envio das
      // 11:00 UTC do dia seguinte. A folga é o ponto: achar o problema 5 minutos antes
      // não serve de nada — gerar um kit leva ~5min por DISC e um vídeo leva ~40min de
      // render. Não roda às 11:00 (24h exatas) só para não disputar a lambda com o
      // envio do próprio dia, que acontece nesse minuto.
      case 'preflight_entrega': {
        const { executarHealthCheck } = await import('@/lib/pipeline-health/core');
        result = await executarHealthCheck('preflight');
        break;
      }

      // Integridade estrutural (duplicatas, presos, órfãos). Independe de entrega e
      // serve para ver TENDÊNCIA: estes números crescem sozinhos onde falta constraint.
      case 'health_estrutural': {
        const { executarHealthCheck } = await import('@/lib/pipeline-health/core');
        result = await executarHealthCheck('estrutural');
        break;
      }

      // Legados (disparo manual): seg = pílula única; qui = evidência. O cron
      // agora usa trigger_diario, que cobre os 2 e respeita a cadência configurada.
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
