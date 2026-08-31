'use server';

import { requireAdminSupabase } from '@/lib/admin-supabase';
import { requireAdminAction, requireUserAction, getAuthenticatedEmailFromAction } from '@/lib/auth/action-context';
import { createSupabaseAdmin } from '@/lib/supabase';
import { canViewColabJourney, findColabByEmail } from '@/lib/authz';
import { tenantDb } from '@/lib/tenant-db';
import { gerarRoteiroDeModulo } from '@/lib/video/gerar-roteiro';
import type { ModuloParaRoteiro } from '@/lib/video/roteiro-prompt';
import { carregarCargoInfo, formatBlocoCargo } from '@/lib/cargo-contexto';
import { extracaoParaTexto } from '@/lib/escola-brief';
import { resolverModuloBaseParaConteudo } from '@/lib/season-engine/modulo-base-integration';
import { tasks } from '@trigger.dev/sdk';
import { regionOpts } from '@/lib/trigger-region';
import type { gerarVideoModuloTask } from '@/trigger/gerar-video-modulo';

type Disc = 'D' | 'I' | 'S' | 'C';
const COLS_MODULO = 'id, locale, competencia_base_id, nivel_entrada, nivel_destino, titulo, descritor, conteudo_central, conteudo_aplicavel, adaptacao_por_formato';

/** Carrega o Módulo-Base e a competência → base do ModuloParaRoteiro. */
async function carregarModulo(sb: any, moduloBaseId: string): Promise<ModuloParaRoteiro | null> {
  const { data: m } = await sb.from('modulos_base_conteudo').select(COLS_MODULO).eq('id', moduloBaseId).maybeSingle();
  if (!m) return null;
  let competenciaNome: string | null = null;
  if (m.competencia_base_id) {
    const { data: c } = await sb.from('competencias_base').select('nome').eq('id', m.competencia_base_id).maybeSingle();
    competenciaNome = c?.nome || null;
  }
  return {
    titulo: m.titulo, descritor: m.descritor, competenciaNome,
    nivel_entrada: m.nivel_entrada, nivel_destino: m.nivel_destino,
    conteudo_central: m.conteudo_central, conteudo_aplicavel: m.conteudo_aplicavel,
    adaptacao_por_formato: m.adaptacao_por_formato, locale: m.locale,
  };
}

/** Contexto de personalização da célula: bloco de cargo + brief do PPP + DISC. */
async function contextoPersonalizacao(sb: any, empresaId: string | null, cargo: string | null, disc: Disc | null, pppBriefOverride?: string | null) {
  const out: Pick<ModuloParaRoteiro, 'cargoBloco' | 'pppBrief' | 'discDominante'> = { discDominante: disc || null };
  if (!empresaId) return out;

  let empresaNome: string | null = null;
  const { data: emp } = await sb.from('empresas').select('nome').eq('id', empresaId).maybeSingle();
  empresaNome = emp?.nome || null;

  if (cargo) {
    const cargoInfo = await carregarCargoInfo(sb, empresaId, cargo).catch(() => null);
    out.cargoBloco = formatBlocoCargo(cargoInfo || { nome: cargo }, empresaNome);
  }
  // PPP/contexto da empresa. Empresa-rede (município, ex.: Ibipeba) tem VÁRIOS
  // PPPs → consolida o MUNICIPAL (não pega o "mais recente" de uma escola). O kit
  // passa o brief já resolvido via override. Ver kit/contexto-empresa.ts.
  if (pppBriefOverride !== undefined) {
    out.pppBrief = pppBriefOverride;
  } else {
    const { resolverContextoEmpresa } = await import('@/lib/season-engine/kit/contexto-empresa');
    out.pppBrief = await resolverContextoEmpresa(sb, empresaId).catch(() => null);
  }
  return out;
}

/**
 * Gera o roteiro (personalizado se houver célula), cria o rastreador e dispara o
 * job. Internamente usado pelo disparo admin e pela resolução lazy do colaborador.
 */
async function criarEDispararVideo(sb: any, args: {
  moduloBaseId: string; empresaId: string | null; cargo: string | null; disc: Disc | null; createdBy: string | null;
  desafioTexto?: string | null; kitId?: string | null; pppBrief?: string | null; forceSync?: boolean;
}) {
  const base = await carregarModulo(sb, args.moduloBaseId);
  if (!base) return { error: 'Módulo-base não encontrado' };

  const perso = await contextoPersonalizacao(sb, args.empresaId, args.cargo, args.disc, args.kitId ? (args.pppBrief ?? null) : undefined);
  const { roteiro, error: rotErr } = await gerarRoteiroDeModulo(
    { ...base, ...perso, desafioTexto: args.desafioTexto ?? null },
    { forceSync: !!args.forceSync },
  );
  if (rotErr || !roteiro) return { error: rotErr || 'A IA não retornou um roteiro válido' };

  const { data: novo, error: insErr } = await sb.from('videos_gerados').insert({
    modulo_base_id: args.moduloBaseId,
    empresa_id: args.empresaId,
    cargo: args.cargo,
    disc_dominante: args.disc,
    status: 'processing',
    etapa: 'roteiro',
    roteiro,
    created_by: args.createdBy,
    kit_id: args.kitId ?? null,
  }).select('id').maybeSingle();
  if (insErr || !novo?.id) return { error: insErr?.message || 'Falha ao criar registro do vídeo' };

  try {
    await tasks.trigger<typeof gerarVideoModuloTask>('gerar-video-modulo', { videoId: novo.id, roteiro }, regionOpts());
  } catch (e: any) {
    await sb.from('videos_gerados').update({ status: 'error', error: e?.message?.slice(0, 500) }).eq('id', novo.id);
    return { error: `Não foi possível iniciar o processamento: ${e?.message || 'erro'}` };
  }
  return { success: true, id: novo.id, roteiro };
}

/**
 * Disparo manual (admin) de um vídeo do módulo. Aceita personalização opcional
 * (empresa × cargo × DISC); sem ela, gera o vídeo genérico do módulo.
 */
export async function dispararVideoDeModulo(moduloBaseId: string, opts: { escopoEmpresaId?: string | null; cargo?: string | null; discDominante?: Disc | null } = {}) {
  try {
    const sb = await requireAdminSupabase('content.manage');
    const ctx = await requireAdminAction('content.manage');
    if (!moduloBaseId) return { error: 'Módulo-base não informado' };
    return await criarEDispararVideo(sb, {
      moduloBaseId,
      empresaId: opts.escopoEmpresaId || null,
      cargo: opts.cargo || null,
      disc: opts.discDominante || null,
      createdBy: (ctx as any)?.email || null,
    });
  } catch (err: any) {
    console.error('[dispararVideoDeModulo]', err);
    return { error: err?.message || 'Falha ao disparar a geração de vídeo' };
  }
}

/**
 * Disparo do vídeo do KIT (background, service-role — SEM auth de request). Gera o
 * vídeo da célula (modulo × empresa × cargo × DISC) com o DESAFIO do DISC no
 * roteiro + PPP municipal + kit_id, em modo SYNC (não espera o batch). Idempotente
 * por kit (reusa se já gerou o vídeo deste kit). Ver docs/KIT-SEMANAL.md (Fase 2b).
 */
export async function dispararVideoDoKit(sb: any, args: {
  moduloBaseId: string; empresaId: string | null; cargo: string | null; disc: Disc;
  desafioTexto: string; kitId: string; pppBrief?: string | null; createdBy?: string | null;
}): Promise<{ id?: string; reused?: boolean; status?: string; error?: string }> {
  if (!args.moduloBaseId) return { error: 'sem módulo-base p/ o vídeo' };
  const { data: existente } = await sb.from('videos_gerados')
    .select('id, status').eq('kit_id', args.kitId).neq('status', 'error')
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (existente) return { id: existente.id, reused: true, status: existente.status };
  const r = await criarEDispararVideo(sb, {
    moduloBaseId: args.moduloBaseId, empresaId: args.empresaId, cargo: args.cargo, disc: args.disc,
    createdBy: args.createdBy || 'kit', desafioTexto: args.desafioTexto, kitId: args.kitId,
    pppBrief: args.pppBrief ?? null, forceSync: true,
  });
  if ((r as any).error) return { error: (r as any).error };
  return { id: (r as any).id, status: 'processing' };
}

/**
 * Resolução LAZY de uma célula (módulo × empresa × cargo × DISC): se já existe um
 * vídeo pronto/processando para a célula, reaproveita; senão, gera sob demanda.
 * É o ponto de reuso — todos os colaboradores da mesma célula caem aqui.
 */
export async function resolverCelulaVideo(moduloBaseId: string, empresaId: string, cargo: string, disc: Disc, createdBy: string | null = null, opts: { sb?: any; gerar?: boolean; colaboradorId?: string } = {}) {
  const sb = opts.sb || await requireAdminSupabase();
  const gerar = opts.gerar !== false; // default: lazy gera se ausente
  const { data: existente } = await sb.from('videos_gerados')
    .select('id, status, etapa, video_url, bunny_video_id, bunny_library, error')
    .eq('modulo_base_id', moduloBaseId).eq('empresa_id', empresaId).eq('cargo', cargo).eq('disc_dominante', disc)
    .neq('status', 'error')
    .order('created_at', { ascending: false }).limit(1).maybeSingle();

  if (existente) {
    const base = { reused: true, id: existente.id, status: existente.status, etapa: existente.etapa, video_url: existente.video_url, bunny_video_id: existente.bunny_video_id, bunny_library: existente.bunny_library };
    // Vídeo PERSONALIZADO (saudação nominal "Olá, {nome}") do colaborador: se já
    // houver um pronto pra esta pessoa nesta célula, entrega ELE no lugar do
    // genérico. Senão, cai no genérico da célula (fallback transparente).
    if (opts.colaboradorId) {
      const { data: perso } = await sb.from('videos_personalizados')
        .select('status, video_url, bunny_video_id, bunny_library')
        .eq('cell_video_id', existente.id).eq('colaborador_id', opts.colaboradorId)
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (perso?.status === 'done' && perso.bunny_video_id) {
        return { ...base, status: 'done', etapa: 'done', video_url: perso.video_url, bunny_video_id: perso.bunny_video_id, bunny_library: perso.bunny_library, isPersonalizado: true, personalizadoStatus: 'done' };
      }
      if (perso) return { ...base, isPersonalizado: false, personalizadoStatus: perso.status };
    }
    return base;
  }
  if (!gerar) return { reused: false, status: 'nao_gerado' };
  const r = await criarEDispararVideo(sb, { moduloBaseId, empresaId, cargo, disc, createdBy });
  if ((r as any).error) return r;
  return { reused: false, id: (r as any).id, status: 'processing', etapa: 'roteiro' };
}

/**
 * ENTREGA AO COLABORADOR: resolve o vídeo personalizado da competência da semana
 * para o colaborador LOGADO. Deriva a célula (empresa + cargo + DISC dominante) e o
 * módulo-base (competência × transição de nível, do assessment do colab), e devolve
 * o vídeo da célula. `gerar=false` (default) só REUSA prontos/em-andamento — não
 * dispara geração (controle de custo); a geração é feita pelo admin / pré-aquecimento.
 */
async function resolverVideoDaSemanaParaColaborador(
  sb: any,
  colab: any,
  competencia: string,
  descritor: string | null,
  gerar: boolean,
  opts: { coreId?: string | null },
) {
  if (!colab?.empresa_id || !colab.cargo) return { available: false, reason: 'sem-cargo' };
  const disc = (colab.perfil_dominante || '').trim().charAt(0).toUpperCase();
  if (!['D', 'I', 'S', 'C'].includes(disc)) return { available: false, reason: 'sem-disc' };

  // ESTRUTURAL: o vídeo segue o MESMO módulo-base do CONTEÚDO (texto/case) que a
  // trilha já resolveu — via `core_id` do micro-conteúdo. Isso mantém vídeo↔texto
  // consistentes (mesmo módulo/nível) E ESTÁVEL: não re-resolve por embedding/
  // anti-repetição a cada acesso (que orfanava o vídeo em regen). Fallback pra
  // resolução por competência+nível só quando não há core_id / módulo no conteúdo.
  let moduloId: string | null = null;
  if (opts.coreId) {
    const { data: mc } = await sb.from('micro_conteudos')
      .select('modulo_base_id').eq('id', opts.coreId).eq('empresa_id', colab.empresa_id).maybeSingle();
    if (mc?.modulo_base_id) moduloId = mc.modulo_base_id;
  }
  if (!moduloId) {
    // nível do colab na competência (média do assessment) → transição N→N
    let aq = sb.from('descriptor_assessments').select('nota').eq('colaborador_id', colab.id).eq('competencia', competencia);
    if (descritor) aq = aq.eq('descritor', descritor);
    const { data: assess } = await aq;
    const notas = (assess || []).map((a: any) => Number(a.nota)).filter((n: number) => n > 0);
    const nivelMin = notas.length ? notas.reduce((s: number, n: number) => s + n, 0) / notas.length : 1.5;
    const escolha = await resolverModuloBaseParaConteudo(sb, { competenciaNome: competencia, descritor: descritor || undefined, nivelMin, locale: colab.locale || 'pt-BR', cargo: colab.cargo, empresaId: colab.empresa_id });
    if (!escolha?.modulo?.id) return { available: false, reason: 'sem-modulo' };
    moduloId = escolha.modulo.id;
  }

  const cel = await resolverCelulaVideo(moduloId, colab.empresa_id, colab.cargo, disc as Disc, `colab:${colab.id}`, { sb, gerar, colaboradorId: colab.id });
  if ((cel as any).error) return { available: false, reason: (cel as any).error };
  return { available: true, moduloId, colaboradorId: colab.id, ...cel };
}

export async function resolverVideoDaSemana(competencia: string, descritor: string | null = null, gerar = false, opts: { coreId?: string | null } = {}) {
  try {
    await requireUserAction();
    const email = await getAuthenticatedEmailFromAction();
    const cb = email ? await findColabByEmail(email, 'id') : null;
    if (!cb) return { available: false };
    const sb = createSupabaseAdmin();
    const { data: colab, error: colabError } = await sb.from('colaboradores')
      .select('id, empresa_id, cargo, perfil_dominante, locale')
      .eq('id', cb.id)
      .maybeSingle();
    if (colabError) return { available: false, reason: colabError.message };
    return await resolverVideoDaSemanaParaColaborador(sb, colab, competencia, descritor, gerar, opts);
  } catch (err: any) {
    console.error('[resolverVideoDaSemana]', err);
    return { available: false };
  }
}

/**
 * Consulta o vídeo que um colaborador específico vê, para a prévia somente
 * leitura de RH/gestor/tutor. Nunca dispara geração e mantém o gate de posse no
 * servidor; o ID vindo da URL não é tratado como autorização.
 */
export async function resolverVideoDaSemanaGestor(
  colaboradorId: string,
  competencia: string,
  descritor: string | null = null,
  opts: { coreId?: string | null } = {},
) {
  try {
    const ctx = await requireUserAction();
    if (!ctx.empresaId || !colaboradorId) return { available: false };
    const tdb = tenantDb(ctx.empresaId);
    const { data: colab, error: colabError } = await tdb.from('colaboradores')
      .select('id, empresa_id, cargo, perfil_dominante, locale, gestor_email')
      .eq('id', colaboradorId)
      .maybeSingle();
    if (colabError) return { available: false, reason: colabError.message };
    if (!colab || !canViewColabJourney(ctx, colab)) return { available: false, reason: 'fora-do-escopo' };
    // A autorização/tenant já foram fixados acima. O resolvedor também consulta
    // catálogo global (competencias_base / módulos compartilhados) e a tabela
    // nominal, que não possui empresa_id; por isso usa o escape hatch explícito.
    // Todas as leituras do alvo continuam ancoradas no colab autorizado.
    return await resolverVideoDaSemanaParaColaborador(tdb.raw, colab, competencia, descritor, false, opts);
  } catch (err: any) {
    console.error('[resolverVideoDaSemanaGestor]', err);
    return { available: false };
  }
}

/**
 * Resolve o vídeo para um COLABORADOR específico: deriva a célula (empresa, cargo,
 * DISC dominante = 1ª letra de perfil_dominante) e reaproveita/gera. Chamado pela
 * superfície de entrega ao colaborador (lazy).
 */
export async function resolverVideoDoColaborador(moduloBaseId: string, colaboradorId: string) {
  try {
    const sb = await requireAdminSupabase();
    const { data: colab } = await sb.from('colaboradores').select('id, empresa_id, cargo, perfil_dominante').eq('id', colaboradorId).maybeSingle();
    if (!colab) return { error: 'Colaborador não encontrado' };
    if (!colab.empresa_id || !colab.cargo) return { error: 'Colaborador sem empresa/cargo definido' };
    const disc = (colab.perfil_dominante || '').trim().charAt(0).toUpperCase();
    if (!['D', 'I', 'S', 'C'].includes(disc)) return { error: 'Colaborador sem perfil DISC mapeado' };
    return await resolverCelulaVideo(moduloBaseId, colab.empresa_id, colab.cargo, disc as Disc, `colab:${colab.id}`, { colaboradorId: colab.id });
  } catch (err: any) {
    console.error('[resolverVideoDoColaborador]', err);
    return { error: err?.message || 'Falha ao resolver o vídeo do colaborador' };
  }
}

/** Lista os vídeos gerados (e em andamento) de um Módulo-Base. */
export async function listarVideosDoModulo(moduloBaseId: string) {
  try {
    await requireAdminAction();
    const sb = await requireAdminSupabase();
    const { data } = await sb.from('videos_gerados')
      .select('id, status, etapa, cargo, disc_dominante, empresa_id, video_url, bunny_video_id, bunny_library, error, created_at, updated_at')
      .eq('modulo_base_id', moduloBaseId)
      .order('created_at', { ascending: false })
      .limit(40);
    return { data: data || [] };
  } catch (err: any) {
    console.error('[listarVideosDoModulo]', err);
    return { data: [] };
  }
}

/** Status de um vídeo (para polling da UI). */
export async function statusDoVideo(videoId: string) {
  try {
    await requireAdminAction();
    const sb = await requireAdminSupabase();
    const { data } = await sb.from('videos_gerados')
      .select('id, status, etapa, video_url, bunny_video_id, bunny_library, error, updated_at')
      .eq('id', videoId)
      .maybeSingle();
    return { data };
  } catch (err: any) {
    console.error('[statusDoVideo]', err);
    return { data: null };
  }
}
