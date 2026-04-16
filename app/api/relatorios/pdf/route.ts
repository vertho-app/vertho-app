import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { renderToBuffer } from '@react-pdf/renderer';
import RelatorioIndividualPDF from '@/components/pdf/RelatorioIndividual';
import RelatorioGestorPDF from '@/components/pdf/RelatorioGestor';
import RelatorioRHPDF from '@/components/pdf/RelatorioRH';
import { getLogoCoverBase64 } from '@/lib/pdf-assets';
import React from 'react';

const COMPONENTS = {
  individual: { C: RelatorioIndividualPDF, prefix: 'vertho-pdi' },
  gestor: { C: RelatorioGestorPDF, prefix: 'vertho-gestor' },
  rh: { C: RelatorioRHPDF, prefix: 'vertho-rh' },
};

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const relatorioId = searchParams.get('id');

    if (!relatorioId) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });

    const sb = createSupabaseAdmin();

    const { data: rel } = await sb.from('relatorios')
      .select('*').eq('id', relatorioId).single();
    if (!rel) return NextResponse.json({ error: 'Relatório não encontrado' }, { status: 404 });

    const tipoCfg = COMPONENTS[rel.tipo];
    if (!tipoCfg) return NextResponse.json({ error: `Tipo "${rel.tipo}" não suportado para PDF` }, { status: 400 });

    // Resolver nome do colaborador / empresa (para filename)
    let colaboradorNome = '', empresaNome = '';
    if (rel.colaborador_id) {
      const { data: colab } = await sb.from('colaboradores')
        .select('nome_completo').eq('id', rel.colaborador_id).maybeSingle();
      colaboradorNome = colab?.nome_completo || '';
    }
    if (rel.empresa_id) {
      const { data: emp } = await sb.from('empresas').select('nome').eq('id', rel.empresa_id).maybeSingle();
      empresaNome = emp?.nome || '';
    }

    const baseName = rel.tipo === 'individual' ? colaboradorNome : empresaNome;
    const filename = `${tipoCfg.prefix}-${(baseName || rel.tipo).replace(/\s+/g, '-').toLowerCase()}.pdf`;

    // 1) Tentar baixar do storage se já foi salvo
    if (rel.pdf_path) {
      const { data: stored, error: dlErr } = await sb.storage.from('relatorios-pdf').download(rel.pdf_path);
      if (!dlErr && stored) {
        const buffer = Buffer.from(await stored.arrayBuffer());
        return new NextResponse(buffer, {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'X-Pdf-Source': 'storage',
          },
        });
      }
      console.warn('[PDF] download falhou, vai regenerar:', dlErr?.message);
    }

    // 2) Fallback: gerar on-the-fly e salvar no storage
    const conteudo = typeof rel.conteudo === 'string' ? JSON.parse(rel.conteudo) : rel.conteudo;
    let colaboradorCargo = '';
    if (rel.colaborador_id) {
      const { data: c } = await sb.from('colaboradores')
        .select('cargo').eq('id', rel.colaborador_id).maybeSingle();
      colaboradorCargo = c?.cargo || '';
    }
    const data = { ...rel, conteudo, colaborador_nome: colaboradorNome, colaborador_cargo: colaboradorCargo };

    const logoBase64 = getLogoCoverBase64();
    const buffer = await renderToBuffer(
      React.createElement(tipoCfg.C, { data, empresaNome, logoBase64 }) as any
    );

    // Salvar no storage para próximos downloads
    try {
      const slug = (baseName || rel.tipo).replace(/\s+/g, '-').toLowerCase();
      const path = `${rel.empresa_id}/${rel.tipo}-${slug}-${Date.now()}.pdf`;
      const { error: upErr } = await sb.storage.from('relatorios-pdf').upload(path, buffer, {
        contentType: 'application/pdf',
        upsert: true,
      });
      if (!upErr) {
        await sb.from('relatorios').update({ pdf_path: path }).eq('id', relatorioId);
      }
    } catch (e) {
      console.error('[PDF upload]', e.message);
    }

    return new NextResponse(buffer as any, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-Pdf-Source': 'generated',
      },
    });
  } catch (err) {
    console.error('[PDF]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
