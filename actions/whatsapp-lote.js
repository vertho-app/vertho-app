'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { enviarLink } from './whatsapp';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ── Disparar links CIS (avaliação) em lote ──────────────────────────────────

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

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://vertho.app';
    let enviados = 0;
    let erros = 0;

    for (const envio of envios) {
      const telefone = envio.colaboradores.telefone;
      if (!telefone) continue;

      const link = `${baseUrl}/${empresa.slug}/avaliacao/${envio.token}`;
      const titulo = `${empresa.nome} — Avaliação de Competências`;

      const result = await enviarLink(telefone, link, titulo);

      if (result.success) {
        await sb.from('envios_diagnostico')
          .update({ status: 'enviado', enviado_em: new Date().toISOString(), canal: 'whatsapp' })
          .eq('id', envio.id);
        enviados++;
      } else {
        erros++;
      }

      // Rate limit: 1.5s between messages
      await delay(1500);
    }

    return { success: true, message: `WhatsApp lote: ${enviados} enviados, ${erros} erros de ${envios.length} total` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Disparar relatórios em lote via WhatsApp ────────────────────────────────

export async function dispararRelatoriosLote(empresaId) {
  const sb = createSupabaseAdmin();
  try {
    const { data: empresa } = await sb.from('empresas')
      .select('nome, slug')
      .eq('id', empresaId).single();

    const { data: relatorios } = await sb.from('relatorios')
      .select('id, tipo, colaborador_id, colaboradores!inner(nome_completo, telefone)')
      .eq('empresa_id', empresaId)
      .eq('tipo', 'individual')
      .not('colaboradores.telefone', 'is', null);

    if (!relatorios?.length) return { success: false, error: 'Nenhum relatório individual com telefone' };

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://vertho.app';
    let enviados = 0;
    let erros = 0;

    for (const rel of relatorios) {
      const telefone = rel.colaboradores.telefone;
      if (!telefone) continue;

      const link = `${baseUrl}/${empresa.slug}/relatorio/${rel.id}`;
      const titulo = `${empresa.nome} — Seu Relatório de Competências`;

      const result = await enviarLink(telefone, link, titulo);

      if (result.success) {
        enviados++;
      } else {
        erros++;
      }

      // Rate limit: 1.5s between messages
      await delay(1500);
    }

    return { success: true, message: `Relatórios WhatsApp: ${enviados} enviados, ${erros} erros` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
