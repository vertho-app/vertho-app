import { NextResponse } from 'next/server';
import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { createSupabaseAdmin } from '@/lib/supabase';
import { getLogoCoverBase64, getTrajetoriaLogosBase64 } from '@/lib/pdf-assets';
import { buildProposalDocument } from '@/lib/sales/proposal-document';
import PropostaComercialPDF from '@/components/pdf/PropostaComercialPDF';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const sb = createSupabaseAdmin();

  // 1) Proposta por public_token
  const { data: proposal } = await sb
    .from('sales_proposals')
    .select('*')
    .eq('public_token', token)
    .maybeSingle();
  if (!proposal) {
    return new NextResponse('Proposta não encontrada', { status: 404 });
  }

  // 2) Conta + representante + contexto da oportunidade (para o VM cliente-facing)
  const [{ data: account }, { data: rep }, { data: opp }, { data: orc }] = await Promise.all([
    proposal.account_id
      ? sb.from('sales_accounts').select('legal_name,trade_name').eq('id', proposal.account_id).maybeSingle()
      : Promise.resolve({ data: null }),
    proposal.representante_id
      ? sb.from('sales_representatives').select('name,email,phone').eq('id', proposal.representante_id).maybeSingle()
      : Promise.resolve({ data: null }),
    proposal.opportunity_id
      ? sb.from('sales_opportunities').select('identified_need').eq('id', proposal.opportunity_id).maybeSingle()
      : Promise.resolve({ data: null }),
    // Mesma carga da página (`getPropostaPublica`): PDF e página vêm do MESMO
    // VM, então o que alimenta um tem que alimentar o outro — senão o cliente
    // baixa um documento com menos informação do que leu na tela.
    sb.from('orcamento_cenarios').select('entradas, resultado').eq('proposta_id', proposal.id).maybeSingle(),
  ]);

  const doc = buildProposalDocument(proposal, account, rep, {
    contexto: (opp as any)?.identified_need ?? null,
    orcamento: orc,
  });

  const trajetoriaLogos = getTrajetoriaLogosBase64();
  if (!trajetoriaLogos) {
    // A seção some do PDF; sem este log, sumiria calada. Causa provável: o
    // arquivo fora do `outputFileTracingIncludes` (next.config.mjs).
    console.error('[proposta/pdf] quadro de logos da trajetória não carregou: public/proposta/trajetoria-logos-2026-09.jpg');
  }

  const buffer = await renderToBuffer(
    // @ts-ignore - JSX em route handler com renderToBuffer
    React.createElement(PropostaComercialPDF, {
      doc,
      logoBase64: getLogoCoverBase64() || undefined,
      trajetoriaLogosBase64: trajetoriaLogos || undefined,
    }),
  );

  return new NextResponse(buffer as any, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="proposta-${doc.numero}.pdf"`,
    },
  });
}
