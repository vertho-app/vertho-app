'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { findColabByEmail } from '@/lib/authz';
import { resolverMarcaPdf, nomeArquivoMarca } from '@/lib/pdf-marca';
import { storageSlug } from '@/lib/storage-slug';
import { totalDoMapeamento } from '@/lib/demo/convidado-demo';
import { colaboradorEmDegustacao } from '@/lib/demo/degustacao-mapeamento';
import { pdiRetidoPelaAuditoria } from '@/lib/relatorios/pdi-retido';
import { pausaDaEmpresa } from '@/lib/envios-pausados';
import { caminhoDoPdf, idiomaDaPessoa, idiomaDoCaminhoPdf } from '@/lib/pdf-locale';
import { carregarPdisDaJornada, REF_HISTORICO, REF_VIVO, type VersaoPdi } from '@/lib/relatorios/pdis-da-jornada';

/**
 * O começo de toda action desta tela: a sessão, o cadastro da PRÓPRIA pessoa e o client do servidor, num ponto só.
 * Toda leitura daqui em diante é desta pessoa (colaborador_id e empresa_id dela), nunca de alguém que o cliente indique.
 */
async function pessoaDaSessao(): Promise<{ colab: any; sb: any } | { error: string; codigo: string }> {
  const { getAuthenticatedEmailFromAction } = await import('@/lib/auth/action-context');
  const email = await getAuthenticatedEmailFromAction();
  if (!email) return { error: 'Não autenticado', codigo: 'nao_autenticado' };
  const colab = await findColabByEmail(email, 'id, nome_completo, email, cargo, area_depto, empresa_id');
  if (!colab) return { error: 'Colaborador não encontrado', codigo: 'colaborador_nao_encontrado' };
  return { colab, sb: createSupabaseAdmin() };
}

/**
 * Carrega o PDI ativo do colaborador.
 * O campo `conteudo` é JSONB com objetivos por competência.
 *
 * O PDI ATIVO é o da jornada ATUAL da pessoa (18/10/2026): na 2ª jornada de Ibipeba, antes do PDI novo, o da
 * Temporada 1 aparecia como o plano de agora. Os de jornadas anteriores vêm em `anteriores` (um por jornada), em
 * todos os estados da tela, inclusive com a empresa pausada: são histórico, que a pessoa continua lendo.
 */
export async function loadPDI() {
  const sessao = await pessoaDaSessao();
  if ('error' in sessao) return { error: sessao.error, codigo: sessao.codigo };
  const { colab, sb } = sessao;

  // O PDI individual é gerado pelo admin (gerarRelatorioIndividual) e salvo
  // na tabela 'relatorios' com tipo='individual'.
  let pdis;
  try {
    pdis = await carregarPdisDaJornada(sb, colab.empresa_id, colab.id);
  } catch (e: any) {
    console.error('[loadPDI]', e?.message || e);
    return { error: 'Não foi possível carregar o PDI', codigo: 'falha_gerar' };
  }
  const anteriores = pdis.anteriores;
  const rel = pdis.atual;

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
    // Só as respostas da jornada atual contam: as da anterior não completam o mapeamento novo.
    let q = sb.from('respostas')
      .select('id', { count: 'exact', head: true })
      .eq('colaborador_id', colab.id)
      .eq('empresa_id', colab.empresa_id);
    if (pdis.janelaAtual.de !== null) q = q.gte('created_at', new Date(pdis.janelaAtual.de).toISOString());
    if (pdis.janelaAtual.ate !== null) q = q.lt('created_at', new Date(pdis.janelaAtual.ate).toISOString());
    const { count: respondidas, error: errResp } = await q;
    if (errResp) {
      console.error('[loadPDI] respostas:', errResp.message);
      return { error: 'Não foi possível carregar o PDI', codigo: 'falha_gerar' };
    }
    const concluiuAvaliacao = totalTop5 > 0 && (respondidas || 0) >= totalTop5;
    return {
      colaborador: colab,
      pdiAtivo: false,
      concluiuAvaliacao,
      respondidas: respondidas || 0,
      totalAvaliacao: totalTop5,
      degustacao,
      anteriores,
    };
  }

  const conteudo = typeof rel.conteudo === 'string' ? JSON.parse(rel.conteudo) : rel.conteudo;

  // Reprovado pela 2ª IA: retido até ser regerado (R-60). A pessoa vê "em
  // preparação", que é o estado verdadeiro dela: o plano vai ser refeito.
  // Empresa com os envios pausados (decisão do dono, 16/10/2026, "esconder até liberar"): o mesmo "em preparação".
  if (pdiRetidoPelaAuditoria(conteudo, rel.gerado_em) || await pausaDaEmpresa(sb, colab.empresa_id)) {
    return { colaborador: colab, pdiAtivo: false, concluiuAvaliacao: true, respondidas: 0, totalAvaliacao: 0, degustacao: false, anteriores };
  }

  return {
    colaborador: colab,
    pdiAtivo: true,
    conteudo,
    pdiId: rel.ref.slice(REF_VIVO.length),
    criadoEm: rel.gerado_em,
    pdfPath: rel.pdf_path || null,
    anteriores,
  };
}

/**
 * Abre um PDI ANTERIOR da pessoa autenticada (18/10/2026). A `ref` vem do cliente, então só vale se estiver na lista
 * de anteriores DELA, calculada aqui de novo: nunca serve um PDI de outra pessoa nem um rascunho da mesma jornada.
 */
export async function loadPdiAnterior(ref: string) {
  const sessao = await pessoaDaSessao();
  if ('error' in sessao) return { error: sessao.error, codigo: sessao.codigo };
  const { colab, sb } = sessao;

  let anterior;
  try {
    anterior = await pdiAnteriorDaPessoa(sb, colab, ref);
  } catch (e: any) {
    console.error('[loadPdiAnterior]', e?.message || e);
    return { error: 'Não foi possível carregar o PDI', codigo: 'falha_gerar' };
  }
  if ('error' in anterior) return anterior;
  const conteudo = typeof anterior.versao.conteudo === 'string' ? JSON.parse(anterior.versao.conteudo) : anterior.versao.conteudo;
  return {
    colaborador: { nome_completo: colab.nome_completo, cargo: colab.cargo },
    conteudo,
    criadoEm: anterior.versao.gerado_em,
    turma: anterior.turma,
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
    const sessao = await pessoaDaSessao();
    if ('error' in sessao) return { error: sessao.error, codigo: sessao.codigo };
    const { colab, sb } = sessao;
    // O PDF segue a tela: só o PDI da jornada atual, e reprovado pela 2ª IA não sai (R-60).
    const { atual: rel } = await carregarPdisDaJornada(sb, colab.empresa_id, colab.id);
    if (!rel) return { error: 'PDI não encontrado', codigo: 'pdi_nao_encontrado' };
    if (pdiRetidoPelaAuditoria(rel.conteudo, rel.gerado_em) || await pausaDaEmpresa(sb, colab.empresa_id)) return { error: 'PDI não encontrado', codigo: 'pdi_nao_encontrado' };

    return await linkDoPdfDoPdi(sb, colab, rel, '');
  } catch (err) {
    console.error('[baixarMeuPdiPdf]', err);
    return { error: err?.message || 'Erro ao gerar PDF', codigo: 'falha_gerar' };
  }
}

/** O PDF de um PDI ANTERIOR da pessoa autenticada (mesma validação de `loadPdiAnterior`). */
export async function baixarPdiAnteriorPdf(ref: string) {
  try {
    const sessao = await pessoaDaSessao();
    if ('error' in sessao) return { error: sessao.error, codigo: sessao.codigo };
    const { colab, sb } = sessao;

    const anterior = await pdiAnteriorDaPessoa(sb, colab, ref);
    if ('error' in anterior) return anterior;
    // O nome do arquivo leva a data: dois PDIs da mesma pessoa não saem com o mesmo nome.
    return await linkDoPdfDoPdi(sb, colab, anterior.versao, `-${String(anterior.versao.gerado_em).slice(0, 10)}`);
  } catch (err) {
    console.error('[baixarPdiAnteriorPdf]', err);
    return { error: err?.message || 'Erro ao gerar PDF', codigo: 'falha_gerar' };
  }
}

/** A versão anterior que a `ref` aponta, só se ela estiver na lista de anteriores da pessoa. */
async function pdiAnteriorDaPessoa(sb: any, colab: any, ref: string): Promise<{ versao: VersaoPdi; turma: string | null } | { error: string; codigo: string }> {
  if (typeof ref !== 'string' || !ref) return { error: 'PDI não encontrado', codigo: 'pdi_nao_encontrado' };
  const pdis = await carregarPdisDaJornada(sb, colab.empresa_id, colab.id);
  const item = pdis.anteriores.find((a) => a.ref === ref);
  const versao = item ? pdis.versoes.find((v) => v.ref === ref) : null;
  if (!item || !versao) return { error: 'PDI não encontrado', codigo: 'pdi_nao_encontrado' };
  return { versao, turma: item.turma };
}

/**
 * Signed URL do PDF de uma versão do PDI. Sem PDF guardado (ou guardado em outro idioma), gera, sobe num caminho novo
 * (o caminho tem carimbo de tempo) e grava o caminho na linha de origem: a viva (`relatorios`) ou a do histórico.
 */
async function linkDoPdfDoPdi(sb: any, colab: any, versao: VersaoPdi, sufixoArquivo: string) {
  const slug = storageSlug(colab.nome_completo, 'pdi');
  // Resolvido antes do `if (!path)` porque o nome do arquivo também é marca —
  // e ele vale inclusive quando o PDF já existe no Storage.
  const marca = await resolverMarcaPdf(colab.empresa_id);
  const filename = `${nomeArquivoMarca('vertho-pdi', marca)}-${slug}${sufixoArquivo}.pdf`;

  // O PDF sai no idioma da PESSOA (colaboradores.locale, senão o da empresa, senão pt-BR). O arquivo
  // guardado diz o idioma em que nasceu no nome; em outro idioma, ele é gerado de novo e passa a ser o dela.
  const locale = await idiomaDaPessoa(colab.empresa_id, colab.id);

  // Se ainda não tem PDF salvo (ou ele está em outro idioma), gera e sobe antes de criar a signed URL
  let path = versao.pdf_path || null;
  if (!path || idiomaDoCaminhoPdf(path) !== locale) {
    const { renderToBuffer } = await import('@react-pdf/renderer');
    const React = (await import('react')).default;
    const { default: RelatorioIndividualPDF } = await import('@/components/pdf/RelatorioIndividual');

    const { data: emp } = await sb.from('empresas').select('nome').eq('id', colab.empresa_id).maybeSingle();
    const conteudo = typeof versao.conteudo === 'string' ? JSON.parse(versao.conteudo) : versao.conteudo;
    const data = {
      conteudo,
      gerado_em: versao.gerado_em,
      colaborador_id: colab.id,
      empresa_id: colab.empresa_id,
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
    path = caminhoDoPdf(colab.empresa_id, 'individual', slug, locale);
    const { error: upErr } = await sb.storage.from('relatorios-pdf').upload(path, buffer, {
      contentType: 'application/pdf',
      upsert: true,
    });
    if (upErr) {
      console.error('[pdf do PDI] upload:', upErr.message);
      return { error: `Falha ao salvar PDF: ${upErr.message}`, codigo: 'falha_salvar' };
    }
    const historico = versao.ref.startsWith(REF_HISTORICO);
    const { error: errPath } = await sb.from(historico ? 'artefatos_jornada_historico' : 'relatorios')
      .update({ pdf_path: path })
      .eq('id', versao.ref.slice(historico ? REF_HISTORICO.length : REF_VIVO.length))
      .eq('empresa_id', colab.empresa_id);
    // O PDF já subiu e o link sai mesmo assim; sem o caminho gravado, o próximo download só gera de novo.
    if (errPath) console.error('[pdf do PDI] caminho não gravado:', errPath.message);
  }

  // Gera signed URL válida por 5 minutos, forçando download com o nome bonito
  const { data: signed, error: signErr } = await sb.storage
    .from('relatorios-pdf')
    .createSignedUrl(path, 300, { download: filename });
  if (signErr) {
    console.error('[pdf do PDI] link:', signErr.message);
    return { error: `Erro ao gerar link: ${signErr.message}`, codigo: 'falha_link' };
  }

  return { success: true, url: signed.signedUrl, filename };
}
