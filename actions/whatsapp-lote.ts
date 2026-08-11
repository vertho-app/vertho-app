'use server';

import { templateWhatsAppCIS } from '@/lib/notifications';
import { requireAdminSupabase } from '@/lib/admin-supabase';
import { APP_WEBHOOK_URL, QSTASH_BASE_URL, tenantUrl } from '@/lib/domain';
import { assertWhatsappAvailable } from '@/lib/whatsapp';
import { aplicarTetoLote, atrasosDoLote, duracaoEstimada } from '@/lib/whatsapp/cadencia';

/** Fila residual tolerada antes de um lote — ver MAX_FILA_ANTES_DO_LOTE no admin. */
const MAX_FILA_ANTES_DO_LOTE = 0;

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
      // maxFilaPendente: conectado não basta — fila residual do provedor é
      // entregue em rajada e empilhar lote em cima dela arrisca o bloqueio.
      await assertWhatsappAvailable({ maxFilaPendente: MAX_FILA_ANTES_DO_LOTE });
    } catch (err: any) {
      return { success: false, error: `${err?.message || 'WhatsApp indisponível'}. Reconecte uma instância antes de disparar WhatsApp em lote.` };
    }

    // Teto de volume + cadência com jitter (lib/whatsapp/cadencia).
    const { enviar: alvos, adiados, aviso: avisoTeto } = aplicarTetoLote(envios as any[]);
    const atrasos = atrasosDoLote(alvos.length);

    // Publicar no QStash em paralelo, com o atraso vindo da política.
    const results = await Promise.all(alvos.map(async (envio: any, i) => {
      const nome = envio.colaboradores.nome_completo || 'Colaborador';
      const telefone = envio.colaboradores.telefone;
      const link = tenantUrl(empresa.slug, `/avaliacao/${envio.token}`);
      const mensagem = templateWhatsAppCIS(nome, link);

      try {
        await publishToQStash({
          telefone,
          mensagem,
          envioId: envio.id,
          // Identifica a pessoa na telemetria de entrega, como no broadcast.
          ...(envio.colaborador_id ? { colaboradorId: envio.colaborador_id } : {}),
          empresaId,
        }, atrasos[i]);

        return { ok: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[dispararLinksCIS] Erro ${nome}:`, message);
        return { ok: false, error: message };
      }
    }));

    const agendados = results.filter(r => r.ok).length;
    const erros = results.filter(r => !r.ok).length;
    const semWhatsapp = envios.length - alvos.length - adiados.length;

    return {
      success: true,
      message:
        `${agendados} agendados no QStash (entrega em ${duracaoEstimada(agendados)}), ${erros} erros` +
        `${semWhatsapp > 0 ? `, ${semWhatsapp} sem telefone` : ''}${avisoTeto ? ` ⚠️ ${avisoTeto}` : ''}`,
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
      await assertWhatsappAvailable({ maxFilaPendente: MAX_FILA_ANTES_DO_LOTE });
    } catch (err: any) {
      return { success: false, error: `${err?.message || 'WhatsApp indisponível'}. Reconecte uma instância antes de disparar WhatsApp em lote.` };
    }

    const { enviar: alvos, adiados, aviso: avisoTeto } = aplicarTetoLote(relatorios as any[]);
    const atrasos = atrasosDoLote(alvos.length);

    const results = await Promise.all(alvos.map(async (rel: any, i) => {
      const nome = rel.colaboradores.nome_completo || 'Colaborador';
      const telefone = rel.colaboradores.telefone;
      const link = tenantUrl(empresa.slug, `/relatorio/${rel.id}`);
      const mensagem = `Olá, ${nome}! Seu relatório de competências da ${empresa.nome} está disponível:\n\n${link}`;

      try {
        await publishToQStash({
          telefone,
          mensagem,
          kindEnvio: 'relatorio',
          ...(rel.colaborador_id ? { colaboradorId: rel.colaborador_id } : {}),
          empresaId,
        }, atrasos[i]);
        return { ok: true };
      } catch {
        return { ok: false };
      }
    }));

    const agendados = results.filter(r => r.ok).length;
    const erros = results.filter(r => !r.ok).length;

    return {
      success: true,
      message:
        `Relatórios: ${agendados} agendados (entrega em ${duracaoEstimada(agendados)}), ${erros} erros` +
        `${avisoTeto ? ` ⚠️ ${avisoTeto}` : ''}`,
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
