'use server';

import { enviarPDF } from './whatsapp';
import { criarPaceadorSincrono, maxPorDisparo } from '@/lib/whatsapp/cadencia';
import { requireAdminSupabase, requireEmpresaSupabase } from '@/lib/admin-supabase';
import { getAuthenticatedEmailFromAction } from '@/lib/auth/action-context';
import { logAdminAction } from '@/lib/audit';
import { renderToBuffer } from '@react-pdf/renderer';
import RelatorioIndividualPDF from '@/components/pdf/RelatorioIndividual';
import { getLogoCoverBase64 } from '@/lib/pdf-assets';
import React from 'react';

// ── Enviar PDFs em lote via WhatsApp ────────────────────────────────────────
//
// ⚠️ Este export NÃO tem chamador na UI (verificado por `git grep` em 11/08/2026)
// — e num arquivo `'use server'` isso não significa "código morto": todo export
// vira endpoint HTTP. Ele mandava DOCUMENTO a cada 1,5s, sem teto e sem trava de
// fila, o que o tornava o disparo mais agressivo do repositório com a menor
// visibilidade. O caminho vivo equivalente é o broadcast do admin com `comPDF`
// (fila QStash + signed URL + teto), e a recomendação é remover este daqui; até
// que essa decisão seja tomada, ele passa pela mesma política dos outros.

export async function enviarPDFsLote(empresaId: string) {
  // Gate TENANT-SCOPED (auditoria 23/07): envia PDFs DISC confidenciais via
  // WhatsApp — o empresaId vem do client e precisa bater com o tenant da sessão.
  const sb = await requireEmpresaSupabase(empresaId, 'assessments.dispatch', 'enviarPDFsLote');
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
    let adiados = 0;
    const paceador = criarPaceadorSincrono();

    for (const rel of (relatorios as any[])) {
      const telefone = rel.colaboradores.telefone;
      if (!telefone) continue;

      // Teto por volume ou por tempo da invocação. O excedente é DEVOLVIDO na
      // mensagem de retorno — nunca cortado em silêncio.
      if (paceador.tetoAtingido()) { adiados++; continue; }

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

        // A espera vem ANTES do envio (e depois do render, que já consome
        // tempo): a política define a taxa NO NÚMERO, e o paceador desconta o
        // que a iteração anterior gastou.
        await paceador.aguardarVez();
        const result = await enviarPDF(telefone, pdfBase64, filename);

        if (result.success) {
          enviados++;
        } else {
          erros++;
        }
      } catch (_) {
        erros++;
      }
    }

    await logAdminAction({
      adminEmail: (await getAuthenticatedEmailFromAction()) || 'desconhecido',
      acao: 'envio.pdfs_lote', empresaId, empresaSlug: empresa?.slug,
      alvo: `${relatorios.length} relatórios`,
      detalhes: { canal: 'whatsapp', enviados, erros, adiados, total: relatorios.length },
      resultado: enviados === 0 ? 'erro' : erros > 0 ? 'parcial' : 'ok',
    });

    const avisoTeto = adiados > 0
      ? ` · ${adiados} NÃO enviados (teto de segurança de ${maxPorDisparo()} por disparo, ou tempo da execução esgotado) — dispare o restante depois`
      : '';
    return {
      success: true,
      message: `PDFs enviados: ${enviados} sucesso, ${erros} erros de ${relatorios.length} total${avisoTeto}`,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
