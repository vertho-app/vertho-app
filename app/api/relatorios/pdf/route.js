import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { renderToBuffer } from '@react-pdf/renderer';
import RelatorioIndividualPDF from '@/components/pdf/RelatorioIndividual';
import React from 'react';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const relatorioId = searchParams.get('id');
    const empresaId = searchParams.get('empresa');

    if (!relatorioId) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });

    const sb = createSupabaseAdmin();

    const { data: rel } = await sb.from('relatorios')
      .select('*')
      .eq('id', relatorioId)
      .single();

    if (!rel) return NextResponse.json({ error: 'Relatório não encontrado' }, { status: 404 });

    const conteudo = typeof rel.conteudo === 'string' ? JSON.parse(rel.conteudo) : rel.conteudo;

    // Buscar nome do colaborador
    let colaboradorNome = '—', colaboradorCargo = '—';
    if (rel.colaborador_id) {
      const { data: colab } = await sb.from('colaboradores')
        .select('nome_completo, cargo').eq('id', rel.colaborador_id).maybeSingle();
      if (colab) { colaboradorNome = colab.nome_completo; colaboradorCargo = colab.cargo; }
    }

    // Buscar nome da empresa
    let empresaNome = '';
    if (rel.empresa_id) {
      const { data: emp } = await sb.from('empresas')
        .select('nome').eq('id', rel.empresa_id).maybeSingle();
      empresaNome = emp?.nome || '';
    }

    const data = {
      ...rel,
      conteudo,
      colaborador_nome: colaboradorNome,
      colaborador_cargo: colaboradorCargo,
    };

    // Gerar PDF
    const buffer = await renderToBuffer(
      React.createElement(RelatorioIndividualPDF, { data, empresaNome })
    );

    const filename = `vertho-relatorio-${colaboradorNome.replace(/\s+/g, '-').toLowerCase()}.pdf`;

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error('[PDF]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
