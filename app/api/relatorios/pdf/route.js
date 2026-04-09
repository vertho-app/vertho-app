import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { renderToBuffer } from '@react-pdf/renderer';
import RelatorioIndividualPDF from '@/components/pdf/RelatorioIndividual';
import RelatorioGestorPDF from '@/components/pdf/RelatorioGestor';
import RelatorioRHPDF from '@/components/pdf/RelatorioRH';
import React from 'react';
import { readFileSync } from 'fs';
import { join } from 'path';

// Logo como base64 (carregado uma vez no cold start)
let logoBase64 = null;
try {
  const logoPath = join(process.cwd(), 'public', 'logo-vertho.png');
  const logoBuffer = readFileSync(logoPath);
  logoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;
} catch {
  // Logo não encontrada — PDF renderiza sem logo
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const relatorioId = searchParams.get('id');

    if (!relatorioId) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });

    const sb = createSupabaseAdmin();

    const { data: rel } = await sb.from('relatorios')
      .select('*').eq('id', relatorioId).single();

    if (!rel) return NextResponse.json({ error: 'Relatório não encontrado' }, { status: 404 });

    const conteudo = typeof rel.conteudo === 'string' ? JSON.parse(rel.conteudo) : rel.conteudo;

    // Buscar colaborador
    let colaboradorNome = '', colaboradorCargo = '';
    if (rel.colaborador_id) {
      const { data: colab } = await sb.from('colaboradores')
        .select('nome_completo, cargo').eq('id', rel.colaborador_id).maybeSingle();
      if (colab) { colaboradorNome = colab.nome_completo; colaboradorCargo = colab.cargo; }
    }

    // Buscar empresa
    let empresaNome = '';
    if (rel.empresa_id) {
      const { data: emp } = await sb.from('empresas')
        .select('nome').eq('id', rel.empresa_id).maybeSingle();
      empresaNome = emp?.nome || '';
    }

    const data = { ...rel, conteudo, colaborador_nome: colaboradorNome, colaborador_cargo: colaboradorCargo };

    // Selecionar componente PDF pelo tipo
    let Component;
    let filename;
    let extraProps = {};

    switch (rel.tipo) {
      case 'individual':
        Component = RelatorioIndividualPDF;
        filename = `vertho-pdi-${colaboradorNome.replace(/\s+/g, '-').toLowerCase()}.pdf`;
        extraProps = { logoBase64 };
        break;
      case 'gestor':
        Component = RelatorioGestorPDF;
        filename = `vertho-gestor-${empresaNome.replace(/\s+/g, '-').toLowerCase()}.pdf`;
        extraProps = { logoBase64 };
        break;
      case 'rh':
        Component = RelatorioRHPDF;
        filename = `vertho-rh-${empresaNome.replace(/\s+/g, '-').toLowerCase()}.pdf`;
        extraProps = { logoBase64 };
        break;
      default:
        return NextResponse.json({ error: `Tipo "${rel.tipo}" não suportado para PDF` }, { status: 400 });
    }

    const buffer = await renderToBuffer(
      React.createElement(Component, { data, empresaNome, ...extraProps })
    );

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
