'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { templateWhatsAppCIS } from '@/lib/notifications';

const DELAY_BETWEEN_MS = 2000; // 2s entre cada mensagem

/**
 * Publica uma mensagem no QStash para entrega via webhook.
 */
async function publishToQStash(payload, delaySec = 0) {
  const qstashToken = process.env.QSTASH_TOKEN;
  if (!qstashToken) throw new Error('QSTASH_TOKEN não configurado');

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'https://vertho-app-xi.vercel.app';

  const webhookUrl = `${appUrl}/api/webhooks/qstash/whatsapp-cis`;

  const headers = {
    'Authorization': `Bearer ${qstashToken}`,
    'Content-Type': 'application/json',
    'Upstash-Delay': `${delaySec}s`,
  };

  const res = await fetch('https://qstash.upstash.io/v2/publish/' + encodeURIComponent(webhookUrl), {
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

export async function dispararLinksCIS(empresaId) {
  const sb = createSupabaseAdmin();
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

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://vertho-app-xi.vercel.app';

    // Publicar todas no QStash em paralelo com delay incremental
    const results = await Promise.all(envios.map(async (envio, i) => {
      const nome = envio.colaboradores.nome_completo || 'Colaborador';
      const telefone = envio.colaboradores.telefone;
      const link = `${baseUrl}/${empresa.slug}/avaliacao/${envio.token}`;
      const mensagem = templateWhatsAppCIS(nome, link);
      const delaySec = Math.floor((i * DELAY_BETWEEN_MS) / 1000);

      try {
        await publishToQStash({ telefone, mensagem }, delaySec);

        // Marcar como enviado
        await sb.from('envios_diagnostico')
          .update({ status: 'enviado', enviado_em: new Date().toISOString(), canal: 'whatsapp' })
          .eq('id', envio.id);

        return { ok: true };
      } catch (err) {
        console.error(`[dispararLinksCIS] Erro ${nome}:`, err.message);
        return { ok: false, error: err.message };
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
    return { success: false, error: err.message };
  }
}

// ── Disparar relatórios em lote via QStash ────────────────────────────────

export async function dispararRelatoriosLote(empresaId) {
  const sb = createSupabaseAdmin();
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

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://vertho-app-xi.vercel.app';

    const results = await Promise.all(relatorios.map(async (rel, i) => {
      const nome = rel.colaboradores.nome_completo || 'Colaborador';
      const telefone = rel.colaboradores.telefone;
      const link = `${baseUrl}/${empresa.slug}/relatorio/${rel.id}`;
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
    return { success: false, error: err.message };
  }
}
