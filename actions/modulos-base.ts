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
  carregarCompetenciaBase,
  carregarCompetenciaEmpresa,
  carregarCompetenciaDoModulo,
} from '@/lib/modulo-base-auditor';
import { chamarIAComRetry } from '@/lib/modulo-base-autor';
import { refinarModuloCore } from '@/lib/modulo-base-refino';
import {
  estruturarEInserirModulo,
  nivelGreater,
  NIVEIS,
  type Locale,
  type MetaModulo,
  type Status,
} from '@/lib/modulos-base/pipeline';
import { publicarModuloCore } from '@/lib/modulos-base/publicar';
import { escaparLike } from '@/lib/sql-like';




// ════════════════════════════════════════════════════════════════════════════
// CRUD / listagem
// ════════════════════════════════════════════════════════════════════════════

/**
 * Página padrão da listagem. A tela pede mais em blocos deste tamanho.
 *
 * ⚠️ NÃO exportar: num arquivo `'use server'` **todo export precisa ser função
 * async** — o `tsc` aceita a constante e o build do Turbopack falha. (E export
 * aqui não é só um detalhe de sintaxe: cada um vira endpoint HTTP.)
 */
const MODULOS_POR_PAGINA = 200;

/**
 * ── B6 (auditoria de 22/08): a tela mostrava 200 de 283, sem dizer ────────
 *
 * O `.limit(200)` era fixo e o único consumidor não paginava, não passava
 * offset e não exibia total. `Medido em 24/08:` `modulos_base_conteudo` tem
 * **283 linhas**, então **83 módulos (29% do acervo) não apareciam** e não
 * tinham como ser alcançados por essa tela.
 *
 * Pior que a invisibilidade: o "selecionar tudo" marca o que está na tela, e
 * "aprovar e publicar" reportava **"200/200 publicado(s)"** — o denominador do
 * aviso era a fatia, não o acervo, e a mensagem ensinava que o lote cobriu tudo.
 *
 * E o corte era por `updated_at DESC`: os 83 excluídos eram justamente os mais
 * ANTIGOS — os que mais precisam de reauditoria.
 *
 * Agora devolve `{ modulos, total, temMais }`, com `count: 'exact'` medindo o
 * conjunto FILTRADO (não a tabela). A tela mostra "N de M" e busca o resto.
 *
 * ⚠️ O desempate por `id` não é enfeite: paginar por uma coluna que empata tem o
 * mesmo defeito do B7 — entre duas páginas a ordem de um bloco empatado não é
 * garantida, e a linha some ou vem duas vezes. Hoje os 283 `updated_at` são
 * distintos, mas o lote do manuscrito grava vários módulos no mesmo instante.
 */
export async function listarModulos(filtros: {
  status?: Status; locale?: Locale; competencia_base_id?: string;
  contexto_pedagogico?: string; busca?: string;
  // empresa_id: 'global' = só canônicos (empresa_id null); uuid = exclusivos dessa empresa; undefined = todos.
  empresa_id?: string; pilar?: string;
  /** Paginação: quantos pular e quantos trazer (default: a 1ª página). */
  offset?: number; limit?: number;
} = {}) {
  await requireAdminAction();
  const sb = createSupabaseAdmin();
  let q = sb.from('modulos_base_conteudo')
    .select(COLS, { count: 'exact' })
    .order('updated_at', { ascending: false })
    .order('id');
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
      if (!ors.length) return { modulos: [], total: 0, offset: 0, temMais: false };
      q = q.or(ors.join(','));
    }
  }
  if (filtros.contexto_pedagogico) q = q.eq('contexto_pedagogico', filtros.contexto_pedagogico);
  // Os `%` das pontas sao curinga INTENCIONAL (busca parcial); o que o operador
  // digitou, nao. Sem escapar, um `_` no termo casa qualquer caractere e a lista
  // volta mais larga do que a busca pedia.
  if (filtros.busca) q = q.ilike('titulo', `%${escaparLike(filtros.busca)}%`);
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
    if (!ors.length) return { modulos: [], total: 0, offset: 0, temMais: false };
    q = q.or(ors.join(','));
  }

  const offset = Math.max(0, filtros.offset ?? 0);
  const limit = Math.max(1, filtros.limit ?? MODULOS_POR_PAGINA);
  const { data, error, count } = await q.range(offset, offset + limit - 1);
  if (error) return { error: error.message };
  const modulos = (data || []) as any[];
  const total = count ?? modulos.length;

  // Resolve o nome da competência dos DOIS catálogos (canônico + empresa), já que
  // módulos da empresa (competencia_id) não aparecem em competencias_base.
  const empresaIds = [...new Set(modulos.map((m) => m.competencia_id).filter(Boolean))];
  if (empresaIds.length) {
    const { data: emp } = await sb.from('competencias').select('id, nome').in('id', empresaIds);
    const nomeDe = new Map((emp || []).map((c: any) => [c.id, c.nome]));
    for (const m of modulos) if (m.competencia_id) m.competencia_nome = nomeDe.get(m.competencia_id) || null;
  }
  return { modulos, total, offset, temMais: offset + modulos.length < total };
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

export async function aprovarPublicar(id: string) {
  const ctx = await requireAdminAction('content.manage');
  return publicarModuloCore(createSupabaseAdmin(), (ctx as any).email, id);
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
  return _emLote(ids, (id) => publicarModuloCore(sb, (ctx as any).email, id));
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
  await requireAdminAction('content.manage');
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
    contextoCargo: comp.cargo || undefined,
  });
  const model = await getModelForTask(null as any, 'modulo_base_autor');
  const corpo = await chamarIAComRetry(SYSTEM_AUTOR, userPrompt, model);
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


// ════════════════════════════════════════════════════════════════════════════
// Refinar módulo consumindo o feedback estruturado da IA-auditora
// (loop Dual-IA — disparado manualmente pelo autor humano)
// ════════════════════════════════════════════════════════════════════════════


