'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { enviarPDF } from './whatsapp';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ── Enviar PDFs em lote via WhatsApp ────────────────────────────────────────

export async function enviarPDFsLote(empresaId) {
  const sb = createSupabaseAdmin();
  try {
    const { data: empresa } = await sb.from('empresas')
      .select('nome, slug')
      .eq('id', empresaId).single();

    // Fetch individual reports that have collaborators with phone numbers
    const { data: relatorios } = await sb.from('relatorios')
      .select('id, conteudo, colaborador_id, colaboradores!inner(nome_completo, telefone)')
      .eq('empresa_id', empresaId)
      .eq('tipo', 'individual')
      .not('colaboradores.telefone', 'is', null);

    if (!relatorios?.length) return { success: false, error: 'Nenhum relatório com telefone para enviar' };

    let enviados = 0;
    let erros = 0;

    for (const rel of relatorios) {
      const telefone = rel.colaboradores.telefone;
      if (!telefone) continue;

      try {
        // Generate PDF via internal API
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://vertho.app';
        const pdfRes = await fetch(`${baseUrl}/api/relatorio-pdf/${rel.id}`, {
          method: 'GET',
          headers: {
            'x-api-key': process.env.INTERNAL_API_KEY || '',
          },
        });

        if (!pdfRes.ok) {
          erros++;
          continue;
        }

        const pdfBuffer = await pdfRes.arrayBuffer();
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

    return {
      success: true,
      message: `PDFs enviados: ${enviados} sucesso, ${erros} erros de ${relatorios.length} total`,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
