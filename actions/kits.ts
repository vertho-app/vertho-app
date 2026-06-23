'use server';

/**
 * Kit Semanal — orquestrador (Fase 1). Gera UM kit DISC coeso: brief (núcleo
 * compartilhado, create-or-reuse) → desafio do DISC → 4 formatos semeados pela
 * espinha, todos amarrados ao kit_id. Ver docs/KIT-SEMANAL.md.
 *
 * Fase 1 = on-demand (um (tema × DISC) por chamada) para validar a coesão antes
 * de escalar para o lote (Fase 2: 4 DISC × 4 formatos, agendado por coorte).
 */
import { requireAdminSupabase } from '@/lib/admin-supabase';
import { resolverOuCriarBrief, gerarKitDesafio, type DiscLetter } from '@/lib/season-engine/kit/brief';
import { gerarConteudoIA } from '@/actions/conteudos';
import type { AIConfig } from '@/actions/ai-client';

const FORMATOS_PADRAO = ['video', 'audio', 'texto', 'case'] as const;

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
}

export async function gerarKit({
  competencia, descritor, disc,
  nivelMin = 1.0, nivelMax = 2.0, cargo = 'todos', contexto = 'generico',
  empresaId = null, aiConfig = {}, formatos = FORMATOS_PADRAO,
}: GerarKitParams) {
  try {
    const sb = await requireAdminSupabase('content.manage');
    if (!competencia || !descritor || !disc) {
      return { success: false, error: 'competencia, descritor e disc obrigatórios' };
    }
    if (!['D', 'I', 'S', 'C'].includes(disc)) {
      return { success: false, error: `disc inválido: ${disc}` };
    }

    // Contexto/PPP da EMPRESA — tecido no core (o kit é por empresa). Mesmo padrão
    // do roteiro de vídeo: pega o PPP mais recente extraído e usa como lente.
    let pppBrief: string | null = null;
    if (empresaId) {
      const { data: ppp } = await sb.from('ppp_escolas')
        .select('extracao').eq('empresa_id', empresaId).eq('status', 'extraido')
        .order('extracted_at', { ascending: false }).limit(1).maybeSingle();
      if (ppp?.extracao) {
        const { extracaoParaTexto } = await import('@/lib/escola-brief');
        pppBrief = extracaoParaTexto(ppp.extracao).slice(0, 2500);
      }
    }

    const baseParams = { competencia, descritor, nivelMin, nivelMax, cargo, contexto, empresaId, aiConfig, pppBrief };

    // 1) Brief (núcleo da empresa, idempotente por tema; PPP como lente).
    const { briefId, brief, reused } = await resolverOuCriarBrief(sb, baseParams);

    // 2) Desafio sob medida ao DISC, ancorado no núcleo + contexto da empresa.
    const desafio = await gerarKitDesafio(baseParams, brief, disc);

    // 3) Kit (1 por brief×DISC). Marca 'generating' enquanto os formatos saem.
    const { data: kitRow, error: kErr } = await sb.from('kits')
      .upsert({ brief_id: briefId, disc, desafio, status: 'generating', error: null }, { onConflict: 'brief_id,disc' })
      .select('id').single();
    if (kErr) return { success: false, error: `kit upsert: ${kErr.message}` };
    const kitId = kitRow.id;

    // 4) Os 4 formatos, todos semeados pela MESMA espinha + desafio do DISC + PPP da empresa.
    const seed = { nucleo: brief, disc, desafio, kitId, pppBrief };
    const conteudos: Array<{ formato: string; conteudoId?: string; titulo?: string; ok: boolean; error?: string }> = [];
    for (const formato of formatos) {
      const r = await gerarConteudoIA({ ...baseParams, formato, kit: seed });
      conteudos.push({ formato, conteudoId: (r as any).conteudoId, titulo: (r as any).titulo, ok: r.success, error: (r as any).error });
    }

    const okAll = conteudos.every((c) => c.ok);
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
}: GerarKitSemanalParams) {
  try {
    const kits: Awaited<ReturnType<typeof gerarKit>>[] = [];
    for (const disc of discs) {
      // sequencial: o 1º cria o brief; os demais reusam (resolverOuCriarBrief idempotente).
      kits.push(await gerarKit({ competencia, descritor, disc, nivelMin, nivelMax, cargo, contexto, empresaId, aiConfig, formatos }));
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
