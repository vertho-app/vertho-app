'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { findColabByEmail } from '@/lib/authz';
import { resolverMarcaPdf, nomeArquivoMarca } from '@/lib/pdf-marca';
import { storageSlug } from '@/lib/storage-slug';
import { totalDoMapeamento } from '@/lib/demo/convidado-demo';
import { colaboradorEmDegustacao } from '@/lib/demo/degustacao-mapeamento';
import { pdiRetidoPelaAuditoria } from '@/lib/relatorios/pdi-retido';
import { caminhoDoPdf, idiomaDaPessoa, idiomaDoCaminhoPdf } from '@/lib/pdf-locale';

/**
 * Carrega o PDI ativo do colaborador.
 * O campo `conteudo` é JSONB com objetivos por competência.
 */
export async function loadPDI() {
  const { getAuthenticatedEmailFromAction } = await import('@/lib/auth/action-context');
  const email = await getAuthenticatedEmailFromAction();
  if (!email) return { error: 'Não autenticado', codigo: 'nao_autenticado' };

  const colab = await findColabByEmail(email, 'id, nome_completo, email, cargo, area_depto, empresa_id');
  if (!colab) return { error: 'Colaborador nao encontrado', codigo: 'colaborador_nao_encontrado' };

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
    // O convidado da degustação responde uma competência só, e o PDI não existe
    // para ele: a tela diz isso em vez de "PDI em preparação".
    const degustacaoP = colaboradorEmDegustacao(sb, colab);
    const { data: cargoEmp } = await sb.from('cargos_empresa')
      .select('top5_workshop').eq('empresa_id', colab.empresa_id).eq('nome', colab.cargo).maybeSingle();
    const degustacao = await degustacaoP;
    const totalTop5 = totalDoMapeamento(cargoEmp?.top5_workshop, degustacao);
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
      degustacao,
    };
  }

  const conteudo = typeof rel.conteudo === 'string' ? JSON.parse(rel.conteudo) : rel.conteudo;

  // Reprovado pela 2ª IA: retido até ser regerado (R-60). A pessoa vê "em
  // preparação", que é o estado verdadeiro dela: o plano vai ser refeito.
  if (pdiRetidoPelaAuditoria(conteudo, rel.gerado_em)) {
    return { colaborador: colab, pdiAtivo: false, concluiuAvaliacao: true, respondidas: 0, totalAvaliacao: 0, degustacao: false };
  }

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
 * Se o PDF ainda não existe no bucket, ou existe em outro idioma que não o da
 * pessoa, gera on-the-fly e sobe primeiro. Client usa a URL direto pra baixar
 * (sem passar payload pelo server action).
 *
 * Erro: `error` é o texto em pt-BR de sempre (log e quem ainda o lê) e `codigo` é o
 * código estável que a tela traduz (`Pdf.download.errors.*`), como o login faz.
 */
export async function baixarMeuPdiPdf() {
  try {
    const { getAuthenticatedEmailFromAction } = await import('@/lib/auth/action-context');
    const email = await getAuthenticatedEmailFromAction();
    if (!email) return { error: 'Não autenticado', codigo: 'nao_autenticado' };
    const colab = await findColabByEmail(email, 'id, nome_completo, cargo, empresa_id');
    if (!colab) return { error: 'Colaborador não encontrado', codigo: 'colaborador_nao_encontrado' };

    const sb = createSupabaseAdmin();

    const { data: rel } = await sb.from('relatorios')
      .select('id, conteudo, pdf_path, gerado_em, colaborador_id, empresa_id')
      .eq('colaborador_id', colab.id)
      .eq('empresa_id', colab.empresa_id)
      .eq('tipo', 'individual')
      .order('gerado_em', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!rel) return { error: 'PDI não encontrado', codigo: 'pdi_nao_encontrado' };
    // O PDF segue a tela: reprovado pela 2ª IA não sai (R-60).
    if (pdiRetidoPelaAuditoria(rel.conteudo, rel.gerado_em)) return { error: 'PDI não encontrado', codigo: 'pdi_nao_encontrado' };

    const slug = storageSlug(colab.nome_completo, 'pdi');
    // Resolvido antes do `if (!path)` porque o nome do arquivo também é marca —
    // e ele vale inclusive quando o PDF já existe no Storage.
    const marca = await resolverMarcaPdf(colab.empresa_id);
    const filename = `${nomeArquivoMarca('vertho-pdi', marca)}-${slug}.pdf`;

    // O PDF sai no idioma da PESSOA (colaboradores.locale, senão o da empresa, senão pt-BR). O arquivo
    // guardado diz o idioma em que nasceu no nome; em outro idioma, ele é gerado de novo e passa a ser o dela.
    const locale = await idiomaDaPessoa(colab.empresa_id, colab.id);

    // Se ainda não tem PDF salvo (ou ele está em outro idioma), gera e sobe antes de criar a signed URL
    let path = rel.pdf_path;
    if (!path || idiomaDoCaminhoPdf(path) !== locale) {
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
          data, empresaNome: emp?.nome || '',
          logoBase64: marca.logoBase64 || undefined,
          mostrarVertho: marca.mostrarVertho,
          locale,
        }) as any
      );
      path = caminhoDoPdf(rel.empresa_id, 'individual', slug, locale);
      const { error: upErr } = await sb.storage.from('relatorios-pdf').upload(path, buffer, {
        contentType: 'application/pdf',
        upsert: true,
      });
      if (upErr) {
        console.error('[baixarMeuPdiPdf] upload:', upErr.message);
        return { error: `Falha ao salvar PDF: ${upErr.message}`, codigo: 'falha_salvar' };
      }
      await sb.from('relatorios').update({ pdf_path: path }).eq('id', rel.id);
    }

    // Gera signed URL válida por 5 minutos, forçando download com o nome bonito
    const { data: signed, error: signErr } = await sb.storage
      .from('relatorios-pdf')
      .createSignedUrl(path, 300, { download: filename });
    if (signErr) {
      console.error('[baixarMeuPdiPdf] link:', signErr.message);
      return { error: `Erro ao gerar link: ${signErr.message}`, codigo: 'falha_link' };
    }

    return { success: true, url: signed.signedUrl, filename };
  } catch (err) {
    console.error('[baixarMeuPdiPdf]', err);
    return { error: err?.message || 'Erro ao gerar PDF', codigo: 'falha_gerar' };
  }
}
