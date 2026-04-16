'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { findColabByEmail } from '@/lib/authz';
import { getLogoCoverBase64 } from '@/lib/pdf-assets';

/**
 * Carrega o PDI ativo do colaborador.
 * O campo `conteudo` é JSONB com objetivos por competência.
 */
export async function loadPDI(email) {
  if (!email) return { error: 'Nao autenticado' };

  const colab = await findColabByEmail(email, 'id, nome_completo, email, cargo, area_depto, empresa_id');
  if (!colab) return { error: 'Colaborador nao encontrado' };

  const sb = createSupabaseAdmin();

  // O PDI individual é gerado pelo admin (gerarRelatorioIndividual) e salvo
  // na tabela 'relatorios' com tipo='individual'.
  const { data: rel } = await sb.from('relatorios')
    .select('id, conteudo, gerado_em, pdf_path')
    .eq('colaborador_id', colab.id)
    .eq('empresa_id', colab.empresa_id)
    .eq('tipo', 'individual')
    .order('gerado_em', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!rel) {
    // Verificar se o colab já completou TODAS as competências do top5 do cargo
    // (não só "tem pelo menos uma resposta" — diferencia "em progresso" de "tudo concluído, aguardando admin gerar PDI")
    const { data: cargoEmp } = await sb.from('cargos_empresa')
      .select('top5_workshop').eq('empresa_id', colab.empresa_id).eq('nome', colab.cargo).maybeSingle();
    const totalTop5 = (cargoEmp?.top5_workshop || []).length;
    const { count: respondidas } = await sb.from('respostas')
      .select('id', { count: 'exact', head: true })
      .eq('colaborador_id', colab.id)
      .eq('empresa_id', colab.empresa_id);
    const concluiuAvaliacao = totalTop5 > 0 && (respondidas || 0) >= totalTop5;
    return {
      colaborador: colab,
      pdiAtivo: false,
      concluiuAvaliacao,
      respondidas: respondidas || 0,
      totalAvaliacao: totalTop5,
    };
  }

  const conteudo = typeof rel.conteudo === 'string' ? JSON.parse(rel.conteudo) : rel.conteudo;

  return {
    colaborador: colab,
    pdiAtivo: true,
    conteudo,
    pdiId: rel.id,
    criadoEm: rel.gerado_em,
    pdfPath: rel.pdf_path || null,
  };
}

/**
 * Retorna uma signed URL do Supabase Storage para o PDI do colab autenticado.
 * Se o PDF ainda não existe no bucket, gera on-the-fly e sobe primeiro.
 * Client usa a URL direto pra baixar (sem passar payload pelo server action).
 */
export async function baixarMeuPdiPdf(email) {
  try {
    if (!email) return { error: 'Não autenticado' };
    const colab = await findColabByEmail(email, 'id, nome_completo, cargo, empresa_id');
    if (!colab) return { error: 'Colaborador não encontrado' };

    const sb = createSupabaseAdmin();

    const { data: rel } = await sb.from('relatorios')
      .select('id, conteudo, pdf_path, gerado_em, colaborador_id, empresa_id')
      .eq('colaborador_id', colab.id)
      .eq('empresa_id', colab.empresa_id)
      .eq('tipo', 'individual')
      .order('gerado_em', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!rel) return { error: 'PDI não encontrado' };

    const slug = (colab.nome_completo || 'pdi').replace(/\s+/g, '-').toLowerCase();
    const filename = `vertho-pdi-${slug}.pdf`;

    // Se ainda não tem PDF salvo, gera e sobe antes de criar a signed URL
    let path = rel.pdf_path;
    if (!path) {
      const { renderToBuffer } = await import('@react-pdf/renderer');
      const React = (await import('react')).default;
      const { default: RelatorioIndividualPDF } = await import('@/components/pdf/RelatorioIndividual');

      const { data: emp } = await sb.from('empresas').select('nome').eq('id', colab.empresa_id).maybeSingle();
      const conteudo = typeof rel.conteudo === 'string' ? JSON.parse(rel.conteudo) : rel.conteudo;
      const data = {
        ...rel,
        conteudo,
        colaborador_nome: colab.nome_completo,
        colaborador_cargo: colab.cargo,
      };
      const buffer = await renderToBuffer(
        React.createElement(RelatorioIndividualPDF, {
          data, empresaNome: emp?.nome || '', logoBase64: getLogoCoverBase64(),
        }) as any
      );
      path = `${rel.empresa_id}/individual-${slug}-${Date.now()}.pdf`;
      const { error: upErr } = await sb.storage.from('relatorios-pdf').upload(path, buffer, {
        contentType: 'application/pdf',
        upsert: true,
      });
      if (upErr) return { error: `Falha ao salvar PDF: ${upErr.message}` };
      await sb.from('relatorios').update({ pdf_path: path }).eq('id', rel.id);
    }

    // Gera signed URL válida por 5 minutos, forçando download com o nome bonito
    const { data: signed, error: signErr } = await sb.storage
      .from('relatorios-pdf')
      .createSignedUrl(path, 300, { download: filename });
    if (signErr) return { error: `Erro ao gerar link: ${signErr.message}` };

    return { success: true, url: signed.signedUrl, filename };
  } catch (err) {
    console.error('[baixarMeuPdiPdf]', err);
    return { error: err?.message || 'Erro ao gerar PDF' };
  }
}
