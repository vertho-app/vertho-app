'use server';

import { updateTag } from 'next/cache';
import { requireAdminSupabase, requireEmpresaSupabase } from '@/lib/admin-supabase';
import { getAuthenticatedEmailFromAction } from '@/lib/auth/action-context';
import { logAdminAction } from '@/lib/audit';
import { addVercelDomain, removeVercelDomain } from '@/lib/vercel-domain';
import { isAppLocale, locales } from '@/i18n/routing';
import { TENANT_LOCALE_CACHE_TAG } from '@/lib/i18n-server';

export async function loadConfig(empresaId) {
  const sb = await requireAdminSupabase();
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const { data, error } = await sb.from('empresas')
    .select('id, nome, slug, sys_config, ui_config, default_locale')
    .eq('id', empresaId).single();
  if (error && /default_locale/i.test(error.message || '')) {
    const fallback = await sb.from('empresas')
      .select('id, nome, slug, sys_config, ui_config')
      .eq('id', empresaId).single();
    if (fallback.error) return { success: false, error: fallback.error.message };
    return { success: true, empresa: { ...fallback.data, default_locale: 'pt-BR' } };
  }
  if (error) return { success: false, error: error.message };
  return { success: true, empresa: data };
}

export async function salvarConfig(empresaId, sysConfig) {
  // Gate TENANT-SCOPED (auditoria 23/07): empresaId vem do client.
  const sb = await requireEmpresaSupabase(empresaId, 'settings.company.manage');
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const { error } = await sb.from('empresas')
    .update({ sys_config: sysConfig })
    .eq('id', empresaId);
  if (error) return { success: false, error: error.message };
  await logAdminAction({
    adminEmail: (await getAuthenticatedEmailFromAction()) || 'desconhecido',
    acao: 'empresa.editar', empresaId, alvo: 'sys_config',
    detalhes: { campo: 'sys_config', chaves: Object.keys(sysConfig || {}) },
  });
  return { success: true, message: 'Configurações salvas' };
}

export async function salvarLocaleEmpresa(empresaId, defaultLocale) {
  // Gate TENANT-SCOPED (auditoria 23/07): settings.locale.manage existe até no
  // role colaborador — sem amarrar ao tenant, qualquer colab mudava o idioma
  // padrão de OUTRA empresa.
  const sb = await requireEmpresaSupabase(empresaId, 'settings.locale.manage');
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  if (!isAppLocale(defaultLocale)) {
    return { success: false, error: `Locale inválido. Use: ${locales.join(', ')}` };
  }

  const { error } = await sb.from('empresas')
    .update({ default_locale: defaultLocale })
    .eq('id', empresaId);
  if (error) return { success: false, error: error.message };
  // O locale default é cacheado no data cache (ver lib/i18n-server.ts) —
  // sem isso, requests antigos continuariam servindo o idioma anterior.
  // updateTag (server action) expira na hora, com read-your-own-writes.
  updateTag(TENANT_LOCALE_CACHE_TAG);
  await logAdminAction({
    adminEmail: (await getAuthenticatedEmailFromAction()) || 'desconhecido',
    acao: 'empresa.editar', empresaId, alvo: 'default_locale',
    detalhes: { campo: 'default_locale', valor: defaultLocale },
  });
  return { success: true, message: 'Idioma padrão salvo' };
}

export async function salvarBranding(empresaId, branding) {
  const sb = await requireAdminSupabase('companies.manage');
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };

  const { data: current } = await sb.from('empresas')
    .select('ui_config')
    .eq('id', empresaId).single();

  const merged = { ...(current?.ui_config || {}), ...branding };

  const { error } = await sb.from('empresas')
    .update({ ui_config: merged })
    .eq('id', empresaId);
  if (error) return { success: false, error: error.message };
  await logAdminAction({
    adminEmail: (await getAuthenticatedEmailFromAction()) || 'desconhecido',
    acao: 'empresa.editar', empresaId, alvo: 'branding',
    detalhes: { campo: 'ui_config', chaves: Object.keys(branding || {}) },
  });
  return { success: true, message: 'Branding salvo' };
}

/**
 * Remove o logo do tenant DE VERDADE: apaga os arquivos do bucket e limpa
 * ui_config.logo_url. Antes o botão só limpava o estado local (exigia Salvar)
 * e o storage ficava intacto — assimétrico com o upload, que grava na hora.
 */
export async function removerLogo(empresaId: string) {
  const sb = await requireAdminSupabase('companies.manage');
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  try {
    const { data: existing } = await sb.storage.from('logos').list(empresaId);
    if (existing?.length) {
      await sb.storage.from('logos').remove(existing.map((f: any) => `${empresaId}/${f.name}`));
    }
    const { data: emp } = await sb.from('empresas')
      .select('ui_config').eq('id', empresaId).maybeSingle();
    const { error } = await sb.from('empresas')
      .update({ ui_config: { ...(emp?.ui_config || {}), logo_url: null } })
      .eq('id', empresaId);
    if (error) return { success: false, error: error.message };
    await logAdminAction({
      adminEmail: (await getAuthenticatedEmailFromAction()) || 'desconhecido',
      acao: 'empresa.editar', empresaId, alvo: 'branding (logo removido)',
      detalhes: { arquivos_removidos: existing?.length || 0 },
    });
    return { success: true, message: 'Logo removido' };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Falha ao remover o logo' };
  }
}

/**
 * Extrai a paleta de cores do SITE do cliente e propõe as 7 cores da tela de
 * login. Núcleo headless em lib/site-palette (fetch anti-SSRF + extração de
 * CSS/meta/manifest + IA mapeia + contraste garantido em código). NÃO salva —
 * devolve a proposta; o admin revisa no form e clica Salvar.
 */
export async function extrairPaletaDoSite(empresaId: string, siteUrl: string) {
  await requireAdminSupabase('companies.manage');
  if (!empresaId || !siteUrl?.trim()) return { success: false, error: 'empresaId e URL do site obrigatórios' };
  try {
    const { extrairPaletaDoSiteCore } = await import('@/lib/site-palette');
    const r = await extrairPaletaDoSiteCore(siteUrl.trim());
    await logAdminAction({
      adminEmail: (await getAuthenticatedEmailFromAction()) || 'desconhecido',
      acao: 'empresa.editar', empresaId, alvo: 'branding (paleta do site)',
      detalhes: { url: siteUrl.trim(), css_arquivos: r.fontes.cssArquivos, ajustes: r.ajustes },
    });
    return { success: true, paleta: r.paleta, racional: r.racional, ajustes: r.ajustes, candidatos: r.candidatos.slice(0, 12) };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Falha ao extrair a paleta do site' };
  }
}

/**
 * Resume o PPP (ou descrição livre) da escola num brief estruturado e o salva
 * em sys_config.video_escola. O brief ancora a bíblia visual e o tom do
 * voice-over no render de vídeo IA (ver lib/escola-brief + lib/video-plan).
 */
export async function resumirPPPEscola(empresaId, ppp) {
  const sb = await requireAdminSupabase('ai.audit.regenerate');
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  if (!ppp?.trim()) return { success: false, error: 'Cole o PPP ou uma descrição da escola' };

  try {
    const { resumirPPP } = await import('@/lib/escola-brief');
    const brief = await resumirPPP(ppp);

    const { data: current } = await sb.from('empresas')
      .select('sys_config').eq('id', empresaId).single();
    const merged = { ...(current?.sys_config || {}), video_escola: brief };

    const { error } = await sb.from('empresas')
      .update({ sys_config: merged }).eq('id', empresaId);
    if (error) return { success: false, error: error.message };

    await logAdminAction({
      adminEmail: (await getAuthenticatedEmailFromAction()) || 'desconhecido',
      acao: 'empresa.editar', empresaId, alvo: 'video_escola (PPP)',
      detalhes: { campo: 'sys_config.video_escola', fonte_chars: ppp.length },
    });
    return { success: true, message: 'PPP resumido e salvo', brief };
  } catch (err) {
    return { success: false, error: err?.message || 'Falha ao resumir o PPP' };
  }
}

/**
 * Lista os PPPs já extraídos da empresa (tabela ppp_escolas) para o seletor
 * de escola na aba Vídeo. Uma empresa pode ter vários PPPs (um por escola).
 */
export async function listarPPPEscolas(empresaId: string) {
  const sb = await requireAdminSupabase();
  if (!empresaId) return [];
  const { data } = await sb.from('ppp_escolas')
    .select('id, escola, status, extracted_at')
    .eq('empresa_id', empresaId)
    .order('extracted_at', { ascending: false, nullsFirst: false });
  return data || [];
}

/**
 * Pré-preenche o brief de vídeo a partir de um PPP já extraído (ppp_escolas).
 * O admin seleciona a escola e a IA resume o PPP existente direto pro
 * sys_config.video_escola — sem precisar colar o texto de novo.
 */
export async function gerarBriefDoPPP(empresaId: string, pppEscolaId?: string) {
  const sb = await requireAdminSupabase('ai.audit.regenerate');
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };

  let q = sb.from('ppp_escolas')
    .select('id, escola, extracao, status')
    .eq('empresa_id', empresaId);
  q = pppEscolaId
    ? q.eq('id', pppEscolaId)
    : q.eq('status', 'extraido').order('extracted_at', { ascending: false, nullsFirst: false }).limit(1);

  const { data, error } = await q.maybeSingle();
  if (error) return { success: false, error: error.message };
  if (!data?.extracao) return { success: false, error: 'Nenhum PPP extraído encontrado para esta escola' };

  try {
    const { resumirPPP, extracaoParaTexto } = await import('@/lib/escola-brief');
    const fonte = extracaoParaTexto(data.extracao);
    if (!fonte.trim()) return { success: false, error: 'PPP extraído está vazio' };

    const brief = await resumirPPP(fonte);

    const { data: current } = await sb.from('empresas')
      .select('sys_config').eq('id', empresaId).single();
    const merged = { ...(current?.sys_config || {}), video_escola: brief };

    const { error: upErr } = await sb.from('empresas')
      .update({ sys_config: merged }).eq('id', empresaId);
    if (upErr) return { success: false, error: upErr.message };

    await logAdminAction({
      adminEmail: (await getAuthenticatedEmailFromAction()) || 'desconhecido',
      acao: 'empresa.editar', empresaId, alvo: `video_escola (PPP: ${data.escola})`,
      detalhes: { campo: 'sys_config.video_escola', ppp_escola_id: data.id, escola: data.escola },
    });
    return { success: true, message: `Brief gerado a partir do PPP de "${data.escola}"`, brief, escola: data.escola };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Falha ao gerar o brief do PPP' };
  }
}

// ── Gerenciar Roles da Equipe ──────────────────────────────────────────────

export async function loadEquipe(empresaId) {
  const sb = await requireAdminSupabase();
  if (!empresaId) return [];
  const { data } = await sb.from('colaboradores')
    .select('id, nome_completo, email, cargo, role, programa_modo')
    .eq('empresa_id', empresaId)
    .order('nome_completo');
  return data || [];
}

/**
 * Override do programa POR COLABORADOR (mig 154): null = herda o default da
 * empresa (sys_config.programa_modo). Só afeta a PRÓXIMA geração de trilha —
 * trilha em andamento roda pelo carimbo dela (trilhas.programa_modo).
 */
export async function atualizarProgramaModo(colaboradorId, novoModo, empresaId) {
  // Gate TENANT-SCOPED (auditoria 23/07): empresaId vem do client.
  const sb = await requireEmpresaSupabase(empresaId, 'users.manage');
  if (!colaboradorId || !empresaId) return { success: false, error: 'colaboradorId e empresaId obrigatórios' };
  const modo = novoModo || null;
  const validos = [null, 'regular_duo', 'regular_single', 'onboarding', 'piloto', 'custom'];
  if (!validos.includes(modo)) return { success: false, error: 'Modo inválido. Use: herdar (vazio), regular_duo, regular_single, onboarding, piloto, custom' };

  // Update TENANT-SCOPED: o id sozinho permitiria mexer em colaborador de
  // outra empresa (defense-in-depth mesmo sendo gate de platform admin).
  const { data: upd, error } = await sb.from('colaboradores')
    .update({ programa_modo: modo })
    .eq('id', colaboradorId)
    .eq('empresa_id', empresaId)
    .select('empresa_id, nome_completo')
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  if (!upd) return { success: false, error: 'Colaborador não encontrado nesta empresa' };
  await logAdminAction({
    adminEmail: (await getAuthenticatedEmailFromAction()) || 'desconhecido',
    acao: 'equipe.editar_programa', empresaId: upd?.empresa_id,
    alvo: upd?.nome_completo || colaboradorId,
    detalhes: { colaboradorId, programa_modo: modo },
  });
  return { success: true, message: modo ? `Programa: ${modo} (vale pra próxima geração)` : 'Programa: herda o default da empresa' };
}

export async function atualizarRole(colaboradorId, novoRole, empresaId) {
  // Gate TENANT-SCOPED (auditoria 23/07): RH de um tenant promovia/rebaixava
  // colaborador de OUTRO tenant (escalada) — empresaId precisa bater com a sessão.
  const sb = await requireEmpresaSupabase(empresaId, 'users.manage');
  if (!colaboradorId || !novoRole || !empresaId) return { success: false, error: 'colaboradorId, novoRole e empresaId obrigatórios' };
  const validRoles = ['colaborador', 'gestor', 'rh', 'tutor'];
  if (!validRoles.includes(novoRole)) return { success: false, error: `Role invalido. Use: ${validRoles.join(', ')}` };

  // Update TENANT-SCOPED (mesma regra do atualizarProgramaModo): o id sozinho
  // permitiria mexer em colaborador de outra empresa.
  const { data: upd, error } = await sb.from('colaboradores')
    .update({ role: novoRole })
    .eq('id', colaboradorId)
    .eq('empresa_id', empresaId)
    .select('empresa_id, nome_completo')
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  if (!upd) return { success: false, error: 'Colaborador não encontrado nesta empresa' };
  await logAdminAction({
    adminEmail: (await getAuthenticatedEmailFromAction()) || 'desconhecido',
    acao: 'equipe.editar_role', empresaId: upd?.empresa_id,
    alvo: upd?.nome_completo || colaboradorId,
    detalhes: { colaboradorId, novoRole },
  });
  return { success: true, message: `Role atualizado para ${novoRole}` };
}

export async function salvarSlug(empresaId, slug) {
  const sb = await requireAdminSupabase('companies.manage');
  if (!empresaId || !slug) return { success: false, error: 'empresaId e slug obrigatórios' };

  const clean = slug.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (!clean || clean.length < 2) return { success: false, error: 'Slug deve ter pelo menos 2 caracteres (letras, números e hífens)' };

  const { data: existing } = await sb.from('empresas')
    .select('id')
    .eq('slug', clean)
    .neq('id', empresaId)
    .single();

  if (existing) return { success: false, error: `O slug "${clean}" já está em uso por outra empresa` };

  const { data: prev } = await sb.from('empresas')
    .select('slug')
    .eq('id', empresaId)
    .single();
  const slugAnterior = prev?.slug;

  const { error } = await sb.from('empresas')
    .update({ slug: clean })
    .eq('id', empresaId);
  if (error) return { success: false, error: error.message };

  // Subdomínio antigo é removido automaticamente do Vercel; o novo precisa
  // ser vinculado manualmente pelo botão "Vincular ao Vercel".
  if (slugAnterior && slugAnterior !== clean) {
    removeVercelDomain(slugAnterior).catch(() => {});
  }

  await logAdminAction({
    adminEmail: (await getAuthenticatedEmailFromAction()) || 'desconhecido',
    acao: 'empresa.editar', empresaId, empresaSlug: clean, alvo: 'slug (subdomínio)',
    detalhes: { campo: 'slug', de: slugAnterior, para: clean },
  });

  return { success: true, message: `Slug atualizado para "${clean}". Lembre de vincular o novo subdomínio ao Vercel.`, slug: clean };
}

/**
 * Vincula o subdomínio do tenant ao projeto Vercel (emissão de SSL).
 * Acionado pelo botão "Vincular ao Vercel" no card de subdomínio em
 * /admin/empresas/[id]/configuracoes (aba Branding).
 */
export async function vincularDominioVercel(empresaId: string) {
  const sb = await requireAdminSupabase('companies.manage');
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };

  const { data: empresa } = await sb.from('empresas')
    .select('slug, nome').eq('id', empresaId).maybeSingle();
  if (!empresa?.slug) return { success: false, error: 'Empresa sem slug definido' };

  const r = await addVercelDomain(empresa.slug);
  if ('skipped' in r && r.skipped) {
    return { success: false, error: 'VERCEL_TOKEN/PROJECT_ID não configurados em produção' };
  }
  if (!r.ok) {
    return { success: false, error: (r as any).error || 'Falha ao vincular ao Vercel' };
  }
  if (r.alreadyExists) {
    return { success: true, message: `${empresa.slug}.vertho.ai já estava vinculado.` };
  }
  return { success: true, message: `${empresa.slug}.vertho.ai vinculado. SSL será emitido em ~1 minuto.` };
}
