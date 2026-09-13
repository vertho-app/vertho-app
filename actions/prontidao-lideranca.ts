'use server';
/**
 * Prontidão para Liderança — as portas de entrada pela web.
 *
 * Molde: `actions/ranking-adequacao.ts`. Cada leitura existe em par —
 * RH self-service (papel `rh`, empresa DA SESSÃO, nunca do argumento) e
 * preview de admin (`admin.access`, empresa da rota). Todo export aplica o
 * gate ANTES de qualquer leitura de dado; o núcleo (`lib/prontidao-lideranca/`)
 * não autoriza ninguém.
 *
 * O gate de MÓDULO vem logo depois do de sessão: módulo não contratado
 * responde com código, não com tela vazia — "vazio" e "não comprou" são coisas
 * diferentes para quem lê.
 */
import { getUserContext } from '@/lib/authz';
import { tenantDb } from '@/lib/tenant-db';
import { requireEmpresaSupabase } from '@/lib/admin-supabase';
import { MODULOS, canUseModulo } from '@/lib/access-gates/modulos';
import { listarTurmasDoTenant } from '@/lib/turmas/contexto';
import {
  CHAVE_CONFIG, lerConfigProntidao, validarConfigProntidao, type ConfigProntidaoLideranca,
} from '@/lib/prontidao-lideranca/config';
import {
  agregarProntidaoLideranca, carregarParecer, carregarCalibragem, carregarCargosParaValidacao, carregarPopulacao,
} from '@/lib/prontidao-lideranca/agregar';

type Falha = { success: false; error: string; code?: string };

async function ctxRh(): Promise<{ empresaId: string } | { erro: string }> {
  const { getAuthenticatedEmailFromAction } = await import('@/lib/auth/action-context');
  const email = await getAuthenticatedEmailFromAction();
  if (!email) return { erro: 'Não autenticado.' };
  const ctx = await getUserContext(email);
  if (ctx?.role !== 'rh') return { erro: 'Acesso exclusivo do RH.' };
  if (!ctx.empresaId) return { erro: 'RH sem empresa vinculada.' };
  return { empresaId: ctx.empresaId };
}

async function lerSysConfig(sb: any, empresaId: string): Promise<{ sysConfig: any; nome: string } | Falha> {
  // `empresas` não tem coluna empresa_id: sob tenantDb a leitura vai pelo `raw`
  // (o filtro por tenant aqui é o próprio `.eq('id', empresaId)`).
  const base = sb?.raw || sb;
  const { data, error } = await base.from('empresas').select('nome, sys_config').eq('id', empresaId).maybeSingle();
  if (error) return { success: false, error: `não foi possível ler a configuração: ${error.message}` };
  if (!data) return { success: false, error: 'Empresa não encontrada.' };
  return { sysConfig: data.sys_config || {}, nome: data.nome || '' };
}

/** Módulo contratado + programa configurado, ou a razão de não estar. */
async function programa(sb: any, empresaId: string): Promise<{ cfg: ConfigProntidaoLideranca; sysConfig: any; nome: string } | Falha> {
  const lido = await lerSysConfig(sb, empresaId);
  if ('error' in lido) return lido;
  const gate = canUseModulo(lido.sysConfig, MODULOS.PRONTIDAO_LIDERANCA);
  if (!gate.allowed) return { success: false, error: gate.message || 'Módulo não contratado.', code: gate.code };
  const cfg = lerConfigProntidao(lido.sysConfig);
  if (!cfg) return { success: false, error: 'O mapeamento de liderança ainda não foi configurado para esta empresa.', code: 'PROGRAMA_NAO_CONFIGURADO' };
  return { cfg, sysConfig: lido.sysConfig, nome: lido.nome };
}

/**
 * Render + Storage + link assinado (molde `_exportarPDF` do ranking). O PDF é
 * VIEW do que a agregação calculou agora — por isso o nome carrega o instante.
 */
async function _exportar(sb: any, empresaId: string, alvo: { tipo: 'parecer'; colaboradorId: string } | { tipo: 'consolidado' }) {
  try {
    const p = await programa(sb, empresaId);
    if ('error' in p) return p;
    let buffer: Buffer;
    let sufixo: string;
    if (alvo.tipo === 'parecer') {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(alvo.colaboradorId)) return { success: false as const, error: 'Colaborador inválido.' };
      const r = await carregarParecer(sb, empresaId, alvo.colaboradorId, p.cfg);
      if ('indisponivel' in r) return { success: false as const, error: r.indisponivel, code: 'PARECER_INDISPONIVEL' };
      const { renderParecerPDF } = await import('@/lib/prontidao-lideranca/parecer-pdf');
      buffer = await renderParecerPDF({ empresaNome: p.nome, parecer: r, competencias: r.linha.posicao.competencias.map((c) => c.competencia) });
      sufixo = `parecer-${alvo.colaboradorId}`;
    } else {
      const data = await agregarProntidaoLideranca(sb, empresaId, p.cfg);
      const { renderConsolidadoPDF } = await import('@/lib/prontidao-lideranca/parecer-pdf');
      buffer = await renderConsolidadoPDF({ empresaNome: p.nome, data });
      sufixo = 'consolidado';
    }
    const path = `final/prontidao-lideranca/${empresaId}-${sufixo}-${Date.now()}.pdf`;
    const up = await sb.storage.from('conteudos').upload(path, buffer, { contentType: 'application/pdf', upsert: true });
    if (up.error) return { success: false as const, error: `Falha ao salvar PDF: ${up.error.message}` };
    const signed = await sb.storage.from('conteudos').createSignedUrl(path, 60 * 30);
    if (signed.error || !signed.data?.signedUrl) return { success: false as const, error: 'Falha ao gerar link do PDF.' };
    return { success: true as const, url: signed.data.signedUrl as string };
  } catch (e: any) {
    return { success: false as const, error: e?.message || 'Erro ao gerar o PDF.' };
  }
}

async function _get(sb: any, empresaId: string) {
  try {
    const p = await programa(sb, empresaId);
    if ('error' in p) return p;
    const data = await agregarProntidaoLideranca(sb, empresaId, p.cfg);
    return { success: true as const, data };
  } catch (e: any) {
    return { success: false as const, error: e?.message || 'Erro ao calcular a prontidão.' };
  }
}

async function _parecer(sb: any, empresaId: string, colaboradorId: string) {
  try {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(colaboradorId || ''))) {
      return { success: false as const, error: 'Colaborador inválido.' };
    }
    const p = await programa(sb, empresaId);
    if ('error' in p) return p;
    const r = await carregarParecer(sb, empresaId, colaboradorId, p.cfg);
    if ('indisponivel' in r) return { success: false as const, error: r.indisponivel, code: 'PARECER_INDISPONIVEL' };
    return { success: true as const, data: r };
  } catch (e: any) {
    return { success: false as const, error: e?.message || 'Erro ao montar o parecer.' };
  }
}

// ── RH self-service (empresa da sessão) ───────────────────────────────────────

export async function getProntidaoLideranca() {
  const g = await ctxRh(); if ('erro' in g) return { success: false as const, error: g.erro };
  // tenantDb, não o client cru: o escopo é a empresa da sessão e o filtro vai
  // em toda leitura de tabela de tenant por construção (regra do CLAUDE.md).
  return _get(tenantDb(g.empresaId), g.empresaId);
}

export async function getParecerLideranca(colaboradorId: string) {
  const g = await ctxRh(); if ('erro' in g) return { success: false as const, error: g.erro };
  return _parecer(tenantDb(g.empresaId), g.empresaId, colaboradorId);
}

// ── Preview e configuração do admin (empresa da rota) ─────────────────────────

export async function getProntidaoLiderancaAdmin(empresaId: string) {
  const sb = await requireEmpresaSupabase(empresaId, 'admin.access', 'getProntidaoLiderancaAdmin');
  return _get(sb, empresaId);
}

export async function getParecerLiderancaAdmin(empresaId: string, colaboradorId: string) {
  const sb = await requireEmpresaSupabase(empresaId, 'admin.access', 'getParecerLiderancaAdmin');
  return _parecer(sb, empresaId, colaboradorId);
}

/** Tudo que a aba de configuração precisa: estado atual, cargos elegíveis, turmas e pessoas (para escolher exemplares). */
export async function getConfigProntidaoAdmin(empresaId: string) {
  const sb = await requireEmpresaSupabase(empresaId, 'admin.access', 'getConfigProntidaoAdmin');
  try {
    const lido = await lerSysConfig(sb, empresaId);
    if ('error' in lido) return lido;
    const contratado = canUseModulo(lido.sysConfig, MODULOS.PRONTIDAO_LIDERANCA).allowed;
    const cfg = lerConfigProntidao(lido.sysConfig);
    const [cargos, turmas, pessoas] = await Promise.all([
      carregarCargosParaValidacao(sb, empresaId),
      listarTurmasDoTenant(sb, empresaId),
      carregarPopulacao(sb, empresaId, { cargo_alvo: '', exemplares: [], escopo: { tipo: 'empresa_inteira' }, um_por_dia: true, corte_nota: 3, banda: 0.33 }),
    ]);
    const validacao = cfg
      ? validarConfigProntidao(cfg, { cargos, cargosDaPopulacao: pessoas.map((p) => p.cargo || ''), colaboradorIdsDoTenant: new Set(pessoas.map((p) => p.id)) })
      : null;
    return {
      success: true as const,
      contratado,
      cfg,
      validacao,
      cargos: cargos.filter((c) => c.temGabarito || c.top5.length),
      turmas: (turmas || []).map((t: any) => ({ id: t.id, nome: t.nome, status: t.status })),
      pessoas: pessoas.map((p) => ({ id: p.id, nome: p.nome, cargo: p.cargo })),
    };
  } catch (e: any) {
    return { success: false as const, error: e?.message || 'Erro ao carregar a configuração.' };
  }
}

/**
 * Grava `sys_config.prontidao_lideranca` — read-modify-write do objeto inteiro
 * (padrão de `actions/perfil-externo.ts`). Fail-closed: configuração inválida
 * não é gravada, e os erros voltam nomeados.
 */
export async function salvarConfigProntidaoAdmin(empresaId: string, cfgRaw: unknown) {
  const sb = await requireEmpresaSupabase(empresaId, 'settings.company.manage', 'salvarConfigProntidaoAdmin');
  try {
    const cfg = lerConfigProntidao({ [CHAVE_CONFIG]: cfgRaw });
    if (!cfg) return { success: false as const, error: 'Informe o cargo-alvo.', erros: ['Informe o cargo-alvo.'] };
    const [cargos, pessoas] = await Promise.all([carregarCargosParaValidacao(sb, empresaId), carregarPopulacao(sb, empresaId, cfg)]);
    const validacao = validarConfigProntidao(cfg, {
      cargos, cargosDaPopulacao: pessoas.map((p) => p.cargo || ''), colaboradorIdsDoTenant: new Set(pessoas.map((p) => p.id)),
    });
    if (!validacao.ok) return { success: false as const, error: validacao.erros[0], erros: validacao.erros, avisos: validacao.avisos };
    const lido = await lerSysConfig(sb, empresaId);
    if ('error' in lido) return lido;
    const merged = { ...(lido.sysConfig || {}), [CHAVE_CONFIG]: cfg };
    const { error } = await sb.from('empresas').update({ sys_config: merged }).eq('id', empresaId);
    if (error) return { success: false as const, error: error.message };
    return { success: true as const, cfg, avisos: validacao.avisos };
  } catch (e: any) {
    return { success: false as const, error: e?.message || 'Erro ao salvar a configuração.' };
  }
}

/** Liga/desliga o módulo em `sys_config.modulos.prontidao_lideranca`. */
export async function setModuloProntidaoAdmin(empresaId: string, ligado: boolean) {
  const sb = await requireEmpresaSupabase(empresaId, 'settings.company.manage', 'setModuloProntidaoAdmin');
  try {
    const lido = await lerSysConfig(sb, empresaId);
    if ('error' in lido) return lido;
    const modulos = { ...((lido.sysConfig || {}).modulos || {}), [MODULOS.PRONTIDAO_LIDERANCA]: ligado === true };
    const { error } = await sb.from('empresas').update({ sys_config: { ...(lido.sysConfig || {}), modulos } }).eq('id', empresaId);
    if (error) return { success: false as const, error: error.message };
    return { success: true as const, contratado: ligado === true };
  } catch (e: any) {
    return { success: false as const, error: e?.message || 'Erro ao alterar o módulo.' };
  }
}

/** Calibragem: onde o instrumento coloca os líderes de referência. */
export async function getCalibragemAdmin(empresaId: string) {
  const sb = await requireEmpresaSupabase(empresaId, 'admin.access', 'getCalibragemAdmin');
  try {
    const p = await programa(sb, empresaId);
    if ('error' in p) return p;
    const data = await carregarCalibragem(sb, empresaId, p.cfg);
    return { success: true as const, data };
  } catch (e: any) {
    return { success: false as const, error: e?.message || 'Erro ao calcular a calibragem.' };
  }
}

// ── PDF: parecer individual e consolidado da equipe ───────────────────────────

export async function exportarParecerPDF(colaboradorId: string) {
  const g = await ctxRh(); if ('erro' in g) return { success: false as const, error: g.erro };
  return _exportar(tenantDb(g.empresaId), g.empresaId, { tipo: 'parecer', colaboradorId });
}

export async function exportarParecerPDFAdmin(empresaId: string, colaboradorId: string) {
  const sb = await requireEmpresaSupabase(empresaId, 'admin.access', 'exportarParecerPDFAdmin');
  return _exportar(sb, empresaId, { tipo: 'parecer', colaboradorId });
}

export async function exportarConsolidadoPDF() {
  const g = await ctxRh(); if ('erro' in g) return { success: false as const, error: g.erro };
  return _exportar(tenantDb(g.empresaId), g.empresaId, { tipo: 'consolidado' });
}

export async function exportarConsolidadoPDFAdmin(empresaId: string) {
  const sb = await requireEmpresaSupabase(empresaId, 'admin.access', 'exportarConsolidadoPDFAdmin');
  return _exportar(sb, empresaId, { tipo: 'consolidado' });
}
