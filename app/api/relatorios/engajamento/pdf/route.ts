import { NextResponse } from 'next/server';
import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { requireAdmin } from '@/lib/auth/request-context';
import { tenantDb } from '@/lib/tenant-db';
import { rollUpEngajamento } from '@/lib/engajamento/roll-up';
import { carregarEvolucaoEngajamento } from '@/lib/engajamento/evolucao';
import { buildViews } from '@/lib/engajamento/relatorio-model';
import { resolverMarcaPdf, nomeArquivoMarca } from '@/lib/pdf-marca';
import RelatorioEngajamentoPDF from '@/components/pdf/RelatorioEngajamento';

export const runtime = 'nodejs';
export const maxDuration = 300;

/** Mesmo acesso da página admin: escolher RH/Gestor muda a leitura, não a autorização. */
export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (auth instanceof Response) return auth;
  const { searchParams, origin } = new URL(request.url);
  const empresaId = searchParams.get('empresa');
  const publico = searchParams.get('publico') || 'gestor';
  if (!empresaId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(empresaId)) {
    return NextResponse.json({ error: 'Selecione uma empresa válida.' }, { status: 400 });
  }
  if (publico !== 'gestor' && publico !== 'rh') {
    return NextResponse.json({ error: 'Público do relatório inválido.' }, { status: 400 });
  }
  try {
    const tdb = tenantDb(empresaId);
    const empresa = await tdb.raw.from('empresas').select('nome, slug').eq('id', empresaId).maybeSingle();
    if (empresa.error) throw new Error(empresa.error.message);
    if (!empresa.data) return NextResponse.json({ error: 'Empresa não encontrada.' }, { status: 404 });

    const [rollup, evolution, marca] = await Promise.all([
      rollUpEngajamento(empresaId), carregarEvolucaoEngajamento(empresaId), resolverMarcaPdf(empresaId),
    ]);
    // Consulta com erro não pode virar um PDF com indicadores zerados.
    if (!evolution.ok) throw new Error('error' in evolution ? evolution.error : 'Evolução indisponível.');
    if (rollup.resumo && 'erro' in rollup.resumo && rollup.resumo.erro) throw new Error(String(rollup.resumo.erro));
    const views = buildViews({ empresaNome: empresa.data.nome, rollup, evolucao: evolution.data });
    if (!views) return NextResponse.json({ error: 'Sem dados para gerar o relatório.' }, { status: 422 });
    const semana = evolution.data.semanas.at(-1)?.semana || evolution.data.semanaAtual || 0;
    const buffer = await renderToBuffer(React.createElement(RelatorioEngajamentoPDF, {
      data: views[publico], empresaNome: empresa.data.nome, semana, inscritos: evolution.data.inscritos,
      geradoEm: new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
      logoBase64: marca.logoBase64, mostrarVertho: marca.mostrarVertho,
      detailUrl: `${origin}/admin/engajamento?empresa=${encodeURIComponent(empresaId)}&view=evolucao`,
    }) as any);
    const slug = String(empresa.data.slug || empresaId).replace(/[^a-z0-9-]/gi, '-');
    const filename = `${nomeArquivoMarca('vertho-engajamento', marca)}-${slug}-${publico}.pdf`;
    const disposition = searchParams.get('view') === 'inline' ? 'inline' : 'attachment';
    return new NextResponse(new Uint8Array(buffer), { headers: {
      'Content-Type': 'application/pdf', 'Content-Disposition': `${disposition}; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    } });
  } catch (error) {
    console.error('[pdf-engajamento]', error);
    return NextResponse.json({ error: 'Não foi possível gerar o relatório. Tente novamente.' }, { status: 500 });
  }
}
