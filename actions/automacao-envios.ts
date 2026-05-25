'use server';

import { enviarPDF } from './whatsapp';
import { APP_URL } from '@/lib/domain';
import { requireAdminSupabase } from '@/lib/admin-supabase';
import { getAuthenticatedEmailFromAction } from '@/lib/auth/action-context';
import { logAdminAction } from '@/lib/audit';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ── Enviar PDFs em lote via WhatsApp ────────────────────────────────────────

export async function enviarPDFsLote(empresaId: string) {
  const sb = await requireAdminSupabase();
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

    for (const rel of (relatorios as any[])) {
      const telefone = rel.colaboradores.telefone;
      if (!telefone) continue;

      try {
        // Generate PDF via internal API
        const pdfRes = await fetch(`${APP_URL}/api/relatorio-pdf/${rel.id}`, {
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
