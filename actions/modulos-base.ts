'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { requireAdminAction } from '@/lib/auth/action-context';
import { callAI } from '@/actions/ai-client';
import { getModelForTask } from '@/lib/ai-tasks';
import {
  SYSTEM_AUTOR,
  montarUserPrompt,
  extractCorpo,
  validarCorpo,
  type Nivel,
} from '@/lib/modulo-base-autor';
import { persistirModuloDeManuscrito, LIMITE_FONTE_MANUSCRITO } from '@/lib/manuscrito-modulos';
import {
  COLS_MODULO as COLS,
  SYSTEM_AUDITOR,
  auditarModuloCore,
  auditarModulosCore,
  carregarCompetenciaBase,
  carregarCompetenciaEmpresa,
  carregarCompetenciaDoModulo,
} from '@/lib/modulo-base-auditor';
import { chamarIAComRetry } from '@/lib/modulo-base-autor';
import { refinarModuloCore } from '@/lib/modulo-base-refino';

// ── Tipos ─────────────────────────────────────────────────────────────────────

type Status = 'rascunho' | 'revisao' | 'publicado' | 'obsoleto';
type Locale = 'pt-BR' | 'pt-PT' | 'es-ES' | 'en-US';


const NIVEIS: Nivel[] = ['N1', 'N2', 'N3', 'N4'];

function nivelGreater(a: Nivel, b: Nivel) {
  return NIVEIS.indexOf(a) > NIVEIS.indexOf(b);
}



// ════════════════════════════════════════════════════════════════════════════
// CRUD / listagem
// ════════════════════════════════════════════════════════════════════════════

export async function listarModulos(filtros: {
  status?: Status; locale?: Locale; competencia_base_id?: string;
  contexto_pedagogico?: string; busca?: string;
  // empresa_id: 'global' = só canônicos (empresa_id null); uuid = exclusivos dessa empresa; undefined = todos.
  empresa_id?: string; pilar?: string;
} = {}) {
  await requireAdminAction();
  const sb = createSupabaseAdmin();
  let q = sb.from('modulos_base_conteudo').select(COLS).order('updated_at', { ascending: false });
  if (filtros.status) q = q.eq('status', filtros.status);
  if (filtros.locale) q = q.eq('locale', filtros.locale);
  // Competência: valor uuid (catálogo global) filtra por id; valor nome (modelo da empresa)
  // filtra por nome resolvido nos DOIS catálogos (canônico competencia_base_id OU empresa competencia_id).
  if (filtros.competencia_base_id) {
    const cf = filtros.competencia_base_id;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cf)) {
      q = q.or(`competencia_base_id.eq.${cf},competencia_id.eq.${cf}`);
    } else {
      const empQ = sb.from('competencias').select('id').eq('nome', cf);
      if (filtros.empresa_id && filtros.empresa_id !== 'global') empQ.eq('empresa_id', filtros.empresa_id);
      const [{ data: cb }, { data: ce }] = await Promise.all([
        sb.from('competencias_base').select('id').eq('nome', cf),
        empQ,
      ]);
      const ors: string[] = [];
      const baseIds = (cb || []).map((c: any) => c.id);
      const empIds = (ce || []).map((c: any) => c.id);
      if (baseIds.length) ors.push(`competencia_base_id.in.(${baseIds.join(',')})`);
      if (empIds.length) ors.push(`competencia_id.in.(${empIds.join(',')})`);
      if (!ors.length) return { modulos: [] };
      q = q.or(ors.join(','));
    }
  }
  if (filtros.contexto_pedagogico) q = q.eq('contexto_pedagogico', filtros.contexto_pedagogico);
  if (filtros.busca) q = q.ilike('titulo', `%${filtros.busca}%`);
  if (filtros.empresa_id === 'global') q = q.is('empresa_id', null);
  else if (filtros.empresa_id) q = q.eq('empresa_id', filtros.empresa_id);

  // Pilar: resolve as competências (nos DOIS catálogos) com esse pilar e filtra
  // os módulos por competencia_base_id OU competencia_id. Aplica no SQL (antes do
  // limit) p/ não perder resultados.
  if (filtros.pilar) {
    const [{ data: cb }, { data: ce }] = await Promise.all([
      sb.from('competencias_base').select('id').eq('pilar', filtros.pilar),
      sb.from('competencias').select('id').eq('pilar', filtros.pilar),
    ]);
    const baseIds = (cb || []).map((c: any) => c.id);
    const empIds = (ce || []).map((c: any) => c.id);
    const ors: string[] = [];
    if (baseIds.length) ors.push(`competencia_base_id.in.(${baseIds.join(',')})`);
    if (empIds.length) ors.push(`competencia_id.in.(${empIds.join(',')})`);
    if (!ors.length) return { modulos: [] };
    q = q.or(ors.join(','));
  }

  const { data, error } = await q.limit(200);
  if (error) return { error: error.message };
  const modulos = (data || []) as any[];

  // Resolve o nome da competência dos DOIS catálogos (canônico + empresa), já que
  // módulos da empresa (competencia_id) não aparecem em competencias_base.
  const empresaIds = [...new Set(modulos.map((m) => m.competencia_id).filter(Boolean))];
  if (empresaIds.length) {
    const { data: emp } = await sb.from('competencias').select('id, nome').in('id', empresaIds);
    const nomeDe = new Map((emp || []).map((c: any) => [c.id, c.nome]));
    for (const m of modulos) if (m.competencia_id) m.competencia_nome = nomeDe.get(m.competencia_id) || null;
  }
  return { modulos };
}

/**
 * Opções dos filtros da lista de módulos: empresas que têm módulos (+ flag de
 * canônicos/global) e pilares presentes (resolvidos das competências referenciadas).
 */
export async function listarFiltrosModulos(empresaId?: string) {
  await requireAdminAction();
  const sb = createSupabaseAdmin();
  const { data: mods } = await sb.from('modulos_base_conteudo')
    .select('empresa_id, competencia_base_id, competencia_id');
  const allRows = (mods || []) as any[];

  // Lista de empresas (NÃO escopada — é o menu pra escolher no filtro).
  const empresaIds = [...new Set(allRows.map((m) => m.empresa_id).filter(Boolean))];
  const hasGlobal = allRows.some((m) => !m.empresa_id);
  let empresas: { id: string; nome: string }[] = [];
  if (empresaIds.length) {
    const { data: emp } = await sb.from('empresas').select('id, nome').in('id', empresaIds);
    empresas = ((emp || []) as any[]).sort((a, b) => String(a.nome).localeCompare(String(b.nome)));
  }

  // Empresa específica: pilares + competências vêm do MODELO dela (tabela competencias),
  // NÃO do catálogo global (competencias_base) nem derivado dos módulos. Dedup por nome
  // (a tabela é nível-descritor, com linhas dup por cargo); alfabético. O id do option é
  // o nome — listarModulos filtra por nome nesse caso (casa nos 2 catálogos).
  if (empresaId && empresaId !== 'global') {
    const { data: comps } = await sb.from('competencias')
      .select('nome, pilar')
      .eq('empresa_id', empresaId);
    const seen = new Set<string>();
    const competencias: { id: string; nome: string; pilar: string | null }[] = [];
    const pilares = new Set<string>();
    for (const c of (comps || []) as any[]) {
      if (c.nome && !seen.has(c.nome)) { seen.add(c.nome); competencias.push({ id: c.nome, nome: c.nome, pilar: c.pilar ?? null }); }
      if (c.pilar) pilares.add(c.pilar);
    }
    competencias.sort((a, b) => a.nome.localeCompare(b.nome));
    return { empresas, hasGlobal, pilares: [...pilares].sort((a, b) => a.localeCompare(b)), competencias };
  }

  // Sem empresa (Todas) ou 'global': pilares resolvidos dos módulos (canônico + empresa).
  const rows = empresaId === 'global' ? allRows.filter((m) => !m.empresa_id) : allRows;
  const baseIds = [...new Set(rows.map((m) => m.competencia_base_id).filter(Boolean))];
  const compIds = [...new Set(rows.map((m) => m.competencia_id).filter(Boolean))];
  const pilares = new Set<string>();
  if (baseIds.length) {
    const { data: cb } = await sb.from('competencias_base').select('pilar').in('id', baseIds);
    for (const c of (cb || []) as any[]) if (c.pilar) pilares.add(c.pilar);
  }
  if (compIds.length) {
    const { data: ce } = await sb.from('competencias').select('pilar').in('id', compIds);
    for (const c of (ce || []) as any[]) if (c.pilar) pilares.add(c.pilar);
  }
  return { empresas, hasGlobal, pilares: [...pilares].sort((a, b) => a.localeCompare(b)), competencias: [] };
}

// ── Cobertura por descritor (matriz competência × descritor × módulos) ──────
const _STOP = new Set(['para', 'como', 'sobre', 'mais', 'pela', 'pelo', 'entre', 'isso', 'esta', 'este', 'essa', 'esse', 'dos', 'das', 'com', 'sem', 'que', 'capacidade']);
const _norm = (s: string) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const _toks = (s: string) => new Set(_norm(s).split(/[^a-z0-9]+/g).filter((t) => t.length >= 4 && !_STOP.has(t)));

/**
 * Matriz de COBERTURA por descritor para uma empresa: pra cada (competência ×
 * descritor) do modelo dela, quantos módulos-base existem, o status e a melhor
 * nota da auditoria. Casa o `descritor` (texto livre) de cada módulo ao descritor
 * do modelo por overlap de tokens (o módulo aponta só pra competência; o sub-tema
 * fica no texto). Módulo sem match claro vai pra "(sem descritor claro)".
 */
export async function coberturaPorDescritor(empresaId: string, opts: { pilar?: string } = {}) {
  await requireAdminAction('content.manage');
  if (!empresaId) return { error: 'empresaId obrigatório' as const };
  try {
  const sb = createSupabaseAdmin();

  // 1) Modelo de competências (a tabela tem linhas DUP por cargo → dedup por cod_desc).
  let q = sb.from('competencias').select('cod_comp, nome, nome_curto, pilar, cod_desc, descritor_completo').eq('empresa_id', empresaId);
  if (opts.pilar) q = q.eq('pilar', opts.pilar);
  const { data: rows } = await q;
  const pilares = [...new Set((rows || []).map((r: any) => r.pilar).filter(Boolean))].sort();

  const vistos = new Set<string>();
  // descritor = NOME_CURTO (rótulo oficial e o que o módulo grava); longo = descrição (fallback de match p/ módulos legados).
  const grupos = new Map<string, { cod_comp: string; nome: string; pilar: string; descritores: { cod_desc: string; descritor: string; longo: string }[] }>();
  for (const r of (rows || []) as any[]) {
    const dk = r.cod_desc || `${r.nome}|${String(r.descritor_completo).slice(0, 60)}`;
    if (vistos.has(dk)) continue;
    vistos.add(dk);
    const ck = r.cod_comp || r.nome;
    if (!grupos.has(ck)) grupos.set(ck, { cod_comp: r.cod_comp, nome: r.nome, pilar: r.pilar, descritores: [] });
    grupos.get(ck)!.descritores.push({ cod_desc: r.cod_desc, descritor: r.nome_curto || r.descritor_completo, longo: r.descritor_completo });
  }

  // 2) Módulos da empresa (apontam pra competencia_id) + resolve o nome da competência.
  const { data: mods } = await sb.from('modulos_base_conteudo')
    .select('id, competencia_id, descritor, titulo, status, auditoria_ia')
    .eq('empresa_id', empresaId).not('competencia_id', 'is', null);
  const compIds = [...new Set((mods || []).map((m: any) => m.competencia_id))];
  const nomeDe = new Map<string, string>();
  if (compIds.length) {
    const { data: cb } = await sb.from('competencias').select('id, nome').in('id', compIds);
    for (const c of (cb || []) as any[]) nomeDe.set(c.id, c.nome);
  }

  // 3) Casa cada módulo ao melhor descritor DA SUA competência (overlap de tokens).
  const cells = new Map<string, any[]>(); // `${comp}|${cod_desc}` -> módulos
  const SEM = '(sem descritor claro)';
  for (const m of (mods || []) as any[]) {
    const compNome = nomeDe.get(m.competencia_id);
    const grupo = [...grupos.values()].find((g) => g.nome === compNome);
    if (!grupo) continue; // competência fora do filtro de pilar
    // 1º match EXATO pelo nome_curto (o módulo agora grava o nome_curto oficial).
    // Fallback: overlap de tokens contra a descrição longa (módulos legados que
    // ainda tenham a descrição no campo descritor).
    let best = SEM;
    const mNorm = _norm(m.descritor);
    const exato = grupo.descritores.find((d) => _norm(d.descritor) === mNorm);
    if (exato) {
      best = exato.cod_desc;
    } else {
      const mt = _toks(m.descritor);
      let bestHit = 0;
      for (const d of grupo.descritores) {
        const dt = _toks(`${d.descritor} ${d.longo}`);
        let hit = 0; for (const t of mt) if (dt.has(t)) hit++;
        if (hit > bestHit) { bestHit = hit; best = d.cod_desc; }
      }
    }
    const key = `${compNome}|${best}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key)!.push({ id: m.id, titulo: m.titulo, status: m.status, nota: Number(m?.auditoria_ia?.nota) || null });
  }

  // 4) Monta a matriz.
  const competencias = [...grupos.values()].sort((a, b) => String(a.cod_comp).localeCompare(String(b.cod_comp))).map((g) => {
    const linhas = g.descritores.map((d) => {
      const ms = cells.get(`${g.nome}|${d.cod_desc}`) || [];
      return resumoCelula(d.cod_desc, d.descritor, ms);
    });
    const semClaro = cells.get(`${g.nome}|${SEM}`) || [];
    if (semClaro.length) linhas.push(resumoCelula(SEM, 'módulos cujo sub-tema não casou com nenhum descritor do modelo', semClaro));
    return { cod_comp: g.cod_comp, nome: g.nome, pilar: g.pilar, descritores: linhas };
  });

  const totalCels = competencias.reduce((s, c) => s + c.descritores.filter((d: any) => d.cod_desc !== SEM).length, 0);
  const cobertas = competencias.reduce((s, c) => s + c.descritores.filter((d: any) => d.cod_desc !== SEM && d.publicados > 0).length, 0);
  return { ok: true as const, competencias, pilares, resumo: { totalCels, cobertas, modulos: (mods || []).length } };
  } catch (err: any) {
    console.error('[coberturaPorDescritor]', err);
    return { error: String(err?.message || 'Erro ao montar a cobertura') };
  }
}

function resumoCelula(cod_desc: string, descritor: string, ms: any[]) {
  const notas = ms.map((x) => x.nota).filter((n) => n != null) as number[];
  return {
    cod_desc, descritor,
    total: ms.length,
    publicados: ms.filter((x) => x.status === 'publicado').length,
    rascunhos: ms.filter((x) => x.status === 'rascunho' || x.status === 'revisao').length,
    melhorNota: notas.length ? Math.max(...notas) : null,
    modulos: ms.slice(0, 12),
  };
}

export async function obterModulo(id: string) {
  await requireAdminAction();
  if (!id) return { error: 'id obrigatório' };
  const sb = createSupabaseAdmin();
  const { data, error } = await sb.from('modulos_base_conteudo').select(COLS).eq('id', id).maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: 'Módulo não encontrado' };
  // Módulo da empresa: resolve o nome da competência (não está em competencias_base).
  if ((data as any).competencia_id) {
    const { data: c } = await sb.from('competencias').select('nome').eq('id', (data as any).competencia_id).maybeSingle();
    (data as any).competencia_nome = c?.nome || null;
  }
  return { modulo: data };
}

export async function obterGrupo(grupo_id: string) {
  await requireAdminAction();
  if (!grupo_id) return { error: 'grupo_id obrigatório' };
  const sb = createSupabaseAdmin();
  const { data, error } = await sb.from('modulos_base_conteudo')
    .select('id, locale, status, versao, updated_at, published_at')
    .eq('grupo_id', grupo_id)
    .order('locale');
  if (error) return { error: error.message };
  return { variantes: data || [] };
}

export async function listarCompetenciasBase() {
  await requireAdminAction();
  const sb = createSupabaseAdmin();
  const { data, error } = await sb.from('competencias_base')
    .select('id, segmento, cod_comp, nome, pilar, descritor_completo')
    .order('segmento').order('pilar').order('nome');
  if (error) return { error: error.message };
  return { competencias: data || [] };
}

// ════════════════════════════════════════════════════════════════════════════
// Salvar (INSERT ou UPDATE)
// ════════════════════════════════════════════════════════════════════════════

export async function salvarModulo(payload: any) {
  const ctx = await requireAdminAction('content.manage');
  // Módulo é chaveado pela competência CANÔNICA ou pela da EMPRESA (extração escopada).
  if (!payload?.competencia_base_id && !payload?.competencia_id) return { error: 'competência (canônica ou da empresa) obrigatória' };
  if (!payload?.nivel_entrada || !payload?.nivel_destino) return { error: 'níveis obrigatórios' };
  if (!nivelGreater(payload.nivel_destino, payload.nivel_entrada)) {
    return { error: 'nivel_destino deve ser maior que nivel_entrada' };
  }
  if (!payload?.titulo || !payload?.finalidade) return { error: 'titulo e finalidade obrigatórios' };

  const sb = createSupabaseAdmin();
  const base = {
    competencia_base_id: payload.competencia_id ? null : payload.competencia_base_id,
    competencia_id: payload.competencia_id || null,
    locale: payload.locale || 'pt-BR',
    nivel_entrada: payload.nivel_entrada,
    nivel_destino: payload.nivel_destino,
    titulo: payload.titulo,
    descritor: payload.descritor || null,
    finalidade: payload.finalidade,
    contexto_pedagogico: payload.contexto_pedagogico || null,
    tags: Array.isArray(payload.tags) ? payload.tags : [],
    conteudo_central: payload.conteudo_central || {},
    conteudo_aplicavel: payload.conteudo_aplicavel || {},
    guarda_corpos: payload.guarda_corpos || {},
    adaptacao_por_formato: payload.adaptacao_por_formato || {},
  };

  if (payload.id) {
    // UPDATE — só pode editar quando status = rascunho ou revisão.
    const { data: atual } = await sb.from('modulos_base_conteudo').select('status').eq('id', payload.id).maybeSingle();
    if (!atual) return { error: 'Módulo não encontrado' };
    if (atual.status !== 'rascunho' && atual.status !== 'revisao') {
      return { error: `Não é possível editar um módulo ${atual.status}` };
    }
    const { error } = await sb.from('modulos_base_conteudo').update(base).eq('id', payload.id);
    if (error) return { error: error.message };
    return { id: payload.id };
  }

  // INSERT
  const insertRow: any = {
    ...base,
    grupo_id: payload.grupo_id || undefined, // default gen_random_uuid() do banco
    created_by: ctx.email,
  };
  const { data, error } = await sb.from('modulos_base_conteudo').insert(insertRow).select('id').single();
  if (error) return { error: error.message };
  return { id: data.id };
}

// ════════════════════════════════════════════════════════════════════════════
// Workflow de status
// ════════════════════════════════════════════════════════════════════════════

// Núcleo de submissão pra revisão SEM guard (reusável por batch). Move pra revisao
// e dispara a auditoria. Usa auditarModuloCore (lib, sem guard — roda em qq contexto).
async function _submeterRevisaoCore(sb: ReturnType<typeof createSupabaseAdmin>, id: string) {
  const { data } = await sb.from('modulos_base_conteudo').select('status, conteudo_central, conteudo_aplicavel, guarda_corpos, adaptacao_por_formato').eq('id', id).maybeSingle();
  if (!data) return { error: 'Módulo não encontrado' };
  if (data.status !== 'rascunho' && data.status !== 'revisao') {
    return { error: `Status atual é ${data.status} — só é possível submeter rascunho ou re-submeter em revisão` };
  }
  const erros = validarCorpo(data);
  if (erros.length) return { error: 'Validação estrutural falhou', detalhes: erros };

  const { error: errStatus } = await sb.from('modulos_base_conteudo').update({ status: 'revisao' }).eq('id', id);
  if (errStatus) return { error: errStatus.message };

  // Padrão Dual-IA: ao submeter, dispara automaticamente a IA-auditora.
  const auditResult = await auditarModuloCore(sb, id);
  if ('error' in auditResult && auditResult.error) {
    return { ok: true, aviso_auditoria: auditResult.error };
  }
  return { ok: true, auditoria: (auditResult as any).auditoria };
}

export async function submeterRevisao(id: string) {
  await requireAdminAction('content.manage');
  return _submeterRevisaoCore(createSupabaseAdmin(), id);
}

// Núcleo de publicação SEM guard (reusável por batch). email = quem publica.
async function _aprovarPublicarCore(sb: ReturnType<typeof createSupabaseAdmin>, email: string, id: string) {
  const { data } = await sb.from('modulos_base_conteudo')
    .select('status, versao, auditoria_ia, auditado_em_versao, descritor, titulo')
    .eq('id', id).maybeSingle();
  if (!data) return { error: 'Módulo não encontrado' };
  if (data.status !== 'revisao') return { error: `Status atual é ${data.status} — só é possível publicar em revisão` };

  // Dual-IA: a publicação exige aprovação da IA-auditora pra ESTA versão.
  if (!data.auditoria_ia) {
    return { error: 'Auditoria da IA pendente. Submeta pra revisão (dispara a auditoria) ou clique em "Reauditar".' };
  }
  if (data.auditado_em_versao !== data.versao) {
    return { error: 'Módulo foi editado após a última auditoria. Reauditar antes de publicar.' };
  }
  const veredito = (data.auditoria_ia as any)?.veredito;
  if (veredito === 'reprovado') {
    return { error: 'IA-auditora reprovou. Corrija os problemas listados e submeta novamente pra reauditar.' };
  }
  if (veredito !== 'aprovado' && veredito !== 'aprovado_com_ressalvas') {
    return { error: 'Veredito da auditoria inválido — reauditar.' };
  }

  const { error } = await sb.from('modulos_base_conteudo')
    .update({ status: 'publicado', published_by: email, published_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { error: error.message };

  // Embedding do descritor p/ a seleção semântica na trilha (best-effort, não bloqueia).
  try {
    const { embedText } = await import('@/lib/embeddings');
    const emb = await embedText(`${data.descritor || ''} ${data.titulo || ''}`.trim());
    if (emb?.vector) await sb.from('modulos_base_conteudo').update({ descritor_embedding: emb.vector }).eq('id', id);
  } catch (e: any) { console.warn('[aprovarPublicar] embedding falhou:', e?.message); }

  return { ok: true };
}

export async function aprovarPublicar(id: string) {
  const ctx = await requireAdminAction('content.manage');
  return _aprovarPublicarCore(createSupabaseAdmin(), (ctx as any).email, id);
}

// ── Ações em LOTE (lista de módulos, seleção múltipla) ──────────────────────
async function _emLote<T>(ids: string[], fn: (id: string) => Promise<any>, conc = 4) {
  const alvo = [...new Set((ids || []).filter(Boolean))];
  let ok = 0; const falhas: string[] = [];
  for (let i = 0; i < alvo.length; i += conc) {
    const r = await Promise.all(alvo.slice(i, i + conc).map((id) => fn(id).catch((e: any) => ({ error: e?.message || 'erro' }))));
    r.forEach((res, k) => { if ((res as any)?.ok) ok++; else falhas.push(`${String(alvo[i + k]).slice(0, 8)}: ${(res as any)?.error || 'falhou'}`); });
  }
  return { ok: true, processados: ok, total: alvo.length, falhas: falhas.slice(0, 8) };
}

export async function submeterRevisaoEmLote(ids: string[]) {
  await requireAdminAction('content.manage');
  const sb = createSupabaseAdmin();
  if (!ids?.length) return { error: 'Nenhum módulo selecionado' };
  return _emLote(ids, (id) => _submeterRevisaoCore(sb, id));
}

export async function aprovarPublicarEmLote(ids: string[]) {
  const ctx = await requireAdminAction('content.manage');
  const sb = createSupabaseAdmin();
  if (!ids?.length) return { error: 'Nenhum módulo selecionado' };
  return _emLote(ids, (id) => _aprovarPublicarCore(sb, (ctx as any).email, id));
}

export async function marcarObsoleto(id: string, substitui_por?: string) {
  await requireAdminAction('content.manage');
  const sb = createSupabaseAdmin();
  const update: any = { status: 'obsoleto' };
  if (substitui_por) update.substitui_modulo_id = substitui_por;
  const { error } = await sb.from('modulos_base_conteudo').update(update).eq('id', id);
  if (error) return { error: error.message };
  return { ok: true };
}

export async function excluirModulo(id: string) {
  await requireAdminAction('content.manage');
  if (!id) return { error: 'id obrigatório' };
  const sb = createSupabaseAdmin();
  const { data } = await sb.from('modulos_base_conteudo').select('status, titulo').eq('id', id).maybeSingle();
  if (!data) return { error: 'Módulo não encontrado' };
  if (data.status === 'publicado') {
    return { error: 'Marque como obsoleto primeiro antes de excluir um módulo publicado (proteção contra apagar conteúdo em uso pelo engine).' };
  }
  // FK substitui_modulo_id já tem ON DELETE SET NULL — não trava se outro
  // módulo apontar pra este (a cadeia de versão fica órfã, mas íntegra).
  const { error } = await sb.from('modulos_base_conteudo').delete().eq('id', id);
  if (error) return { error: error.message };
  return { ok: true };
}

export async function setPreferido(id: string, preferido: boolean) {
  await requireAdminAction('content.manage');
  const sb = createSupabaseAdmin();
  // Se setando true, primeiro zera os demais do mesmo grupo (índice partial garante consistência)
  if (preferido) {
    const { data: m } = await sb.from('modulos_base_conteudo').select('grupo_id').eq('id', id).maybeSingle();
    if (m?.grupo_id) {
      await sb.from('modulos_base_conteudo').update({ preferido: false }).eq('grupo_id', m.grupo_id);
    }
  }
  const { error } = await sb.from('modulos_base_conteudo').update({ preferido }).eq('id', id);
  if (error) return { error: error.message };
  return { ok: true };
}

// ════════════════════════════════════════════════════════════════════════════
// i18n — criar tradução
// ════════════════════════════════════════════════════════════════════════════

export async function criarTraducao(modulo_origem_id: string, novo_locale: Locale) {
  const ctx = await requireAdminAction('content.manage');
  const sb = createSupabaseAdmin();
  const { data: origem } = await sb.from('modulos_base_conteudo').select(COLS).eq('id', modulo_origem_id).maybeSingle();
  if (!origem) return { error: 'Módulo de origem não encontrado' };

  // Não pode haver duas variantes do mesmo grupo+locale.
  const { count } = await sb.from('modulos_base_conteudo')
    .select('id', { count: 'exact', head: true })
    .eq('grupo_id', origem.grupo_id)
    .eq('locale', novo_locale);
  if ((count || 0) > 0) return { error: `Já existe uma variante ${novo_locale} neste grupo` };

  const insertRow = {
    grupo_id: origem.grupo_id,
    locale: novo_locale,
    competencia_base_id: origem.competencia_base_id,
    competencia_id: origem.competencia_id,
    nivel_entrada: origem.nivel_entrada,
    nivel_destino: origem.nivel_destino,
    titulo: origem.titulo,
    finalidade: origem.finalidade,
    contexto_pedagogico: origem.contexto_pedagogico,
    tags: origem.tags,
    conteudo_central: origem.conteudo_central,    // copia conteúdo da origem como ponto de partida
    conteudo_aplicavel: origem.conteudo_aplicavel,
    guarda_corpos: origem.guarda_corpos,
    adaptacao_por_formato: origem.adaptacao_por_formato,
    created_by: ctx.email,
    status: 'rascunho' as Status,
  };
  const { data, error } = await sb.from('modulos_base_conteudo').insert(insertRow).select('id').single();
  if (error) return { error: error.message };
  return { id: data.id };
}



export async function rascunharModuloBase(opts: {
  competencia_base_id: string;
  nivel_entrada: Nivel;
  nivel_destino: Nivel;
  locale: Locale;
  contexto_pedagogico?: string;
  modulo_referencia_id?: string;
}) {
  const ctx = await requireAdminAction('ai.audit.regenerate');
  if (!opts.competencia_base_id) return { error: 'competencia_base_id obrigatório' };
  if (!nivelGreater(opts.nivel_destino, opts.nivel_entrada)) {
    return { error: 'nivel_destino deve ser maior que nivel_entrada' };
  }

  const comp = await carregarCompetenciaBase(opts.competencia_base_id);
  if (!comp) return { error: 'Competência base não encontrada' };

  let referencia: any = null;
  if (opts.modulo_referencia_id) {
    const sb = createSupabaseAdmin();
    const { data } = await sb.from('modulos_base_conteudo').select(COLS).eq('id', opts.modulo_referencia_id).maybeSingle();
    referencia = data;
  }

  const userPrompt = montarUserPrompt(comp, opts.nivel_entrada, opts.nivel_destino, { contexto: opts.contexto_pedagogico, referencia });
  const model = await getModelForTask(null as any, 'modulo_base_autor');

  const corpo = await chamarIAComRetry(SYSTEM_AUTOR, userPrompt, model);
  if (!corpo) return { error: 'A IA não conseguiu gerar um módulo válido. Tente novamente.' };

  const erros = validarCorpo(corpo);
  if (erros.length) {
    console.warn('[rascunharModuloBase] validação parcial:', erros);
    // Persiste mesmo com avisos — o autor revisa.
  }

  const sb = createSupabaseAdmin();
  const insertRow = {
    grupo_id: referencia?.grupo_id || undefined,
    locale: opts.locale,
    competencia_base_id: opts.competencia_base_id,
    nivel_entrada: opts.nivel_entrada,
    nivel_destino: opts.nivel_destino,
    titulo: corpo?.titulo || `[Rascunho IA] ${comp.nome} ${opts.nivel_entrada}→${opts.nivel_destino}`.slice(0, 120),
    finalidade: (corpo?.finalidade || `Matéria-prima pedagógica para apoiar a transição ${opts.nivel_entrada}→${opts.nivel_destino} em "${comp.nome}".`).slice(0, 400),
    contexto_pedagogico: opts.contexto_pedagogico || null,
    tags: [],
    conteudo_central: corpo.conteudo_central,
    conteudo_aplicavel: corpo.conteudo_aplicavel,
    guarda_corpos: corpo.guarda_corpos,
    adaptacao_por_formato: corpo.adaptacao_por_formato,
    created_by: ctx.email,
    status: 'rascunho' as Status,
  };
  const { data, error } = await sb.from('modulos_base_conteudo').insert(insertRow).select('id, grupo_id').single();
  if (error) return { error: error.message };
  return { id: data.id, grupo_id: data.grupo_id, avisos: erros };
}

// ════════════════════════════════════════════════════════════════════════════
// Detectar metadados do cabeçalho do .docx (sem persistir nada)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Faz uma chamada curta à IA pra extrair Competência/Descritor/Nível/Locale/
 * Título/Finalidade do CABEÇALHO do template oficial Vertho dentro do .docx,
 * e tenta fazer match contra `competencias_base` pelo nome. Retorna sugestões
 * pra o frontend pré-preencher o modal antes do import definitivo.
 *
 * NÃO persiste nada. Usuário revisa e corrige antes de chamar `importarModuloDocx`.
 */
export async function detectarMetadadosDocx(opts: { arquivoBase64: string }) {
  await requireAdminAction('ai.audit.regenerate');
  if (!opts?.arquivoBase64) return { error: 'arquivoBase64 obrigatório' };

  let texto: string;
  try {
    const mammoth: any = await import('mammoth');
    const buffer = Buffer.from(opts.arquivoBase64, 'base64');
    const out = await mammoth.extractRawText({ buffer });
    texto = String(out?.value || '').trim();
    if (!texto) return { error: 'Não foi possível extrair texto do .docx' };
  } catch (e: any) {
    console.error('[detectarMetadadosDocx] mammoth:', e?.message);
    return { error: 'Falha ao processar o .docx' };
  }

  const sb = createSupabaseAdmin();
  const { data: comps } = await sb.from('competencias_base')
    .select('id, nome, segmento')
    .order('nome');

  const system = `Você analisa o cabeçalho de um template oficial Vertho de Módulo-Base de Conteúdo e extrai metadados.

Retorne APENAS JSON válido com a estrutura:
{
  "competencia_nome_detectado": "string ou null (nome exato que aparece no docx)",
  "competencia_match": { "id": "uuid ou null", "nome": "...", "confianca": 0.0 a 1.0 },
  "nivel_entrada": "N1|N2|N3|null",
  "nivel_destino": "N2|N3|N4|null",
  "locale": "pt-BR|pt-PT|es-ES|en-US|null",
  "titulo": "string ou null",
  "finalidade": "string ou null",
  "contexto_pedagogico": "string ou null"
}

REGRAS:
- "competencia_match.id" = id da lista oficial que bate semanticamente. Confiança <0.5 → use null.
- Se o docx só diz "Nível 1" (sem destino), assuma N1→N2; "Nível 2" → N2→N3; "Nível 3" → N3→N4.
- Locale: detecte pela língua do conteúdo; null se ambíguo.
- Não invente. Use null quando o campo não estiver claro.`;

  const compsListagem = (comps || []).slice(0, 200).map((c: any) => `- ${c.id} :: ${c.nome} (${c.segmento})`).join('\n');
  const user = `LISTA OFICIAL DE COMPETÊNCIAS (catálogo Vertho — escolha 1 ou null):
${compsListagem}

CABEÇALHO DO DOCX (primeiros 4000 chars):
${texto.slice(0, 4000)}`;

  const model = await getModelForTask(null as any, 'modulo_base_autor');
  const raw = await callAI(system, user, { model }, 800).catch((e: any) => { console.warn('[detectarMetadados] callAI:', e?.message); return ''; });
  if (!raw) return { error: 'Detecção falhou (sem resposta da IA)' };

  let det: any = null;
  const cleaned = String(raw).replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  const candidatos = [cleaned];
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (m) candidatos.push(m[0]);
  for (const c of candidatos) {
    try { const p = JSON.parse(c); if (p && typeof p === 'object') { det = p; break; } } catch { /* tenta próximo */ }
  }
  if (!det) return { error: 'Resposta inválida da IA' };

  return {
    ok: true,
    texto_chars: texto.length,
    sugestoes: {
      competencia_nome_detectado: det.competencia_nome_detectado || null,
      competencia_base_id: det.competencia_match?.id || null,
      competencia_nome_match: det.competencia_match?.nome || null,
      confianca: typeof det.competencia_match?.confianca === 'number' ? det.competencia_match.confianca : 0,
      nivel_entrada: det.nivel_entrada || null,
      nivel_destino: det.nivel_destino || null,
      locale: det.locale || null,
      titulo: det.titulo || null,
      finalidade: det.finalidade || null,
      contexto_pedagogico: det.contexto_pedagogico || null,
    },
  };
}

// ════════════════════════════════════════════════════════════════════════════
// Import de .docx → IA estrutura
// ════════════════════════════════════════════════════════════════════════════

export async function importarModuloDocx(opts: {
  arquivoBase64: string;
  competencia_base_id: string;
  nivel_entrada: Nivel;
  nivel_destino: Nivel;
  locale: Locale;
  contexto_pedagogico?: string;
}) {
  const ctx = await requireAdminAction('content.manage');
  if (!opts.arquivoBase64) return { error: 'arquivoBase64 obrigatório' };
  if (!opts.competencia_base_id) return { error: 'competencia_base_id obrigatório' };
  if (!nivelGreater(opts.nivel_destino, opts.nivel_entrada)) {
    return { error: 'nivel_destino deve ser maior que nivel_entrada' };
  }

  // Extrai texto via mammoth (dynamic import — lib pesada)
  let texto: string;
  try {
    const mammoth: any = await import('mammoth');
    const buffer = Buffer.from(opts.arquivoBase64, 'base64');
    const out = await mammoth.extractRawText({ buffer });
    texto = String(out?.value || '').trim();
    if (!texto) return { error: 'Não foi possível extrair texto do .docx' };
  } catch (e: any) {
    console.error('[importarModuloDocx] mammoth:', e?.message);
    return { error: 'Falha ao processar o .docx' };
  }

  const comp = await carregarCompetenciaBase(opts.competencia_base_id);
  if (!comp) return { error: 'Competência base não encontrada' };

  const userPrompt = montarUserPrompt(comp, opts.nivel_entrada, opts.nivel_destino, { contexto: opts.contexto_pedagogico, docxTexto: texto });
  const model = await getModelForTask(null as any, 'modulo_base_autor');
  const corpo = await chamarIAComRetry(SYSTEM_AUTOR, userPrompt, model);
  if (!corpo) return { error: 'A IA não conseguiu estruturar o conteúdo do .docx. Verifique o arquivo ou edite manualmente.' };

  const erros = validarCorpo(corpo);

  const sb = createSupabaseAdmin();
  const insertRow = {
    locale: opts.locale,
    competencia_base_id: opts.competencia_base_id,
    nivel_entrada: opts.nivel_entrada,
    nivel_destino: opts.nivel_destino,
    titulo: `[Importado docx] ${comp.nome} ${opts.nivel_entrada}→${opts.nivel_destino}`.slice(0, 120),
    finalidade: `Matéria-prima pedagógica importada de docx para a transição ${opts.nivel_entrada}→${opts.nivel_destino} em "${comp.nome}".`.slice(0, 400),
    contexto_pedagogico: opts.contexto_pedagogico || null,
    tags: ['importado-docx'],
    conteudo_central: corpo.conteudo_central,
    conteudo_aplicavel: corpo.conteudo_aplicavel,
    guarda_corpos: corpo.guarda_corpos,
    adaptacao_por_formato: corpo.adaptacao_por_formato,
    created_by: ctx.email,
    status: 'rascunho' as Status,
  };
  const { data, error } = await sb.from('modulos_base_conteudo').insert(insertRow).select('id, grupo_id').single();
  if (error) return { error: error.message };
  return { id: data.id, grupo_id: data.grupo_id, avisos: erros, textoExtraidoChars: texto.length };
}

// ════════════════════════════════════════════════════════════════════════════
// Extração de vídeo → Módulo-Base (matéria-prima). O texto-base extraído de um
// vídeo (YouTube/Vimeo/TED/LMS) entra no lugar do texto do .docx: a IA detecta
// a competência canônica + transição de nível e estrutura os 4 blocos. Resultado
// é sempre rascunho (passa pelo workflow Dual-IA). Alcance = global (empresa_id
// null) ou exclusivo de uma empresa.
// ════════════════════════════════════════════════════════════════════════════

/**
 * Detecta competência canônica (competencias_base) + transição de nível + locale
 * a partir do texto-base + título do vídeo. Mesma ideia de detectarMetadadosDocx,
 * mas a fonte é o conteúdo livre extraído (não há cabeçalho de template).
 */
async function detectarMetadadosDeTexto(textoBase: string, tituloVideo: string, localeHint?: string) {
  const sb = createSupabaseAdmin();
  const { data: comps } = await sb.from('competencias_base').select('id, nome, segmento, descricao').order('nome');
  const compsListagem = (comps || []).slice(0, 200).map((c: any) => `- ${c.id} :: ${c.nome} (${c.segmento})${c.descricao ? ' — ' + c.descricao : ''}`).join('\n');

  const system = `Você classifica um conteúdo pedagógico (extraído de um vídeo) contra o catálogo canônico de competências Vertho.

Retorne APENAS JSON válido:
{
  "competencia_match": { "id": "uuid da lista ou null", "confianca": 0.0 a 1.0 },
  "descritor": "sub-tema ESPECÍFICO que o conteúdo desenvolve dentro da competência (5-10 palavras), ou null",
  "nivel_entrada": "N1|N2|N3",
  "nivel_destino": "N2|N3|N4",
  "contexto_pedagogico": "rótulo curto slug ou null (máx. 80 chars; ex.: transversal, lideranca, educacao-infantil)",
  "titulo": "título interno do módulo (não é o título do vídeo) ou null",
  "finalidade": "1-2 frases: o que este módulo precisa permitir que a IA ensine"
}

REGRAS:
- "competencia_match.id" = a competência da lista que melhor representa o conteúdo. Confiança <0.4 → use null.
- "descritor" = o foco específico do conteúdo dentro da competência (ex.: "Aversão à perda e vieses na decisão sob risco"). NÃO é o nome da competência; é mais granular.
- Escolha a transição de nível mais provável que o conteúdo serve (default N1→N2 se incerto).
- Não invente. Use null quando não estiver claro.`;
  const user = `CATÁLOGO DE COMPETÊNCIAS (escolha 1 ou null):
${compsListagem}

TÍTULO DO VÍDEO: ${tituloVideo || '—'}

TEXTO-BASE EXTRAÍDO (primeiros 5000 chars):
${String(textoBase).slice(0, 5000)}`;

  const model = await getModelForTask(null as any, 'modulo_base_autor');
  const raw = await callAI(system, user, { model }, 800).catch(() => '');
  let det: any = null;
  const cleaned = String(raw || '').replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  for (const c of [cleaned, cleaned.match(/\{[\s\S]*\}/)?.[0] || '']) {
    if (!c) continue;
    try { const p = JSON.parse(c); if (p && typeof p === 'object') { det = p; break; } } catch { /* tenta próximo */ }
  }
  const niveisOk = (e: string, d: string) => NIVEIS.includes(e as Nivel) && NIVEIS.includes(d as Nivel) && nivelGreater(d as Nivel, e as Nivel);
  let nivel_entrada: Nivel = 'N1', nivel_destino: Nivel = 'N2';
  if (det && niveisOk(det.nivel_entrada, det.nivel_destino)) { nivel_entrada = det.nivel_entrada; nivel_destino = det.nivel_destino; }
  return {
    competencia_base_id: det?.competencia_match?.id || null,
    confianca: typeof det?.competencia_match?.confianca === 'number' ? det.competencia_match.confianca : 0,
    nivel_entrada, nivel_destino,
    contexto_pedagogico: det?.contexto_pedagogico || null,
    locale: (localeHint || 'pt-BR') as Locale,
    titulo: det?.titulo || null,
    descritor: det?.descritor || null,
    finalidade: det?.finalidade || null,
  };
}

interface MetaModulo {
  // Uma das duas: competência CANÔNICA (base) OU competência da EMPRESA.
  competencia_base_id?: string | null;
  competencia_id?: string | null;
  nivel_entrada: Nivel;
  nivel_destino: Nivel;
  contexto_pedagogico?: string | null;
  locale: Locale;
  titulo?: string | null;
  descritor?: string | null;
  finalidade?: string | null;
}

function normalizeContextoPedagogico(value?: string | null): string | null {
  const clean = String(value || '').trim();
  if (!clean) return null;
  return clean
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || null;
}

function montarCorpoFallback(comp: any, meta: MetaModulo, textoBase: string) {
  const texto = String(textoBase || '').trim().slice(0, 7000);
  const foco = meta.descritor || comp?.nome || 'tema do material';
  return {
    conteudo_central: {
      ideia_principal: `Material base extraído para apoiar o desenvolvimento de ${comp?.nome || foco}.`,
      explicacao_expandida: texto || `O material deve ser revisado para consolidar conceitos, exemplos e orientações ligados a ${foco}.`,
      principios: [
        `Organizar os conceitos centrais de ${foco} em linguagem clara.`,
        'Preservar exemplos e situações presentes no material original.',
        'Transformar o conteúdo em orientação aplicável, sem criar fatos não presentes na fonte.',
        'Separar fundamentos, práticas e cuidados para facilitar a adaptação em formatos finais.',
        'Manter o módulo como matéria-prima pedagógica, não como aula final.',
      ],
      sintese_executiva: `Rascunho gerado a partir do material original para revisão e refinamento em ${comp?.nome || foco}.`,
    },
    conteudo_aplicavel: {
      situacoes_tipicas: [
        { situacao: 'Revisão do material-base', risco_comum: 'Usar o texto bruto sem curadoria', boa_abordagem: 'Selecionar conceitos e exemplos aderentes ao público-alvo.' },
        { situacao: 'Criação de conteúdo final', risco_comum: 'Inventar exemplos fora da fonte', boa_abordagem: 'Adaptar apenas o que está sustentado pelo material.' },
        { situacao: 'Aplicação em trilhas de aprendizagem', risco_comum: 'Misturar muitos objetivos em um módulo', boa_abordagem: 'Definir um objetivo pedagógico por peça.' },
        { situacao: 'Contextualização para empresa', risco_comum: 'Forçar termos genéricos', boa_abordagem: 'Revisar linguagem e exemplos para o contexto da empresa.' },
      ],
      erros_comuns: [
        'Publicar sem revisão humana do rascunho.',
        'Tratar o módulo-base como roteiro final.',
        'Remover nuances importantes do material original.',
        'Atribuir maturidade ou diagnóstico sem evidência.',
      ],
      boas_praticas: [
        'Revisar títulos, descritores e finalidade antes de publicar.',
        'Conferir se a competência canônica escolhida está adequada.',
        'Preservar trechos relevantes do material como referência.',
        'Ajustar o conteúdo para exemplos universais e seguros.',
      ],
    },
    guarda_corpos: {
      preservar: [
        'Fidelidade ao material original.',
        'Linguagem clara e aplicável.',
        'Caráter de matéria-prima pedagógica.',
      ],
      evitar: [
        'Inventar dados, casos ou estatísticas.',
        'Transformar o módulo em aula final.',
        'Fazer diagnóstico psicológico ou comportamental.',
      ],
      cuidados: [
        'Rascunho de contingência: revisar antes de publicar.',
      ],
    },
    adaptacao_por_formato: {
      texto: 'Converter em artigo ou microconteúdo após revisão.',
      podcast_roteiro: 'Usar como base para conversa guiada, preservando exemplos do material.',
      video_roteiro: 'Transformar em roteiro curto com abertura, conceito central e aplicação prática.',
    },
  };
}

/**
 * Estrutura um texto-base nos 4 blocos (IA-autora) e insere o módulo rascunho.
 * Núcleo compartilhado: a competência canônica + transição já vêm resolvidas
 * (pela detecção de texto único OU pelo segmentador de transcrição longa).
 */
async function estruturarEInserirModulo(
  meta: MetaModulo,
  textoBase: string,
  opts: { empresaId?: string | null; urlOrigem?: string; createdBy?: string },
): Promise<{ id?: string; grupo_id?: string; competencia?: string; nivel_entrada?: Nivel; nivel_destino?: Nivel; avisos?: string[]; error?: string }> {
  const isEmpresa = !!meta.competencia_id;
  const comp = isEmpresa
    ? await carregarCompetenciaEmpresa(meta.competencia_id!)
    : await carregarCompetenciaBase(meta.competencia_base_id!);
  if (!comp) return { error: isEmpresa ? 'Competência da empresa não encontrada' : 'Competência base não encontrada' };

  // Estrutura os 4 blocos tratando o texto-base como matéria-prima (igual ao docx).
  const contextoPedagogico = normalizeContextoPedagogico(meta.contexto_pedagogico);
  const userPrompt = montarUserPrompt(comp, meta.nivel_entrada, meta.nivel_destino, {
    contexto: contextoPedagogico || undefined,
    docxTexto: textoBase,
  });
  const model = await getModelForTask(null as any, 'modulo_base_autor');
  let corpo = await chamarIAComRetry(SYSTEM_AUTOR, userPrompt, model);
  const usouFallback = !corpo && contextoPedagogico === 'fallback-material';
  if (!corpo && usouFallback) corpo = montarCorpoFallback(comp, meta, textoBase);
  if (!corpo) return { error: 'A IA não conseguiu estruturar o conteúdo do vídeo. Tente novamente ou edite manualmente.' };

  const erros = validarCorpo(corpo);
  const sb = createSupabaseAdmin();
  const insertRow: any = {
    empresa_id: opts.empresaId || null,
    locale: meta.locale,
    competencia_base_id: isEmpresa ? null : meta.competencia_base_id,
    competencia_id: isEmpresa ? meta.competencia_id : null,
    nivel_entrada: meta.nivel_entrada,
    nivel_destino: meta.nivel_destino,
    titulo: (meta.titulo || `[Vídeo] ${comp.nome} ${meta.nivel_entrada}→${meta.nivel_destino}`).slice(0, 120),
    descritor: meta.descritor ? String(meta.descritor).slice(0, 200) : null,
    finalidade: (meta.finalidade || `Matéria-prima pedagógica extraída de vídeo para a transição ${meta.nivel_entrada}→${meta.nivel_destino} em "${comp.nome}".`).slice(0, 400),
    contexto_pedagogico: contextoPedagogico,
    tags: opts.urlOrigem ? ['extraido-video', opts.urlOrigem.slice(0, 80)] : ['extraido-video'],
    conteudo_central: corpo.conteudo_central,
    conteudo_aplicavel: corpo.conteudo_aplicavel,
    guarda_corpos: corpo.guarda_corpos,
    adaptacao_por_formato: corpo.adaptacao_por_formato,
    created_by: opts.createdBy || 'extracao-video',
    status: 'rascunho' as Status,
  };
  if (usouFallback) insertRow.tags = [...insertRow.tags, 'fallback-ia'];
  const { data, error } = await sb.from('modulos_base_conteudo').insert(insertRow).select('id, grupo_id').single();
  if (error) return { error: error.message };
  return { id: data.id, grupo_id: data.grupo_id, competencia: comp.nome, nivel_entrada: meta.nivel_entrada, nivel_destino: meta.nivel_destino, avisos: usouFallback ? [...erros, 'Rascunho de contingência: revisar antes de publicar.'] : erros };
}

/**
 * Cria UM Módulo-Base rascunho a partir do texto-base extraído de um vídeo curto
 * (fluxo síncrono YouTube). Detecta competência+níveis e estrutura. `empresaId`
 * null = módulo global/canônico; preenchido = exclusivo.
 */
export async function criarModuloBaseDeTextoExtraido(opts: {
  textoBase: string;
  tituloVideo?: string;
  urlOrigem?: string;
  locale?: string;
  empresaId?: string | null;
  createdBy?: string;
}): Promise<{ id?: string; grupo_id?: string; competencia?: string; nivel_entrada?: Nivel; nivel_destino?: Nivel; avisos?: string[]; error?: string }> {
  if (!opts?.textoBase?.trim()) return { error: 'texto-base vazio' };
  const meta = await detectarMetadadosDeTexto(opts.textoBase, opts.tituloVideo || '', opts.locale);
  if (!meta.competencia_base_id) {
    return { error: 'Não foi possível mapear o vídeo a uma competência canônica com confiança. Mapeie manualmente.' };
  }
  return estruturarEInserirModulo(meta as MetaModulo, opts.textoBase, opts);
}

/**
 * Cria UM Módulo-Base a partir de uma fatia de manuscrito autoral (uma transição
 * de um descritor). A competência e a transição JÁ vêm resolvidas pelo parser
 * determinístico (`lib/manuscrito-parser`) — aqui não há detecção nem inferência.
 *
 * Aceita competência CANÔNICA ou da EMPRESA: os manuscritos da rede (SED01-SED12)
 * vivem em `competencias`, não em `competencias_base`.
 *
 * A fatia tem ~64k chars, acima do teto padrão de 60k — daí o LIMITE_FONTE_MANUSCRITO.
 * Persiste pela mesma função que a task de lote usa, pra não haver dois inserts.
 */
export async function criarModuloBaseDeManuscrito(opts: {
  competencia_base_id?: string | null;
  competencia_id?: string | null;
  empresaId?: string | null;
  nivel_entrada: Nivel;
  nivel_destino: Nivel;
  locale?: Locale;
  textoFonte: string;
  descritor?: string | null;
  titulo?: string | null;
  /** Como a autora deve nomear o profissional. Sem isto, ela alterna sinônimos. */
  termoCanonico?: string;
  /** Rastreabilidade: "SED08". */
  codManuscrito?: string;
  /** IDs dos microblocos que compõem a fatia (vira tag). */
  microblocos?: string[];
}) {
  const ctx = await requireAdminAction('content.manage');
  if (!opts.competencia_base_id && !opts.competencia_id) {
    return { error: 'Informe competencia_base_id OU competencia_id' };
  }
  if (!opts.textoFonte?.trim()) return { error: 'textoFonte vazio' };
  if (!nivelGreater(opts.nivel_destino, opts.nivel_entrada)) {
    return { error: 'nivel_destino deve ser maior que nivel_entrada' };
  }

  const isEmpresa = !!opts.competencia_id;
  const comp = isEmpresa
    ? await carregarCompetenciaEmpresa(opts.competencia_id!)
    : await carregarCompetenciaBase(opts.competencia_base_id!);
  if (!comp) return { error: 'Competência não encontrada' };

  const userPrompt = montarUserPrompt(comp, opts.nivel_entrada, opts.nivel_destino, {
    docxTexto: opts.textoFonte,
    termoCanonico: opts.termoCanonico,
    limiteFonte: LIMITE_FONTE_MANUSCRITO,
  });
  const model = await getModelForTask(null as any, 'modulo_base_autor');
  const corpo = await chamarIAComRetry(SYSTEM_AUTOR, userPrompt, model, 32000);
  if (!corpo) return { error: 'A IA não conseguiu estruturar a fatia do manuscrito.' };

  const avisos = validarCorpo(corpo);
  const r = await persistirModuloDeManuscrito(createSupabaseAdmin(), {
    comp,
    empresaId: opts.empresaId ?? null,
    nivel_entrada: opts.nivel_entrada,
    nivel_destino: opts.nivel_destino,
    locale: opts.locale || 'pt-BR',
    descritor: opts.descritor || comp.nome_curto || comp.nome,
    corpo,
    codManuscrito: opts.codManuscrito || comp.cod_comp,
    microblocos: opts.microblocos || [],
    createdBy: ctx.email,
  });
  return r.error ? { error: r.error } : { id: r.id, avisos };
}

type SegSecao = Omit<MetaModulo, 'locale'> & { texto_base: string };
type DirecionamentoModuloBase = {
  pilar?: string | null;
  competencia?: string | null;
  competenciaBaseId?: string | null;
};
interface SegCtx {
  compsListagem: string;
  direcionamentoTexto: string;
  idSet: Set<string>;
  nomeParaId: Map<string, string>;
  /** id da competência → nome (p/ ancorar o descritor no modelo da empresa). */
  idToNome: Map<string, string>;
  /** nome da competência (lower) → descritores do modelo (empresa). */
  descritoresPorComp: Map<string, string[]>;
  model: string;
  /** true = catálogo da EMPRESA (ids vão para competencia_id, não competencia_base_id). */
  empresa: boolean;
  /** true = direcionamento pilar/competência ATIVO: extrai SÓ o escopo, sem forçar (0 é válido). */
  exclusivo: boolean;
}

/**
 * Ancora um descritor (texto livre da IA) no descritor do MODELO da competência
 * mais próximo por overlap de tokens — garante que o descritor de um módulo da
 * empresa seja SEMPRE um do modelo, não inventado. Sem descritores no modelo ou
 * sem competência resolvida → devolve o original.
 */
function ancorarDescritor(competenciaId: string | null | undefined, descritorLivre: string, ctx: SegCtx): string {
  if (!competenciaId) return descritorLivre;
  const nome = ctx.idToNome.get(competenciaId);
  const opcoes = nome ? ctx.descritoresPorComp.get(String(nome).trim().toLowerCase()) : null;
  if (!opcoes || !opcoes.length) return descritorLivre;
  const mt = _toks(descritorLivre || '');
  let best = opcoes[0], bestHit = -1;
  for (const d of opcoes) {
    const dt = _toks(d);
    let hit = 0; for (const t of mt) if (dt.has(t)) hit++;
    if (hit > bestHit) { bestHit = hit; best = d; }
  }
  return best;
}

type CompetenciaSeg = {
  id: string;
  nome: string;
  segmento: string;
  descricao?: string;
  pilar?: string | null;
  descritor_completo?: string | null;
};

function tokensBusca(s: string): string[] {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((t) => t.length >= 4 && !['para', 'como', 'sobre', 'mais', 'pela', 'pelo', 'entre', 'isso', 'esta', 'este', 'essa', 'esse'].includes(t));
}

function escolherCompetenciaFallback(texto: string, comps: CompetenciaSeg[], direcionamento?: DirecionamentoModuloBase | null): CompetenciaSeg | null {
  if (!comps.length) return null;
  const hintId = String(direcionamento?.competenciaBaseId || '').trim();
  if (hintId) {
    const byId = comps.find((c) => c.id === hintId);
    if (byId) return byId;
  }
  const textoTokens = new Set(tokensBusca(`${direcionamento?.pilar || ''} ${direcionamento?.competencia || ''} ${texto.slice(0, 24000)}`));
  const hintPilar = String(direcionamento?.pilar || '').trim().toLowerCase();
  const hintComp = String(direcionamento?.competencia || '').trim().toLowerCase();
  let best = comps[0], bestScore = -1;
  for (const c of comps) {
    const hay = `${c.nome || ''} ${c.pilar || ''} ${c.descritor_completo || ''} ${c.descricao || ''}`;
    const compTokens = tokensBusca(hay);
    let score = 0;
    if (hintPilar && String(c.pilar || '').trim().toLowerCase() === hintPilar) score += 80;
    if (hintComp && String(c.nome || '').trim().toLowerCase() === hintComp) score += 80;
    for (const t of compTokens) if (textoTokens.has(t)) score += 4;
    if (score > bestScore) { best = c; bestScore = score; }
  }
  return best;
}

function secoesFallbackDeterministico(transcricao: string, tituloVideo: string, comps: CompetenciaSeg[], direcionamento?: DirecionamentoModuloBase | null, empresa = false): SegSecao[] {
  const full = String(transcricao || '').trim();
  if (full.length < 200 || !comps.length) return [];
  const AMOSTRA = 8000;
  const total = Math.min(3, Math.max(1, Math.ceil(full.length / 120000)));
  const step = Math.max(AMOSTRA, Math.floor(full.length / total));
  const out: SegSecao[] = [];
  for (let i = 0; i < total; i++) {
    const trecho = full.slice(i * step, i * step + AMOSTRA).trim();
    if (trecho.length < 500) continue;
    const comp = escolherCompetenciaFallback(trecho, comps, direcionamento);
    if (!comp) continue;
    // Descritor é um SUB-TEMA da competência — NUNCA o pilar nem o nome da
    // competência. No fallback (sem IA) não dá pra gerar um granular fiel, então
    // usamos um placeholder honesto que o admin ajusta na revisão. (Bug anterior:
    // o pilar direcionador vazava para o descritor.)
    out.push({
      competencia_base_id: empresa ? null : comp.id,
      competencia_id: empresa ? comp.id : null,
      nivel_entrada: 'N1',
      nivel_destino: 'N2',
      contexto_pedagogico: 'fallback-material',
      titulo: `${tituloVideo || 'Material'} — parte ${i + 1}`,
      // Empresa: usa um descritor do modelo (o representativo da competência), não placeholder.
      descritor: (empresa && comp.descritor_completo) ? comp.descritor_completo : `Visão geral — parte ${i + 1}`,
      finalidade: `Estruturar matéria-prima extraída do material em "${comp.nome}".`,
      texto_base: trecho,
    });
  }
  return out;
}

// Formato de saída em BLOCOS DELIMITADOS (não JSON): o texto_base é markdown
// denso e longo, e pedir JSON faz o modelo deixar aspas/quebras não escapadas
// (parse falha) ou serializar o array como string (tool use). Marcadores com o
// markdown livre entre delimitadores não precisam de escape → parse 100% estável.
const SEG_SYSTEM = `Você é designer instrucional da Vertho. Recebe um TRECHO de transcrição/material (aula/palestra/apostila) e o divide em SEÇÕES TEMÁTICAS coerentes. Cada seção vira matéria-prima de UM módulo-base, mapeado a UMA competência canônica do catálogo Vertho.

REGRAS:
- Identifique de 1 a 8 seções (use o número que o conteúdo pedir; um trecho monotemático pode ter 1).
- Se houver DIRECIONAMENTO DO ADMIN, trate-o como prioridade semântica: prefira o pilar/competência indicada quando o trecho for compatível. Só desvie se o conteúdo claramente pertencer a outro tema.
- Para CADA seção, escolha SEMPRE a competência do catálogo SEMANTICAMENTE mais próxima — nunca deixe sem competência. Copie o competencia_base_id EXATO da lista (e repita o nome em competencia_nome para conferência).
- descritor: o sub-tema ESPECÍFICO da seção dentro da competência (5-10 palavras; mais granular que o nome da competência).
- PODE haver mais de uma seção para a MESMA competência, desde que sejam DESCRITORES (sub-temas) distintos — cada descritor vira um módulo separado. Não force descritores iguais a se juntarem.
- Transição de nível: cada módulo cobre EXATAMENTE UM DEGRAU. Use SOMENTE N1→N2, N2→N3 ou N3→N4. NUNCA pule níveis (proibido N1→N3, N1→N4, N2→N4). Um mesmo descritor PODE virar até 3 módulos (um por degrau), mas nenhum módulo cobre mais de um degrau. Default N1→N2 se incerto.
- texto_base: PRESERVE o conteúdo da seção na ORDEM original — não RESUMA (não corte definições, distinções, exemplos/casos, dados/números nem o encadeamento dos argumentos) e não INFLE (não repita, não floreie, não invente para alongar). O tamanho deve ser PROPORCIONAL ao que o trecho realmente desenvolve do tema: se o material de entrada já vier denso, MANTENHA essa densidade; se vier de fala/transcrição crua, organize em prosa fiel sem perder conteúdo. Markdown. Corte só ruído (saudações, repetição vazia); NÃO inclua nada que não esteja no trecho.

FORMATO DA SAÍDA — para CADA seção emita EXATAMENTE este bloco (um bloco por seção; NÃO escreva nada fora dos blocos, sem JSON, sem comentários):
===SECAO===
competencia_base_id: <id EXATO da lista do catálogo>
competencia_nome: <nome>
descritor: <sub-tema específico, 5-10 palavras>
nivel_entrada: <N1|N2|N3|N4>
nivel_destino: <N1|N2|N3|N4>
contexto_pedagogico: <rótulo curto slug, máx. 80 chars, ex.: transversal, lideranca, educacao-infantil; ou vazio>
titulo: <título da seção>
finalidade: <1 frase>
---TEXTO---
<texto_base em markdown, denso e fiel — pode ter várias linhas, ## títulos, aspas, listas; escreva livremente>
===FIM===`;

// Todo módulo cobre EXATAMENTE UM DEGRAU (N1→N2, N2→N3 ou N3→N4). Spans largos
// (N1→N4, N1→N3, N2→N4) são proibidos — viram um módulo "panorâmico" que se
// sobrepõe aos granulares. Quando a IA emite um span largo, cai no default N1→N2.
const niveisValidos = (e: string, d: string) =>
  NIVEIS.includes(e as Nivel) && NIVEIS.includes(d as Nivel)
  && NIVEIS.indexOf(d as Nivel) - NIVEIS.indexOf(e as Nivel) === 1;

/**
 * Parser dos blocos delimitados emitidos pelo SEG_SYSTEM:
 *   ===SECAO=== <campos key: value> ---TEXTO--- <markdown livre> ===FIM===
 * Robusto por construção: o markdown (com aspas, ##, quebras) fica entre
 * delimitadores e não precisa de escape — sem os erros de parse de JSON.
 */
function parseSecoesBlocos(raw: string): any[] {
  const out: any[] = [];
  for (const bloco of String(raw).split('===SECAO===').slice(1)) {
    const corpo = bloco.split('===FIM===')[0];
    const idx = corpo.indexOf('---TEXTO---');
    if (idx < 0) continue;
    const meta = corpo.slice(0, idx);
    const texto_base = corpo.slice(idx + '---TEXTO---'.length).trim();
    const get = (k: string) => (new RegExp('^\\s*' + k + '\\s*:\\s*(.+)$', 'm').exec(meta)?.[1] || '').trim();
    const competencia_base_id = get('competencia_base_id');
    if (!competencia_base_id || !texto_base) continue;
    out.push({
      competencia_base_id,
      competencia_nome: get('competencia_nome'),
      descritor: get('descritor'),
      nivel_entrada: get('nivel_entrada'),
      nivel_destino: get('nivel_destino'),
      contexto_pedagogico: get('contexto_pedagogico') || null,
      titulo: get('titulo'),
      finalidade: get('finalidade'),
      texto_base,
    });
  }
  return out;
}

/** Segmenta UMA janela de texto (≤ ~110k chars) numa chamada (com retry). */
async function segmentarJanela(texto: string, tituloVideo: string, ctx: SegCtx): Promise<{ secoes: SegSecao[]; diag: string }> {
  const montarUser = (incluirDirecionamento: boolean) => `${incluirDirecionamento && ctx.direcionamentoTexto ? `${ctx.direcionamentoTexto}\n\n` : ''}${ctx.empresa ? `REGRA DO DESCRITOR (obrigatória): o campo "descritor" de cada seção DEVE ser o NOME CURTO de um dos descritores listados sob a competência escolhida — o texto ANTES do travessão "—" (a parte depois do "—" é só a descrição longa, NÃO copie ela). Copie o nome curto LITERALMENTE. Escolha o que melhor descreve a seção (use a descrição longa só pra entender qual é) — NUNCA escreva um descritor novo. Se a seção tocar mais de um, escolha o predominante.\n\n` : ''}CATÁLOGO DE COMPETÊNCIAS (escolha sempre 1 por seção — id EXATO):
${ctx.compsListagem}

TÍTULO: ${tituloVideo || '—'}

TRECHO:
${texto}`;

  const tentar = async (user: string, sufixo: string): Promise<{ secoes: SegSecao[]; diag: string }> => {
    let ultimoDiag = 'sem resposta';
  // 2 tentativas (não 3): cada chamada densa pode levar ~minutos; 3× estouraria
  // os 300s da rota síncrona. timeoutMs 150s cobre a geração densa legítima e
  // maxRetries 0 evita o retry do SDK (que dobraria o tempo por chamada).
    for (let tentativa = 1; tentativa <= 2; tentativa++) {
      const raw = await callAI(SEG_SYSTEM, user, { model: ctx.model }, 32000, { timeoutMs: 180000, maxRetries: 0 }).catch((e: any) => { ultimoDiag = 'callAI: ' + (e?.message || e); return ''; });
      const brutas = parseSecoesBlocos(String(raw || ''));
      if (!brutas.length) { ultimoDiag = `t${tentativa}${sufixo}: raw=${String(raw || '').length}c, 0 blocos`; continue; }

      // Resolve a competência: id válido do catálogo OU nome casado ao catálogo.
      const secoes: SegSecao[] = brutas.map((s: any) => {
        let id = String(s?.competencia_base_id || '').trim();
        if (!ctx.idSet.has(id)) id = ctx.nomeParaId.get(String(s?.competencia_nome || '').trim().toLowerCase()) || '';
        return { s, id };
      }).filter((x) => x.id && x.s?.texto_base).map(({ s, id }) => ({
        // Catálogo da empresa → competencia_id; canônico → competencia_base_id.
        competencia_base_id: ctx.empresa ? null : id,
        competencia_id: ctx.empresa ? id : null,
        nivel_entrada: (niveisValidos(s.nivel_entrada, s.nivel_destino) ? s.nivel_entrada : 'N1') as Nivel,
        nivel_destino: (niveisValidos(s.nivel_entrada, s.nivel_destino) ? s.nivel_destino : 'N2') as Nivel,
        contexto_pedagogico: s.contexto_pedagogico || null,
        titulo: s.titulo || null,
        // Empresa: ANCORA o descritor no modelo da competência (não texto livre).
        descritor: ctx.empresa ? ancorarDescritor(id, s.descritor, ctx) : (s.descritor || null),
        finalidade: s.finalidade || null,
        texto_base: String(s.texto_base),
      }));

      if (secoes.length) return { secoes, diag: `${secoes.length} (t${tentativa}${sufixo})` };
      ultimoDiag = `t${tentativa}${sufixo}: ${brutas.length} brutas, 0 válidas`;
    }
    return { secoes: [], diag: ultimoDiag };
  };

  const comDirecionamento = await tentar(montarUser(true), '');
  if (comDirecionamento.secoes.length || !ctx.direcionamentoTexto) return comDirecionamento;
  // Modo exclusivo: NÃO re-tenta sem direcionamento — isso forçaria o material a
  // competências fora do escopo. 0 seções é um resultado válido aqui.
  if (ctx.exclusivo) return comDirecionamento;
  const semDirecionamento = await tentar(montarUser(false), ' sem-direcionamento');
  if (semDirecionamento.secoes.length) return { ...semDirecionamento, diag: `${semDirecionamento.diag}; fallback após direcionamento sem blocos` };
  return comDirecionamento;
}

/**
 * Segmenta a transcrição/material completo em seções temáticas → 1 módulo por
 * tema. Texto pequeno (≤110k chars): 1 chamada. Texto GRANDE: MAP-REDUCE —
 * fatia em janelas com overlap, segmenta cada uma e deduplica/mescla seções por
 * (competência × transição), removendo o teto de tamanho (livros, cursos, etc).
 */
async function segmentarTranscricao(
  transcricao: string, tituloVideo: string, direcionamento?: DirecionamentoModuloBase | null, empresaId?: string | null,
): Promise<{ secoes: SegSecao[]; diag: string }> {
  const sb = createSupabaseAdmin();
  // Escopo de EMPRESA → usa o catálogo de competências DELA (pilares próprios, ex.:
  // Empreendedorismo na Macaé). Global → catálogo canônico. competencias tem linhas
  // duplicadas por cargo → dedup por nome (1 competência = 1 entrada no catálogo).
  let lista: CompetenciaSeg[];
  // Empresa: o descritor do módulo é SEMPRE o NOME_CURTO oficial do descritor da
  // matriz (ex.: "Escuta ativa"), NÃO a descrição longa. Guardamos os nome_curto
  // por competência (p/ a IA copiar e o ancorarDescritor casar) + a descrição
  // longa só como CONTEXTO no catálogo (ajuda a IA a casar o trecho ao descritor).
  const descritoresPorComp = new Map<string, string[]>();          // nome_curto[]
  const descricaoLongaDe = new Map<string, string>();              // `${compK}|${curtoLower}` → descrição longa
  if (empresaId) {
    const { data: comps } = await sb.from('competencias')
      .select('id, nome, nome_curto, cargo, descricao, pilar, descritor_completo')
      .eq('empresa_id', empresaId).order('nome');
    const porNome = new Map<string, CompetenciaSeg>();
    for (const c of (comps || []) as any[]) {
      const k = String(c.nome || '').trim().toLowerCase();
      if (k && !porNome.has(k)) porNome.set(k, { ...c, segmento: c.cargo || 'empresa' });
      // Descritor oficial = nome_curto; cai pra descrição longa só se faltar nome_curto.
      const curto = String(c.nome_curto || '').trim() || String(c.descritor_completo || '').trim();
      const longo = String(c.descritor_completo || '').trim();
      if (k && curto) {
        if (!descritoresPorComp.has(k)) descritoresPorComp.set(k, []);
        const arr = descritoresPorComp.get(k)!;
        if (!arr.includes(curto)) arr.push(curto);
        if (longo && longo !== curto) descricaoLongaDe.set(`${k}|${curto.toLowerCase()}`, longo);
      }
    }
    lista = [...porNome.values()];
  } else {
    const { data: comps } = await sb.from('competencias_base')
      .select('id, nome, segmento, descricao, pilar, descritor_completo')
      .order('nome');
    lista = (comps || []) as CompetenciaSeg[];
  }
  const hintPilar = String(direcionamento?.pilar || '').trim().toLowerCase();
  const hintComp = String(direcionamento?.competencia || '').trim().toLowerCase();
  const hintId = String(direcionamento?.competenciaBaseId || '').trim();

  // MODO EXCLUSIVO: havendo direcionamento (pilar/competência), a extração é
  // restrita ESTRITAMENTE a esse escopo — o catálogo oferecido à IA contém SÓ as
  // competências do escopo, e trechos fora dele NÃO viram módulo (0 é resultado
  // válido). Direcionamento a nível de COMPETÊNCIA (id/nome) restringe àquela
  // competência; só pilar restringe ao pilar inteiro.
  const exclusivo = !!(hintId || hintComp || hintPilar);
  const _normc = (s: any) => String(s || '').trim().toLowerCase();
  let listaEscopo = lista;
  if (exclusivo) {
    listaEscopo = lista.filter((c) => {
      if (hintId || hintComp) {
        if (hintId && c.id === hintId) return true;
        if (hintComp) {
          const nome = _normc(c.nome);
          if (nome === hintComp || nome.includes(hintComp) || hintComp.includes(nome)) return true;
        }
        return false;
      }
      return _normc(c.pilar) === hintPilar; // só pilar
    });
    if (!listaEscopo.length) {
      // O pilar/competência direcionado não existe neste catálogo — config, não
      // aderência. Sinaliza distinto pra não confundir com "material não aderente".
      const alvo = direcionamento?.competencia || direcionamento?.pilar || direcionamento?.competenciaBaseId;
      return { secoes: [], diag: `direcionamento "${alvo}" não encontrado no catálogo ${empresaId ? 'da empresa' : 'canônico'} (verifique o pilar/competência)` };
    }
  }

  const score = (c: typeof lista[number]) => {
    let s = 0;
    if (hintId && c.id === hintId) s += 1000;
    if (hintPilar && _normc(c.pilar) === hintPilar) s += 100;
    const nome = _normc(c.nome);
    if (hintComp && nome === hintComp) s += 80;
    if (hintComp && (nome.includes(hintComp) || hintComp.includes(nome))) s += 40;
    return s;
  };
  const listaOrdenada = [...listaEscopo].sort((a, b) => score(b) - score(a) || a.nome.localeCompare(b.nome));
  const direcionamentoTexto = exclusivo
    ? `ESCOPO EXCLUSIVO DA EXTRAÇÃO (regra absoluta — SOBREPÕE qualquer instrução do sistema sobre "sempre escolher uma competência"):
- Pilar: ${direcionamento?.pilar || '—'}
- Competência: ${direcionamento?.competencia || '—'}
O catálogo abaixo já contém SOMENTE as competências válidas deste escopo.
1. Crie seções APENAS para trechos que tratam GENUINAMENTE deste escopo.
2. Trecho que NÃO seja deste escopo: IGNORE — não emita seção, não force, não aproxime "mais ou menos", não classifique no que sobrou.
3. É CORRETO e esperado retornar ZERO seções se o material não aborda este escopo. Não invente cobertura para parecer produtivo.`
    : '';
  // Empresa: o catálogo LISTA os descritores do modelo por competência — a IA
  // ESCOLHE um deles (semântica > token snap). Global: 1 linha por competência.
  const compsListagem = listaOrdenada.slice(0, 200).map((c) => {
    if (empresaId) {
      const k = String(c.nome).trim().toLowerCase();
      const ds = descritoresPorComp.get(k) || [];
      // Lista o NOME_CURTO (o que vai no campo "descritor") + a descrição longa só
      // como contexto pra IA casar o trecho ao descritor certo.
      const dl = ds.map((d) => {
        const longo = descricaoLongaDe.get(`${k}|${d.toLowerCase()}`);
        return `    • ${d}${longo ? ` — ${longo}` : ''}`;
      }).join('\n');
      return `- ${c.id} :: ${c.nome}${c.pilar ? ' (' + c.pilar + ')' : ''}${dl ? `\n  DESCRITORES desta competência (copie o NOME CURTO — o texto ANTES do "—" — literalmente no campo "descritor"):\n${dl}` : ''}`;
    }
    return `- ${c.id} :: ${c.nome} (${c.segmento}${c.pilar ? ' / ' + c.pilar : ''})${c.descritor_completo || c.descricao ? ' — ' + (c.descritor_completo || c.descricao) : ''}`;
  }).join('\n');
  const ctx: SegCtx = {
    compsListagem,
    direcionamentoTexto,
    idSet: new Set(listaEscopo.map((c) => c.id)),
    nomeParaId: new Map(listaEscopo.map((c) => [c.nome.trim().toLowerCase(), c.id])),
    idToNome: new Map(listaEscopo.map((c) => [c.id, c.nome])),
    descritoresPorComp,
    model: await getModelForTask(null as any, 'modulo_base_autor'),
    empresa: !!empresaId,
    exclusivo,
  };

  const full = String(transcricao);
  // Janelas MENORES (40k chars ≈ 6-7k palavras): cada chamada gera menos seções
  // → output curto (~120-160s) que cabe no timeout e nos 800s da rota interna.
  // Janelas grandes (110k) faziam UMA chamada densa gerar ~30k tokens (~600s),
  // estourando o tempo num livro. Mais janelas, mas paralelas (CONC) e curtas.
  // Cobertura de materiais grandes. Rodando IN-TASK (trigger), o limite real é o
  // maxDuration da task (1h), NÃO os 800s da rota — então os caps são só uma rede de
  // segurança alta. Configuráveis por env (sem deploy): EXTRACAO_MAX_JANELAS (~35k
  // chars/janela) e EXTRACAO_MAX_SECOES (módulos). O `diag` reporta se truncou; se o
  // material for ENORME, suba as envs (e o maxDuration da task, se preciso).
  const envNum = (k: string, d: number) => { const n = parseInt(process.env[k] || '', 10); return Number.isFinite(n) && n > 0 ? n : d; };
  // MERGE_CAP: teto de texto BRUTO acumulado por célula (competência×descritor) no
  // REDUCE — acima disso, o excedente (cauda, geralmente repetitiva) é aparado antes
  // de estruturar. Subido 24k→40k (roda in-task, sem o teto de 800s) p/ não cortar
  // descritores muito cobertos. Env-tunável.
  const JANELA = 40000, OVERLAP = 5000;
  const MERGE_CAP = envNum('EXTRACAO_MERGE_CAP', 40000);
  const MAX_JANELAS = envNum('EXTRACAO_MAX_JANELAS', 60);
  const MAX_SECOES = envNum('EXTRACAO_MAX_SECOES', 80);

  // Caso comum: cabe numa janela → 1 chamada (comportamento anterior).
  if (full.length <= JANELA) return segmentarJanela(full, tituloVideo, ctx);

  // MAP: janelas com overlap (evita cortar um tema na fronteira).
  const janelas: string[] = [];
  for (let i = 0; i < full.length && janelas.length < MAX_JANELAS; i += (JANELA - OVERLAP)) {
    janelas.push(full.slice(i, i + JANELA));
  }
  const truncado = (MAX_JANELAS - 1) * (JANELA - OVERLAP) + JANELA < full.length;

  // MAP em PARALELO: as janelas são independentes. Para materiais grandes, 5
  // janelas por lote ainda criavam 3 ondas de IA e podiam estourar a conexão de
  // ~300s do callback; até 12 janelas cabem no teto já imposto por MAX_JANELAS.
  const CONC = 12;
  const todas: SegSecao[] = [];
  const diags: string[] = [];
  for (let i = 0; i < janelas.length; i += CONC) {
    const lote = janelas.slice(i, i + CONC);
    const rs = await Promise.all(lote.map((jan, k) =>
      segmentarJanela(jan, `${tituloVideo} (parte ${i + k + 1}/${janelas.length})`, ctx)));
    rs.forEach((r, k) => { todas.push(...r.secoes); diags.push(`j${i + k + 1}:${r.secoes.length}`); });
  }

  // REDUCE: dedup/mescla por (competência × transição × DESCRITOR). Assim, mesma
  // competência com descritores (sub-temas) DIFERENTES vira módulos SEPARADOS;
  // só o MESMO descritor que cruza janelas é fundido (material combinado, cap).
  const map = new Map<string, SegSecao>();
  for (const s of todas) {
    const key = `${s.competencia_id || s.competencia_base_id}|${s.nivel_entrada}|${s.nivel_destino}|${String(s.descritor || '').trim().toLowerCase()}`;
    const ex = map.get(key);
    if (ex) {
      if (ex.texto_base.length < MERGE_CAP) ex.texto_base = (ex.texto_base + '\n\n' + s.texto_base).slice(0, MERGE_CAP);
    } else {
      map.set(key, { ...s });
    }
  }
  const secoes = [...map.values()].slice(0, MAX_SECOES);
  // Fallback determinístico FORÇA uma competência em cada trecho — incompatível
  // com o modo exclusivo (onde 0 é resultado legítimo). Só roda fora dele.
  if (!secoes.length && !exclusivo) {
    const fallback = secoesFallbackDeterministico(full, tituloVideo, listaOrdenada, direcionamento, !!empresaId);
    if (fallback.length) {
      return { secoes: fallback, diag: `fallback determinístico após IA sem blocos (${janelas.length} janelas)` };
    }
  }
  const diag = `map-reduce ${janelas.length} janelas → ${todas.length} brutas → ${secoes.length} módulos${truncado ? ' [texto truncado em ' + MAX_JANELAS + ' janelas]' : ''} (${diags.join(' ')})`;
  return { secoes, diag };
}

/**
 * Cria N Módulos-Base rascunho a partir da transcrição completa de um vídeo
 * longo (1 módulo por seção temática). Usado pelo worker (vídeos >1h via rota
 * interna). Para vídeos curtos, o segmentador devolve 1 seção → 1 módulo.
 */
export async function criarModulosDeTranscricao(opts: {
  transcricao: string;
  tituloVideo?: string;
  urlOrigem?: string;
  locale?: string;
  empresaId?: string | null;
  createdBy?: string;
  direcionamento?: DirecionamentoModuloBase | null;
}): Promise<{ modulos: { id: string; competencia?: string; nivel_entrada?: Nivel; nivel_destino?: Nivel }[]; error?: string; semAderencia?: boolean }> {
  if (!opts?.transcricao?.trim()) return { modulos: [], error: 'transcrição vazia' };

  const dir = opts.direcionamento;
  const exclusivo = !!(dir?.pilar || dir?.competencia || dir?.competenciaBaseId);
  const { secoes, diag } = await segmentarTranscricao(opts.transcricao, opts.tituloVideo || '', dir, opts.empresaId);
  if (!secoes.length) {
    if (exclusivo) {
      // Material processado, mas nada aderente ao escopo direcionado: 0 módulos é
      // o resultado correto (não-erro). Sinaliza com semAderencia pra UI tratar distinto.
      const alvo = dir?.competencia || dir?.pilar || 'o escopo direcionado';
      return { modulos: [], semAderencia: true, error: `Material não aderente a "${alvo}" — 0 módulos extraídos. ${diag}` };
    }
    return { modulos: [], error: `Não foi possível segmentar a transcrição. ${diag}` };
  }

  const locale = (opts.locale || 'pt-BR') as Locale;
  // Estrutura as seções EM PARALELO — N módulos levam ~o tempo de 1, em vez de
  // N×(tempo de um). Crucial pra não estourar o timeout no fluxo síncrono
  // (material) e no callback (vídeo) quando há muitos temas.
  const estruturar = (s: SegSecao) => estruturarEInserirModulo(
    { ...s, locale } as MetaModulo,
    s.texto_base,
    { empresaId: opts.empresaId, urlOrigem: opts.urlOrigem, createdBy: opts.createdBy },
  ).catch((e: any) => ({ error: e?.message || 'erro' } as any));

  // Estrutura em LOTES (concorrência limitada): cada seção é uma chamada Claude
  // densa (até 64k tokens). Tudo de uma vez (Promise.all de 20) estoura o
  // rate-limit; lotes de 6 mantêm o paralelismo sem afogar o provedor.
  const ESTRUT_CONC = 6;
  const resultados: any[] = [];
  for (let i = 0; i < secoes.length; i += ESTRUT_CONC) {
    resultados.push(...await Promise.all(secoes.slice(i, i + ESTRUT_CONC).map(estruturar)));
  }
  const modulos: { id: string; competencia?: string; nivel_entrada?: Nivel; nivel_destino?: Nivel }[] = [];
  const falhas: string[] = [];
  resultados.forEach((res, i) => {
    if (res?.id) modulos.push({ id: res.id, competencia: res.competencia, nivel_entrada: res.nivel_entrada, nivel_destino: res.nivel_destino });
    else falhas.push(`[${String(secoes[i].competencia_base_id).slice(0, 8)}] ${res?.error || 'sem id'}`);
  });
  if (!modulos.length) {
    return { modulos: [], error: `${secoes.length} seções, 0 estruturadas. Motivos: ${falhas.slice(0, 4).join(' · ').slice(0, 380)}` };
  }

  // Já entrega cada módulo COM nota da IA-auditora (best-effort). Sem isto, todo
  // módulo extraído nascia sem nota até alguém reauditar manualmente. Desligável
  // por env (EXTRACAO_AUTO_AUDITAR=0) se o custo/tempo da auditoria pesar.
  if (process.env.EXTRACAO_AUTO_AUDITAR !== '0') {
    try {
      await autoAuditarModulosExtraidos(createSupabaseAdmin(), modulos.map((m) => m.id));
    } catch (e: any) {
      console.warn('[criarModulosDeTranscricao] auto-auditoria falhou (módulos seguem sem nota):', e?.message);
    }
  }
  return { modulos };
}

/**
 * Segmenta + estrutura uma extração (extracoes_video) em N Módulos-Base e atualiza
 * o status. ANTES era o corpo da rota /api/internal/modulo-from-video (limitada a
 * 800s na Vercel). Agora é uma função compartilhada que as TASKS do trigger rodam
 * DIRETO (orçamento de minutos→horas, sem o teto de 800s e sem HTTP no meio — o que
 * também elimina o "erro" por conexão cortada). A rota vira um wrapper fino.
 * Idempotente: se a extração já está 'done', devolve o resultado existente.
 */
export async function segmentarEEstruturarExtracao(
  extracaoId: string,
  opts: { transcricao?: string; titulo?: string | null; locale?: string } = {},
): Promise<{ ok?: true; moduloIds?: string[]; n?: number; idempotente?: boolean; error?: string; httpStatus?: number }> {
  const sb = createSupabaseAdmin();
  const { data: ext } = await sb.from('extracoes_video')
    .select('id, status, modulo_base_ids, escopo_empresa_id, url, transcricao, pilar_direcionador, competencia_direcionadora, competencia_base_id_direcionadora')
    .eq('id', extracaoId).maybeSingle();
  if (!ext) return { error: 'extração não encontrada', httpStatus: 404 };
  if (ext.status === 'done' && Array.isArray(ext.modulo_base_ids) && ext.modulo_base_ids.length) {
    return { ok: true, moduloIds: ext.modulo_base_ids, n: ext.modulo_base_ids.length, idempotente: true };
  }
  const texto = String(opts.transcricao || ext.transcricao || '').trim();
  if (!texto) return { error: 'transcricao obrigatória', httpStatus: 400 };

  let locale = opts.locale;
  if (!locale && ext.escopo_empresa_id) {
    const { data: emp } = await sb.from('empresas').select('default_locale').eq('id', ext.escopo_empresa_id).maybeSingle();
    locale = emp?.default_locale || undefined;
  }
  locale = locale || 'pt-BR';

  const res = await criarModulosDeTranscricao({
    transcricao: texto, tituloVideo: opts.titulo || undefined, urlOrigem: ext.url,
    locale, empresaId: ext.escopo_empresa_id || null, createdBy: 'extracao-video',
    direcionamento: {
      pilar: ext.pilar_direcionador || null,
      competencia: ext.competencia_direcionadora || null,
      competenciaBaseId: ext.competencia_base_id_direcionadora || null,
    },
  });

  if (res.error || !res.modulos.length) {
    // Material não aderente ao escopo direcionado → status 'vazio' (resultado válido,
    // não falha). Erro real de segmentação → 'error'.
    const status = res.semAderencia ? 'vazio' : 'error';
    await sb.from('extracoes_video').update({
      status, error: String(res.error || 'falha ao estruturar módulos').slice(0, 500),
      n_modulos: 0,
      transcricao: texto.slice(0, 500000), titulo: opts.titulo || null, updated_at: new Date().toISOString(),
    }).eq('id', extracaoId);
    return { error: res.error || 'falha ao estruturar', httpStatus: res.semAderencia ? 200 : 422 };
  }

  const ids = res.modulos.map((m) => m.id);
  const comps = res.modulos.map((m) => m.competencia).filter(Boolean);
  const tituloFinal = res.modulos.length > 1
    ? `${res.modulos.length} módulos: ${comps.slice(0, 2).join(', ')}${comps.length > 2 ? '…' : ''}`
    : (comps[0] || opts.titulo || 'Vídeo');
  await sb.from('extracoes_video').update({
    status: 'done', modulo_base_id: ids[0], modulo_base_ids: ids, n_modulos: ids.length,
    transcricao: texto.slice(0, 500000), titulo: tituloFinal, error: null, updated_at: new Date().toISOString(),
  }).eq('id', extracaoId);
  return { ok: true, moduloIds: ids, n: ids.length };
}

// ════════════════════════════════════════════════════════════════════════════
// IA-auditora — valida o módulo contra spec e seus próprios guarda-corpos
// (padrão Dual-IA — substitui revisão humana cruzada)
// ════════════════════════════════════════════════════════════════════════════


// Núcleo da auditoria SEM guard de sessão — reusável pela extração (roda no
// trigger, sem admin logado) e pelo batch. Carrega o módulo, chama a IA-auditora,
// persiste o veredito. NÃO chamar direto da UI: use auditarModuloBase (com guard).

export async function auditarModuloBase(id: string) {
  await requireAdminAction('ai.audit.regenerate');
  return auditarModuloCore(createSupabaseAdmin(), id);
}

/**
 * Audita VÁRIOS módulos numa tacada (concorrência limitada). Disparado pela UI
 * (lista de módulos-base, seleção múltipla) — guard de sessão uma única vez.
 */
export async function auditarModulosBaseEmLote(ids: string[]) {
  await requireAdminAction('ai.audit.regenerate');
  const sb = createSupabaseAdmin();
  const alvo = [...new Set((ids || []).filter(Boolean))];
  if (!alvo.length) return { error: 'Nenhum módulo selecionado' };

  // Lotes de 4: cada auditoria é uma chamada GPT-5.4 densa; 4 em paralelo mantém
  // throughput sem afogar o rate-limit do provedor.
  const CONC = 4;
  let ok = 0; const falhas: string[] = [];
  for (let i = 0; i < alvo.length; i += CONC) {
    const r = await Promise.all(alvo.slice(i, i + CONC).map((id) =>
      auditarModuloCore(sb, id).catch((e: any) => ({ error: e?.message || 'erro' }))));
    r.forEach((res, k) => {
      if ((res as any)?.ok) ok++;
      else falhas.push(`${String(alvo[i + k]).slice(0, 8)}: ${(res as any)?.error || 'falhou'}`);
    });
  }
  return { ok: true, auditados: ok, total: alvo.length, falhas: falhas.slice(0, 6) };
}

/** Wrapper com guard do refino. O núcleo vive em `lib/modulo-base-refino.ts`. */
export async function refinarComFeedback(id: string) {
  await requireAdminAction('ai.audit.regenerate');
  return refinarModuloCore(createSupabaseAdmin(), id);
}

/**
 * Refina VÁRIOS módulos numa tacada (concorrência baixa — cada refino é autora +
 * nova auditoria, pesado). Disparado pela UI (seleção múltipla). Módulos já
 * aprovados ou sem auditoria são PULADOS (não contam como falha). Guard 1×.
 */
export async function refinarModulosEmLote(ids: string[]) {
  await requireAdminAction('ai.audit.regenerate');
  const alvo = [...new Set((ids || []).filter(Boolean))];
  if (!alvo.length) return { error: 'Nenhum módulo selecionado' };

  const CONC = 2; // refino = IA-autora + IA-auditora por módulo; 2 em paralelo.
  let refinados = 0, revertidos = 0, pulados = 0; const falhas: string[] = [];
  for (let i = 0; i < alvo.length; i += CONC) {
    const r = await Promise.all(alvo.slice(i, i + CONC).map((id) =>
      refinarComFeedback(id).catch((e: any) => ({ error: e?.message || 'erro' }))));
    r.forEach((res: any, k) => {
      if (res?.revertido) { revertidos++; refinados++; }
      else if (res?.ok) refinados++;
      else {
        const err = res?.error || 'falhou';
        // "já aprovou" / "nada a refinar" / "sem auditoria" = nada a fazer, não é falha.
        if (/aprovou|nada a refinar|sem auditoria|reauditar/i.test(err)) pulados++;
        else falhas.push(`${String(alvo[i + k]).slice(0, 8)}: ${err}`);
      }
    });
  }
  return { ok: true, refinados, revertidos, pulados, total: alvo.length, falhas: falhas.slice(0, 6) };
}

// Auto-auditoria pós-extração: audita os módulos recém-criados em lotes, sem
// guard (roda no trigger). Best-effort — falha em um módulo não derruba os outros
// nem a extração; o módulo só fica sem nota (auditável depois pela UI).
async function autoAuditarModulosExtraidos(sb: ReturnType<typeof createSupabaseAdmin>, ids: string[]) {
  // Mesma rotina que a task do manuscrito usa — auditoria em lotes de 4 e
  // promoção rascunho → revisão para quem recebeu veredito.
  const { falhas } = await auditarModulosCore(sb, ids, { promoverParaRevisao: true });
  if (falhas.length) console.warn('[autoAuditar] falhas:', falhas.join(' · '));
}

// ════════════════════════════════════════════════════════════════════════════
// Refinar módulo consumindo o feedback estruturado da IA-auditora
// (loop Dual-IA — disparado manualmente pelo autor humano)
// ════════════════════════════════════════════════════════════════════════════


