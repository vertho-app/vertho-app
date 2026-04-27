'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { requireAdminAction } from '@/lib/auth/action-context';
import { removeVercelDomain } from '@/lib/vercel-domain';

export async function loadEmpresaPipeline(empresaId) {
  await requireAdminAction();
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const sb = createSupabaseAdmin();

  const { data: empresa, error } = await sb.from('empresas')
    .select('id, nome, segmento, slug, ui_config, sys_config')
    .eq('id', empresaId).single();
  if (error) return { success: false, error: error.message };

  const [colabRes, compRes, cargosRes, cenariosRes, enviosRes, respostasRes, avalRes, pppRes] = await Promise.all([
    sb.from('colaboradores').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId),
    sb.from('competencias').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId),
    (sb.from('cargos').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId) as any).then((r: any) => r).catch(() => ({ count: 0 })),
    sb.from('banco_cenarios').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId),
    sb.from('envios_diagnostico').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId),
    sb.from('respostas').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId),
    sb.from('respostas').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId).not('nivel_ia4', 'is', null),
    (sb.from('ppp_escolas').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId) as any).then((r: any) => r).catch(() => ({ count: 0 })),
  ]);

  const totalColab = colabRes.count || 0;
  const totalComp = compRes.count || 0;
  const totalCargos = cargosRes.count || 0;
  const totalCenarios = cenariosRes.count || 0;
  const totalEnvios = enviosRes.count || 0;
  const totalRespostas = respostasRes.count || 0;
  const avaliadas = avalRes.count || 0;
  const totalPPPs = pppRes.count || 0;

  // Contagem de top10 por cargo
  const { count: totalTop10 } = await sb.from('top10_cargos')
    .select('id', { count: 'exact', head: true })
    .eq('empresa_id', empresaId);
  const cargosComTop10 = totalTop10 ? Math.ceil((totalTop10 || 0) / 10) : 0;

  // Top 5 definidos
  const { data: cargosComTop5Data } = await sb.from('cargos_empresa')
    .select('top5_workshop')
    .eq('empresa_id', empresaId);
  const cargosComTop5 = (cargosComTop5Data || []).filter(c => Array.isArray(c.top5_workshop) && c.top5_workshop.length > 0).length;

  // Gabaritos (IA2)
  const { count: totalGabaritos } = await sb.from('cargos_empresa')
    .select('id', { count: 'exact', head: true })
    .eq('empresa_id', empresaId)
    .not('gabarito', 'is', null);

  // Cenários aprovados
  const { count: cenariosAprovados } = await sb.from('banco_cenarios')
    .select('id', { count: 'exact', head: true })
    .eq('empresa_id', empresaId)
    .eq('status_check', 'aprovado');

  // Envios respondidos
  const { count: respondidos } = await sb.from('envios_diagnostico')
    .select('id', { count: 'exact', head: true })
    .eq('empresa_id', empresaId)
    .not('respondido_em', 'is', null);

  // Fase 1 status: precisa Top10 + Top5 + cenários para ser concluída
  const fase1Status = (totalCenarios > 0 && cargosComTop5 > 0 && (totalTop10 || 0) > 0)
    ? 'concluido'
    : ((totalTop10 || 0) > 0 || totalCenarios > 0) ? 'andamento' : (totalColab > 0 ? 'andamento' : 'pendente');

  const fases = [
    { num: 0, titulo: 'Onboarding & PPP', status: totalColab > 0 ? 'concluido' : 'andamento',
      metricas: [{ label: 'Colaboradores', valor: totalColab }, { label: 'Cargos', valor: totalCargos }, { label: 'PPPs', valor: totalPPPs }] },
    { num: 1, titulo: 'Análise de Cargos & Cenários', status: fase1Status,
      metricas: [{ label: 'Top 10', valor: cargosComTop10, total: totalCargos || cargosComTop10 }, { label: 'Top 5', valor: cargosComTop5, total: totalCargos || cargosComTop5 }, { label: 'Cenários', valor: totalCenarios }, { label: 'Aprovados', valor: cenariosAprovados || 0 }] },
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
  await requireAdminAction();
  const sb = createSupabaseAdmin();

  const { data: empresa } = await sb.from('empresas')
    .select('slug')
    .eq('id', empresaId)
    .single();

  const { error } = await sb.from('empresas').delete().eq('id', empresaId);
  if (error) return { success: false, error: error.message };

  if (empresa?.slug) removeVercelDomain(empresa.slug).catch(() => {});

  return { success: true };
}

export async function limparRegistros(empresaId, tabelas, colaboradorId = null, fields = null, opts: any = {}) {
  await requireAdminAction();
  const sb = createSupabaseAdmin();
  const { hardDelete = false } = opts;
  let pdfsRemovidos = 0;
  let movidosLixeira = 0;
  const operacao = fields ? 'UPDATE (nullify)' : (hardDelete ? 'DELETE permanente' : 'soft DELETE (lixeira)');

  for (const t of tabelas) {
    // UPDATE nullify: zera campos sem deletar linhas (ex: zerar IA4 mantendo respostas)
    if (fields) {
      let q = sb.from(t).update(fields).eq('empresa_id', empresaId);
      if (colaboradorId && t !== 'cargos' && t !== 'competencias' && t !== 'ppp_escolas') {
        q = q.eq('colaborador_id', colaboradorId);
      }
      const { error } = await q;
      if (error) return { success: false, error: `Erro em ${t} (${operacao}): ${error.message}` };
      continue;
    }

    // Antes de DELETE em 'relatorios' (hard), limpa PDFs órfãos
    if (hardDelete && t === 'relatorios') {
      let selectQ = sb.from('relatorios').select('pdf_path').eq('empresa_id', empresaId).not('pdf_path', 'is', null);
      if (colaboradorId) selectQ = selectQ.eq('colaborador_id', colaboradorId);
      const { data: rows } = await selectQ;
      const paths = (rows || []).map(r => r.pdf_path).filter(Boolean);
      if (paths.length) {
        try { await sb.storage.from('relatorios-pdf').remove(paths); pdfsRemovidos = paths.length; }
        catch (e) { console.error('[limparRegistros storage]', e.message); }
      }
    }

    // SOFT DELETE: copia rows pra trash, depois deleta da origem
    if (!hardDelete) {
      let selQ = sb.from(t).select('*').eq('empresa_id', empresaId);
      if (colaboradorId && t !== 'cargos' && t !== 'competencias' && t !== 'ppp_escolas') {
        selQ = selQ.eq('colaborador_id', colaboradorId);
      }
      const { data: rows } = await selQ;
      if (rows && rows.length > 0) {
        const trashRows = rows.map(r => ({
          empresa_id: empresaId,
          tabela_origem: t,
          registro_id: r.id || null,
          payload: r,
          contexto: `Limpar ${t}${colaboradorId ? ' (colab)' : ' (empresa)'}`,
        }));
        const { error: trashErr } = await sb.from('trash').insert(trashRows);
        if (trashErr) return { success: false, error: `Erro ao copiar pra lixeira (${t}): ${trashErr.message}` };
        movidosLixeira += rows.length;
      }
    }

    // DELETE da origem (após backup pra lixeira, se soft)
    let q = sb.from(t).delete().eq('empresa_id', empresaId);
    if (colaboradorId && t !== 'cargos' && t !== 'competencias' && t !== 'ppp_escolas') {
      q = q.eq('colaborador_id', colaboradorId);
    }
    const { error } = await q;
    if (error) return { success: false, error: `Erro em ${t} (DELETE): ${error.message}` };
  }

  const scope = colaboradorId ? '(colaborador)' : '(empresa)';
  let msg;
  if (fields) {
    msg = `${tabelas.length} tabela(s) zeradas ${scope}`;
  } else if (hardDelete) {
    msg = `${tabelas.length} tabela(s) APAGADAS PERMANENTEMENTE ${scope}`;
  } else {
    msg = `${movidosLixeira} registro(s) movidos pra lixeira ${scope} — restauráveis em /admin/lixeira`;
  }
  if (pdfsRemovidos > 0) msg += ` | ${pdfsRemovidos} PDF(s) removidos`;
  return { success: true, message: msg };
}

/**
 * Lista itens da lixeira (agrupados por tabela + data).
 */
export async function listarLixeira(empresaId, opts: any = {}) {
  await requireAdminAction();
  const sb = createSupabaseAdmin();
  let q = sb.from('trash').select('*').order('deletado_em', { ascending: false });
  if (empresaId) q = q.eq('empresa_id', empresaId);
  if (opts.tabela) q = q.eq('tabela_origem', opts.tabela);
  const { data, error } = await q.limit(500);
  if (error) return { success: false, error: error.message };
  return { success: true, items: data || [] };
}

/**
 * Restaura registros da lixeira (re-INSERT na tabela origem).
 * Pode passar IDs específicos ou critérios (tabela + intervalo de tempo).
 */
export async function restaurarDaLixeira(trashIds: any[] = []) {
  await requireAdminAction();
  const sb = createSupabaseAdmin();
  if (!trashIds.length) return { success: false, error: 'Nenhum ID informado' };

  const { data: items } = await sb.from('trash').select('*').in('id', trashIds);
  if (!items?.length) return { success: false, error: 'Itens não encontrados na lixeira' };

  // Agrupa por tabela_origem e re-insere o payload
  const porTabela = {};
  for (const it of items) {
    if (!porTabela[it.tabela_origem]) porTabela[it.tabela_origem] = [];
    porTabela[it.tabela_origem].push(it.payload);
  }

  let restaurados = 0, erros = 0;
  for (const [tabela, payloads] of Object.entries(porTabela) as [string, any[]][]) {
    const { error } = await sb.from(tabela).upsert(payloads);
    if (error) { erros++; console.error(`[restaurar ${tabela}]`, error.message); }
    else restaurados += payloads.length;
  }

  // Remove da lixeira os que foram restaurados com sucesso
  if (restaurados > 0) {
    await sb.from('trash').delete().in('id', trashIds);
  }

  return {
    success: erros === 0,
    message: `${restaurados} registro(s) restaurado(s)${erros ? ` · ${erros} tabela(s) com erro` : ''}`,
    restaurados, erros,
  };
}

/**
 * Esvazia lixeira permanentemente (hard delete dos itens em trash).
 */
export async function esvaziarLixeira(empresaId, dias = 30) {
  await requireAdminAction();
  const sb = createSupabaseAdmin();
  const corte = new Date(Date.now() - dias * 86400 * 1000).toISOString();
  let q: any = sb.from('trash').delete().lt('deletado_em', corte);
  if (empresaId) q = q.eq('empresa_id', empresaId);
  const { error, count } = await q.select('id', { count: 'exact' });
  if (error) return { success: false, error: error.message };
  return { success: true, message: `${count || 0} item(s) >${dias}d removidos da lixeira` };
}

export async function limparCenariosB(empresaId) {
  await requireAdminAction();
  const sb = createSupabaseAdmin();
  const { error, count } = await sb.from('banco_cenarios')
    .delete({ count: 'exact' })
    .eq('empresa_id', empresaId)
    .eq('tipo_cenario', 'cenario_b');
  if (error) return { success: false, error: error.message };
  return { success: true, message: `${count || 0} cenário(s) B removido(s)` };
}

export async function limparReavaliacaoSessoes(empresaId) {
  await requireAdminAction();
  const sb = createSupabaseAdmin();
  const { error, count } = await sb.from('reavaliacao_sessoes')
    .delete({ count: 'exact' })
    .eq('empresa_id', empresaId);
  if (error) return { success: false, error: error.message };
  return { success: true, message: `${count || 0} sessão(ões) de reavaliação removida(s)` };
}

// Limpa respostas do mapeamento de competências. Remove TODAS as respostas
// (qualquer canal) porque o getDiagnosticoDoDia conta tudo ao decidir se
// uma competência já foi respondida — filtrar só canal='dashboard' deixava
// respostas de simulação admin bloqueando a retomada do fluxo.
export async function limparMapeamentoCompetencias(empresaId, colaboradorId = null) {
  await requireAdminAction();
  const sb = createSupabaseAdmin();
  let q = sb.from('respostas')
    .delete({ count: 'exact' })
    .eq('empresa_id', empresaId);
  if (colaboradorId) q = q.eq('colaborador_id', colaboradorId);
  const { error, count } = await q;
  if (error) return { success: false, error: error.message };
  const scope = colaboradorId ? '(colaborador)' : '(empresa)';
  return { success: true, message: `${count || 0} resposta(s) de mapeamento removida(s) ${scope}` };
}

// ── Setar senha "teste" para todos os colaboradores da empresa ─────────────
// Útil para bypass do rate limit de magic links durante testes.
// Cria o auth.user se não existir; senão atualiza a senha.
export async function definirSenhaTesteEmpresa(empresaId) {
  await requireAdminAction();
  const sb = createSupabaseAdmin();

  const { data: colabs, error: colabErr } = await sb.from('colaboradores')
    .select('email').eq('empresa_id', empresaId);
  if (colabErr) return { success: false, error: colabErr.message };
  if (!colabs?.length) return { success: false, error: 'Nenhum colaborador na empresa' };

  // Listar TODOS os auth.users (paginar de 1000 em 1000)
  const authUsersByEmail = new Map();
  let page = 1;
  while (true) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return { success: false, error: `listUsers: ${error.message}` };
    (data?.users || []).forEach(u => {
      if (u.email) authUsersByEmail.set(u.email.toLowerCase(), u);
    });
    if (!data?.users?.length || data.users.length < 1000) break;
    page++;
  }

  let atualizados = 0, criados = 0, erros = 0;
  const emailsUnicos = [...new Set(colabs.map(c => c.email?.toLowerCase()).filter(Boolean))];

  for (const email of emailsUnicos) {
    const existing = authUsersByEmail.get(email);
    try {
      if (existing) {
        const { error } = await sb.auth.admin.updateUserById(existing.id, {
          password: 'teste123',
          email_confirm: true,
        });
        if (error) { erros++; console.error('[setSenha update]', email, error.message); }
        else atualizados++;
      } else {
        const { error } = await sb.auth.admin.createUser({
          email,
          password: 'teste123',
          email_confirm: true,
        });
        if (error) { erros++; console.error('[setSenha create]', email, error.message); }
        else criados++;
      }
    } catch (e) {
      erros++;
      console.error('[setSenha exception]', email, e.message);
    }
  }

  return {
    success: true,
    message: `Senha "teste" definida — ${atualizados} atualizados, ${criados} criados${erros ? `, ${erros} erros` : ''}`,
  };
}

export async function limparMapeamento(empresaId, colaboradorId = null) {
  await requireAdminAction();
  const sb = createSupabaseAdmin();

  // Antes de limpar: remove PDFs órfãos do Storage
  let pathQuery = sb.from('colaboradores')
    .select('comportamental_pdf_path').eq('empresa_id', empresaId)
    .not('comportamental_pdf_path', 'is', null);
  if (colaboradorId) pathQuery = pathQuery.eq('id', colaboradorId);
  const { data: paths } = await pathQuery;
  const pdfsParaRemover = (paths || []).map(r => r.comportamental_pdf_path).filter(Boolean);
  if (pdfsParaRemover.length > 0) {
    try { await sb.storage.from('relatorios-pdf').remove(pdfsParaRemover); }
    catch (e) { console.warn('[VERTHO] remover PDFs:', e.message); }
  }

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
    // Limpa artefatos derivados do mapeamento
    comportamental_pdf_path: null,
    report_texts: null, report_generated_at: null,
    insights_executivos: null, insights_executivos_at: null,
  };
  let query = sb.from('colaboradores').update(campos).eq('empresa_id', empresaId);
  if (colaboradorId) query = query.eq('id', colaboradorId);
  const { error, count } = await query;
  if (error) return { success: false, error: error.message };
  return { success: true, message: `Mapeamento limpo${colaboradorId ? ' (colaborador)' : ' (todos)'} · ${pdfsParaRemover.length} PDF(s) removidos` };
}

export async function loadColaboradoresLista(empresaId) {
  await requireAdminAction();
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
import { rodarIA4 as _ia4, rodarIA4Uma as _ia4Uma, listarPendentesIA4 as _listarIA4, verFilaIA4 as _fila, gerarRelatoriosIndividuais as _relInd, gerarRelatorioGestor as _relGestor, gerarRelatorioRH as _relRH, enviarRelIndividuais as _envInd, enviarRelGestor as _envGestor, enviarRelRH as _envRH } from '@/actions/fase3';
import { checkAvaliacoes as _check } from '@/actions/check-ia4';
import { gerarPDIs as _pdis, gerarPDIsDescritores as _pdisDesc, montarTrilhasLote as _trilhas, criarEstruturaFase4 as _estrutura, iniciarFase4ParaTodos as _iniciar, triggerSegundaFase4 as _trigSeg, triggerQuintaFase4 as _trigQui, getStatusFase4 as _statusF4, salvarCompetenciaFoco as _salvarFoco, loadCompetenciasFoco as _loadFoco } from '@/actions/fase4';
import { gerarCenariosBLote as _cenB, checkCenariosBLote as _checkCenB, checkCenarioBUm as _checkCenBUm, regenerarCenarioB as _regenCenB, regenerarERecheckarCenariosBLote as _regenLote, iniciarReavaliacaoLote as _reav, gerarRelatoriosEvolucaoLote as _evolucao, gerarPlenariaEvolucao as _plenaria, gerarRelatorioRHManual as _rhManual, gerarRelatorioPlenaria as _rhPlen, enviarLinksPerfil as _links, gerarDossieGestor as _dossie, checkCenarios as _checkCen } from '@/actions/fase5';
import { dispararLinksCIS as _dispCIS, dispararRelatoriosLote as _dispLote } from '@/actions/whatsapp-lote';

export async function rodarIA1(e, c) { await requireAdminAction(); return _ia1(e, c); }
export async function rodarIA2(e, c) { await requireAdminAction(); return _ia2(e, c); }
export async function rodarIA3(e, c) { await requireAdminAction(); return _ia3(e, c); }
export async function dispararEmails(e) { await requireAdminAction(); return _emails(e); }
export async function verStatusEnvios(e) { await requireAdminAction(); return _status(e); }
export async function rodarIA4(e, c) {
  try {
    await requireAdminAction();
    return await _ia4(e, c);
  } catch (err: any) {
    console.error('[rodarIA4 wrapper]', err.message);
    return { success: false, error: err.message };
  }
}
export async function rodarIA4Uma(e, respostaId, c) { await requireAdminAction(); return _ia4Uma(e, respostaId, c); }
export async function listarPendentesIA4(e) { await requireAdminAction(); return _listarIA4(e); }
export async function verFilaIA4(e) { await requireAdminAction(); return _fila(e); }
export async function checkAvaliacoes(e, c) { await requireAdminAction(); return _check(e, c); }
export async function gerarRelatoriosIndividuais(e, c) { await requireAdminAction(); return _relInd(e, c); }
export async function gerarRelatorioGestor(e, c) { await requireAdminAction(); return _relGestor(e, c); }
export async function gerarRelatorioRH(e, c) { await requireAdminAction(); return _relRH(e, c); }
export async function enviarRelIndividuais(e) { await requireAdminAction(); return _envInd(e); }
export async function enviarRelGestor(e) { await requireAdminAction(); return _envGestor(e); }
export async function enviarRelRH(e) { await requireAdminAction(); return _envRH(e); }
export async function gerarPDIs(e, c) { await requireAdminAction(); return _pdis(e, c); }
export async function gerarPDIsDescritores(e) { await requireAdminAction(); return _pdisDesc(e); }
export async function montarTrilhasLote(e) { await requireAdminAction(); return _trilhas(e); }
export async function salvarCompetenciaFoco(e, cargo, comp) { await requireAdminAction(); return _salvarFoco(e, cargo, comp); }
export async function loadCompetenciasFoco(e) { await requireAdminAction(); return _loadFoco(e); }
export async function criarEstruturaFase4(e) { await requireAdminAction(); return _estrutura(e); }
export async function iniciarFase4ParaTodos(e) { await requireAdminAction(); return _iniciar(e); }
export async function triggerSegundaFase4(e) { await requireAdminAction(); return _trigSeg(e); }
export async function triggerQuintaFase4(e) { await requireAdminAction(); return _trigQui(e); }
export async function getStatusFase4(e) { await requireAdminAction(); return _statusF4(e); }
export async function gerarCenariosBLote(e, c) { await requireAdminAction(); return _cenB(e, c); }
export async function checkCenariosBLote(e, c) { await requireAdminAction(); return _checkCenB(e, c); }
export async function checkCenarioBUm(cenarioId, modelo) { await requireAdminAction(); return _checkCenBUm(cenarioId, modelo); }
export async function regenerarCenarioB(cenarioId, aiConfig) { await requireAdminAction(); return _regenCenB(cenarioId, aiConfig); }
export async function regenerarERecheckarCenariosBLote(empresaId, aiConfig) { await requireAdminAction(); return _regenLote(empresaId, aiConfig); }
export async function iniciarReavaliacaoLote(e, c) { await requireAdminAction(); return _reav(e, c); }
export async function gerarRelatoriosEvolucaoLote(e, c) { await requireAdminAction(); return _evolucao(e, c); }
export async function gerarPlenariaEvolucao(e, c) { await requireAdminAction(); return _plenaria(e, c); }
export async function gerarRelatorioRHManual(e, c) { await requireAdminAction(); return _rhManual(e, c); }
export async function gerarRelatorioPlenaria(e, c) { await requireAdminAction(); return _rhPlen(e, c); }
export async function enviarLinksPerfil(e) { await requireAdminAction(); return _links(e); }
export async function gerarDossieGestor(e, c) { await requireAdminAction(); return _dossie(e, c); }
export async function checkCenarios(e, c) { await requireAdminAction(); return _checkCen(e, c); }
export async function dispararRelatoriosLote(e) { await requireAdminAction(); return _dispLote(e); }
export async function dispararLinksCIS(e) { await requireAdminAction(); return _dispCIS(e); }
