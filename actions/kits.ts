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

    const baseParams = { competencia, descritor, nivelMin, nivelMax, cargo, contexto, empresaId, aiConfig };

    // 1) Brief (núcleo compartilhado, idempotente por tema).
    const { briefId, brief, reused } = await resolverOuCriarBrief(sb, baseParams);

    // 2) Desafio sob medida ao DISC, ancorado no núcleo.
    const desafio = await gerarKitDesafio(baseParams, brief, disc);

    // 3) Kit (1 por brief×DISC). Marca 'generating' enquanto os formatos saem.
    const { data: kitRow, error: kErr } = await sb.from('kits')
      .upsert({ brief_id: briefId, disc, desafio, status: 'generating', error: null }, { onConflict: 'brief_id,disc' })
      .select('id').single();
    if (kErr) return { success: false, error: `kit upsert: ${kErr.message}` };
    const kitId = kitRow.id;

    // 4) Os 4 formatos, todos semeados pela MESMA espinha + o desafio do DISC.
    const seed = { nucleo: brief, disc, desafio, kitId };
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
