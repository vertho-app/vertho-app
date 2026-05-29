'use server';

import { requireAdminSupabase } from '@/lib/admin-supabase';
import { getAuthenticatedEmailFromAction } from '@/lib/auth/action-context';
import { logAdminAction } from '@/lib/audit';
import { addVercelDomain, removeVercelDomain } from '@/lib/vercel-domain';
import { isAppLocale, locales } from '@/i18n/routing';

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
  const sb = await requireAdminSupabase();
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
  const sb = await requireAdminSupabase();
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  if (!isAppLocale(defaultLocale)) {
    return { success: false, error: `Locale inválido. Use: ${locales.join(', ')}` };
  }

  const { error } = await sb.from('empresas')
    .update({ default_locale: defaultLocale })
    .eq('id', empresaId);
  if (error) return { success: false, error: error.message };
  await logAdminAction({
    adminEmail: (await getAuthenticatedEmailFromAction()) || 'desconhecido',
    acao: 'empresa.editar', empresaId, alvo: 'default_locale',
    detalhes: { campo: 'default_locale', valor: defaultLocale },
  });
  return { success: true, message: 'Idioma padrão salvo' };
}

export async function salvarBranding(empresaId, branding) {
  const sb = await requireAdminSupabase();
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
 * Resume o PPP (ou descrição livre) da escola num brief estruturado e o salva
 * em sys_config.video_escola. O brief ancora a bíblia visual e o tom do
 * voice-over no render de vídeo IA (ver lib/escola-brief + lib/video-plan).
 */
export async function resumirPPPEscola(empresaId, ppp) {
  const sb = await requireAdminSupabase();
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
 * Converte a extração estruturada do PPP (ppp_escolas.extracao, formato
 * educacional do actions/ppp.ts) num texto legível para alimentar resumirPPP.
 * Cai pro JSON cru se o formato não bater.
 */
function extracaoParaTexto(raw: any): string {
  let d: any;
  try { d = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return String(raw || ''); }
  if (!d || typeof d !== 'object') return String(raw || '');

  const partes: string[] = [];
  const p = d.perfil_instituicao;
  if (p) {
    partes.push(`Instituição: ${[p.nome, p.tipo, p.segmento, p.porte, p.localizacao].filter(Boolean).join(' — ')}`);
  }
  if (d.comunidade_contexto) partes.push(`Comunidade/contexto: ${d.comunidade_contexto}`);
  const id = d.identidade;
  if (id) {
    const linhas = [id.missao && `Missão: ${id.missao}`, id.visao && `Visão: ${id.visao}`,
      Array.isArray(id.principios) && id.principios.length && `Princípios: ${id.principios.join('; ')}`,
      id.concepcao && `Concepção: ${id.concepcao}`].filter(Boolean);
    if (linhas.length) partes.push(`Identidade:\n${linhas.join('\n')}`);
  }
  if (Array.isArray(d.praticas_descritas) && d.praticas_descritas.length) {
    partes.push(`Práticas: ${d.praticas_descritas.map((x: any) => x?.nome || x?.descricao).filter(Boolean).join('; ')}`);
  }
  if (d.inclusao_diversidade) partes.push(`Inclusão/diversidade: ${d.inclusao_diversidade}`);
  if (d.gestao_participacao) partes.push(`Gestão/participação: ${d.gestao_participacao}`);
  const inf = d.infraestrutura_recursos;
  if (inf) {
    const linhas = [Array.isArray(inf.espacos) && inf.espacos.length && `Espaços: ${inf.espacos.join(', ')}`,
      Array.isArray(inf.tecnologia) && inf.tecnologia.length && `Tecnologia: ${inf.tecnologia.join(', ')}`].filter(Boolean);
    if (linhas.length) partes.push(`Infraestrutura:\n${linhas.join('\n')}`);
  }
  const vals = Array.isArray(d.valores_institucionais) ? d.valores_institucionais
    : (d.valores_institucionais?.conteudo || []);
  if (Array.isArray(vals) && vals.length) partes.push(`Valores: ${vals.join(', ')}`);

  const texto = partes.join('\n\n').trim();
  return texto || JSON.stringify(d);
}

/**
 * Pré-preenche o brief de vídeo a partir de um PPP já extraído (ppp_escolas).
 * O admin seleciona a escola e a IA resume o PPP existente direto pro
 * sys_config.video_escola — sem precisar colar o texto de novo.
 */
export async function gerarBriefDoPPP(empresaId: string, pppEscolaId?: string) {
  const sb = await requireAdminSupabase();
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
    const fonte = extracaoParaTexto(data.extracao);
    if (!fonte.trim()) return { success: false, error: 'PPP extraído está vazio' };

    const { resumirPPP } = await import('@/lib/escola-brief');
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
    .select('id, nome_completo, email, cargo, role')
    .eq('empresa_id', empresaId)
    .order('nome_completo');
  return data || [];
}

export async function atualizarRole(colaboradorId, novoRole) {
  const sb = await requireAdminSupabase();
  if (!colaboradorId || !novoRole) return { success: false, error: 'Dados obrigatorios' };
  const validRoles = ['colaborador', 'gestor', 'rh', 'tutor'];
  if (!validRoles.includes(novoRole)) return { success: false, error: `Role invalido. Use: ${validRoles.join(', ')}` };

  const { data: upd, error } = await sb.from('colaboradores')
    .update({ role: novoRole })
    .eq('id', colaboradorId)
    .select('empresa_id, nome_completo')
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  await logAdminAction({
    adminEmail: (await getAuthenticatedEmailFromAction()) || 'desconhecido',
    acao: 'equipe.editar_role', empresaId: upd?.empresa_id,
    alvo: upd?.nome_completo || colaboradorId,
    detalhes: { colaboradorId, novoRole },
  });
  return { success: true, message: `Role atualizado para ${novoRole}` };
}

export async function salvarSlug(empresaId, slug) {
  const sb = await requireAdminSupabase();
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
  const sb = await requireAdminSupabase();
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
