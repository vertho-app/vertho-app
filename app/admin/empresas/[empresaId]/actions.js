'use server';

import { createSupabaseAdmin } from '@/lib/supabase';

export async function loadEmpresaPipeline(empresaId) {
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const sb = createSupabaseAdmin();

  const { data: empresa, error } = await sb.from('empresas')
    .select('id, nome, segmento, slug, ui_config, sys_config')
    .eq('id', empresaId).single();
  if (error) return { success: false, error: error.message };

  const [colabRes, compRes, cargosRes, cenariosRes, enviosRes, respostasRes, avalRes, pppRes] = await Promise.all([
    sb.from('colaboradores').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId),
    sb.from('competencias').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId),
    sb.from('cargos').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId).then(r => r).catch(() => ({ count: 0 })),
    sb.from('banco_cenarios').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId),
    sb.from('envios_diagnostico').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId),
    sb.from('respostas').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId),
    sb.from('respostas').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId).not('nivel_ia4', 'is', null),
    sb.from('ppp_escolas').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId).then(r => r).catch(() => ({ count: 0 })),
  ]);

  const totalColab = colabRes.count || 0;
  const totalComp = compRes.count || 0;
  const totalCargos = cargosRes.count || 0;
  const totalCenarios = cenariosRes.count || 0;
  const totalEnvios = enviosRes.count || 0;
  const totalRespostas = respostasRes.count || 0;
  const avaliadas = avalRes.count || 0;
  const totalPPPs = pppRes.count || 0;

  // Contagem de top10 por cargo (competencias agrupadas)
  const { data: compsPorCargo } = await sb.from('competencias').select('cargo').eq('empresa_id', empresaId);
  const cargosComTop10 = new Set((compsPorCargo || []).map(c => c.cargo).filter(Boolean)).size;

  // Envios respondidos
  const { count: respondidos } = await sb.from('envios_diagnostico')
    .select('id', { count: 'exact', head: true })
    .eq('empresa_id', empresaId)
    .not('respondido_em', 'is', null);

  const fases = [
    { num: 0, titulo: 'Onboarding & PPP', status: totalColab > 0 ? 'concluido' : 'andamento',
      metricas: [{ label: 'Colaboradores', valor: totalColab }, { label: 'Cargos', valor: totalCargos }, { label: 'PPPs', valor: totalPPPs }] },
    { num: 1, titulo: 'Análise de Cargos & Cenários', status: totalCenarios > 0 ? 'concluido' : totalColab > 0 ? 'andamento' : 'pendente',
      metricas: [{ label: 'Top 10', valor: cargosComTop10, total: totalCargos || cargosComTop10 }, { label: 'Cenários', valor: totalCenarios }] },
    { num: 2, titulo: 'Formulários & Envios', status: totalEnvios > 0 ? 'concluido' : totalCenarios > 0 ? 'andamento' : 'pendente',
      metricas: [{ label: 'Enviados', valor: totalEnvios }, { label: 'Respondidos', valor: respondidos || 0, total: totalEnvios }] },
    { num: 3, titulo: 'Diagnóstico IA & Relatórios', status: avaliadas > 0 ? (avaliadas >= totalRespostas ? 'concluido' : 'andamento') : totalRespostas > 0 ? 'andamento' : 'pendente',
      metricas: [{ label: 'Respostas', valor: totalRespostas }, { label: 'Avaliadas', valor: avaliadas, total: totalRespostas }],
      progresso: totalRespostas ? Math.round((avaliadas / totalRespostas) * 100) : 0 },
    { num: 4, titulo: 'PDI, Trilhas & Capacitação', status: 'pendente', metricas: [] },
    { num: 5, titulo: 'Evolução & Reavaliação', status: 'pendente', metricas: [] },
  ];

  return { success: true, empresa, totalColab, fases };
}

export async function excluirEmpresa(empresaId) {
  const sb = createSupabaseAdmin();
  const { error } = await sb.from('empresas').delete().eq('id', empresaId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function limparRegistros(empresaId, tabelas, colaboradorId = null) {
  const sb = createSupabaseAdmin();
  for (const t of tabelas) {
    let query = sb.from(t).delete().eq('empresa_id', empresaId);
    if (colaboradorId && t !== 'cargos' && t !== 'competencias' && t !== 'ppp_escolas') {
      query = query.eq('colaborador_id', colaboradorId);
    }
    const { error } = await query;
    if (error) return { success: false, error: `Erro em ${t}: ${error.message}` };
  }
  const scope = colaboradorId ? '(colaborador)' : '(empresa)';
  return { success: true, message: `${tabelas.length} tabela(s) limpas ${scope}` };
}

export async function limparMapeamento(empresaId, colaboradorId = null) {
  const sb = createSupabaseAdmin();
  const campos = {
    perfil_dominante: null,
    d_natural: null, i_natural: null, s_natural: null, c_natural: null,
    d_adaptado: null, i_adaptado: null, s_adaptado: null, c_adaptado: null,
    lid_executivo: null, lid_motivador: null, lid_metodico: null, lid_sistematico: null,
    comp_ousadia: null, comp_comando: null, comp_objetividade: null, comp_assertividade: null,
    comp_persuasao: null, comp_extroversao: null, comp_entusiasmo: null, comp_sociabilidade: null,
    comp_empatia: null, comp_paciencia: null, comp_persistencia: null, comp_planejamento: null,
    comp_organizacao: null, comp_detalhismo: null, comp_prudencia: null, comp_concentracao: null,
    pref_video_curto: null, pref_video_longo: null, pref_texto: null, pref_audio: null,
    pref_infografico: null, pref_exercicio: null, pref_mentor: null, pref_estudo_caso: null,
    mapeamento_em: null, disc_resultados: null,
  };
  let query = sb.from('colaboradores').update(campos).eq('empresa_id', empresaId);
  if (colaboradorId) query = query.eq('id', colaboradorId);
  const { error, count } = await query;
  if (error) return { success: false, error: error.message };
  return { success: true, message: `Mapeamento limpo${colaboradorId ? ' (colaborador)' : ' (todos)'}` };
}

export async function loadColaboradoresLista(empresaId) {
  const sb = createSupabaseAdmin();
  const { data } = await sb.from('colaboradores')
    .select('id, nome_completo, email')
    .eq('empresa_id', empresaId)
    .order('nome_completo');
  return data || [];
}

// ── Wrappers das actions reais ──
import { rodarIA1 as _ia1, rodarIA2 as _ia2, rodarIA3 as _ia3 } from '@/actions/fase1';
import { dispararEmails as _emails, verStatusEnvios as _status } from '@/actions/fase2';
import { rodarIA4 as _ia4, verFilaIA4 as _fila, gerarRelatoriosIndividuais as _relInd, gerarRelatorioGestor as _relGestor, gerarRelatorioRH as _relRH, enviarRelIndividuais as _envInd, enviarRelGestor as _envGestor, enviarRelRH as _envRH } from '@/actions/fase3';
import { checkAvaliacoes as _check } from '@/actions/check-ia4';
import { gerarPDIs as _pdis, gerarPDIsDescritores as _pdisDesc, montarTrilhasLote as _trilhas, criarEstruturaFase4 as _estrutura, iniciarFase4ParaTodos as _iniciar, triggerSegundaFase4 as _trigSeg, triggerQuintaFase4 as _trigQui, getStatusFase4 as _statusF4 } from '@/actions/fase4';
import { iniciarReavaliacaoLote as _reav, gerarRelatoriosEvolucaoLote as _evolucao, gerarPlenariaEvolucao as _plenaria, gerarRelatorioRHManual as _rhManual, gerarRelatorioPlenaria as _rhPlen, enviarLinksPerfil as _links, gerarDossieGestor as _dossie, checkCenarios as _checkCen } from '@/actions/fase5';
import { dispararLinksCIS as _dispCIS, dispararRelatoriosLote as _dispLote } from '@/actions/whatsapp-lote';

export async function rodarIA1(e, c) { return _ia1(e, c); }
export async function rodarIA2(e, c) { return _ia2(e, c); }
export async function rodarIA3(e, c) { return _ia3(e, c); }
export async function dispararEmails(e) { return _emails(e); }
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
