'use server';

/**
 * Kit Semanal — orquestrador (Fase 1). Gera UM kit DISC coeso: brief (núcleo
 * compartilhado, create-or-reuse) → desafio do DISC → 4 formatos semeados pela
 * espinha, todos amarrados ao kit_id. Ver docs/KIT-SEMANAL.md.
 *
 * Fase 1 = on-demand (um (tema × DISC) por chamada) para validar a coesão antes
 * de escalar para o lote (Fase 2: 4 DISC × 4 formatos, agendado por coorte).
 */
import { requireEmpresaSupabase, requireLinhaSupabase } from '@/lib/admin-supabase';
import { resolverOuCriarBrief, gerarKitDesafio, type DiscLetter } from '@/lib/season-engine/kit/brief';
import { resolverPerfilPublicoDaEmpresa, type RegistroPublico } from '@/lib/season-engine/perfil-publico';
import { levantarPlanoKitsCoorte } from '@/lib/season-engine/kit/plano-coorte';
import { gerarConteudoIA } from '@/actions/conteudos';
import type { AIConfig } from '@/actions/ai-client';
import { tasks } from '@trigger.dev/sdk';
import { regionOpts } from '@/lib/trigger-region';
import type { gerarKitTask } from '@/trigger/gerar-kit';

// Conteúdos textuais/áudio do kit (micro_conteudos). O VÍDEO não é um roteiro
// aqui — é o vídeo RENDERIZADO (videos_gerados) disparado à parte, com o desafio
// do DISC no roteiro. Ver docs/KIT-SEMANAL.md (Fase 2b).
const FORMATOS_PADRAO = ['audio', 'texto', 'case'] as const;

/** Resumo enxuto de um resultado de kit para o progresso (polling da tela). */
function resumoKit(k: any) {
  return {
    disc: k?.disc, ok: k?.success, kitId: k?.kitId,
    desafio: k?.desafio?.desafio_texto || null,
    conteudos: (k?.conteudos || []).map((c: any) => ({ formato: c.formato, ok: c.ok, titulo: c.titulo, error: c.error })),
  };
}

export interface GerarKitParams {
  competencia: string;
  descritor: string;
  disc: DiscLetter;
  nivelMin?: number;
  nivelMax?: number;
  cargo?: string;
  contexto?: string;
  empresaId?: string | null;
  aiConfig?: AIConfig;
  formatos?: readonly string[];
  /** Cliente service-role já pronto (job em background pula a auth de request). */
  sb?: any;
  // ── Batch API (lote) ──────────────────────────────────────────────────────
  /** Caller de IA injetado (Batch API); thread p/ desafio + formatos. Default síncrono. */
  aiRun?: import('@/lib/ai-batch').AIRun;
  /** Brief já resolvido (1× p/ todos os DISC) — evita corrida ao rodar os 4 em paralelo. */
  briefPreResolvido?: { briefId: string; brief: any; moduloBaseId: string | null; reused: boolean };
  /** PPP/contexto da empresa já resolvido (evita reconsultar por DISC). */
  pppBriefPreResolvido?: string | null;
  /** Registro/domínio por público já resolvido (1× p/ todos os DISC). */
  perfilPublico?: RegistroPublico;
  /** Pula o disparo do vídeo renderizado (HeyGen/render) — p/ lote de coorte sem custo de GPU. */
  skipVideo?: boolean;
}

export async function gerarKit({
  competencia, descritor, disc,
  nivelMin = 1.0, nivelMax = 2.0, cargo = 'todos', contexto = 'generico',
  empresaId = null, aiConfig = {}, formatos = FORMATOS_PADRAO, sb: sbIn,
  aiRun, briefPreResolvido, pppBriefPreResolvido, perfilPublico: perfilPublicoIn, skipVideo = false,
}: GerarKitParams) {
  try {
    // A5: `empresaId` vem do cliente (kit custa IA e grava no acervo dele).
    // `sbIn` = chamada interna (lote/task) que já passou pelo gate.
    const sb = sbIn || await requireEmpresaSupabase(empresaId, 'content.manage', 'kit.gerar');
    if (!competencia || !descritor || !disc) {
      return { success: false, error: 'competencia, descritor e disc obrigatórios' };
    }
    if (!['D', 'I', 'S', 'C'].includes(disc)) {
      return { success: false, error: `disc inválido: ${disc}` };
    }

    // Registro/domínio por público (cargo-primeiro). Resolve 1× se não veio do lote.
    const perfilPublico = perfilPublicoIn ?? await resolverPerfilPublicoDaEmpresa(sb, empresaId, cargo);

    // Contexto/PPP da EMPRESA — tecido no core (o kit é por empresa). Consolida
    // VÁRIOS PPPs (rede/município, ex.: Ibipeba) num contexto MUNICIPAL único, em
    // vez de pegar o de uma escola qualquer. Ver kit/contexto-empresa.ts.
    let pppBrief: string | null = pppBriefPreResolvido ?? null;
    if (pppBriefPreResolvido === undefined && empresaId) {
      const { resolverContextoEmpresa } = await import('@/lib/season-engine/kit/contexto-empresa');
      pppBrief = await resolverContextoEmpresa(sb, empresaId, aiConfig).catch(() => null);
    }

    const baseParams = { competencia, descritor, nivelMin, nivelMax, cargo, contexto, empresaId, aiConfig, pppBrief, perfilPublico };

    // 1) Brief (núcleo da empresa, idempotente por tema; PPP como lente).
    //    No lote (Batch), resolvido 1× ANTES de fanout — evita corrida entre os 4 DISC.
    const { briefId, brief, moduloBaseId, reused } = briefPreResolvido
      ?? await resolverOuCriarBrief(sb, baseParams);

    // 2) Desafio sob medida ao DISC, ancorado no núcleo + contexto da empresa.
    const desafio = await gerarKitDesafio({ ...baseParams, aiRun }, brief, disc);

    // 3) Kit (1 por brief×DISC). Marca 'generating' enquanto os formatos saem.
    const { data: kitRow, error: kErr } = await sb.from('kits')
      .upsert({ brief_id: briefId, disc, desafio, status: 'generating', error: null }, { onConflict: 'brief_id,disc' })
      .select('id').single();
    if (kErr) return { success: false, error: `kit upsert: ${kErr.message}` };
    const kitId = kitRow.id;

    // 4) Os 4 formatos, todos semeados pela MESMA espinha + desafio do DISC + PPP da empresa.
    const seed = { nucleo: brief, disc, desafio, kitId, pppBrief };
    const conteudos: Array<{ formato: string; conteudoId?: string; titulo?: string; ok: boolean; error?: string }> = [];
    // No lote (Batch), os formatos saem CONCORRENTES — o collector os agrupa numa
    // tacada. Síncrono (sem aiRun), Promise.all mantém o comportamento (1 de cada vez
    // não é exigência) mas preserva a ordem do retorno.
    const formatoResults = await Promise.all(
      formatos.map((formato) => gerarConteudoIA({ ...baseParams, formato, kit: seed, sb, aiRun })
        .then((r) => ({ formato, conteudoId: (r as any).conteudoId, titulo: (r as any).titulo, ok: r.success, error: (r as any).error }))
        .catch((e: any) => ({ formato, ok: false, error: e?.message || 'erro' }))),
    );
    conteudos.push(...formatoResults);

    // VÍDEO renderizado (Fase 2b): célula (modulo × empresa × cargo × DISC) com o
    // desafio do DISC no roteiro + PPP municipal, ligada ao kit. Render é async
    // (cx33); aqui só dispara/reusa. Não conta no okAll (é best-effort/assíncrono).
    if (skipVideo) {
      conteudos.push({ formato: 'video', ok: true, titulo: 'vídeo pulado (skipVideo)' });
    } else if (moduloBaseId) {
      const { dispararVideoDoKit } = await import('@/actions/gerar-video');
      const v: any = await dispararVideoDoKit(sb, { moduloBaseId, empresaId, cargo, disc, desafioTexto: desafio.desafio_texto, kitId, pppBrief, createdBy: 'kit' }).catch((e: any) => ({ error: e?.message }));
      conteudos.push({ formato: 'video', conteudoId: v.id, titulo: v.reused ? 'vídeo (reusado)' : 'vídeo (renderizando)', ok: !v.error, error: v.error });
    } else {
      conteudos.push({ formato: 'video', ok: false, error: 'sem módulo-base — vídeo não gerado' });
    }

    // okAll = formatos de CONTEÚDO (o vídeo é async; não bloqueia a publicação).
    const okAll = conteudos.filter((c) => c.formato !== 'video').every((c) => c.ok);
    await sb.from('kits').update({
      status: okAll ? 'published' : 'error',
      published_at: okAll ? new Date().toISOString() : null,
      error: okAll ? null : conteudos.filter((c) => !c.ok).map((c) => `${c.formato}: ${c.error}`).join(' | '),
    }).eq('id', kitId);

    return {
      success: okAll,
      kitId, briefId, briefReused: reused, disc,
      desafio,
      conteudos,
      message: `Kit ${disc} (${competencia} › ${descritor}): ${conteudos.filter((c) => c.ok).length}/${conteudos.length} formatos`,
    };
  } catch (err: any) {
    console.error('[gerarKit]', err);
    return { success: false, error: err?.message || 'Erro' };
  }
}

// ── Fase 2: lote dos 4 DISC (brief gerado 1× e reusado) ─────────────────────
export interface GerarKitSemanalParams extends Omit<GerarKitParams, 'disc'> {
  discs?: DiscLetter[];
  renderAudio?: boolean; // dispara o TTS dos podcasts (pesado/lento)
  /** Callback de progresso (job em background atualiza kit_jobs). */
  onProgress?: (p: { done: number; total: number; current: string; kits: any[] }) => Promise<void> | void;
  /** Batch API (−50%): gera os 4 DISC numa tacada (async, ~min). Fallback síncrono. */
  useBatch?: boolean;
  /** Inclui o vídeo renderizado (default true). false = só conteúdo (lote sem GPU). */
  incluirVideo?: boolean;
}

/**
 * Gera o kit semanal completo de um tema: os 4 DISC × formatos. O brief (núcleo)
 * é destilado 1× (no 1º DISC) e REUSADO pelos demais — coesão garantida. Em DUO
 * o chamador roda isto 1× por competência. Opcionalmente renderiza os podcasts
 * (TTS) na sequência. O vídeo renderizado (assistível) reusa o pipeline de célula
 * existente (DISC-aware) — ver docs/KIT-SEMANAL.md (Fase 2b: costurar o desafio
 * exato no roteiro do vídeo).
 */
export async function gerarKitSemanal({
  competencia, descritor, nivelMin = 1.0, nivelMax = 2.0, cargo = 'todos', contexto = 'generico',
  empresaId = null, aiConfig = {}, formatos, discs = ['D', 'I', 'S', 'C'], renderAudio = false,
  sb, onProgress, useBatch = false, incluirVideo = true, perfilPublico: perfilPublicoIn,
}: GerarKitSemanalParams) {
  try {
    const total = discs.length;
    const sbk = sb || await requireEmpresaSupabase(empresaId, 'content.manage', 'kit.gerar_semanal');
    const skipVideo = !incluirVideo;
    // Registro/domínio por público resolvido 1× p/ todos os DISC (núcleo+desafio coesos).
    const perfilPublico = perfilPublicoIn ?? await resolverPerfilPublicoDaEmpresa(sbk, empresaId, cargo);
    let kits: Awaited<ReturnType<typeof gerarKit>>[] = [];

    // ── Caminho LOTE (Batch API −50%) ─────────────────────────────────────────
    // Vale a pena só com fan-out (≥2 DISC). Resolve brief+PPP 1× (evita corrida),
    // roda os DISC CONCORRENTES e o collector agrupa as chamadas num batch async.
    // Qualquer falha do batch → o próprio collector cai em callAI síncrono; uma
    // falha estrutural aqui → fallback ao loop sequencial abaixo.
    let batchOk = false;
    if (useBatch && discs.length >= 2) {
      try {
        await onProgress?.({ done: 0, total, current: `lote (batch) — preparando núcleo…`, kits: [] });
        const baseParams = { competencia, descritor, nivelMin, nivelMax, cargo, contexto, empresaId, aiConfig, perfilPublico };
        let pppBrief: string | null = null;
        if (empresaId) {
          const { resolverContextoEmpresa } = await import('@/lib/season-engine/kit/contexto-empresa');
          pppBrief = await resolverContextoEmpresa(sbk, empresaId, aiConfig).catch(() => null);
        }
        const brief = await resolverOuCriarBrief(sbk, { ...baseParams, pppBrief });
        const { createAIBatchCollector } = await import('@/lib/ai-batch');
        const { run } = createAIBatchCollector(aiConfig?.model || 'claude-sonnet-4-6', {
          ledger: { feature: 'kit_semanal', empresaId },
        });

        await onProgress?.({ done: 0, total, current: `lote (batch) — gerando ${discs.length} DISC…`, kits: [] });
        let done = 0;
        kits = await Promise.all(discs.map((disc) =>
          gerarKit({
            competencia, descritor, disc, nivelMin, nivelMax, cargo, contexto, empresaId, aiConfig, formatos, sb: sbk,
            aiRun: run, briefPreResolvido: brief, pppBriefPreResolvido: pppBrief, perfilPublico, skipVideo,
          }).then(async (k) => {
            done++;
            await onProgress?.({ done, total, current: `kit ${disc} concluído`, kits: [] });
            return k;
          })));
        batchOk = true;
      } catch (e: any) {
        console.warn(`[gerarKitSemanal] lote/batch falhou (${e?.message}) — fallback sequencial`);
        kits = [];
      }
    }

    // ── Caminho SEQUENCIAL (default / fallback) ───────────────────────────────
    if (!batchOk) {
      for (const disc of discs) {
        await onProgress?.({ done: kits.length, total, current: `gerando kit ${disc}…`, kits: kits.map(resumoKit) });
        // sequencial: o 1º cria o brief; os demais reusam (resolverOuCriarBrief idempotente).
        kits.push(await gerarKit({ competencia, descritor, disc, nivelMin, nivelMax, cargo, contexto, empresaId, aiConfig, formatos, sb: sbk, perfilPublico, skipVideo }));
        await onProgress?.({ done: kits.length, total, current: `kit ${disc} concluído`, kits: kits.map(resumoKit) });
      }
    }

    let audioRendered = 0;
    if (renderAudio) {
      const { gerarPodcastAudio } = await import('@/actions/conteudos');
      for (const k of kits) {
        for (const c of (k as any).conteudos || []) {
          if (c.formato === 'audio' && c.ok && c.conteudoId) {
            const a = await gerarPodcastAudio(c.conteudoId).catch(() => null);
            if ((a as any)?.success) audioRendered++;
          }
        }
      }
    }

    const okKits = kits.filter((k) => k.success).length;
    return {
      success: okKits > 0,
      competencia, descritor,
      kits: kits.map((k) => ({ disc: (k as any).disc, kitId: (k as any).kitId, ok: k.success, error: (k as any).error, desafio: (k as any).desafio, conteudos: (k as any).conteudos })),
      audioRendered,
      message: `Kit semanal ${competencia} › ${descritor}: ${okKits}/${discs.length} DISC` + (renderAudio ? ` · ${audioRendered} podcast(s) renderizado(s)` : ''),
    };
  } catch (err: any) {
    console.error('[gerarKitSemanal]', err);
    return { success: false, error: err?.message || 'Erro' };
  }
}

// ── Background job (trigger.dev): enfileira + status p/ polling da tela ──────

export interface EnqueueKitParams {
  competencia: string;
  descritor: string;
  nivelMin?: number;
  nivelMax?: number;
  cargo?: string;
  contexto?: string;
  empresaId?: string | null;
  discs?: DiscLetter[];
  renderAudio?: boolean;
  /** Batch API (−50%). Default: ligado no lote (≥2 DISC). */
  useBatch?: boolean;
  /** Inclui o vídeo renderizado (default true). */
  incluirVideo?: boolean;
}

/** Cria o job em kit_jobs e dispara o task gerar-kit. Retorna o jobId p/ polling. */
export async function enqueueKit(p: EnqueueKitParams) {
  try {
    // ⚠️ O guard G-A5 NÃO via este export: o id do cliente vem dentro de `p`
    // (tipo nomeado), e o predicado só olhava parâmetros com cara de id. Mesma
    // classe dos outros — gate por tenant, não por permissão.
    const sb = await requireEmpresaSupabase(p.empresaId, 'content.manage', 'kit.enqueue');
    if (!p.competencia || !p.descritor) return { success: false as const, error: 'competência e descritor obrigatórios' };
    const discs = (p.discs?.length ? p.discs : ['D', 'I', 'S', 'C']) as DiscLetter[];
    const jobParams = {
      nivelMin: p.nivelMin ?? 1.0, nivelMax: p.nivelMax ?? 2.0,
      cargo: p.cargo ?? 'todos', contexto: p.contexto ?? 'generico',
      discs, renderAudio: !!p.renderAudio,
      useBatch: p.useBatch ?? (discs.length >= 2),
      incluirVideo: p.incluirVideo ?? true,
    };
    const { data: job, error } = await sb.from('kit_jobs').insert({
      empresa_id: p.empresaId ?? null, competencia: p.competencia, descritor: p.descritor,
      params: jobParams, status: 'queued',
      progress: { done: 0, total: discs.length, current: 'na fila', kits: [] },
    }).select('id').single();
    if (error) return { success: false as const, error: error.message };
    try {
      await tasks.trigger<typeof gerarKitTask>('gerar-kit', { jobId: job.id }, regionOpts());
    } catch (e: any) {
      await sb.from('kit_jobs').update({ status: 'error', error: 'dispatch: ' + (e?.message || e) }).eq('id', job.id);
      return { success: false as const, error: 'Não foi possível enfileirar: ' + (e?.message || e) };
    }
    return { success: true as const, jobId: job.id, total: discs.length };
  } catch (err: any) {
    return { success: false as const, error: err?.message || 'Erro' };
  }
}

/** Status do job (polling). */
export async function statusKit(jobId: string) {
  try {
    // A5: o jobId vem do cliente; o polling lia status/competência/descritor de
    // job alheio. Leitura, mas é leitura de outro tenant.
    const { linha } = await requireLinhaSupabase(
      'kit_jobs', jobId, 'content.manage', 'kit.status',
      'id, status, progress, kit_ids, error, competencia, descritor, updated_at',
    );
    return linha || null;
  } catch {
    return null;
  }
}

// ── Agendador por coorte (manual por empresa) ───────────────────────────────
// A VARREDURA (leitura + dedup + faltantes) vive em `lib/season-engine/kit/plano-coorte.ts`
// — núcleo sem gate, para que o CRON de horizonte possa usá-la (o cron não tem sessão e
// esta action exige `content.manage`). Aqui fica o gate + a EXECUÇÃO (enfileirar).
// `executar:false` = dry-run (preview do plano). Ver docs/KIT-SEMANAL.md.
export type { PlanoCoorteItem } from '@/lib/season-engine/kit/plano-coorte';

export async function planejarKitsCoorte(
  empresaId: string,
  // `turmaId` (mig 210): a semana N de duas safras são DATAS diferentes, então
  // gerar "para a coorte" sem recorte produz um plano que não corresponde a
  // nenhuma delas. Sem turma → empresa inteira, como sempre foi.
  opts: { executar?: boolean; incluirVideo?: boolean; contexto?: string; nivelMin?: number; nivelMax?: number; semanaMax?: number; turmaId?: string | null } = {},
) {
  try {
    const sb = await requireEmpresaSupabase(empresaId, 'content.manage', 'kit.planejar_coorte');
    const base = await levantarPlanoKitsCoorte(sb, empresaId, opts);
    if ('error' in base) return { error: base.error as string };
    const { plano, totalFaltantes } = base;

    // 6) Executa: enfileira 1 job por (comp × descritor) com os DISC faltantes.
    if (opts.executar) {
      for (const item of plano) {
        if (!item.faltantes.length) continue;
        const r = await enqueueKit({
          competencia: item.competencia, descritor: item.descritor, empresaId,
          discs: item.faltantes as DiscLetter[],
          nivelMin: item.nivelMin, nivelMax: item.nivelMax,
          cargo: item.cargo, contexto: item.contexto,
          useBatch: item.faltantes.length >= 2,
          incluirVideo: opts.incluirVideo ?? true,
        });
        item.jobId = r.success ? r.jobId : null;
        item.jobErro = r.success ? null : (r as any).error;
      }
    }

    return {
      ok: true as const,
      resumo: {
        colaboradores: base.colaboradores,
        combinacoes: plano.length,
        totalFaltantes,
        jobsEnfileirados: opts.executar ? plano.filter((p) => p.jobId).length : 0,
      },
      plano,
    };
  } catch (err: any) {
    console.error('[planejarKitsCoorte]', err);
    return { error: String(err?.message || 'Erro') };
  }
}
