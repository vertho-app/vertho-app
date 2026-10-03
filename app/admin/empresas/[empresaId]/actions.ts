'use server';

import { requireAdminSupabase } from '@/lib/admin-supabase';
import { requireAdminAction } from '@/lib/auth/action-context';
import { logAdminAction } from '@/lib/audit';
import { removeVercelDomain } from '@/lib/vercel-domain';
import { excludeInternalEmails } from '@/lib/internal-emails';
import { z } from 'zod';
import { preverExclusaoPace, excluirCadastroComBackupPace } from '@/lib/simulador-vendas/exclusao';
import { SimuladorError } from '@/lib/simulador-vendas/core';

export async function loadEmpresaPipeline(empresaId) {
  await requireAdminAction();
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const sb = await requireAdminSupabase();

  // `is_demo` decide se a tela oferece a senha de teste (R-19).
  const { data: empresa, error } = await sb.from('empresas')
    .select('id, nome, segmento, slug, ui_config, sys_config, is_demo')
    .eq('id', empresaId).single();
  if (error) return { success: false, error: error.message };

  const [colabRes, compRes, cargosRes, cenariosRes, enviosRes, respostasRes, avalRes, pppRes] = await Promise.all([
    excludeInternalEmails(sb.from('colaboradores').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId)), // exclui internos @vertho.ai
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

  // Vagas abertas (Módulo de Seleção) — cargos_empresa com eh_vaga=true, fora dos operacionais
  const { count: totalVagas } = await sb.from('cargos_empresa')
    .select('id', { count: 'exact', head: true })
    .eq('empresa_id', empresaId).eq('eh_vaga', true);

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
      metricas: [{ label: 'Colaboradores', valor: totalColab }, { label: 'Cargos', valor: totalCargos }, { label: 'Vagas', valor: totalVagas || 0 }, { label: 'PPPs', valor: totalPPPs }] },
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

export async function preverExclusaoEmpresa(empresaId: string) {
  await requireAdminAction('companies.manage');
  try {
    return { success: true, data: await preverExclusaoPace(z.string().uuid().parse(empresaId), { tipo: 'empresa' }) };
  } catch (error) {
    return { success: false, error: error instanceof SimuladorError ? error.message : 'Não foi possível conferir o impacto da exclusão.' };
  }
}

export async function excluirEmpresa(empresaId: string, confirmacao?: string) {
  const ctx = await requireAdminAction('companies.manage');
  let empresa: { slug: string | null; nome: string | null };
  try {
    empresa = await excluirCadastroComBackupPace(z.string().uuid().parse(empresaId), { tipo: 'empresa' }, confirmacao, ctx.email);
  } catch (error) {
    await logAdminAction({
      adminEmail: ctx.email, acao: 'empresa.excluir', empresaId,
      detalhes: { motivo: error instanceof SimuladorError ? error.message : 'Falha ao excluir com backup' }, resultado: 'erro',
    });
    return { success: false, error: error instanceof SimuladorError ? error.message : 'Não foi possível excluir com backup. Confira o cadastro antes de tentar novamente.' };
  }

  // Aguardar a limpeza: trabalho solto pós-response pode morrer na Vercel.
  if (empresa?.slug) await removeVercelDomain(empresa.slug).catch(() => {});

  await logAdminAction({
    adminEmail: ctx.email, acao: 'empresa.excluir', empresaId, empresaSlug: empresa?.slug,
    alvo: empresa?.nome, detalhes: { dominioVercelRemovido: !!empresa?.slug },
  });
  return { success: true };
}

export async function limparRegistros(empresaId, tabelas, colaboradorId = null, fields = null, opts: any = {}) {
  await requireAdminAction('trash.manage');
  const sb = await requireAdminSupabase();
  const { hardDelete = false } = opts;
  let pdfsRemovidos = 0;
  let movidosLixeira = 0;
  const operacao = fields ? 'UPDATE (nullify)' : (hardDelete ? 'DELETE permanente' : 'soft DELETE (lixeira)');

  for (const t of tabelas) {
    // UPDATE nullify: zera campos sem deletar linhas (ex: zerar IA4 mantendo respostas)
    if (fields) {
      let q = sb.from(t).update(fields).eq('empresa_id', empresaId);
      if (colaboradorId && t !== 'cargos' && t !== 'competencias' && t !== 'ppp_escolas' && t !== 'colaboradores') {
        q = q.eq('colaborador_id', colaboradorId);
      } else if (colaboradorId && t === 'colaboradores') {
        q = q.eq('id', colaboradorId);
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
      if (colaboradorId && t !== 'cargos' && t !== 'competencias' && t !== 'ppp_escolas' && t !== 'colaboradores') {
        selQ = selQ.eq('colaborador_id', colaboradorId);
      } else if (colaboradorId && t === 'colaboradores') {
        selQ = selQ.eq('id', colaboradorId);
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
  const sb = await requireAdminSupabase();
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
  await requireAdminAction('trash.manage');
  const sb = await requireAdminSupabase();
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
  await requireAdminAction('trash.manage');
  const sb = await requireAdminSupabase();
  const corte = new Date(Date.now() - dias * 86400 * 1000).toISOString();
  let q: any = sb.from('trash').delete().lt('deletado_em', corte);
  if (empresaId) q = q.eq('empresa_id', empresaId);
  const { error, count } = await q.select('id', { count: 'exact' });
  if (error) return { success: false, error: error.message };
  return { success: true, message: `${count || 0} item(s) >${dias}d removidos da lixeira` };
}

export async function limparCenariosB(empresaId) {
  await requireAdminAction('trash.manage');
  const sb = await requireAdminSupabase();
  const { error, count } = await sb.from('banco_cenarios')
    .delete({ count: 'exact' })
    .eq('empresa_id', empresaId)
    .eq('tipo_cenario', 'cenario_b');
  if (error) return { success: false, error: error.message };
  return { success: true, message: `${count || 0} cenário(s) B removido(s)` };
}

export async function limparReavaliacaoSessoes(empresaId) {
  await requireAdminAction('trash.manage');
  const sb = await requireAdminSupabase();
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
  await requireAdminAction('trash.manage');
  const sb = await requireAdminSupabase();
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
//
// 🔴 R-19 (revisão de 02/10/2026): o botão existia no pipeline de QUALQUER
// empresa, e a senha vai para o `auth.users`, que é GLOBAL por e-mail. Num
// cliente real ele punha "teste123" na conta de cada pessoa (e na mesma pessoa
// em outras empresas), com a confirmação comum e sem rastro. O login de todo
// tenant aceita senha. Agora, nesta ordem:
//  1. só empresa de demonstração (`is_demo`); as demais recebem recusa clara;
//  2. pula quem administra a plataforma (`platform_admins`);
//  3. pula o e-mail que também é colaborador de empresa que NÃO é demo: a
//     conta é a mesma, e a senha valeria lá;
//  4. registra em `admin_audit_log`, inclusive a recusa.
const ACAO_SENHA_TESTE = 'empresa.senha_teste';

export async function definirSenhaTesteEmpresa(empresaId) {
  const ctx = await requireAdminAction('users.manage');
  const sb = await requireAdminSupabase();
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };

  const { data: empresaAlvo, error: empresaErr } = await sb.from('empresas')
    .select('id, nome, slug, is_demo').eq('id', empresaId).maybeSingle();
  if (empresaErr) return { success: false, error: `Não foi possível conferir a empresa: ${empresaErr.message}` };
  if (!empresaAlvo) return { success: false, error: 'Empresa não encontrada' };
  if (empresaAlvo.is_demo !== true) {
    await logAdminAction({
      adminEmail: ctx.email, acao: ACAO_SENHA_TESTE, empresaId, empresaSlug: empresaAlvo.slug,
      alvo: empresaAlvo.nome, detalhes: { recusado: 'empresa_nao_demo' }, resultado: 'erro',
    });
    return {
      success: false,
      error: 'A senha de teste só vale para empresa de demonstração. Esta empresa não é de demonstração, e a senha iria para a conta real de cada pessoa.',
    };
  }

  const { data: colabs, error: colabErr } = await sb.from('colaboradores')
    .select('email').eq('empresa_id', empresaId);
  if (colabErr) return { success: false, error: colabErr.message };
  if (!colabs?.length) return { success: false, error: 'Nenhum colaborador na empresa' };

  const emailsDaEmpresa = [...new Set(colabs.map(c => c.email?.trim().toLowerCase()).filter(Boolean))];
  const protegidos = await emailsQueNaoPodemTerSenhaDeTeste(sb, empresaId, emailsDaEmpresa);
  if ('erro' in protegidos) return { success: false, error: protegidos.erro };

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
  const emailsUnicos = emailsDaEmpresa.filter((email) => !protegidos.emails.has(email));
  const pulados = emailsDaEmpresa.length - emailsUnicos.length;

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

  await logAdminAction({
    adminEmail: ctx.email, acao: ACAO_SENHA_TESTE, empresaId, empresaSlug: empresaAlvo.slug,
    alvo: `${emailsUnicos.length} conta(s)`,
    detalhes: { atualizados, criados, erros, pulados_admin_plataforma: protegidos.admins, pulados_outra_empresa: protegidos.outraEmpresa },
    resultado: erros ? 'parcial' : 'ok',
  });

  return {
    success: true,
    message: `Senha "teste" definida: ${atualizados} atualizados, ${criados} criados${erros ? `, ${erros} erros` : ''}`
      + (pulados ? `; ${pulados} conta(s) pulada(s) por ser admin da plataforma ou ter cadastro em empresa real` : ''),
  };
}

/**
 * E-mails da empresa de demonstração que NÃO recebem a senha de teste: quem
 * administra a plataforma e quem também é colaborador de uma empresa que não é
 * demo. A conta do `auth.users` é uma por e-mail; senha posta aqui vale lá.
 *
 * Falha de leitura RECUSA a operação inteira (devolve `erro`): concluir "ninguém
 * a proteger" a partir de uma consulta que caiu é exatamente o defeito que o
 * R-19 descreve. A busca por outras empresas pagina até a página curta, porque
 * a decisão é pela AUSÊNCIA de linha e o PostgREST corta em 1.000 calado.
 */
async function emailsQueNaoPodemTerSenhaDeTeste(
  sb: any,
  empresaId: string,
  emails: string[],
): Promise<{ emails: Set<string>; admins: number; outraEmpresa: number } | { erro: string }> {
  const protegidos = new Set<string>();

  const { data: admins, error: adminsErr } = await sb.from('platform_admins').select('email');
  if (adminsErr) return { erro: `Não foi possível conferir os admins da plataforma: ${adminsErr.message}` };
  const deAdmin = new Set<string>(
    (admins || []).map((a: any) => String(a.email || '').trim().toLowerCase()).filter(Boolean),
  );
  let qtdAdmins = 0;
  for (const email of emails) if (deAdmin.has(email)) { protegidos.add(email); qtdAdmins++; }

  const { data: empresas, error: empresasErr } = await sb.from('empresas').select('id, is_demo');
  if (empresasErr) return { erro: `Não foi possível conferir as outras empresas: ${empresasErr.message}` };
  const reais = (empresas || [])
    .filter((e: any) => e.id !== empresaId && e.is_demo !== true)
    .map((e: any) => e.id as string);

  let qtdOutraEmpresa = 0;
  const candidatos = emails.filter((e) => !protegidos.has(e));
  if (reais.length && candidatos.length) {
    for (let i = 0; i < candidatos.length; i += 100) {
      const lote = candidatos.slice(i, i + 100);
      for (let de = 0; ; de += 1000) {
        const { data: vinculos, error: vincErr } = await sb.from('colaboradores')
          .select('id, email')
          .in('empresa_id', reais)
          .in('email', lote)
          .order('id')
          .range(de, de + 999);
        if (vincErr) return { erro: `Não foi possível conferir cadastros em outras empresas: ${vincErr.message}` };
        for (const v of vinculos || []) {
          const email = String(v.email || '').trim().toLowerCase();
          if (email && !protegidos.has(email)) { protegidos.add(email); qtdOutraEmpresa++; }
        }
        if ((vinculos || []).length < 1000) break;
      }
    }
  }

  return { emails: protegidos, admins: qtdAdmins, outraEmpresa: qtdOutraEmpresa };
}

export async function limparMapeamento(empresaId, colaboradorId = null) {
  await requireAdminAction('trash.manage');
  const sb = await requireAdminSupabase();

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
  const sb = await requireAdminSupabase();
  const { data } = await sb.from('colaboradores')
    .select('id, nome_completo, email')
    .eq('empresa_id', empresaId)
    .order('nome_completo');
  return data || [];
}

// ── Wrappers das actions reais ──
import { rodarIA1 as _ia1, rodarIA2 as _ia2, rodarIA3 as _ia3 } from '@/actions/fase1';
import { dispararEmails as _emails, verStatusEnvios as _status } from '@/actions/fase2';
import { rodarIA4 as _ia4, rodarIA4Uma as _ia4Uma, listarPendentesIA4 as _listarIA4, verFilaIA4 as _fila } from '@/actions/fase3';
import { listarPendentesCheck as _listarCheck } from '@/actions/check-ia4';
import { rechecarResposta as _recheckUma } from '@/actions/fase3';
import { montarTrilhasLote as _trilhas, criarEstruturaFase4 as _estrutura, iniciarFase4ParaTodos as _iniciar, triggerSegundaFase4 as _trigSeg, triggerQuintaFase4 as _trigQui, getStatusFase4 as _statusF4, salvarCompetenciaFoco as _salvarFoco, loadCompetenciasFoco as _loadFoco } from '@/actions/fase4';
import { gerarCenariosBLote as _cenB, checkCenariosBLote as _checkCenB, checkCenarioBUm as _checkCenBUm, regenerarCenarioB as _regenCenB, regenerarERecheckarCenariosBLote as _regenLote, iniciarReavaliacaoLote as _reav, gerarRelatoriosEvolucaoLote as _evolucao, gerarPlenariaEvolucao as _plenaria, gerarRelatorioRHManual as _rhManual, gerarRelatorioPlenaria as _rhPlen, enviarLinksPerfil as _links, gerarDossieGestor as _dossie, checkCenarios as _checkCen } from '@/actions/fase5';
import { dispararLinksCIS as _dispCIS, dispararRelatoriosLote as _dispLote } from '@/actions/whatsapp-lote';

export async function rodarIA1(e, c) { await requireAdminAction('ai.audit.regenerate'); return _ia1(e, c); }
export async function rodarIA2(e, c, opts?: { cargoNome?: string }) { await requireAdminAction('ai.audit.regenerate'); return _ia2(e, c, opts); }
export async function rodarIA3(e, c) { await requireAdminAction('ai.audit.regenerate'); return _ia3(e, c); }
export async function dispararEmails(e) { await requireAdminAction('assessments.dispatch'); return _emails(e); }
export async function verStatusEnvios(e) { await requireAdminAction(); return _status(e); }
export async function rodarIA4(e, c) {
  try {
    await requireAdminAction('ai.audit.regenerate');
    return await _ia4(e, c);
  } catch (err: any) {
    console.error('[rodarIA4 wrapper]', err.message);
    return { success: false, error: err.message };
  }
}
export async function rodarIA4Uma(e, respostaId, c) { await requireAdminAction('ai.audit.regenerate'); return _ia4Uma(e, respostaId, c); }
// ⚠️ O `opts` (escopo de turma, mig 210) TEM que ser repassado: um wrapper que
// engole o parâmetro faz o fail-closed sumir sem erro nenhum. Aqui o typecheck
// pegou; num JS solto teria passado.
export async function listarPendentesIA4(e, opts?: { turmaId?: string | null; empresaInteiraJustificativa?: string }) { await requireAdminAction(); return _listarIA4(e, opts); }
export async function verFilaIA4(e) { await requireAdminAction(); return _fila(e); }
// Check da IA4: a UI lista a fila e audita UMA resposta por request. Não há
// wrapper de lote — ele estourava o maxDuration de 300s (ver actions/check-ia4.ts).
export async function listarPendentesCheck(e) { await requireAdminAction(); return _listarCheck(e); }
export async function checarUmaAvaliacao(respostaId, c) { await requireAdminAction('ai.audit.regenerate'); return _recheckUma(respostaId, c); }
// Os 6 re-exports de relatório/envio saíram em 15/08 junto com os stubs que
// eles publicavam (ver `actions/fase3.ts`). A tela usa `actions/relatorios.ts`.
export async function montarTrilhasLote(e) { await requireAdminAction('content.manage'); return _trilhas(e); }
export async function salvarCompetenciaFoco(e, cargo, comp) { await requireAdminAction('content.manage'); return _salvarFoco(e, cargo, comp); }
export async function loadCompetenciasFoco(e) { await requireAdminAction(); return _loadFoco(e); }
export async function criarEstruturaFase4(e) { await requireAdminAction('assessments.dispatch'); return _estrutura(e); }
export async function iniciarFase4ParaTodos(e) { await requireAdminAction('assessments.dispatch'); return _iniciar(e); }
export async function triggerSegundaFase4(e) { await requireAdminAction('assessments.dispatch'); return _trigSeg(e); }
export async function triggerQuintaFase4(e) { await requireAdminAction('assessments.dispatch'); return _trigQui(e); }
export async function getStatusFase4(e) { await requireAdminAction(); return _statusF4(e); }
export async function gerarCenariosBLote(e, c) { await requireAdminAction('ai.audit.regenerate'); return _cenB(e, c); }
export async function checkCenariosBLote(e, c) { await requireAdminAction('ai.audit.regenerate'); return _checkCenB(e, c); }
export async function checkCenarioBUm(cenarioId, modelo) { await requireAdminAction('ai.audit.regenerate'); return _checkCenBUm(cenarioId, modelo); }
export async function regenerarCenarioB(cenarioId, aiConfig) { await requireAdminAction('ai.audit.regenerate'); return _regenCenB(cenarioId, aiConfig); }
export async function regenerarERecheckarCenariosBLote(empresaId, aiConfig) { await requireAdminAction('ai.audit.regenerate'); return _regenLote(empresaId, aiConfig); }
export async function iniciarReavaliacaoLote(e, c) { await requireAdminAction('ai.audit.regenerate'); return _reav(e, c); }
export async function gerarRelatoriosEvolucaoLote(e, c) { await requireAdminAction('ai.audit.regenerate'); return _evolucao(e, c); }
export async function gerarPlenariaEvolucao(e, c) { await requireAdminAction('ai.audit.regenerate'); return _plenaria(e, c); }
export async function gerarRelatorioRHManual(e, c) { await requireAdminAction('ai.audit.regenerate'); return _rhManual(e, c); }
export async function gerarRelatorioPlenaria(e, c) { await requireAdminAction('ai.audit.regenerate'); return _rhPlen(e, c); }
export async function enviarLinksPerfil(e) { await requireAdminAction('assessments.dispatch'); return _links(e); }
export async function gerarDossieGestor(e, c) { await requireAdminAction('ai.audit.regenerate'); return _dossie(e, c); }
export async function checkCenarios(e, c) { await requireAdminAction('ai.audit.regenerate'); return _checkCen(e, c); }
export async function dispararRelatoriosLote(e) { await requireAdminAction('assessments.dispatch'); return _dispLote(e); }
export async function dispararLinksCIS(e) { await requireAdminAction('assessments.dispatch'); return _dispCIS(e); }
