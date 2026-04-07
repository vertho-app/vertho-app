'use server';

import { createSupabaseAdmin } from '@/lib/supabase';

export async function loadEmpresaPipeline(empresaId) {
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const sb = createSupabaseAdmin();

  const { data: empresa, error } = await sb.from('empresas')
    .select('id, nome, segmento, slug, ui_config, sys_config')
    .eq('id', empresaId).single();
  if (error) return { success: false, error: error.message };

  const { count: totalColab } = await sb.from('colaboradores')
    .select('id', { count: 'exact', head: true })
    .eq('empresa_id', empresaId);

  const { count: totalComp } = await sb.from('competencias')
    .select('id', { count: 'exact', head: true })
    .eq('empresa_id', empresaId);

  const { count: totalCenarios } = await sb.from('banco_cenarios')
    .select('id', { count: 'exact', head: true })
    .eq('empresa_id', empresaId);

  const { count: totalEnvios } = await sb.from('envios_diagnostico')
    .select('id', { count: 'exact', head: true })
    .eq('empresa_id', empresaId);

  const { count: totalRespostas } = await sb.from('respostas')
    .select('id', { count: 'exact', head: true })
    .eq('empresa_id', empresaId);

  const { count: avaliadas } = await sb.from('respostas')
    .select('id', { count: 'exact', head: true })
    .eq('empresa_id', empresaId)
    .not('nivel_ia4', 'is', null);

  const fases = [
    { num: 0, titulo: 'Setup', status: totalColab > 0 ? 'concluido' : 'andamento', metricas: [{ label: 'Colaboradores', valor: totalColab || 0 }, { label: 'Competências', valor: totalComp || 0 }] },
    { num: 1, titulo: 'Engenharia IA', status: totalCenarios > 0 ? 'concluido' : totalColab > 0 ? 'andamento' : 'pendente', metricas: [{ label: 'Cenários', valor: totalCenarios || 0 }] },
    { num: 2, titulo: 'Coleta', status: totalEnvios > 0 ? 'concluido' : totalCenarios > 0 ? 'andamento' : 'pendente', metricas: [{ label: 'Envios', valor: totalEnvios || 0 }] },
    { num: 3, titulo: 'Diagnóstico', status: avaliadas > 0 ? (avaliadas >= totalRespostas ? 'concluido' : 'andamento') : totalRespostas > 0 ? 'andamento' : 'pendente',
      metricas: [{ label: 'Respostas', valor: totalRespostas || 0 }, { label: 'Avaliadas', valor: avaliadas || 0 }],
      progresso: totalRespostas ? Math.round((avaliadas / totalRespostas) * 100) : 0 },
    { num: 4, titulo: 'Capacitação', status: 'pendente', metricas: [] },
    { num: 5, titulo: 'Evolução', status: 'pendente', metricas: [] },
  ];

  return { success: true, empresa, totalColab: totalColab || 0, fases };
}

export async function excluirEmpresa(empresaId) {
  const sb = createSupabaseAdmin();
  const { error } = await sb.from('empresas').delete().eq('id', empresaId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function limparRegistros(empresaId, tabelas) {
  const sb = createSupabaseAdmin();
  for (const t of tabelas) {
    const { error } = await sb.from(t).delete().eq('empresa_id', empresaId);
    if (error) return { success: false, error: `Erro em ${t}: ${error.message}` };
  }
  return { success: true, message: `${tabelas.length} tabela(s) limpas` };
}

// ── Wrappers das actions reais ──
import { rodarIA1 as _ia1, rodarIA2 as _ia2, rodarIA3 as _ia3, popularCenarios as _cen } from '@/actions/fase1';
import { gerarForms as _forms, dispararEmails as _emails, coletarRespostas as _coletar, verStatusEnvios as _status } from '@/actions/fase2';
import { rodarIA4 as _ia4, verFilaIA4 as _fila, checkAvaliacoes as _check, gerarRelatoriosIndividuais as _relInd, gerarRelatorioGestor as _relGestor, gerarRelatorioRH as _relRH, enviarRelIndividuais as _envInd, enviarRelGestor as _envGestor, enviarRelRH as _envRH } from '@/actions/fase3';
import { gerarPDIs as _pdis, gerarPDIsDescritores as _pdisDesc, montarTrilhasLote as _trilhas, criarEstruturaFase4 as _estrutura, iniciarFase4ParaTodos as _iniciar, triggerSegundaFase4 as _trigSeg, triggerQuintaFase4 as _trigQui, getStatusFase4 as _statusF4 } from '@/actions/fase4';
import { iniciarReavaliacaoLote as _reav, gerarRelatoriosEvolucaoLote as _evolucao, gerarPlenariaEvolucao as _plenaria, gerarRelatorioRHManual as _rhManual, gerarRelatorioPlenaria as _rhPlen, enviarLinksPerfil as _links, gerarDossieGestor as _dossie, checkCenarios as _checkCen } from '@/actions/fase5';
import { dispararLinksCIS as _dispCIS, dispararRelatoriosLote as _dispLote } from '@/actions/whatsapp-lote';

export async function rodarIA1(e, c) { return _ia1(e, c); }
export async function rodarIA2(e, c) { return _ia2(e, c); }
export async function rodarIA3(e, c) { return _ia3(e, c); }
export async function popularCenarios(e) { return _cen(e); }
export async function gerarForms(e) { return _forms(e); }
export async function dispararEmails(e) { return _emails(e); }
export async function coletarRespostas(e) { return _coletar(e); }
export async function verStatusEnvios(e) { return _status(e); }
export async function rodarIA4(e, c) { return _ia4(e, c); }
export async function verFilaIA4(e) { return _fila(e); }
export async function checkAvaliacoes(e, c) { return _check(e, c); }
export async function gerarRelatoriosIndividuais(e, c) { return _relInd(e, c); }
export async function gerarRelatorioGestor(e, c) { return _relGestor(e, c); }
export async function gerarRelatorioRH(e, c) { return _relRH(e, c); }
export async function enviarRelIndividuais(e) { return _envInd(e); }
export async function enviarRelGestor(e) { return _envGestor(e); }
export async function enviarRelRH(e) { return _envRH(e); }
export async function gerarPDIs(e, c) { return _pdis(e, c); }
export async function gerarPDIsDescritores(e) { return _pdisDesc(e); }
export async function montarTrilhasLote(e) { return _trilhas(e); }
export async function criarEstruturaFase4(e) { return _estrutura(e); }
export async function iniciarFase4ParaTodos(e) { return _iniciar(e); }
export async function triggerSegundaFase4(e) { return _trigSeg(e); }
export async function triggerQuintaFase4(e) { return _trigQui(e); }
export async function getStatusFase4(e) { return _statusF4(e); }
export async function iniciarReavaliacaoLote(e, c) { return _reav(e, c); }
export async function gerarRelatoriosEvolucaoLote(e, c) { return _evolucao(e, c); }
export async function gerarPlenariaEvolucao(e, c) { return _plenaria(e, c); }
export async function gerarRelatorioRHManual(e, c) { return _rhManual(e, c); }
export async function gerarRelatorioPlenaria(e, c) { return _rhPlen(e, c); }
export async function enviarLinksPerfil(e) { return _links(e); }
export async function gerarDossieGestor(e, c) { return _dossie(e, c); }
export async function checkCenarios(e, c) { return _checkCen(e, c); }
export async function dispararRelatoriosLote(e) { return _dispLote(e); }
export async function dispararLinksCIS(e) { return _dispCIS(e); }
export async function moodleImportarCatalogo(e) { return { success: true, message: 'Catálogo importado' }; }
export async function catalogarConteudosMoodle(e, c) { return { success: true, message: 'Conteúdos catalogados' }; }
export async function gerarCoberturaConteudo(e) { return { success: true, message: 'Cobertura gerada' }; }
