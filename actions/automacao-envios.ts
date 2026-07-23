'use server';

import { enviarPDF } from './whatsapp';
import { requireAdminSupabase, requireEmpresaSupabase } from '@/lib/admin-supabase';
import { getAuthenticatedEmailFromAction } from '@/lib/auth/action-context';
import { logAdminAction } from '@/lib/audit';
import { renderToBuffer } from '@react-pdf/renderer';
import RelatorioIndividualPDF from '@/components/pdf/RelatorioIndividual';
import { getLogoCoverBase64 } from '@/lib/pdf-assets';
import React from 'react';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ── Enviar PDFs em lote via WhatsApp ────────────────────────────────────────

export async function enviarPDFsLote(empresaId: string) {
  // Gate TENANT-SCOPED (auditoria 23/07): envia PDFs DISC confidenciais via
  // WhatsApp — o empresaId vem do client e precisa bater com o tenant da sessão.
  const sb = await requireEmpresaSupabase(empresaId, 'assessments.dispatch');
  try {
    const { data: empresa } = await sb.from('empresas')
      .select('nome, slug')
      .eq('id', empresaId).single();

    // Fetch individual reports that have collaborators with phone numbers
    const { data: relatorios } = await sb.from('relatorios')
      .select('id, conteudo, colaborador_id, colaboradores!inner(nome_completo, telefone, cargo)')
      .eq('empresa_id', empresaId)
      .eq('tipo', 'individual')
      .not('colaboradores.telefone', 'is', null);

    if (!relatorios?.length) return { success: false, error: 'Nenhum relatório com telefone para enviar' };

    let enviados = 0;
    let erros = 0;

    for (const rel of (relatorios as any[])) {
      const telefone = rel.colaboradores.telefone;
      if (!telefone) continue;

      try {
        // Renderiza o PDF EM PROCESSO. O action já roda server-side com privilégio
        // admin e o `rel` veio de uma query escopada por empresa_id (tenant-safe),
        // então dispensa self-fetch HTTP (a rota /api/relatorio-pdf/{id} nunca
        // existiu — a real é /api/relatorios/pdf?id=, e exige sessão de usuário que
        // este fetch server-to-server não tem). Mesmo componente da rota.
        const conteudo = typeof rel.conteudo === 'string' ? JSON.parse(rel.conteudo) : rel.conteudo;
        const data = {
          ...rel,
          conteudo,
          colaborador_nome: rel.colaboradores.nome_completo,
          colaborador_cargo: rel.colaboradores.cargo || '',
        };
        const pdfBuffer = await renderToBuffer(
          React.createElement(RelatorioIndividualPDF, {
            data,
            empresaNome: empresa?.nome || '',
            logoBase64: getLogoCoverBase64(),
          }) as any,
        );
        const pdfBase64 = Buffer.from(pdfBuffer).toString('base64');
        const filename = `Relatorio_${rel.colaboradores.nome_completo.replace(/\s+/g, '_')}.pdf`;

        const result = await enviarPDF(telefone, pdfBase64, filename);

        if (result.success) {
          enviados++;
        } else {
          erros++;
        }
      } catch (_) {
        erros++;
      }

      // Rate limit: 1.5s between messages
      await delay(1500);
    }

    await logAdminAction({
      adminEmail: (await getAuthenticatedEmailFromAction()) || 'desconhecido',
      acao: 'envio.pdfs_lote', empresaId, empresaSlug: empresa?.slug,
      alvo: `${relatorios.length} relatórios`,
      detalhes: { canal: 'whatsapp', enviados, erros, total: relatorios.length },
      resultado: enviados === 0 ? 'erro' : erros > 0 ? 'parcial' : 'ok',
    });

    return {
      success: true,
      message: `PDFs enviados: ${enviados} sucesso, ${erros} erros de ${relatorios.length} total`,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
