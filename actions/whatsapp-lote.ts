'use server';

import { templateWhatsAppCIS } from '@/lib/notifications';
import { requireAdminSupabase } from '@/lib/admin-supabase';
import { APP_WEBHOOK_URL, QSTASH_BASE_URL, tenantUrl } from '@/lib/domain';
import { assertWhatsappAvailable } from '@/lib/whatsapp';

const DELAY_BETWEEN_MS = 2000; // 2s entre cada mensagem

/**
 * Publica uma mensagem no QStash para entrega via webhook.
 * Usa APP_WEBHOOK_URL (app.{ROOT_DOMAIN}) — não APP_URL — porque a raiz
 * `vertho.ai` pode estar servida por site institucional externo (Gamma)
 * que retorna 404/405 nos endpoints da API.
 */
async function publishToQStash(payload: any, delaySec = 0) {
  const qstashToken = process.env.QSTASH_TOKEN;
  if (!qstashToken) throw new Error('QSTASH_TOKEN não configurado');

  const webhookUrl = `${APP_WEBHOOK_URL}/api/webhooks/qstash/whatsapp-cis`;

  const headers = {
    'Authorization': `Bearer ${qstashToken}`,
    'Content-Type': 'application/json',
    'Upstash-Delay': `${delaySec}s`,
  };

  // QStash exige URL raw no path (sem encodeURIComponent) — encoded retorna
  // "invalid scheme" no QStash atual da Upstash.
  const res = await fetch(`${QSTASH_BASE_URL}/v2/publish/${webhookUrl}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`QStash ${res.status}: ${detail}`);
  }

  return res.json();
}

// ── Disparar links CIS em lote via QStash ──────────────────────────────────

export async function dispararLinksCIS(empresaId: string) {
  const sb = await requireAdminSupabase('assessments.dispatch');
  try {
    const { data: empresa } = await sb.from('empresas')
      .select('nome, slug')
      .eq('id', empresaId).single();

    const { data: envios } = await sb.from('envios_diagnostico')
      .select('id, token, colaborador_id, colaboradores!inner(nome_completo, telefone)')
      .eq('empresa_id', empresaId)
      .eq('status', 'pendente')
      .not('colaboradores.telefone', 'is', null);

    if (!envios?.length) return { success: false, error: 'Nenhum envio pendente com telefone cadastrado' };

    try {
      await assertWhatsappAvailable();
    } catch (err: any) {
      return { success: false, error: `${err?.message || 'WhatsApp indisponível'}. Reconecte uma instância antes de disparar WhatsApp em lote.` };
    }

    // Publicar todas no QStash em paralelo com delay incremental
    const results = await Promise.all(envios.map(async (envio: any, i) => {
      const nome = envio.colaboradores.nome_completo || 'Colaborador';
      const telefone = envio.colaboradores.telefone;
      const link = tenantUrl(empresa.slug, `/avaliacao/${envio.token}`);
      const mensagem = templateWhatsAppCIS(nome, link);
      const delaySec = Math.floor((i * DELAY_BETWEEN_MS) / 1000);

      try {
        await publishToQStash({ telefone, mensagem, envioId: envio.id }, delaySec);

        return { ok: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[dispararLinksCIS] Erro ${nome}:`, message);
        return { ok: false, error: message };
      }
    }));

    const agendados = results.filter(r => r.ok).length;
    const erros = results.filter(r => !r.ok).length;
    const semWhatsapp = envios.length - results.length;

    return {
      success: true,
      message: `${agendados} agendados no QStash, ${erros} erros${semWhatsapp > 0 ? `, ${semWhatsapp} sem telefone` : ''}`,
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Disparar relatórios em lote via QStash ────────────────────────────────

export async function dispararRelatoriosLote(empresaId: string) {
  const sb = await requireAdminSupabase('assessments.dispatch');
  try {
    const { data: empresa } = await sb.from('empresas')
      .select('nome, slug')
      .eq('id', empresaId).single();

    const { data: relatorios } = await sb.from('relatorios')
      .select('id, colaborador_id, colaboradores!inner(nome_completo, telefone)')
      .eq('empresa_id', empresaId)
      .eq('tipo', 'individual')
      .not('colaboradores.telefone', 'is', null);

    if (!relatorios?.length) return { success: false, error: 'Nenhum relatório com telefone' };

    try {
      await assertWhatsappAvailable();
    } catch (err: any) {
      return { success: false, error: `${err?.message || 'WhatsApp indisponível'}. Reconecte uma instância antes de disparar WhatsApp em lote.` };
    }

    const results = await Promise.all(relatorios.map(async (rel: any, i) => {
      const nome = rel.colaboradores.nome_completo || 'Colaborador';
      const telefone = rel.colaboradores.telefone;
      const link = tenantUrl(empresa.slug, `/relatorio/${rel.id}`);
      const mensagem = `Olá, ${nome}! Seu relatório de competências da ${empresa.nome} está disponível:\n\n${link}`;
      const delaySec = Math.floor((i * DELAY_BETWEEN_MS) / 1000);

      try {
        await publishToQStash({ telefone, mensagem }, delaySec);
        return { ok: true };
      } catch {
        return { ok: false };
      }
    }));

    const agendados = results.filter(r => r.ok).length;
    const erros = results.filter(r => !r.ok).length;

    return { success: true, message: `Relatórios: ${agendados} agendados, ${erros} erros` };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
