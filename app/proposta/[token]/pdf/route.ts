import { NextResponse } from 'next/server';
import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { createSupabaseAdmin } from '@/lib/supabase';
import { getLogoCoverBase64 } from '@/lib/pdf-assets';
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
  const [{ data: account }, { data: rep }, { data: opp }] = await Promise.all([
    proposal.account_id
      ? sb.from('sales_accounts').select('legal_name,trade_name').eq('id', proposal.account_id).maybeSingle()
      : Promise.resolve({ data: null }),
    proposal.representante_id
      ? sb.from('sales_representatives').select('name,email,phone').eq('id', proposal.representante_id).maybeSingle()
      : Promise.resolve({ data: null }),
    proposal.opportunity_id
      ? sb.from('sales_opportunities').select('identified_need').eq('id', proposal.opportunity_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const doc = buildProposalDocument(proposal, account, rep, { contexto: (opp as any)?.identified_need ?? null });

  const buffer = await renderToBuffer(
    // @ts-ignore - JSX em route handler com renderToBuffer
    React.createElement(PropostaComercialPDF, {
      doc,
      logoBase64: getLogoCoverBase64() || undefined,
    }),
  );

  return new NextResponse(buffer as any, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="proposta-${doc.numero}.pdf"`,
    },
  });
}
